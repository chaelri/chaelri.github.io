#!/usr/bin/env python3
"""Laro: one launcher for the offline party games.

    python3 laro/serve.py          (or double-click Laro.command)

Opens a page on this Mac with a card per game. Picking one starts that game's
own server (if it isn't already up) and opens its board. Ctrl-C stops the
launcher and every game it started.

The page is localhost-only: it can start processes, so it never listens on
the LAN and rejects any Host/Origin that isn't this machine.
"""
import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
PY = "/usr/bin/python3"

GAMES = {
    "rambulan": {"dir": "rambulan", "port": 8830},
    "karera":   {"dir": "karera",   "port": 8810},
}

ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, default=8840)
ap.add_argument("--no-open", action="store_true")
ARGS = ap.parse_args()

CHILDREN = {}   # game id -> Popen
LOCAL = ("localhost", "127.0.0.1")


def listening(port):
    with socket.socket() as s:
        s.settimeout(0.2)
        return s.connect_ex(("127.0.0.1", port)) == 0


def start(gid):
    g = GAMES[gid]
    if not listening(g["port"]):
        CHILDREN[gid] = subprocess.Popen(
            [PY, "-u", os.path.join(HERE, g["dir"], "server.py"), "--no-open", "--port", str(g["port"])])
        for _ in range(50):                      # up to 5 s for it to bind
            if listening(g["port"]):
                break
            time.sleep(0.1)
    return listening(g["port"])


def stop(gid):
    p = CHILDREN.pop(gid, None)
    if p and p.poll() is None:
        p.terminate()
        try:
            p.wait(3)
        except subprocess.TimeoutExpired:
            p.kill()


class H(BaseHTTPRequestHandler):
    server_version = "laro"

    def log_message(self, *a):
        pass

    def local(self):
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0]
        origin = self.headers.get("Origin")
        if host not in LOCAL:
            return False
        if origin and origin.split("://", 1)[-1].rsplit(":", 1)[0] not in LOCAL:
            return False
        return True

    def send(self, code, body, ctype="application/json"):
        b = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def status(self):
        return {gid: {"port": g["port"], "running": listening(g["port"]), "ours": gid in CHILDREN}
                for gid, g in GAMES.items()}

    def do_GET(self):
        if not self.local():
            return self.send(403, "{}")
        if self.path == "/api/status":
            return self.send(200, json.dumps(self.status()))
        if self.path in ("/", "/index.html"):
            with open(os.path.join(HERE, "index.html"), "rb") as f:
                return self.send(200, f.read(), "text/html; charset=utf-8")
        self.send(404, "{}")

    def do_POST(self):
        if not self.local():
            return self.send(403, "{}")
        parts = self.path.strip("/").split("/")          # api/start/<id> | api/stop/<id>
        if len(parts) == 3 and parts[0] == "api" and parts[2] in GAMES:
            gid = parts[2]
            if parts[1] == "start":
                ok = start(gid)
                return self.send(200 if ok else 500, json.dumps({"ok": ok, "url": f"http://localhost:{GAMES[gid]['port']}/"}))
            if parts[1] == "stop":
                stop(gid)
                return self.send(200, json.dumps({"ok": True}))
        self.send(404, "{}")


def main():
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", ARGS.port), H)
    except OSError:
        if listening(ARGS.port):                 # launcher already up: just show it
            print("Laro is already running.")
            subprocess.Popen(["/usr/bin/open", f"http://localhost:{ARGS.port}/"])
            return
        raise
    url = f"http://localhost:{ARGS.port}/"
    print("Laro (offline games)")
    print(f"  {url}")
    print("  Ctrl-C stops the launcher and the games it started\n", flush=True)
    if not ARGS.no_open:
        subprocess.Popen(["/usr/bin/open", url])
    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):   # closing the Terminal window = SIGHUP
        signal.signal(sig, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        for gid in list(CHILDREN):
            stop(gid)
        print("\nstopped.")


if __name__ == "__main__":
    sys.exit(main())
