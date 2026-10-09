#!/usr/bin/python3
"""phone-drop — the Mac as a receiver. Scan the QR, pick files on the phone,
they land in ~/Downloads/From iPhone. Keeps receiving until Ctrl-C.

    python3 receive.py            # port 8787, opens the QR page
    python3 receive.py --port 9000 --out ~/Desktop/drop --no-open

Stdlib only, no internet needed. The phone has to reach the Mac over SOME
local link: the same WiFi, or the Mac joined to the iPhone's Personal Hotspot
(works with mobile data off). The QR page follows whichever is up.

Security: the phone URL carries a per-run random token; the QR page and its
API answer only to localhost (client IP *and* Host header, against DNS rebinding).
"""
import argparse
import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
CHUNK = 1024 * 1024

ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, default=8787)
ap.add_argument("--out", default="~/Downloads/From iPhone")
ap.add_argument("--no-open", action="store_true")
ARGS = ap.parse_args()

OUT = os.path.expanduser(ARGS.out)
TOKEN = secrets.token_urlsafe(9)
LOCK = threading.Lock()
ACTIVE = {}    # upload id -> {name, got, total, started}
RECEIVED = []  # [{name, size, at, secs}] this run, newest last


def local_ips():
    """[(label, ip)] for every interface the phone could plausibly reach."""
    try:
        out = subprocess.run(["/sbin/ifconfig"], capture_output=True, text=True).stdout
    except OSError:
        return []
    ips, iface = [], None
    for line in out.splitlines():
        m = re.match(r"^([a-z0-9]+):", line)
        if m:
            iface = m.group(1)
            continue
        m = re.match(r"\s+inet (\d+\.\d+\.\d+\.\d+)", line)
        if not m or iface is None:
            continue
        ip = m.group(1)
        if ip.startswith(("127.", "169.254.")) or iface.startswith(("utun", "awdl", "llw")):
            continue
        if ip.startswith("172.20.10."):
            label = "iPhone hotspot"
        elif iface == "en0":
            label = "WiFi"
        elif iface.startswith("bridge"):
            label = "Shared network"
        else:
            label = iface
        ips.append((label, ip))
    # the hotspot first: it's the no-router case this tool is for
    ips.sort(key=lambda x: x[0] != "iPhone hotspot")
    return ips


def safe_name(raw):
    name = os.path.basename(raw.replace("\\", "/")).strip().lstrip(".")
    name = re.sub(r'[\x00-\x1f:/]', "_", name)[:200]
    return name or f"file-{int(time.time())}"


def unique_dest(name):
    dest = os.path.join(OUT, name)
    stem, ext = os.path.splitext(name)
    n = 2
    while os.path.exists(dest):
        dest = os.path.join(OUT, f"{stem} ({n}){ext}")
        n += 1
    return dest


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1000 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1000


class Handler(BaseHTTPRequestHandler):
    server_version = "phone-drop"

    def log_message(self, *a):  # quiet; we print our own lines
        pass

    def is_local(self):
        host = (self.headers.get("Host") or "").split(":")[0]
        return self.client_address[0] in ("127.0.0.1", "::1") and host in ("localhost", "127.0.0.1")

    def send(self, code, body, ctype="text/html; charset=utf-8"):
        if isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def json(self, obj, code=200):
        self.send(code, json.dumps(obj), "application/json")

    # ---- routes -------------------------------------------------------
    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == f"/s/{TOKEN}":
            return self.send(200, PHONE_HTML)
        if path.startswith("/s/"):
            return self.send(403, "This QR is from an old session. Scan the one on the Mac again.", "text/plain")
        if not self.is_local():
            return self.send(404, "not found", "text/plain")
        if path == "/":
            return self.send(200, MAC_HTML)
        if path == "/qrcode.js":
            with open(os.path.join(HERE, "qrcode.js"), "rb") as f:
                return self.send(200, f.read(), "text/javascript")
        if path == "/api/state":
            with LOCK:
                active = [dict(v, id=k) for k, v in ACTIVE.items()]
                received = list(RECEIVED[-200:])
            return self.json({
                "port": self.server.server_address[1],
                "token": TOKEN,
                "out": OUT,
                "ips": [{"label": l, "ip": i} for l, i in local_ips()],
                "active": active,
                "received": received,
            })
        return self.send(404, "not found", "text/plain")

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/open" and self.is_local():
            subprocess.run(["/usr/bin/open", OUT])
            return self.json({"ok": True})
        return self.send(404, "not found", "text/plain")

    def do_PUT(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != f"/s/{TOKEN}/up":
            return self.send(403, "bad token", "text/plain")
        q = urllib.parse.parse_qs(u.query)
        name = safe_name(q.get("name", [""])[0])
        try:
            total = int(self.headers.get("Content-Length", ""))
        except ValueError:
            return self.send(411, "length required", "text/plain")

        uid = secrets.token_hex(4)
        part = os.path.join(OUT, f".{uid}.part")
        started = time.time()
        with LOCK:
            ACTIVE[uid] = {"name": name, "got": 0, "total": total, "started": started}
        got = 0
        try:
            with open(part, "wb") as f:
                while got < total:
                    buf = self.rfile.read(min(CHUNK, total - got))
                    if not buf:
                        break
                    f.write(buf)
                    got += len(buf)
                    with LOCK:
                        ACTIVE[uid]["got"] = got
            if got != total:
                raise IOError(f"connection dropped at {got}/{total} bytes")
            with LOCK:  # pick the name and claim it in one step
                dest = unique_dest(name)
                os.rename(part, dest)
                secs = round(time.time() - started, 1)
                RECEIVED.append({"name": os.path.basename(dest), "size": total,
                                 "at": time.time(), "secs": secs})
            print(f"  ✓ {os.path.basename(dest)}  {human(total)}  {secs}s", flush=True)
            self.json({"ok": True, "saved": os.path.basename(dest)})
        except Exception as e:
            print(f"  ✗ {name}: {e}", flush=True)
            try:
                os.remove(part)
            except OSError:
                pass
            try:
                self.json({"ok": False, "error": str(e)}, 500)
            except OSError:
                pass
        finally:
            with LOCK:
                ACTIVE.pop(uid, None)


def load(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return f.read()


MAC_HTML = load("mac.html")
PHONE_HTML = load("phone.html")


def main():
    os.makedirs(OUT, exist_ok=True)
    # sweep partials a crashed run left behind
    for n in os.listdir(OUT):
        if n.startswith(".") and n.endswith(".part"):
            os.remove(os.path.join(OUT, n))

    port = ARGS.port
    for _ in range(20):
        try:
            srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
            break
        except OSError:
            port += 1
    else:
        sys.exit("no free port near %d" % ARGS.port)
    srv.daemon_threads = True

    print(f"phone-drop receiving → {OUT}")
    for label, ip in local_ips() or [("none yet", "join WiFi or the iPhone hotspot")]:
        print(f"  {label:16} http://{ip}:{port}/s/{TOKEN}")
    print(f"  QR page        http://localhost:{port}/")
    print("  Ctrl-C to stop\n", flush=True)
    if not ARGS.no_open:
        subprocess.Popen(["/usr/bin/open", f"http://localhost:{port}/"])
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped.")


if __name__ == "__main__":
    main()
