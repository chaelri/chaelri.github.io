#!/usr/bin/env python3
"""tlw server: serves a folder and takes Charlie's pick from the page.

usage: python3 tools/tlw/serve.py <folder> [port]

GET  /tlw.js  -> the pick/comment/submit widget (this folder's tlw.js)
POST /submit  -> writes <folder>/answer.json (Claude waits on that file)
"""
import json, os, sys, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8820
WIDGET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tlw.js")


class H(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.split("?")[0] == "/tlw.js":
            body = open(WIDGET, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/submit":
            self.send_error(404)
            return
        n = int(self.headers.get("Content-Length") or 0)
        data = json.loads(self.rfile.read(n) or b"{}")
        data["at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        with open(os.path.join(ROOT, "answer.json"), "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print("ANSWER", json.dumps(data, ensure_ascii=False), flush=True)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')


ThreadingHTTPServer(("127.0.0.1", PORT), partial(H, directory=ROOT)).serve_forever()
