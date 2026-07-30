#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
mac-toggle agent — the "firmware" half of the mac-toggle project.

Same contract as the autoclicker/aircon ESP32 sketches, except the device is
this MacBook and the actuator is macOS itself:

    /mac-toggle/desired   ← phone writes what it WANTS (settings object)
    /mac-toggle/state     ← this agent writes what IS (observed truth + heartbeat)
    /mac-toggle/command   ← transient one-shot actions ("lock", "sleep", …), cleared after run

It holds a long-lived Firebase RTDB SSE stream (like the autoclicker firmware),
re-reads /desired on every event, applies only the deltas, then mirrors the real
observed values back to /state.

Stdlib only — runs on the /usr/bin/python3 that ships with macOS. No pip, no venv.

SECURITY NOTE: every value coming out of Firebase is treated as hostile. Nothing
from the network is ever passed to a shell; only whitelisted keys are honored,
every value is coerced + range-clamped, and the command list is fixed. Even so,
if the RTDB rules for /mac-toggle are world-writable, anyone who knows the path
can flip these settings. See README.md → "Lock the RTDB path down".
"""

import json
import os
import pwd
import re
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #

DB_URL = "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
ROOT = "mac-toggle"

STREAM_TIMEOUT = 70        # s — RTDB sends keep-alive ~every 45 s; longer gap = dead socket
RECONNECT_DELAY = 3        # s — backoff floor after a stream drop
RECONNECT_MAX = 60         # s — backoff ceiling
HEARTBEAT_SECS = 45        # s — republish /state at least this often so the phone sees "online"

PMSET = "/usr/bin/pmset"
DEFAULTS = "/usr/bin/defaults"
CAFFEINATE = "/usr/bin/caffeinate"
SYSADMINCTL = "/usr/sbin/sysadminctl"
SECURITY = "/usr/bin/security"
LAUNCHCTL = "/bin/launchctl"
SCUTIL = "/usr/sbin/scutil"
OPEN = "/usr/bin/open"

LOGINWINDOW = "/Library/Preferences/com.apple.loginwindow"

# Optional: admin password for `sysadminctl -screenLock`, stored in the SYSTEM
# keychain (root-readable, no prompt). Absent = the screenLock row is reported
# as unavailable and never written. See README.
KEYCHAIN_SERVICE = "mac-toggle-admin"
KEYCHAIN_ACCOUNT = "mac-toggle"
SYSTEM_KEYCHAIN = "/Library/Keychains/System.keychain"


def log(msg):
    sys.stdout.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), msg))
    sys.stdout.flush()


_warned = set()


def warn_once(key, msg):
    """Log a recurring condition once — reconcile runs on every RTDB event."""
    if key not in _warned:
        _warned.add(key)
        log(msg)


# --------------------------------------------------------------------------- #
# Shell helpers — always list-args, never shell=True
# --------------------------------------------------------------------------- #

def sh(args, timeout=20):
    """Run a command, return (rc, stdout, stderr). Never raises."""
    try:
        p = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        out, err = p.communicate(timeout=timeout)
        return p.returncode, out.decode("utf-8", "replace"), err.decode("utf-8", "replace")
    except Exception as e:                                    # noqa: BLE001
        return 1, "", str(e)


def console_user():
    """The human currently logged in at the physical screen, or None."""
    rc, out, _ = sh(["/usr/bin/stat", "-f", "%Su", "/dev/console"])
    name = out.strip()
    if rc != 0 or not name or name == "root":
        return None
    return name


def sh_as_user(args, timeout=20):
    """
    Run something in the logged-in user's GUI session.

    We run as a root LaunchDaemon, so anything that touches the window server
    (screen saver, per-user prefs) has to be bounced into the user's Aqua
    session via `launchctl asuser <uid> sudo -u <user> …`.
    """
    user = console_user()
    if not user:
        return 1, "", "no console user"
    try:
        uid = pwd.getpwnam(user).pw_uid
    except KeyError:
        return 1, "", "unknown user %s" % user
    return sh([LAUNCHCTL, "asuser", str(uid), "/usr/bin/sudo", "-u", user] + args, timeout)


# --------------------------------------------------------------------------- #
# Reading the machine's actual state
# --------------------------------------------------------------------------- #

def pmset_custom():
    """Parse `pmset -g custom` into {'ac': {...}, 'batt': {...}}."""
    rc, out, _ = sh([PMSET, "-g", "custom"])
    blocks = {"ac": {}, "batt": {}}
    cur = None
    if rc != 0:
        return blocks
    for line in out.splitlines():
        if line.startswith("Battery Power"):
            cur = "batt"
        elif line.startswith("AC Power"):
            cur = "ac"
        elif cur and line.startswith(" "):
            parts = line.split()
            # Only single-token keys matter to us (displaysleep, sleep, disksleep).
            # Multi-word rows like "Sleep On Power Button 1" fall out harmlessly.
            if len(parts) >= 2:
                blocks[cur][parts[0]] = parts[-1]
    return blocks


def pmset_int(blocks, source, key, fallback=0):
    try:
        return int(blocks.get(source, {}).get(key, fallback))
    except (TypeError, ValueError):
        return fallback


def defaults_read(domain, key):
    rc, out, _ = sh([DEFAULTS, "read", domain, key])
    if rc != 0:
        return None
    return out.strip()


def defaults_bool(domain, key, fallback=False):
    raw = defaults_read(domain, key)
    if raw is None:
        return fallback
    return raw.strip() in ("1", "true", "TRUE", "YES", "yes")


def defaults_int(domain, key, fallback=0):
    raw = defaults_read(domain, key)
    if raw is None:
        return fallback
    try:
        return int(raw)
    except ValueError:
        return fallback


def screenlock_delay():
    """
    Current 'require password after…' delay in seconds.
    Returns -1 for "never / off", or None if it can't be read.

    MUST run as the console user: -screenLock is a per-user setting, so asking
    as root reports root's value (always "off") and would make the remote lie
    about the logged-in user's lock delay.
    """
    rc, out, err = sh_as_user([SYSADMINCTL, "-screenLock", "status"])
    blob = (out + " " + err).lower()
    m = re.search(r"delay is (\d+) seconds", blob)
    if m:
        return int(m.group(1))
    if "off" in blob:
        return -1
    return None


def admin_password():
    """Read the opt-in admin password from the System keychain, or None."""
    if not os.path.exists(SYSTEM_KEYCHAIN):
        return None
    rc, out, _ = sh([SECURITY, "find-generic-password",
                     "-a", KEYCHAIN_ACCOUNT, "-s", KEYCHAIN_SERVICE,
                     "-w", SYSTEM_KEYCHAIN])
    if rc != 0:
        return None
    pw = out.strip("\n")
    return pw or None


# --------------------------------------------------------------------------- #
# The caffeinate assertion — "keep awake" without touching any saved setting
# --------------------------------------------------------------------------- #

class Caffeine(object):
    """
    Holds a `caffeinate -dimsu` child process. This is the reversible twin of
    setting displaysleep to Never: it blocks display + system sleep only while
    the process lives, and dies with the agent, so a crash can never leave the
    Mac permanently awake.
    """

    def __init__(self):
        self.proc = None

    def active(self):
        return self.proc is not None and self.proc.poll() is None

    def set(self, on):
        if on and not self.active():
            try:
                self.proc = subprocess.Popen([CAFFEINATE, "-dimsu"])
                log("caffeinate: ON (pid %d)" % self.proc.pid)
            except Exception as e:                            # noqa: BLE001
                log("caffeinate failed: %s" % e)
                self.proc = None
        elif not on and self.active():
            try:
                self.proc.terminate()
                self.proc.wait(timeout=5)
            except Exception:                                 # noqa: BLE001
                try:
                    self.proc.kill()
                except Exception:                             # noqa: BLE001
                    pass
            log("caffeinate: OFF")
            self.proc = None


CAFFEINE = Caffeine()


# --------------------------------------------------------------------------- #
# Setting registry — the ONLY keys that will ever be honored
# --------------------------------------------------------------------------- #

SLEEP_CHOICES = [0, 1, 2, 3, 5, 10, 15, 20, 30, 60, 120, 180]   # minutes, 0 = never
LOCK_CHOICES = [-1, 0, 5, 60, 300, 900, 3600, 14400, 28800]     # seconds, -1 = never/off


def clamp_choice(value, choices, fallback):
    try:
        v = int(value)
    except (TypeError, ValueError):
        return fallback
    return v if v in choices else fallback


def read_state():
    """Snapshot every managed setting straight from macOS."""
    pm = pmset_custom()
    st = {
        "keepAwake":         CAFFEINE.active(),
        "displaySleepAC":    pmset_int(pm, "ac", "displaysleep"),
        "displaySleepBatt":  pmset_int(pm, "batt", "displaysleep"),
        "systemSleepAC":     pmset_int(pm, "ac", "sleep"),
        "systemSleepBatt":   pmset_int(pm, "batt", "sleep"),
        "showFullName":      defaults_bool(LOGINWINDOW, "SHOWFULLNAME", False),
        "showPasswordHints": defaults_int(LOGINWINDOW, "RetriesUntilHint", 0) > 0,
        "powerButtons":      not (defaults_bool(LOGINWINDOW, "SleepDisabled", False)
                                  or defaults_bool(LOGINWINDOW, "RestartDisabled", False)
                                  or defaults_bool(LOGINWINDOW, "ShutDownDisabled", False)),
        "lockMessage":       defaults_read(LOGINWINDOW, "LoginwindowText") or "",
    }
    delay = screenlock_delay()
    # None (nobody logged in at the console) is published as null rather than
    # guessing -1 — the remote leaves that control alone instead of showing a lie.
    st["screenLock"] = delay
    st["screenLockAvailable"] = (delay is not None) and (admin_password() is not None)
    return st


def apply_setting(key, want, current):
    """
    Push one setting into macOS. Returns True if a change was attempted.
    `want` is untrusted; every branch coerces it before use.
    """
    if key == "keepAwake":
        CAFFEINE.set(bool(want))
        return True

    if key in ("displaySleepAC", "displaySleepBatt", "systemSleepAC", "systemSleepBatt"):
        minutes = clamp_choice(want, SLEEP_CHOICES, None)
        if minutes is None or minutes == current:
            return False
        source = "-c" if key.endswith("AC") else "-b"
        knob = "displaysleep" if key.startswith("displaySleep") else "sleep"
        rc, _, err = sh([PMSET, source, knob, str(minutes)])
        if rc != 0:
            log("pmset %s %s %d failed: %s" % (source, knob, minutes, err.strip()))
        return True

    if key == "showFullName":
        val = "true" if want else "false"
        sh([DEFAULTS, "write", LOGINWINDOW, "SHOWFULLNAME", "-bool", val])
        return True

    if key == "showPasswordHints":
        # macOS shows a hint after N failed attempts; 0 disables it entirely.
        sh([DEFAULTS, "write", LOGINWINDOW, "RetriesUntilHint", "-int", "3" if want else "0"])
        return True

    if key == "powerButtons":
        disabled = "false" if want else "true"
        for k in ("SleepDisabled", "RestartDisabled", "ShutDownDisabled", "PowerOffDisabled"):
            sh([DEFAULTS, "write", LOGINWINDOW, k, "-bool", disabled])
        return True

    if key == "lockMessage":
        text = "" if want is None else str(want)
        text = "".join(ch for ch in text if ch == "\n" or ord(ch) >= 32)[:200]
        if text:
            sh([DEFAULTS, "write", LOGINWINDOW, "LoginwindowText", "-string", text])
        else:
            sh([DEFAULTS, "delete", LOGINWINDOW, "LoginwindowText"])
        return True

    if key == "screenLock":
        if current is None:
            warn_once("screenlock-unreadable", "screenLock skipped — can't read it (nobody at the console?)")
            return False
        pw = admin_password()
        if not pw:
            warn_once("screenlock-nopw", "screenLock ignored — no admin password in the System keychain")
            return False
        secs = clamp_choice(want, LOCK_CHOICES, None)
        if secs is None or secs == current:
            return False
        arg = "off" if secs < 0 else str(secs)
        # Per-user setting — must be applied in the console user's session, for
        # the same reason screenlock_delay() reads it there.
        rc, _, err = sh_as_user([SYSADMINCTL, "-screenLock", arg, "-password", pw])
        if rc != 0:
            log("sysadminctl -screenLock %s failed: %s" % (arg, err.strip()))
        return True

    return False


# Keys the phone is allowed to drive. Anything else in /desired is ignored.
WRITABLE = ("keepAwake", "displaySleepAC", "displaySleepBatt", "systemSleepAC",
            "systemSleepBatt", "showFullName", "showPasswordHints", "powerButtons",
            "lockMessage", "screenLock")


# --------------------------------------------------------------------------- #
# One-shot actions (the "click" of this project)
# --------------------------------------------------------------------------- #

def do_action(cmd):
    cmd = str(cmd).strip().lower()
    if cmd == "lock":
        # ScreenSaverEngine + a non-zero screenLock delay is the modern lock.
        # CGSession was removed in macOS 26.
        sh_as_user([OPEN, "-a", "ScreenSaverEngine"])
    elif cmd == "displayoff":
        sh([PMSET, "displaysleepnow"])
    elif cmd == "sleep":
        sh([PMSET, "sleepnow"])
    elif cmd == "refresh":
        pass                                                   # publish handles it
    else:
        log("unknown command: %r" % cmd)
        return
    log("action: %s" % cmd)


# --------------------------------------------------------------------------- #
# Firebase REST
# --------------------------------------------------------------------------- #

def fb_get(path):
    url = "%s/%s/%s.json" % (DB_URL, ROOT, path)
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:                                     # noqa: BLE001
        log("GET %s failed: %s" % (path, e))
        return None


def fb_put(path, value):
    url = "%s/%s/%s.json" % (DB_URL, ROOT, path)
    body = json.dumps(value).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="PUT",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
            return True
    except Exception as e:                                     # noqa: BLE001
        log("PUT %s failed: %s" % (path, e))
        return False


# --------------------------------------------------------------------------- #
# Reconcile loop
# --------------------------------------------------------------------------- #

HOSTNAME = None
_last_publish = 0.0


def host_name():
    global HOSTNAME
    if HOSTNAME is None:
        rc, out, _ = sh([SCUTIL, "--get", "ComputerName"])
        HOSTNAME = out.strip() if rc == 0 and out.strip() else socket.gethostname()
    return HOSTNAME


def publish_state(state=None):
    global _last_publish
    st = dict(state or read_state())
    st["host"] = host_name()
    st["user"] = console_user() or ""
    st["updatedAt"] = int(time.time() * 1000)
    fb_put("state", st)
    _last_publish = time.time()
    return st


def reconcile():
    """Read /desired, apply the deltas, mirror the truth back to /state."""
    current = read_state()
    desired = fb_get("desired")

    if not isinstance(desired, dict):
        # First run against an empty node — seed /desired from reality so the
        # phone has something to render and nothing gets "applied" on boot.
        seed = dict((k, current[k]) for k in WRITABLE if k in current)
        fb_put("desired", seed)
        log("seeded /desired from current machine state")
        publish_state(current)
        return

    changed = []
    for key in WRITABLE:
        if key not in desired:
            continue
        want = desired[key]
        if key == "keepAwake" or isinstance(want, bool) or key in ("lockMessage",):
            same = (current.get(key) == want)
        else:
            same = (current.get(key) == want)
        if same:
            continue
        if apply_setting(key, want, current.get(key)):
            changed.append("%s=%r" % (key, want))

    if changed:
        log("applied: %s" % ", ".join(changed))
        time.sleep(0.6)                        # let pmset/defaults settle before re-reading
        publish_state()
    else:
        publish_state(current)


def handle_command():
    cmd = fb_get("command")
    if not cmd or not isinstance(cmd, str):
        return
    do_action(cmd)
    fb_put("command", "")
    publish_state()


# --------------------------------------------------------------------------- #
# SSE stream — same shape as the ESP32 firmware's Firebase stream
# --------------------------------------------------------------------------- #

def stream_forever():
    backoff = RECONNECT_DELAY
    while True:
        try:
            url = "%s/%s.json" % (DB_URL, ROOT)
            req = urllib.request.Request(url, headers={"Accept": "text/event-stream"})
            log("streaming %s" % url)
            with urllib.request.urlopen(req, timeout=STREAM_TIMEOUT) as resp:
                backoff = RECONNECT_DELAY
                reconcile()
                handle_command()
                event = None
                for raw in resp:
                    line = raw.decode("utf-8", "replace").rstrip("\n")
                    if line.startswith("event:"):
                        event = line[6:].strip()
                        continue
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if event in (None, "keep-alive", "auth_revoked"):
                        if time.time() - _last_publish > HEARTBEAT_SECS:
                            publish_state()
                        continue
                    # Ignore echoes of our own /state writes, else we'd loop.
                    try:
                        data = json.loads(payload)
                        path = data.get("path", "/") if isinstance(data, dict) else "/"
                    except ValueError:
                        path = "/"
                    if path.startswith("/state"):
                        continue
                    if path.startswith("/command"):
                        handle_command()
                    else:
                        reconcile()
                        handle_command()
        except socket.timeout:
            log("stream idle timeout — reconnecting")
        except urllib.error.HTTPError as e:
            log("stream HTTP %s — check the RTDB rules for /%s" % (e.code, ROOT))
        except Exception as e:                                 # noqa: BLE001
            log("stream error: %s" % e)

        # Offline or rejected: keep the local state honest, then back off.
        time.sleep(backoff)
        backoff = min(backoff * 2, RECONNECT_MAX)


def shutdown(signum, _frame):
    log("signal %d — releasing caffeinate and exiting" % signum)
    CAFFEINE.set(False)
    sys.exit(0)


def main():
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    if os.geteuid() != 0:
        log("WARNING: not running as root — pmset and loginwindow writes will fail")
    log("mac-toggle agent starting on %s" % host_name())
    stream_forever()


if __name__ == "__main__":
    main()
