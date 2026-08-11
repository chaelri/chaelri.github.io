#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
diskscope — the Python half.

A local-only HTTP server that scans a directory tree once, keeps a recursive
size index in memory, and serves it to `index.html` as JSON. It is the piece a
browser cannot do on its own: reading the disk, measuring folders, and calling
Finder to reveal a file.

Design notes worth knowing before you edit this:

  * The scan indexes DIRECTORIES only (path -> size/files/dirs/mtime). There are
    a few hundred thousand directories under a home folder but often millions of
    files, so indexing every file would cost hundreds of MB of RAM for nothing.
    Individual files are listed on demand with one `scandir` per folder, which is
    instant, and the biggest N files are kept in a separate capped heap so the
    "Big files" view has something to read.

  * The walk never crosses a device boundary (`st_dev`). On modern macOS that is
    what keeps `/System/Volumes/Data` firmlinks and mounted volumes from being
    counted twice.

  * Symlinks are never followed, so a loop cannot hang the scan.

Stdlib only — runs on the /usr/bin/python3 that ships with macOS (3.9). No pip,
no venv, no third-party anything.

SECURITY: binds 127.0.0.1 only, requires a per-run random token, and rejects
requests whose Host header is not localhost (a website in another tab must not
be able to drive `open -R` on your machine). Nothing from a request ever reaches
a shell — subprocess is always called with a list of args, never shell=True —
and every path is resolved and checked to be inside the scan root.

    python3 serve.py                 # scan ~, open the browser
    python3 serve.py ~/Documents     # scan a specific root
    python3 serve.py --port 8770     # different port
    python3 serve.py --no-open       # don't launch the browser
    python3 serve.py --fresh         # ignore the cached index
