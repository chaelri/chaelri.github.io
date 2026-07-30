# mac-toggle

Remote control for this MacBook Pro's Lock Screen / sleep settings, built on the
same Firebase pattern as `autoclicker/` and `aircon/`: a phone page writes what it
wants, the device reconciles and mirrors back the truth.

```
[phone]  https://chaelri.github.io/mac-toggle/
   │  set(/mac-toggle/desired/<key>, value)
   ▼
[Firebase RTDB · test-database-55379 · asia-southeast1]
   │  SSE stream (long-lived, like the ESP32 firmware)
   ▼
[MacBook · root LaunchDaemon · /usr/local/libexec/mac-toggle.py]
   │  pmset / defaults / sysadminctl / caffeinate
   ▼
[/mac-toggle/state]  ← observed truth + heartbeat, phone renders from this
```

The ESP32 in the servo build has firmware; here macOS is the actuator and
`agent/mac-toggle.py` is the firmware.

## The remote is one toggle

`index.html` is deliberately a single control: **Never ↔ 5 minutes**, applied to
battery and power adapter together in one `update()` so they can never end up
half-applied. On = Never (display stays lit), off = 5 minutes.

The agent still knows how to drive everything in the table below — those keys are
just not on the page. Write them to `/mac-toggle/desired/<key>` directly (or add a
control back) if you ever want them. If the two power sources are ever set to
different values behind the app's back, the page says "Mixed" and shows both
rather than pretending.

## Install (on the Mac)

```bash
cd mac-toggle/agent
sudo ./install.sh
```

That copies the agent to `/usr/local/libexec/mac-toggle.py`, installs the
LaunchDaemon `com.chaelri.mactoggle`, and starts it. It runs as root because
`pmset` and `/Library/Preferences/com.apple.loginwindow` need it; anything that
touches the GUI session is bounced back to the logged-in user via
`launchctl asuser`.

**First run applies nothing.** If `/mac-toggle/desired` is empty, the agent seeds
it from the machine's current settings, so installing can't change anything
behind your back.

```bash
sudo ./install.sh uninstall      # stop + remove (settings stay where they are)
tail -f /var/log/mac-toggle.log  # what it's doing
sudo launchctl kickstart -k system/com.chaelri.mactoggle   # restart it
```

## What the agent can drive (only the first row is on the page)

| Setting | Command | Root? |
|---|---|---|
| **Turn display off (battery / adapter)** — the toggle | `pmset -b\|-c displaysleep <min>` | yes |
| Keep awake right now | `caffeinate -dimsu` held as a child process | no |
| Put the Mac to sleep (battery / adapter) | `pmset -b\|-c sleep <min>` | yes |
| Require password after… | `sysadminctl -screenLock <secs\|off> -password …` | yes + keychain |
| Show password hints | `defaults write …loginwindow RetriesUntilHint -int 3\|0` | yes |
| Login window shows name and password | `…loginwindow SHOWFULLNAME -bool` | yes |
| Show Sleep/Restart/Shut Down buttons | `…loginwindow {Sleep,Restart,ShutDown,PowerOff}Disabled -bool` | yes |
| Show message when locked | `…loginwindow LoginwindowText -string` | yes |
| Lock / Display off / Sleep (buttons) | `open -a ScreenSaverEngine`, `pmset displaysleepnow`, `pmset sleepnow` | mixed |

**Heads-up on system sleep.** `pmset` keeps `displaysleep` and `sleep` independent
— macOS does *not* clamp one to the other (verified 2026-07-30: displaysleep 5 with
sleep 1 was accepted as-is). This Mac has `sleep 1` on both sources, which never
bites while displaysleep is Never, but in 5-minute mode the machine may suspend
before the display even dims. Fold `systemSleepAC`/`systemSleepBatt` into the
toggle if that ever becomes annoying.

**Keep awake is the safe one.** It holds an assertion instead of writing a saved
setting, so it can't leave the Mac permanently awake — killing the agent releases
it, and so does a reboot. Prefer it over setting displaysleep to Never.

### The "Require password after…" row needs one-time setup

`sysadminctl -screenLock` insists on an admin password, and a daemon has nobody to
ask. Opt in with:

```bash
sudo ./install.sh set-admin-password        # stored in the SYSTEM keychain
sudo ./install.sh clear-admin-password      # undo
```

Root can read that back in plaintext. Until you run it the row shows as
unavailable and the agent refuses to touch the setting — that's the default.

## Firebase paths

| Path | Written by | Meaning |
|---|---|---|
| `/mac-toggle/desired` | phone | what you want. Partial writes are fine — one key at a time is normal. |
| `/mac-toggle/state` | Mac | what's actually true, plus `host`, `user`, `updatedAt`. The phone renders from here; a heartbeat lands every ~45 s and the UI calls the Mac "stale" past 120 s. |
| `/mac-toggle/command` | phone | transient one-shot: `lock`, `displayoff`, `sleep`, `refresh`. The agent clears it after running. |

Same two-path split as `/autoclicker/{command,state}`.

## Lock the RTDB path down

`test-database-55379` currently accepts unauthenticated reads and writes — a
`curl -X PUT` from anywhere can flip these toggles. That posture is the same as
the other projects on this database, but the stakes are higher here: it's your
laptop's lock screen, not a servo. Options, cheapest first:

1. **Leave it.** The path is unguessable-ish and the blast radius is settings you
   can flip back. This is what ships today.
2. **Pin it to your account.** Sign the remote in with Google instead of
   anonymously, then scope the rule:
   ```json
   "mac-toggle": { ".read": "auth.uid === 'YOUR_UID'", ".write": "auth.uid === 'YOUR_UID'" }
   ```
   Anonymous auth is no protection on its own — the web API key is public, so
   anyone can mint an anonymous session.

Whatever the rules say, the agent never trusts the data: only the whitelisted
keys in `WRITABLE` are honored, values are coerced and range-checked against
`SLEEP_CHOICES` / `LOCK_CHOICES`, the action list is fixed, and nothing from the
network ever reaches a shell (every call is list-args, no `shell=True`).

## Files

```
mac-toggle/
├── index.html                        ← the remote: one toggle (GitHub Pages /mac-toggle/)
├── README.md
└── agent/
    ├── mac-toggle.py                 ← the "firmware": SSE listener + reconciler
    ├── com.chaelri.mactoggle.plist   ← root LaunchDaemon
    └── install.sh                    ← install / uninstall / keychain setup
```

Adding a setting = one entry each in `read_state`, `apply_setting`, and `WRITABLE`
in the agent, then whatever UI you want for it. Values must be in the agent's
`SLEEP_CHOICES` / `LOCK_CHOICES` — anything else is dropped on purpose.
