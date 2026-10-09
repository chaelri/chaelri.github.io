#!/usr/bin/python3
"""Karera — offline kart racing. The Mac is the screen; phones are the wheels.

    python3 server.py            # http :8810 (joystick) + https :8811 (tilt steering)
    python3 server.py --no-open

Stdlib only, no internet. Phones and the Mac need the same local network
(house WiFi, even with no internet, or one phone's hotspot).

This server only relays. The race itself runs in the board page (index.html):
  phone --ws--> server --ws--> board      inputs, ~30 Hz
  board --ws--> server --ws--> phone      HUD status, ~6 Hz
A phone whose WebSocket can't connect falls back to POST /in + SSE /out.

HTTPS exists because phones only allow motion sensors (tilt steering) on a
secure page. The certificate is self-signed and made here with openssl, so a
phone shows a warning once; joystick mode on plain http needs none of that.
"""
import argparse
import base64
import hashlib
import json
import os
import queue
import re
import socket
import ssl
import struct
import subprocess
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
CERTS = os.path.join(HERE, "certs")
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, default=8810)
ap.add_argument("--no-open", action="store_true")
ARGS = ap.parse_args()

TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
         ".glb": "model/gltf-binary", ".png": "image/png", ".svg": "image/svg+xml", ".css": "text/css"}

LOCK = threading.Lock()
BOARD = [None]          # the board's WS connection
PHONES = {}             # pid -> set of sinks (WS conns or SSE queues)
PORTS = {}


def local_ips():
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
        label = "iPhone hotspot" if ip.startswith("172.20.10.") else "WiFi" if iface == "en0" else iface
        ips.append((label, ip))
    ips.sort(key=lambda x: x[0] != "WiFi")
    return ips


def ensure_cert():
    """Self-signed cert covering every current LAN IP; remade when the IPs change."""
    os.makedirs(CERTS, exist_ok=True)
    crt, key, tag = (os.path.join(CERTS, n) for n in ("cert.pem", "key.pem", "ips.txt"))
    ips = sorted({ip for _, ip in local_ips()} | {"127.0.0.1"})
    want = ",".join(ips)
    if os.path.exists(crt) and os.path.exists(key) and os.path.exists(tag) and open(tag).read() == want:
        return crt, key
    san = ",".join(["DNS:localhost"] + ["IP:" + ip for ip in ips])
    cfg = os.path.join(CERTS, "req.cnf")
    with open(cfg, "w") as f:
        f.write("[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=Karera\n"
                "[ext]\nsubjectAltName=%s\nbasicConstraints=CA:false\nkeyUsage=digitalSignature,keyEncipherment\n"
                "extendedKeyUsage=serverAuth\n" % san)
    r = subprocess.run(["/usr/bin/openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "825",
                        "-keyout", key, "-out", crt, "-config", cfg], capture_output=True, text=True)
    if r.returncode != 0:
        print("  (couldn't make an HTTPS certificate, tilt steering disabled)\n", r.stderr[-300:])
        return None, None
    with open(tag, "w") as f:
        f.write(want)
    return crt, key


# ---------------- minimal WebSocket (RFC 6455, text frames only) ----------------
class WS:
    def __init__(self, handler):
        self.r, self.w = handler.rfile, handler.wfile
        self.lock = threading.Lock()
        self.open = True

    def send(self, text):
        data = text.encode()
        n = len(data)
        head = bytes([0x81]) + (bytes([n]) if n < 126 else bytes([126]) + struct.pack(">H", n) if n < 65536
                                else bytes([127]) + struct.pack(">Q", n))
        try:
            with self.lock:
                self.w.write(head + data)
                self.w.flush()
        except OSError:
            self.open = False

    def _control(self, op, payload=b""):
        try:
            with self.lock:
                self.w.write(bytes([0x80 | op, len(payload)]) + payload)
                self.w.flush()
        except OSError:
            self.open = False

    def recv(self):
        """Next text message, or None when the socket closes."""
        buf = b""
        while True:
            h = self.r.read(2)
            if len(h) < 2:
                return None
            fin, op = h[0] & 0x80, h[0] & 0x0F
            n = h[1] & 0x7F
            if n == 126:
                n = struct.unpack(">H", self.r.read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self.r.read(8))[0]
            if n > 1 << 20:
                return None
            mask = self.r.read(4) if h[1] & 0x80 else b"\0\0\0\0"
            raw = self.r.read(n)
            data = bytes(b ^ mask[i & 3] for i, b in enumerate(raw))
            if op == 8:
                self._control(8)
                return None
            if op == 9:
                self._control(10, data[:125])
                continue
            if op == 10:
                continue
            buf += data
            if fin:
                return buf.decode("utf-8", "replace")


def to_board(msg):
    b = BOARD[0]
    if b and b.open:
        b.send(json.dumps(msg, separators=(",", ":")))


def to_phone(pid, text):
    with LOCK:
        sinks = list(PHONES.get(pid, ()))
    for s in sinks:
        if isinstance(s, WS):
            s.send(text)
        else:
            s.put(text)


def phone_join(pid, sink):
    with LOCK:
        PHONES.setdefault(pid, set()).add(sink)
    to_board({"t": "hello", "pid": pid})


def phone_leave(pid, sink):
    with LOCK:
        s = PHONES.get(pid)
        if s:
            s.discard(sink)
            if not s:
                del PHONES[pid]
        gone = pid not in PHONES
    if gone:
        to_board({"t": "bye", "pid": pid})


