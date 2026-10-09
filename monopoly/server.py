#!/usr/bin/python3
"""Monopoly night — the Mac is the board and the bank; phones are wallets.

    python3 server.py           # resume the saved game (or a fresh lobby), port 8800
    python3 server.py --new     # throw away the saved game
    python3 server.py --port 9000 --no-open

Stdlib only, no internet. Phones and the Mac just need the same local network:
the house WiFi router (works even when the internet itself is down), or one
phone's hotspot. The board shows a QR that follows whichever is up.

The engine (game.py) lives here and nowhere else: phones send intents
("roll", "buy", "bid 120") and get the whole table back over Server-Sent Events.
Every change is saved to saves/current.json, so a crash or a closed lid resumes.

Security: the board + host controls answer only to localhost (client IP and Host
header). A phone acts only as the player whose secret it holds.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from game import COLORS, GROUPS, SQUARES, Game, GameError, unmortgage_cost

HERE = os.path.dirname(os.path.abspath(__file__))

ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, default=8800)
ap.add_argument("--new", action="store_true")
ap.add_argument("--no-open", action="store_true")
ap.add_argument("--save", default=os.path.join(HERE, "saves", "current.json"))
ARGS = ap.parse_args()
SAVE = os.path.abspath(ARGS.save)

LOCK = threading.Lock()
CHANGED = threading.Condition(LOCK)
GAME = None
REV = [0]
SNAP = [b""]   # the latest public state, pre-encoded once per change


def local_ips():
    """[(label, ip)] for every interface a phone could plausibly reach."""
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
    ips.sort(key=lambda x: x[0] != "WiFi")
    return ips


def commit():
    """Call with LOCK held, after any change: bump rev, save, wake every stream."""
    REV[0] += 1
    GAME.s["rev"] = REV[0]
    SNAP[0] = json.dumps(GAME.public(), separators=(",", ":")).encode()
    tmp = SAVE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(GAME.s, f)
    os.replace(tmp, SAVE)
    CHANGED.notify_all()


def board_data():
    sq = []
    for i, s in enumerate(SQUARES):
        d = dict(s, i=i)
        if s["type"] in ("street", "rail", "util"):
            d["mortgage"] = s["price"] // 2
            d["unmortgage"] = unmortgage_cost(i)
        sq.append(d)
    return {"squares": sq, "groups": GROUPS, "colors": COLORS}


PLAYER_ACTIONS = {
    "roll": lambda g, p, a: g.roll(p),
    "buy": lambda g, p, a: g.buy(p),
    "decline": lambda g, p, a: g.decline(p),
    "bid": lambda g, p, a: g.bid(p, a["amount"]),
    "pass": lambda g, p, a: g.auction_pass(p),
    "end": lambda g, p, a: g.end_turn(p),
    "jail_pay": lambda g, p, a: g.jail_pay(p),
    "jail_card": lambda g, p, a: g.jail_card(p),
    "build": lambda g, p, a: g.build(p, int(a["sq"])),
    "sell": lambda g, p, a: g.sell_house(p, int(a["sq"])),
    "mortgage": lambda g, p, a: g.mortgage(p, int(a["sq"])),
    "unmortgage": lambda g, p, a: g.unmortgage(p, int(a["sq"])),
    "bankrupt": lambda g, p, a: g.bankrupt(p),
    "propose": lambda g, p, a: g.propose(p, a["to"], a.get("give", []), a.get("give_cash", 0),
                                         a.get("get", []), a.get("get_cash", 0)),
    "respond": lambda g, p, a: g.respond(p, a["id"], bool(a.get("accept"))),
    "cancel": lambda g, p, a: g.cancel_trade(p, a["id"]),
    "color": lambda g, p, a: g.set_color(p, a["color"]),
}


class Handler(BaseHTTPRequestHandler):
    server_version = "monopoly"

    def log_message(self, *a):
        pass

    def is_local(self):
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0]
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

    def file(self, name, ctype):
        with open(os.path.join(HERE, name), "rb") as f:
            self.send(200, f.read(), ctype)

    def body(self):
        try:
            n = min(int(self.headers.get("Content-Length", "0")), 65536)
            return json.loads(self.rfile.read(n) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return {}

    # ---- routes -------------------------------------------------------
    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path in ("/p", "/p/"):
            return self.file("phone.html", "text/html; charset=utf-8")
        if path == "/common.js":
            return self.file("common.js", "text/javascript")
        if path == "/api/board":
            return self.json(board_data())
        if path == "/events":
            return self.stream()
        if not self.is_local():
            if path == "/":  # someone typed the bare address on a phone
                return self._redirect("/p")
            return self.send(404, "not found", "text/plain")
        if path == "/":
            return self.file("board.html", "text/html; charset=utf-8")
        if path == "/qrcode.js":
            return self.file("qrcode.js", "text/javascript")
        if path == "/api/net":
            port = self.server.server_address[1]
            return self.json({"port": port, "ips": [{"label": l, "ip": i} for l, i in local_ips()]})
        return self.send(404, "not found", "text/plain")

    def _redirect(self, to):
        self.send_response(302)
        self.send_header("Location", to)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def stream(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()
        seen = -1
        try:
            while True:
                with LOCK:
                    if REV[0] == seen:
                        CHANGED.wait(15)
                    rev, snap = REV[0], SNAP[0]
                if rev == seen:
                    self.wfile.write(b": ping\n\n")
                else:
                    self.wfile.write(b"data: " + snap + b"\n\n")
                    seen = rev
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            return

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        a = self.body()
        try:
            if path == "/api/join":
                with LOCK:
                    p = GAME.join(a.get("name"), a.get("color"))
                    commit()
                return self.json({"ok": True, "id": p["id"], "secret": p["secret"]})
            if path == "/api/me":
                with LOCK:
                    p = GAME.by_secret(a.get("secret"))
                return self.json({"ok": bool(p), "id": p and p["id"]})
            if path == "/api/act":
                fn = PLAYER_ACTIONS.get(a.get("action"))
                if not fn:
                    return self.json({"ok": False, "error": "Unknown action."}, 400)
                with LOCK:
                    p = GAME.by_secret(a.get("secret"))
                    if not p:
                        return self.json({"ok": False, "error": "You're not in this game. Join again."}, 403)
                    fn(GAME, p, a)
                    commit()
                return self.json({"ok": True})
            if path == "/api/host" and self.is_local():
                return self.host(a)
        except GameError as e:
            return self.json({"ok": False, "error": str(e)})
        except (KeyError, TypeError, ValueError):
            return self.json({"ok": False, "error": "Bad request."}, 400)
        return self.send(404, "not found", "text/plain")

    def host(self, a):
        global GAME
        act = a.get("action")
        with LOCK:
            if act == "start":
                GAME.start()
            elif act == "kick":
                GAME.kick(a["id"])
            elif act == "settings":
                GAME.configure(a.get("settings", {}))
            elif act == "finish":
                if GAME.s["phase"] != "play":
                    raise GameError("No game running.")
                GAME.finish()
            elif act == "new":
                # same people, same colours, fresh money: one tap rematch
                old = GAME.s
                GAME = Game()
                GAME.s["settings"] = old["settings"]
                if a.get("keep_players"):
                    for p in old["players"]:
                        GAME.s["players"].append({"id": p["id"], "secret": p["secret"], "name": p["name"],
                                                  "color": p["color"], "cash": 0, "pos": 0, "jailed": False,
                                                  "jail_tries": 0, "cards": [], "out": False})
            else:
                raise GameError("Unknown host action.")
            commit()
        return self.json({"ok": True})


def ticker():
    while True:
        time.sleep(0.25)
        with LOCK:
            if GAME.tick():
                commit()


def main():
    global GAME
    os.makedirs(os.path.dirname(SAVE), exist_ok=True)
    state = None
    if not ARGS.new and os.path.exists(SAVE):
        try:
            with open(SAVE) as f:
                state = json.load(f)
        except (OSError, json.JSONDecodeError):
            state = None
    GAME = Game(state)
    if GAME.s.get("auction"):  # the clock moved on while we were down
        GAME.s["auction"]["ends"] = time.time() + 15
    with LOCK:
        commit()

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
    threading.Thread(target=ticker, daemon=True).start()

    resumed = state and GAME.s["phase"] != "lobby"
    print("Monopoly night" + (" (resumed saved game)" if resumed else ""))
    for label, ip in local_ips() or [("no network", "join the WiFi first")]:
        print(f"  phones ({label:14}) http://{ip}:{port}/p")
    print(f"  board                  http://localhost:{port}/")
    print("  Ctrl-C to stop (the game is saved)\n", flush=True)
    if not ARGS.no_open:
        subprocess.Popen(["/usr/bin/open", f"http://localhost:{port}/"])
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped. Run again to resume.")


if __name__ == "__main__":
    main()