"""

import argparse
import base64
import hashlib
import http.server
import json
import mimetypes
import os
import secrets
import shutil
import socketserver
import subprocess
import sys
import threading
import time
import webbrowser
from urllib.parse import urlparse, parse_qs, unquote

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.expanduser("~/Library/Caches/diskscope")
CACHE_VERSION = 3

# How many "biggest files" to remember from a scan. The Big-files view never
# needs more than a few thousand rows; the rest is padding for filtering.
TOP_FILES = 40000

# Directories that are never worth walking: the read-only system volume, caches
# macOS rebuilds on its own, and synthetic paths that aren't really files. These
# are reported to the UI so it can grey them out instead of showing "—".
SKIP_NAMES = {
    "/System",
    "/private/var/vm",
    "/private/var/folders",
    "/private/var/db",
    "/.Spotlight-V100",
    "/.fseventsd",
    "/.DocumentRevisions-V100",
    "/.MobileBackups",
    "/Volumes",
    "/net",
    "/home",
    "/dev",
    "/proc",
    "/cores",
}


# --------------------------------------------------------------------------- #
# Scanning
# --------------------------------------------------------------------------- #

class Scanner:
    """Owns the size index and the background thread that builds it."""

    def __init__(self, root):
        self.root = root
        self.lock = threading.Lock()

        # path -> [size_bytes, n_files, n_dirs, mtime]
        self.dirs = {}
        # list of [size_bytes, path, mtime], sorted big -> small once done
        self.top = []
        # ".mp4" -> [count, bytes]
        self.exts = {}

        self.state = "idle"          # idle | scanning | ready | error
        self.error = None
        self.started_at = 0.0
        self.finished_at = 0.0
        self.seen_files = 0
        self.seen_dirs = 0
        self.seen_bytes = 0
        self.denied = 0
        self.current = ""
        self.from_cache = False
        self._thread = None

    # -- lifecycle ---------------------------------------------------------- #

    def start(self, fresh=False):
        with self.lock:
            if self.state == "scanning":
                return False
            self.state = "scanning"
            self.error = None
            self.started_at = time.time()
            self.finished_at = 0.0
            self.seen_files = self.seen_dirs = self.seen_bytes = self.denied = 0
            self.current = self.root
            self.from_cache = False
        self._thread = threading.Thread(target=self._run, args=(fresh,), daemon=True)
        self._thread.start()
        return True

    def _run(self, fresh):
        try:
            if not fresh and self._load_cache():
                with self.lock:
                    self.state = "ready"
                    self.from_cache = True
                    # started_at/finished_at were restored from the cached scan's
                    # own timestamps — leave them alone so `elapsed` stays 0 and
                    # `age` reads "indexed 40m ago" instead of timing this load.
                return

            dirs = {}
            top = []          # min-heap-ish: we keep it as a plain list + prune
            exts = {}
            try:
                root_dev = os.lstat(self.root).st_dev
            except OSError as exc:
                raise RuntimeError("cannot read %s: %s" % (self.root, exc))

            cutoff = [0]      # smallest size currently worth keeping in `top`

            def keep_file(size, path, mtime):
                if size < cutoff[0]:
                    return
                top.append([size, path, mtime])
                if len(top) > TOP_FILES * 2:
                    top.sort(key=lambda r: -r[0])
                    del top[TOP_FILES:]
                    cutoff[0] = top[-1][0]

            def walk(path):
                """Post-order: returns (bytes, files, dirs) for `path`."""
                total = 0
                nfiles = 0
                ndirs = 0
                direct_bytes = 0
                direct_files = 0
                try:
                    it = os.scandir(path)
                except (PermissionError, OSError):
                    with self.lock:
                        self.denied += 1
                    dirs[path] = [0, 0, 0, 0]
                    return 0, 0, 0

                with it:
                    for entry in it:
                        try:
                            st = entry.stat(follow_symlinks=False)
                        except OSError:
                            continue
                        if entry.is_symlink():
                            continue
                        if st.st_dev != root_dev:
                            continue          # another volume / firlink — skip
                        if entry.is_dir(follow_symlinks=False):
                            if entry.path in SKIP_NAMES:
                                continue
                            sub_b, sub_f, sub_d = walk(entry.path)
                            total += sub_b
                            nfiles += sub_f
                            ndirs += sub_d + 1
                        else:
                            size = st.st_size
                            total += size
                            nfiles += 1
                            direct_bytes += size
                            direct_files += 1
                            keep_file(size, entry.path, int(st.st_mtime))
                            ext = os.path.splitext(entry.name)[1].lower()[:12]
                            slot = exts.get(ext)
                            if slot is None:
                                exts[ext] = [1, size]
                            else:
                                slot[0] += 1
                                slot[1] += size

                    # Progress counters take only this level's own entries —
                    # subtree totals were already added by the recursive calls,
                    # so adding `total` here would count everything twice.
                    with self.lock:
                        self.seen_files += direct_files
                        self.seen_dirs += 1
                        self.seen_bytes += direct_bytes
                        self.current = path

                try:
                    mtime = int(os.lstat(path).st_mtime)
                except OSError:
                    mtime = 0
                dirs[path] = [total, nfiles, ndirs, mtime]
                return total, nfiles, ndirs

            sys.setrecursionlimit(20000)
            walk(self.root)

            top.sort(key=lambda r: -r[0])
            del top[TOP_FILES:]

            with self.lock:
                self.dirs = dirs
                self.top = top
                self.exts = exts
                self.state = "ready"
                self.finished_at = time.time()
                # `seen_*` accumulated per-directory during the walk; replace the
                # running totals with the authoritative ones from the root node.
                root_node = dirs.get(self.root, [0, 0, 0, 0])
                self.seen_bytes = root_node[0]
                self.seen_files = root_node[1]
                self.seen_dirs = root_node[2]
            self._save_cache()
        except Exception as exc:                       # noqa: BLE001 - surfaced in UI
            with self.lock:
                self.state = "error"
                self.error = "%s: %s" % (type(exc).__name__, exc)

    # -- cache -------------------------------------------------------------- #

    def _cache_path(self):
        key = hashlib.sha1(self.root.encode("utf-8")).hexdigest()[:16]
        return os.path.join(CACHE_DIR, "scan-%s.json" % key)

    def _load_cache(self):
        path = self._cache_path()
        try:
            with open(path, "r", encoding="utf-8") as fh:
                blob = json.load(fh)
        except (OSError, ValueError):
            return False
        if blob.get("version") != CACHE_VERSION or blob.get("root") != self.root:
            return False
        with self.lock:
            self.dirs = blob["dirs"]
            self.top = blob["top"]
            self.exts = blob["exts"]
            self.started_at = self.finished_at = blob.get("ts", 0)
            root_node = self.dirs.get(self.root, [0, 0, 0, 0])
            self.seen_bytes, self.seen_files, self.seen_dirs = root_node[:3]
            self.denied = blob.get("denied", 0)
        return True

    def _save_cache(self):
        try:
            os.makedirs(CACHE_DIR, exist_ok=True)
            tmp = self._cache_path() + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(
                    {
                        "version": CACHE_VERSION,
                        "root": self.root,
                        "ts": self.finished_at,
                        "denied": self.denied,
                        "dirs": self.dirs,
                        "top": self.top,
                        "exts": self.exts,
                    },
                    fh,
                    separators=(",", ":"),
                )
            os.replace(tmp, self._cache_path())
        except OSError:
            pass  # a missing cache only costs a rescan

    # -- reads -------------------------------------------------------------- #

    def status(self):
        with self.lock:
            age = None
            if self.finished_at:
                age = int(time.time() - self.finished_at)
            elif self.started_at and self.state == "ready":
                age = int(time.time() - self.started_at)
            return {
                "state": self.state,
                "error": self.error,
                "root": self.root,
                "files": self.seen_files,
                "dirs": self.seen_dirs,
                "bytes": self.seen_bytes,
                "denied": self.denied,
                "current": self.current,
                "elapsed": round(
                    (self.finished_at or time.time()) - self.started_at, 1
                ) if self.started_at else 0,
                "fromCache": self.from_cache,
                "age": age,
                "indexed": len(self.dirs),
            }

    def dir_info(self, path):
        with self.lock:
            return self.dirs.get(path)

    def measure(self, path):
        """Walk a directory that post-dates the scan, then remember it."""
        total = files = subdirs = 0
        for base, dirnames, filenames in os.walk(path, followlinks=False):
            subdirs += len(dirnames)
            files += len(filenames)
            for name in filenames:
                try:
                    total += os.lstat(os.path.join(base, name)).st_size
                except OSError:
                    continue
        try:
            mtime = int(os.lstat(path).st_mtime)
        except OSError:
            mtime = 0
        node = [total, files, subdirs, mtime]
        with self.lock:
            self.dirs[path] = node
        return node


# --------------------------------------------------------------------------- #
# Kind classification (shared vocabulary with app.js)
# --------------------------------------------------------------------------- #

KIND_BY_EXT = {}
for _kind, _exts in {
    # .lrv/.lrf are DJI's low-res proxy clips — they sit next to the real
    # footage and are pure dead weight, so they belong in Video where they'll
    # actually be noticed.
    "video": "mp4 mov m4v mkv avi webm mpg mpeg wmv flv m2ts mts insv 3gp lrv lrf braw r3d",
    "image": "jpg jpeg png gif heic heif webp tiff tif bmp svg raw cr2 nef arw dng psd ai insp",
    "audio": "mp3 m4a wav aac flac aiff aif ogg opus logicx band mid caf",
    "archive": "zip tar gz tgz bz2 xz 7z rar dmg iso img pkg jar zst sparsebundle",
    "document": "pdf doc docx pages txt rtf md key ppt pptx numbers xls xlsx csv epub",
    "code": "js ts tsx jsx py rb go rs java swift c h cpp hpp cs php html css scss json yml yaml sh sql ino a o dylib so wasm",
    "app": "app exe msi deb appex framework kext xcarchive",
    "game": "vpk bsp pak wad gcf uasset upk pck vpp bnk sav rpf",
}.items():
    for _e in _exts.split():
        KIND_BY_EXT["." + _e] = _kind


# Python's mimetypes table predates most of these, and a wrong Content-Type
# makes <video> refuse the file outright.
EXTRA_TYPES = {
    ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime",
    ".mkv": "video/x-matroska", ".webm": "video/webm", ".avi": "video/x-msvideo",
    ".m2ts": "video/mp2t", ".mts": "video/mp2t", ".insv": "video/mp4",
    ".lrv": "video/mp4", ".3gp": "video/3gpp",
    ".m4a": "audio/mp4", ".aac": "audio/aac", ".flac": "audio/flac",
    ".opus": "audio/ogg", ".aif": "audio/aiff", ".aiff": "audio/aiff",
    ".wav": "audio/wav", ".mp3": "audio/mpeg", ".caf": "audio/x-caf",
    ".heic": "image/heic", ".heif": "image/heif", ".webp": "image/webp",
    ".avif": "image/avif", ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
}

# What the browser can actually put on screen. Anything outside this gets an
# "open it in a real app" button instead of a broken player.
PREVIEWABLE = {
    "video": {".mp4", ".m4v", ".mov", ".webm", ".mkv", ".insv", ".lrv", ".3gp"},
    "audio": {".mp3", ".m4a", ".wav", ".aac", ".flac", ".opus", ".ogg", ".aif", ".aiff"},
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".bmp", ".ico"},
    "pdf": {".pdf"},
    "text": {".txt", ".md", ".json", ".js", ".ts", ".py", ".css", ".html", ".yml",
             ".yaml", ".sh", ".csv", ".log", ".ino", ".c", ".h", ".swift", ".rb", ".go"},
}


def preview_kind(name):
    """Which player, if any, can show this file."""
    ext = os.path.splitext(name)[1].lower()
    for mode, exts in PREVIEWABLE.items():
        if ext in exts:
            return mode
    return None


def kind_for(name, is_dir=False):
    if is_dir:
        ext = os.path.splitext(name)[1].lower()
        if ext in (".app", ".framework", ".photoslibrary", ".logicx", ".band"):
            return "app" if ext in (".app", ".framework") else KIND_BY_EXT.get(ext, "folder")
        return "folder"
    return KIND_BY_EXT.get(os.path.splitext(name)[1].lower(), "other")


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #

class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "diskscope"
    protocol_version = "HTTP/1.1"

    scanner = None      # injected below
    token = ""
    root = ""
    verbose = False

    def log_message(self, fmt, *args):
        if not self.verbose:
            return      # the terminal stays readable
        sys.stderr.write("  %s %s\n" % (
            self.headers.get("Range", "-"), (fmt % args)[:120]))

    # -- helpers ------------------------------------------------------------ #

    def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command == "HEAD":
            return
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass

    def _guard(self):
        """Reject anything that isn't this page on this machine."""
        host = (self.headers.get("Host") or "").split(":")[0]
        if host not in ("127.0.0.1", "localhost", "[::1]", "::1"):
            self._send(403, {"error": "bad host"})
            return False
        origin = self.headers.get("Origin")
        if origin:
            netloc = urlparse(origin).hostname
            if netloc not in ("127.0.0.1", "localhost", "::1"):
                self._send(403, {"error": "bad origin"})
                return False
        return True

    def _authed(self, query):
        given = self.headers.get("X-Diskscope-Token") or (query.get("token") or [""])[0]
        return secrets.compare_digest(given, self.token)

    def _safe(self, raw):
        """Resolve a client-supplied path and refuse anything outside the root."""
        if not raw:
            return None
        path = os.path.realpath(os.path.expanduser(raw))
        if path == self.root or path.startswith(self.root.rstrip("/") + os.sep):
            return path
        return None

    def _body(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return {}
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except ValueError:
            return {}

    # -- routes ------------------------------------------------------------- #

    def do_GET(self):
        if not self._guard():
            return
        url = urlparse(self.path)
        path = unquote(url.path)
        query = parse_qs(url.query)

        # Media lives on its own query-string-free route: `<video src>` requests
        # are issued by Chrome's network service, and a URL carrying ?token=…&
        # can be dropped by privacy extensions before it ever hits the socket.
        # A plain path also keeps the token out of query-string logging.
        if path.startswith("/media/"):
            return self._media(path)

        if path.startswith("/api/"):
            if not self._authed(query):
                return self._send(401, {"error": "bad token"})
            return self._api_get(path, query)

        return self._static(path)

    def _media(self, path):
        parts = path.split("/", 3)          # ['', 'media', token, b64path]
        if len(parts) != 4 or not secrets.compare_digest(parts[2], self.token):
            return self._send(401, {"error": "bad token"})
        try:
            pad = "=" * (-len(parts[3]) % 4)
            target = base64.urlsafe_b64decode(parts[3] + pad).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return self._send(400, {"error": "bad path"})
        target = self._safe(target)
        if not target or not os.path.isfile(target):
            return self._send(404, {"error": "no such file"})
        return self._stream(target)

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        if not self._guard():
            return
        url = urlparse(self.path)
        query = parse_qs(url.query)
        if not self._authed(query):
            return self._send(401, {"error": "bad token"})
        return self._api_post(unquote(url.path), self._body())

    # -- static ------------------------------------------------------------- #

    def _static(self, path):
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        target = os.path.realpath(os.path.join(HERE, rel))
        if not target.startswith(HERE) or not os.path.isfile(target):
            return self._send(404, "not found", "text/plain; charset=utf-8")
        ctype = mimetypes.guess_type(target)[0] or "application/octet-stream"
        with open(target, "rb") as fh:
            data = fh.read()
        if rel == "index.html":
            data = data.replace(b"__DISKSCOPE_TOKEN__", self.token.encode("ascii"))
        self._send(200, data, ctype)

    # -- GET api ------------------------------------------------------------ #

    def _api_get(self, path, query):
        one = lambda k, d="": (query.get(k) or [d])[0]   # noqa: E731

        if path == "/api/status":
            return self._send(200, self.scanner.status())

        if path == "/api/config":
            usage = shutil.disk_usage(self.root)
            return self._send(200, {
                "root": self.root,
                "home": os.path.expanduser("~"),
                "wholeDisk": self.root == "/",
                "fullDiskAccess": _has_full_disk_access(),
                "jumps": [p for p in (
                    os.path.expanduser("~"),
                    os.path.expanduser("~/Downloads"),
                    os.path.expanduser("~/Documents"),
                    os.path.expanduser("~/Desktop"),
                    os.path.expanduser("~/Movies"),
                    os.path.expanduser("~/Library"),
                    "/Applications",
                ) if os.path.isdir(p) and (
                    self.root == "/" or p.startswith(self.root.rstrip("/") + os.sep) or p == self.root
                )],
                "volume": {
                    "total": usage.total,
                    "used": usage.used,
                    "free": usage.free,
                    "name": self._volume_name(),
                },
                "status": self.scanner.status(),
            })

        if path == "/api/ls":
            target = self._safe(one("path", self.root))
            if not target or not os.path.isdir(target):
                return self._send(404, {"error": "no such folder"})
            return self._send(200, self._listing(target))

        if path == "/api/big":
            target = self._safe(one("path", self.root)) or self.root
            try:
                limit = max(1, min(2000, int(one("limit", "300"))))
            except ValueError:
                limit = 300
            kind = one("kind", "all")
            prefix = target.rstrip("/") + os.sep
            out = []
            with self.scanner.lock:
                rows = list(self.scanner.top)
            for size, fpath, mtime in rows:
                if target != self.root and not fpath.startswith(prefix):
                    continue
                name = os.path.basename(fpath)
                k = kind_for(name)
                if kind != "all" and k != kind:
                    continue
                out.append({
                    "name": name,
                    "path": fpath,
                    "dir": False,
                    "size": size,
                    "mtime": mtime,
                    "kind": k,
                    "preview": preview_kind(name),
                    "parent": os.path.dirname(fpath),
                })
                if len(out) >= limit:
                    break
            return self._send(200, {"path": target, "entries": out,
                                    "truncated": len(out) >= limit})

        if path == "/api/kinds":
            with self.scanner.lock:
                exts = dict(self.scanner.exts)
            buckets = {}
            for ext, (count, size) in exts.items():
                k = KIND_BY_EXT.get(ext, "other")
                slot = buckets.setdefault(k, {"kind": k, "bytes": 0, "files": 0, "exts": []})
                slot["bytes"] += size
                slot["files"] += count
                slot["exts"].append({"ext": ext or "(none)", "bytes": size, "files": count})
            for slot in buckets.values():
                slot["exts"].sort(key=lambda r: -r["bytes"])
                del slot["exts"][12:]
            return self._send(200, {
                "kinds": sorted(buckets.values(), key=lambda r: -r["bytes"])
            })

        if path == "/api/info":
            target = self._safe(one("path"))
            if not target:
                return self._send(404, {"error": "outside root"})
            try:
                st = os.lstat(target)
            except OSError as exc:
                return self._send(404, {"error": str(exc)})
            is_dir = os.path.isdir(target)
            node = self.scanner.dir_info(target) if is_dir else None
            return self._send(200, {
                "name": os.path.basename(target) or target,
                "path": target,
                "parent": os.path.dirname(target),
                "dir": is_dir,
                "size": node[0] if node else st.st_size,
                "items": (node[1] + node[2]) if node else None,
                "mtime": int(st.st_mtime),
                "ctime": int(st.st_ctime),
                "kind": kind_for(os.path.basename(target), is_dir),
                "preview": None if is_dir else preview_kind(target),
                "mode": oct(st.st_mode & 0o777),
            })

        return self._send(404, {"error": "unknown endpoint"})

    # -- POST api ----------------------------------------------------------- #

    def _api_post(self, path, body):
        if path == "/api/scan":
            started = self.scanner.start(fresh=bool(body.get("fresh")))
            return self._send(200, {"started": started, "status": self.scanner.status()})

        if path == "/api/measure":
            target = self._safe(body.get("path"))
            if not target or not os.path.isdir(target):
                return self._send(404, {"error": "no such folder"})
            node = self.scanner.measure(target)
            return self._send(200, {"path": target, "size": node[0],
                                    "items": node[1] + node[2]})

        if path in ("/api/reveal", "/api/open"):
            target = self._safe(body.get("path"))
            if not target or not os.path.exists(target):
                return self._send(404, {"error": "no such path"})
            args = ["/usr/bin/open"]
            if path.endswith("reveal"):
                args.append("-R")
            args.append(target)
            try:
                subprocess.run(args, check=True, timeout=10)
            except (subprocess.SubprocessError, OSError) as exc:
                return self._send(500, {"error": str(exc)})
            return self._send(200, {"ok": True, "path": target})

        if path == "/api/trash":
            target = self._safe(body.get("path"))
            if not target or not os.path.exists(target):
                return self._send(404, {"error": "no such path"})
            # Finder's own move-to-Trash: recoverable, and it updates the UI the
            # user already trusts. Never `rm`.
            script = (
                'tell application "Finder" to move POSIX file "%s" to trash'
                % target.replace('"', '\\"')
            )
            try:
                subprocess.run(["/usr/bin/osascript", "-e", script],
                               check=True, timeout=30, capture_output=True)
            except subprocess.CalledProcessError as exc:
                return self._send(500, {"error": (exc.stderr or b"").decode().strip()
                                                 or "Finder refused"})
            except (subprocess.SubprocessError, OSError) as exc:
                return self._send(500, {"error": str(exc)})
            with self.scanner.lock:
                self.scanner.dirs.pop(target, None)
                self.scanner.top = [r for r in self.scanner.top if r[1] != target]
            return self._send(200, {"ok": True, "path": target})

        return self._send(404, {"error": "unknown endpoint"})

    # -- byte streaming (the built-in player lives on this) ----------------- #

    def _stream(self, target):
        """Serve a file with Range support.

        <video> is useless without this: browsers issue `Range: bytes=…` to read
        the moov atom and again for every seek, and a server that answers 200
        with the whole body makes the scrubber dead and pulls 17 GB through the
        socket for a 2-second look.
        """
        try:
            size = os.path.getsize(target)
        except OSError as exc:
            return self._send(404, {"error": str(exc)})

        ctype = EXTRA_TYPES.get(os.path.splitext(target)[1].lower()) \
            or mimetypes.guess_type(target)[0] or "application/octet-stream"

        start, end, status = 0, size - 1, 200
        rng = self.headers.get("Range")
        if rng and rng.strip().startswith("bytes="):
            spec = rng.strip()[6:].split(",")[0].strip()
            first, _, last = spec.partition("-")
            try:
                if first:
                    start = int(first)
                    end = int(last) if last else size - 1
                elif last:                      # suffix form: bytes=-500
                    start = max(0, size - int(last))
                else:
                    raise ValueError
            except ValueError:
                start, end = 0, size - 1
            else:
                end = min(end, size - 1)
                if start >= size or start > end:
                    self.send_response(416)
                    self.send_header("Content-Range", "bytes */%d" % size)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                status = 206

        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        if status == 206:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.end_headers()

        if self.command == "HEAD":
            return
        try:
            with open(target, "rb") as fh:
                fh.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = fh.read(min(262144, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError, OSError):
            # Every seek makes the player abandon the previous request. Normal.
            self.close_connection = True

    # -- listing ------------------------------------------------------------ #

    def _listing(self, target):
        entries = []
        try:
            it = os.scandir(target)
        except (PermissionError, OSError) as exc:
            return {"path": target, "entries": [], "error": str(exc),
                    "crumbs": self._crumbs(target)}

        with it:
            for entry in it:
                try:
                    st = entry.stat(follow_symlinks=False)
                except OSError:
                    continue
                is_dir = entry.is_dir(follow_symlinks=False)
                link = entry.is_symlink()
                if is_dir and not link:
                    node = self.scanner.dir_info(entry.path)
                    size = node[0] if node else None
                    items = (node[1] + node[2]) if node else None
                else:
                    size = st.st_size
                    items = None
                entries.append({
                    "name": entry.name,
                    "path": entry.path,
                    "dir": is_dir and not link,
                    "link": link,
                    "size": size,
                    "items": items,
                    "mtime": int(st.st_mtime),
                    "kind": kind_for(entry.name, is_dir and not link),
                    "preview": None if is_dir else preview_kind(entry.name),
                    "hidden": entry.name.startswith("."),
                    "skipped": entry.path in SKIP_NAMES,
                })

        node = self.scanner.dir_info(target)
        return {
            "path": target,
            "name": os.path.basename(target) or target,
            "size": node[0] if node else None,
            "items": (node[1] + node[2]) if node else None,
            "entries": entries,
            "crumbs": self._crumbs(target),
        }

    def _crumbs(self, target):
        crumbs = []
        cur = target
        while True:
            crumbs.append({"name": os.path.basename(cur) or cur, "path": cur})
            if cur == self.root or len(crumbs) > 40:
                break
            parent = os.path.dirname(cur)
            if parent == cur:
                break
            cur = parent
        crumbs.reverse()
        if crumbs:
            crumbs[0]["name"] = os.path.basename(self.root) or self.root
        return crumbs

    def _volume_name(self):
        try:
            out = subprocess.run(["/usr/sbin/diskutil", "info", "/"],
                                 capture_output=True, timeout=5, text=True)
            for line in out.stdout.splitlines():
                if "Volume Name:" in line:
                    return line.split(":", 1)[1].strip()
        except (subprocess.SubprocessError, OSError):
            pass
        return "Macintosh HD"


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


# --------------------------------------------------------------------------- #

def _has_full_disk_access():
    """A cheap probe: this folder is TCC-protected, so being able to list it
    means the terminal running us was granted Full Disk Access."""
    probe = os.path.expanduser("~/Library/Application Support/com.apple.TCC")
    try:
        os.listdir(probe)
        return True
    except OSError:
        return False


def main():
    ap = argparse.ArgumentParser(description="diskscope — a nicer Finder for size")
    ap.add_argument("root", nargs="?", default="/",
                    help="folder to scan (default: the whole startup disk)")
    ap.add_argument("--port", type=int, default=8770)
    ap.add_argument("--fresh", action="store_true", help="ignore the cached index")
    ap.add_argument("--no-open", action="store_true", help="don't launch the browser")
    ap.add_argument("--verbose", action="store_true", help="log every request")
    args = ap.parse_args()

    root = os.path.realpath(os.path.expanduser(args.root))
    if not os.path.isdir(root):
        sys.exit("not a folder: %s" % root)

    scanner = Scanner(root)
    token = secrets.token_urlsafe(24)

    Handler.scanner = scanner
    Handler.token = token
    Handler.root = root
    Handler.verbose = args.verbose

    httpd = Server(("127.0.0.1", args.port), Handler)
    url = "http://127.0.0.1:%d/?token=%s" % (args.port, token)

    print("\n  diskscope")
    print("  root   %s" % root)
    print("  open   %s" % url)
    if root == "/" and not _has_full_disk_access():
        print("\n  note   Some folders will read as unreadable until this terminal")
        print("         has Full Disk Access (System Settings › Privacy & Security ›")
        print("         Full Disk Access). Everything else still scans fine.")
    print("")

    scanner.start(fresh=args.fresh)
    if not args.no_open:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  bye\n")
        httpd.shutdown()


if __name__ == "__main__":
    main()
