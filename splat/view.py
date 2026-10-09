#!/usr/bin/python3
"""Open a splat file in the local viewer — works offline.

    python3 view.py ~/Downloads/scan.ply        # serves it, opens the browser
    python3 view.py                             # empty viewer; drag a file in

Serves this folder (viewer + vendored three/Spark) and the given file at
/scan/<name> on 127.0.0.1 only. Ctrl-C to stop.
"""
import os
import subprocess
import sys
import urllib.parse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
SCAN = os.path.abspath(os.path.expanduser(ARGS[0])) if ARGS else None


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def translate_path(self, path):
        p = urllib.parse.unquote(urllib.parse.urlparse(path).path)
        if SCAN and p == "/scan/" + os.path.basename(SCAN):
            return SCAN
        return super().translate_path(path)


srv = None
for port in range(8790, 8810):
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=HERE))
        break
    except OSError:
        pass
if not srv:
    sys.exit("no free port")

url = f"http://127.0.0.1:{port}/"
if SCAN:
    url += "?src=" + urllib.parse.quote("scan/" + os.path.basename(SCAN))
print("viewer:", url, flush=True)
if "--no-open" not in sys.argv:
    subprocess.Popen(["/usr/bin/open", url])
try:
    srv.serve_forever()
except KeyboardInterrupt:
    pass
