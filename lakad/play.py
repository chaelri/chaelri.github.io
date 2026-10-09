#!/usr/bin/python3
"""Serve the repo root on 127.0.0.1 and open /lakad/ (it imports ../splat/vendor).

    python3 play.py [--no-open]
"""
import os
import subprocess
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class H(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


for port in range(8820, 8840):
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", port), partial(H, directory=ROOT))
        break
    except OSError:
        continue
else:
    sys.exit("no free port")
url = f"http://127.0.0.1:{port}/lakad/"
print("play:", url, flush=True)
if "--no-open" not in sys.argv:
    subprocess.Popen(["/usr/bin/open", url])
try:
    srv.serve_forever()
except KeyboardInterrupt:
    pass