def from_phone(pid, text):
    try:
        m = json.loads(text)
    except ValueError:
        return
    if isinstance(m, dict):
        to_board({"t": "msg", "pid": pid, "m": m})


def from_board(text):
    try:
        m = json.loads(text)
    except ValueError:
        return
    out = json.dumps(m.get("m"), separators=(",", ":"))
    to = m.get("to")
    if to == "*":
        with LOCK:
            pids = list(PHONES)
        for pid in pids:
            to_phone(pid, out)
    elif to:
        to_phone(to, out)


class Handler(BaseHTTPRequestHandler):
    server_version = "karera"
    protocol_version = "HTTP/1.1"

    def setup(self):
        super().setup()
        try:
            self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except OSError:
            pass

    def log_message(self, *a):
        pass

    def is_local(self):
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0]
        return self.client_address[0] in ("127.0.0.1", "::1") and host in ("localhost", "127.0.0.1")

    def send(self, code, body, ctype="text/plain; charset=utf-8", extra=None):
        if isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def static(self, rel):
        path = os.path.normpath(os.path.join(HERE, rel))
        if not path.startswith(HERE + os.sep) or "/." in path or not os.path.isfile(path):
            return self.send(404, "not found")
        ext = os.path.splitext(path)[1]
        if ext not in TYPES or os.path.basename(path) in ("server.py",):
            return self.send(404, "not found")
        with open(path, "rb") as f:
            self.send(200, f.read(), TYPES[ext])

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        path, q = u.path, urllib.parse.parse_qs(u.query)
        if path == "/ws":
            return self.websocket(q)
        if path == "/out":
            return self.sse(q.get("pid", [""])[0])
        if path in ("/p", "/p/"):
            return self.static("phone.html")
        if path == "/api/net":
            ips = [{"label": l, "ip": i} for l, i in local_ips()]
            return self.send(200, json.dumps({"http": PORTS.get("http"), "https": PORTS.get("https"), "ips": ips}), "application/json")
        if path == "/" or path == "/index.html":
            if not self.is_local():
                self.send_response(302)
                self.send_header("Location", "/p")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            return self.static("index.html")
        if path.startswith(("/js/", "/vendor/", "/assets/")):
            return self.static(path.lstrip("/"))
        return self.send(404, "not found")

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/in":
            pid = urllib.parse.parse_qs(u.query).get("pid", [""])[0][:40]
            n = min(int(self.headers.get("Content-Length", "0") or 0), 4096)
            body = self.rfile.read(n).decode("utf-8", "replace")
            if pid:
                from_phone(pid, body)
            return self.send(204, b"")
        return self.send(404, "not found")

    def websocket(self, q):
        key = self.headers.get("Sec-WebSocket-Key")
        if not key:
            return self.send(400, "websocket only")
        role = q.get("role", ["phone"])[0]
        pid = q.get("pid", [""])[0][:40]
        if role == "board" and not self.is_local():
            return self.send(403, "board is local only")
        if role != "board" and not pid:
            return self.send(400, "pid needed")
        acc = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
        self.send_response(101)
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", acc)
        self.end_headers()
        self.wfile.flush()
        ws = WS(self)
        self.close_connection = True
        if role == "board":
            old = BOARD[0]
            BOARD[0] = ws
            if old:
                old.open = False
            with LOCK:
                pids = list(PHONES)
            ws.send(json.dumps({"t": "phones", "pids": pids}))
            for pid_ in pids:  # phones re-introduce themselves to a fresh board
                to_phone(pid_, json.dumps({"t": "board"}))
            while ws.open:
                m = ws.recv()
                if m is None:
                    break
                from_board(m)
            if BOARD[0] is ws:
                BOARD[0] = None
            return
        phone_join(pid, ws)
        try:
            while ws.open:
                m = ws.recv()
                if m is None:
                    break
                from_phone(pid, m)
        except OSError:
            pass
        finally:
            ws.open = False
            phone_leave(pid, ws)

    def sse(self, pid):
        if not pid:
            return self.send(400, "pid needed")
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.close_connection = True
        qq = queue.Queue(maxsize=200)
        phone_join(pid, qq)
        try:
            while True:
                try:
                    m = qq.get(timeout=15)
                    self.wfile.write(b"data: " + m.encode() + b"\n\n")
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                self.wfile.flush()
        except OSError:
            pass
        finally:
            phone_leave(pid, qq)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False   # HTTPServer turns it on; we'd silently share a busy port


def bind(port):
    for _ in range(20):
        try:
            return Server(("0.0.0.0", port), Handler), port
        except OSError:
            port += 2
    sys.exit("no free port near %d" % port)


def main():
    srv, port = bind(ARGS.port)
    PORTS["http"] = port
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    crt, key = ensure_cert()
    if crt:
        ssrv, sport = bind(port + 1)
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(crt, key)
        ssrv.socket = ctx.wrap_socket(ssrv.socket, server_side=True, do_handshake_on_connect=False)
        PORTS["https"] = sport
        threading.Thread(target=ssrv.serve_forever, daemon=True).start()
    print("Karera (offline kart racing)")
    for label, ip in local_ips() or [("no network", "join the WiFi first")]:
        print(f"  phones ({label:14}) http://{ip}:{port}/p")
    print(f"  board                  http://localhost:{port}/")
    print("  Ctrl-C to stop\n", flush=True)
    if not ARGS.no_open:
        subprocess.Popen(["/usr/bin/open", f"http://localhost:{port}/"])
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("\nstopped.")


if __name__ == "__main__":
    main()
