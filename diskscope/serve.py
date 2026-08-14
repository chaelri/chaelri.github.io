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
import tempfile
import threading
import time
import webbrowser
from urllib.parse import urlparse, parse_qs, unquote

import editor

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.expanduser("~/Library/Caches/diskscope")
THUMB_DIR = os.path.join(CACHE_DIR, "thumbs")
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

    def forget(self, target, size, files, subdirs):
        """Drop a trashed path from the index and shrink every ancestor by what
        it weighed. Without this the folder you are looking at keeps claiming
        the bytes you just reclaimed until the next full scan."""
        prefix = target.rstrip("/") + os.sep
        with self.lock:
            self.dirs.pop(target, None)
            for key in [k for k in self.dirs if k.startswith(prefix)]:
                del self.dirs[key]
            self.top = [r for r in self.top
                        if r[1] != target and not r[1].startswith(prefix)]

            cur = os.path.dirname(target)
            while True:
                node = self.dirs.get(cur)
                if node:
                    node[0] = max(0, node[0] - size)
                    node[1] = max(0, node[1] - files)
                    node[2] = max(0, node[2] - subdirs)
                parent = os.path.dirname(cur)
                if cur == self.root or parent == cur:
                    break
                cur = parent

            self.seen_bytes = max(0, self.seen_bytes - size)
            self.seen_files = max(0, self.seen_files - files)
            self.seen_dirs = max(0, self.seen_dirs - subdirs)

    def weigh(self, path):
        """(bytes, files, dirs) for something about to leave — from the index if
        it is a folder we already measured, otherwise straight off the disk."""
        if os.path.isdir(path) and not os.path.islink(path):
            node = self.dir_info(path)
            if node:
                return node[0], node[1], node[2] + 1
            node = self.measure(path)
            return node[0], node[1], node[2] + 1
        try:
            return os.lstat(path).st_size, 1, 0
        except OSError:
            return 0, 0, 0

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
# Trash
# --------------------------------------------------------------------------- #
#
# Moving a file to the Trash frees nothing — the bytes are still on the volume
# until it is emptied. So the UI has to be able to say "this much is sitting in
# the Trash waiting", which means measuring it. The walk runs on its own thread
# behind a short TTL: a Trash with a 40 GB folder in it must not stall a poll.

TRASH_DIR = os.path.expanduser("~/.Trash")
TRASH_TTL = 12.0


def _walk_trash():
    """Exact figures, but only when the terminal has Full Disk Access."""
    total = 0
    items = 0
    try:
        names = os.listdir(TRASH_DIR)
    except OSError:
        return None                     # almost always TCC, not a missing folder
    for name in names:
        items += 1
        path = os.path.join(TRASH_DIR, name)
        try:
            st = os.lstat(path)
        except OSError:
            continue
        if not os.path.isdir(path) or os.path.islink(path):
            total += st.st_size
            continue
        for base, _dirs, files in os.walk(path, followlinks=False):
            for fname in files:
                try:
                    total += os.lstat(os.path.join(base, fname)).st_size
                except OSError:
                    continue
    return {"bytes": total, "items": items, "partial": False}


def _finder_trash():
    """Ask Finder, which is allowed to look. It sizes files but returns
    `missing value` for folders, so a Trash holding folders reports a floor —
    flagged as partial so the UI can say "at least"."""
    script = ('tell application "Finder" to get {count of items of trash} & '
              '(physical size of every item of trash)')
    try:
        out = subprocess.run(["/usr/bin/osascript", "-e", script],
                             capture_output=True, timeout=30, text=True)
    except (subprocess.SubprocessError, OSError):
        return None
    if out.returncode != 0:
        return None
    parts = [p.strip() for p in out.stdout.strip().split(",")]
    if not parts or not parts[0]:
        return None
    try:
        items = int(float(parts[0]))
    except ValueError:
        return None
    total = 0
    partial = False
    for chunk in parts[1:]:
        try:
            total += int(float(chunk))
        except ValueError:
            partial = True
    return {"bytes": total, "items": items, "partial": partial}


class TrashWatch:
    def __init__(self):
        self.lock = threading.Lock()
        self.bytes = 0
        self.items = 0
        self.at = 0.0
        self.busy = False
        self.partial = False
        self.gen = 0

    def add(self, size, count=1):
        """Something just landed in the Trash. Count it now rather than making
        the UI wait on a walk — and bump the generation so a measure already in
        flight, which saw the Trash before this arrived, cannot overwrite it."""
        with self.lock:
            self.bytes += max(0, size)
            self.items += count
            self.at = time.time()
            self.gen += 1

    def reset(self):
        with self.lock:
            self.bytes = 0
            self.items = 0
            self.at = time.time()
            self.gen += 1

    def snapshot(self, force=False):
        with self.lock:
            stale = (time.time() - self.at) > TRASH_TTL
            start = (stale or force) and not self.busy
            if start:
                self.busy = True
            out = {"bytes": self.bytes, "items": self.items,
                   "partial": self.partial}
        if start:
            threading.Thread(target=self._measure, daemon=True).start()
        return out

    def _measure(self):
        with self.lock:
            gen = self.gen
        data = _walk_trash()
        if data is None:
            # ~/.Trash is TCC-protected, so without Full Disk Access we cannot
            # even list it — but Finder can, and it will answer for us.
            data = _finder_trash() or {"bytes": 0, "items": 0, "partial": True}
        with self.lock:
            self.busy = False
            if gen != self.gen:
                return          # the Trash changed while we were measuring it
            self.bytes = data["bytes"]
            self.items = data["items"]
            self.partial = data.get("partial", False)
            self.at = time.time()


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
# Thumbnails
# --------------------------------------------------------------------------- #
#
# A row that says "Video · Jul 12" tells you nothing about which clip it is. A
# poster frame does. macOS already renders these for Finder, so we ask the same
# engine rather than shipping a decoder:
#
#   * plain rasters go through `sips`, which is one fast process and handles
#     HEIC without any help;
#   * everything else (video, PDF, iWork/Office, RAW, .app bundles) goes through
#     `qlmanage -t`, the Quick Look thumbnailer Finder itself uses.
#
# Results are cached on disk keyed by path+mtime+size, so scrolling a folder a
# second time costs nothing, and failures are cached too — without that, every
# scroll past a clip Quick Look can't read would fork another doomed process.

# The tile is 80x45 CSS px, so a Retina panel wants 160x90 real pixels — 256 on
# the long edge leaves headroom for portrait clips, which `cover` crops the
# other way, and still lands around 10 KB per JPEG.
THUMB_PX = 256
_THUMB_GATE = threading.BoundedSemaphore(3)   # qlmanage is not cheap; don't swarm

THUMB_IMAGE = {".jpg", ".jpeg", ".png", ".gif", ".heic", ".heif", ".webp",
               ".tiff", ".tif", ".bmp", ".avif", ".ico"}
THUMB_QL = {
    ".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm", ".m2ts", ".mts", ".insv",
    ".lrv", ".lrf", ".3gp", ".mpg", ".mpeg", ".wmv", ".flv",
    ".pdf", ".psd", ".ai", ".svg", ".raw", ".cr2", ".nef", ".arw", ".dng",
    ".key", ".pages", ".numbers", ".doc", ".docx", ".ppt", ".pptx",
    ".xls", ".xlsx", ".epub", ".rtf",
}


def thumbable(name, is_dir=False):
    ext = os.path.splitext(name)[1].lower()
    if is_dir:
        return ext in (".app", ".photoslibrary")
    return ext in THUMB_IMAGE or ext in THUMB_QL


def _run(args, timeout):
    try:
        return subprocess.run(args, capture_output=True, timeout=timeout).returncode == 0
    except (subprocess.SubprocessError, OSError):
        return False


def _sips_thumb(src, out):
    tmp = out + ".part"
    ok = _run(["/usr/bin/sips", "-Z", str(THUMB_PX), "-s", "format", "png",
               src, "--out", tmp], 25)
    if ok and os.path.isfile(tmp) and os.path.getsize(tmp) > 0:
        os.replace(tmp, out)
        return True
    _quiet_rm(tmp)
    return False


def _ql_thumb(src, out):
    """Quick Look writes `<basename>.png` into an output directory, so give it a
    private one and take whatever lands there."""
    try:
        stage = tempfile.mkdtemp(dir=THUMB_DIR)
    except OSError:
        return False
    try:
        _run(["/usr/bin/qlmanage", "-t", "-s", str(THUMB_PX), "-o", stage, src], 30)
        made = [os.path.join(stage, n) for n in os.listdir(stage)
                if not n.startswith(".")]
        made = [p for p in made if os.path.isfile(p) and os.path.getsize(p) > 0]
        if not made:
            return False
        png = made[0]
        # These are all opaque, and JPEG makes them ~5x smaller for the same
        # 160 px — worth 15 ms when a folder holds 400 clips.
        tmp = out + ".part"
        if _run(["/usr/bin/sips", "-s", "format", "jpeg", "-s", "formatOptions", "72",
                 png, "--out", tmp], 20) and os.path.getsize(tmp) > 0:
            os.replace(tmp, out)
        else:
            _quiet_rm(tmp)
            shutil.copyfile(png, out)      # the PNG on its own is still fine
        return True
    except OSError:
        return False
    finally:
        shutil.rmtree(stage, ignore_errors=True)


def _quiet_rm(path):
    try:
        os.remove(path)
    except OSError:
        pass


def thumb_file(target):
    """Path to a cached thumbnail for `target`, or None if it can't be made."""
    try:
        st = os.lstat(target)
    except OSError:
        return None
    key = hashlib.sha1(("%s|%d|%d|%d" % (
        target, int(st.st_mtime), st.st_size, THUMB_PX)).encode("utf-8")).hexdigest()
    out = os.path.join(THUMB_DIR, key)
    if os.path.isfile(out):
        return out
    if os.path.isfile(out + ".fail"):
        return None
    try:
        os.makedirs(THUMB_DIR, exist_ok=True)
    except OSError:
        return None

    with _THUMB_GATE:
        if os.path.isfile(out):       # another request got there while we queued
            return out
        ext = os.path.splitext(target)[1].lower()
        ok = _sips_thumb(target, out) if ext in THUMB_IMAGE else _ql_thumb(target, out)
    if ok:
        return out
    try:
        open(out + ".fail", "wb").close()
    except OSError:
        pass
    return None


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #

class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "diskscope"
    protocol_version = "HTTP/1.1"

    scanner = None      # injected below
    trash = None
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
        extra = extra or {}
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if "Cache-Control" not in extra:
            self.send_header("Cache-Control", "no-store")
        for key, value in extra.items():
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

        # Same token-in-the-path shape as /media, for the same reason: these are
        # <img src> loads issued by the network service, not fetch() calls.
        if path.startswith("/thumb/"):
            return self._thumb(path)

        if path.startswith("/api/"):
            if not self._authed(query):
                return self._send(401, {"error": "bad token"})
            return self._api_get(path, query)

        return self._static(path)

    def _tokened_path(self, path):
        """Pull the target out of /<route>/<token>/<base64url-path>."""
        parts = path.split("/", 3)          # ['', 'media', token, b64path]
        if len(parts) != 4 or not secrets.compare_digest(parts[2], self.token):
            self._send(401, {"error": "bad token"})
            return None
        try:
            pad = "=" * (-len(parts[3]) % 4)
            target = base64.urlsafe_b64decode(parts[3] + pad).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            self._send(400, {"error": "bad path"})
            return None
        target = self._safe(target)
        if not target:
            self._send(404, {"error": "outside root"})
            return None
        return target

    def _media(self, path):
        target = self._tokened_path(path)
        if not target:
            return
        if not os.path.isfile(target):
            return self._send(404, {"error": "no such file"})
        return self._stream(target)

    def _thumb(self, path):
        target = self._tokened_path(path)
        if not target:
            return
        if not os.path.exists(target) or not thumbable(
                os.path.basename(target), os.path.isdir(target)):
            return self._send(404, {"error": "no thumbnail"})
        made = thumb_file(target)
        if not made:
            return self._send(404, {"error": "no thumbnail"})
        try:
            with open(made, "rb") as fh:
                data = fh.read()
        except OSError:
            return self._send(404, {"error": "no thumbnail"})
        ctype = "image/png" if data[:4] == b"\x89PNG" else "image/jpeg"
        # The client hangs the file's mtime off the URL as ?v=, so an edited file
        # asks for a different URL and this one can sit in the browser cache —
        # which matters because re-rendering the list rebuilds every <img>.
        self._send(200, data, ctype, {"Cache-Control": "private, max-age=86400"})

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
            # The poll already runs every few seconds, so it is the natural place
            # to carry live volume + Trash figures: the gauge then tracks a
            # trash or an empty on its own, whatever caused it.
            st = self.scanner.status()
            st["volume"] = self._usage()
            st["trash"] = self.trash.snapshot()
            return self._send(200, st)

        if path == "/api/config":
            return self._send(200, {
                "root": self.root,
                "home": os.path.expanduser("~"),
                "wholeDisk": self.root == "/",
                "fullDiskAccess": _has_full_disk_access(),
                "hostApp": _host_app(),
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
                "volume": dict(self._usage(), name=self._volume_name()),
                "trash": self.trash.snapshot(force=True),
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
                    "thumb": thumbable(name),
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

        # -- editor ---------------------------------------------------------- #

        if path == "/api/projects":
            return self._send(200, {"projects": editor.list_projects(),
                                    "ffmpeg": editor.have_ffmpeg(),
                                    "merge": editor.have_merge()})

        if path == "/api/project":
            data = editor.read_project(one("id"))
            if not data:
                return self._send(404, {"error": "no such project"})
            for asset in data.get("assets") or []:
                asset["missing"] = not os.path.isfile(asset["path"])
            return self._send(200, data)

        if path == "/api/analysis":
            data = editor.read_project(one("id"))
            if not data:
                return self._send(404, {"error": "no such project"})
            asset = next((a for a in data["assets"] if a["id"] == one("asset")), None)
            if not asset:
                return self._send(404, {"error": "no such asset"})
            try:
                length = max(1.0, min(120.0, float(one("length", "8"))))
                count = max(1, min(6, int(one("count", "1"))))
            except ValueError:
                length, count = 8.0, 1
            # Analysing on demand costs a fraction of a second, so a clip that
            # was added after the batch run still opens instantly.
            editor.analyse_asset(asset)
            series = editor.read_analysis(asset) or {"levels": [], "step": editor.STEP}
            return self._send(200, {
                "asset": asset["id"], "dur": asset.get("dur"),
                "step": series.get("step"), "levels": series.get("levels"),
                "suggestions": editor.suggest(asset, length, count),
            })

        if path == "/api/jobs":
            job = one("id")
            if job:
                snap = editor.get_job(job)
                if not snap:
                    return self._send(404, {"error": "no such job"})
                return self._send(200, snap)
            return self._send(200, {"jobs": editor.active_jobs()})

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
                "thumb": thumbable(os.path.basename(target), is_dir),
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
            # Weigh it before it moves — afterwards the path is gone.
            size, files, subdirs = self.scanner.weigh(target)
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
            self.scanner.forget(target, size, files, subdirs)
            self.trash.add(size)
            return self._send(200, {"ok": True, "path": target, "size": size,
                                    "trash": self.trash.snapshot()})

        # -- editor ---------------------------------------------------------- #

        if path == "/api/project-new":
            return self._send(200, editor.create_project(body.get("name")))

        if path == "/api/project-delete":
            ok = editor.delete_project(body.get("id") or "")
            return self._send(200 if ok else 404, {"ok": ok})

        if path == "/api/project-add":
            paths = [p for p in (self._safe(raw) for raw in body.get("paths") or []) if p]
            data, report = editor.add_assets(body.get("id") or "", paths)
            if data is None:
                return self._send(404, {"error": "no such project"})
            return self._send(200, {"project": editor.read_project(data["id"], light=True),
                                    **report})

        if path == "/api/project-remove-asset":
            data = editor.remove_asset(body.get("id") or "", body.get("asset") or "")
            if data is None:
                return self._send(404, {"error": "no such project"})
            return self._send(200, {"ok": True})

        if path == "/api/project-save":
            data = editor.set_clips(body.get("id") or "", body.get("clips"),
                                    body.get("aspect"), body.get("name"))
            if data is None:
                return self._send(404, {"error": "no such project"})
            return self._send(200, {"ok": True, "duration": editor.timeline_duration(data)})

        if path == "/api/project-auto":
            try:
                target = max(30.0, min(3600.0, float(body.get("target") or 300)))
                moment = max(2.0, min(60.0, float(body.get("moment") or 8)))
            except (TypeError, ValueError):
                target, moment = 300.0, 8.0
            try:
                out = editor.auto_edit(body.get("id") or "", target, moment,
                                       1 if body.get("perClip") else 0)
            except RuntimeError as exc:
                return self._send(400, {"error": str(exc)})
            if out is None:
                return self._send(404, {"error": "no such project"})
            return self._send(200, out)

        if path == "/api/project-analyse":
            out = editor.analyse_project(body.get("id") or "")
            if out is None:
                return self._send(404, {"error": "no such project"})
            return self._send(200, out)

        if path == "/api/project-export":
            try:
                out = editor.export(body.get("id") or "", body.get("out"))
            except RuntimeError as exc:
                return self._send(400, {"error": str(exc)})
            if out is None:
                return self._send(404, {"error": "no such project"})
            return self._send(200, out)

        if path == "/api/merge":
            paths = [p for p in (self._safe(raw) for raw in body.get("paths") or []) if p]
            try:
                out = editor.merge_upload(
                    paths, body.get("title"),
                    body.get("privacy") or "unlisted",
                    upload=bool(body.get("upload", True)),
                    sort=bool(body.get("sort", True)),
                    trash_after=bool(body.get("trashAfter")),
                    encode=bool(body.get("encode", True)))
            except RuntimeError as exc:
                return self._send(400, {"error": str(exc)})
            return self._send(200, out)

        if path == "/api/merge-check":
            paths = [p for p in (self._safe(raw) for raw in body.get("paths") or []) if p]
            return self._send(200, editor.upload_ready(paths))

        if path == "/api/job-cancel":
            with editor.JOBS_LOCK:
                job = editor.JOBS.get(body.get("id") or "")
            if not job:
                return self._send(404, {"error": "no such job"})
            job.cancel()
            return self._send(200, {"ok": True})

        if path == "/api/fda":
            # Opens the pane. Granting is the user's toggle to flip — TCC gives
            # no API for that, by design.
            try:
                subprocess.run(
                    ["/usr/bin/open",
                     "x-apple.systempreferences:com.apple.preference.security"
                     "?Privacy_AllFilesAccess"],
                    check=True, timeout=10)
            except (subprocess.SubprocessError, OSError) as exc:
                return self._send(500, {"error": str(exc)})
            return self._send(200, {"ok": True, "host": _host_app()})

        if path == "/api/trash-many":
            targets = [p for p in (self._safe(raw) for raw in body.get("paths") or []) if p]
            targets = [p for p in targets if os.path.exists(p)]
            if not targets:
                return self._send(404, {"error": "nothing to trash"})
            # Weigh everything before it moves, and hand Finder the whole list in
            # one go — one osascript per file turns a 40-clip selection into 40
            # round trips through the Apple Event machinery.
            weighed = [(p,) + self.scanner.weigh(p) for p in targets]
            freed = sum(w[1] for w in weighed)
            done, failed = [], []
            for chunk in [targets[i:i + 150] for i in range(0, len(targets), 150)]:
                items = ", ".join('POSIX file "%s"' % p.replace('"', '\\"') for p in chunk)
                script = 'tell application "Finder" to delete {%s}' % items
                try:
                    subprocess.run(["/usr/bin/osascript", "-e", script],
                                   check=True, timeout=180, capture_output=True)
                    done.extend(chunk)
                except subprocess.CalledProcessError as exc:
                    failed.append((exc.stderr or b"").decode().strip() or "Finder refused")
                except (subprocess.SubprocessError, OSError) as exc:
                    failed.append(str(exc))
            gone = set(done)
            moved = 0
            for path_, size, files, subdirs in weighed:
                if path_ in gone:
                    self.scanner.forget(path_, size, files, subdirs)
                    self.trash.add(size)
                    moved += size
            return self._send(200, {
                "ok": not failed, "trashed": len(done), "failed": failed[:3],
                "freed": moved if done else 0,
                "requested": len(targets), "weighed": freed,
                "trash": self.trash.snapshot(),
            })

        if path == "/api/trash-open":
            if not os.path.isdir(TRASH_DIR):
                return self._send(404, {"error": "no Trash folder"})
            try:
                subprocess.run(["/usr/bin/open", TRASH_DIR], check=True, timeout=10)
            except (subprocess.SubprocessError, OSError) as exc:
                return self._send(500, {"error": str(exc)})
            return self._send(200, {"ok": True, "path": TRASH_DIR})

        if path == "/api/trash-empty":
            # The one irreversible thing in this app. It is Finder's own empty,
            # so Finder's warning preference still applies, and the UI arms the
            # button twice before it ever gets here.
            try:
                subprocess.run(
                    ["/usr/bin/osascript", "-e",
                     'tell application "Finder" to empty the trash'],
                    check=True, timeout=180, capture_output=True)
            except subprocess.CalledProcessError as exc:
                return self._send(500, {"error": (exc.stderr or b"").decode().strip()
                                                 or "Finder refused"})
            except (subprocess.SubprocessError, OSError) as exc:
                return self._send(500, {"error": str(exc)})
            self.trash.reset()
            return self._send(200, {"ok": True, "volume": self._usage(),
                                    "trash": self.trash.snapshot()})

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
                    "thumb": thumbable(entry.name, is_dir and not link),
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

    def _usage(self):
        try:
            u = shutil.disk_usage(self.root)
        except OSError:
            return {"total": 0, "used": 0, "free": 0}
        return {"total": u.total, "used": u.used, "free": u.free}

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

TOKEN_FILE = os.path.join(CACHE_DIR, "token")


def _token(fresh=False):
    """The per-machine token, remembered between runs.

    It used to be minted per process, which meant every restart silently turned
    every open tab into a dead page answering "bad token" to everything. The
    secret is no weaker for being reused: still 24 random bytes, still only
    reachable from 127.0.0.1, and now stored 0600 in a cache directory only this
    user can read. `--new-token` rotates it.
    """
    if not fresh:
        try:
            with open(TOKEN_FILE, "r", encoding="utf-8") as fh:
                saved = fh.read().strip()
            if len(saved) >= 24:
                return saved
        except OSError:
            pass
    token = secrets.token_urlsafe(24)
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as fh:
            fh.write(token)
    except OSError:
        pass        # a token that only lives in memory still works for this run
    return token


def _host_app():
    """Which app has to be granted Full Disk Access. TCC does not judge python3
    — it judges whatever launched it, so the name to add to the list is the
    terminal or editor this process was started from."""
    by_term = {
        "vscode": "Visual Studio Code",
        "iTerm.app": "iTerm",
        "Apple_Terminal": "Terminal",
        "WarpTerminal": "Warp",
        "ghostty": "Ghostty",
        "Hyper": "Hyper",
    }
    name = by_term.get(os.environ.get("TERM_PROGRAM", ""))
    if name:
        return name
    return "the terminal running serve.py"


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
    ap.add_argument("--new-token", action="store_true",
                    help="mint a new token, invalidating old links")
    args = ap.parse_args()

    root = os.path.realpath(os.path.expanduser(args.root))
    if not os.path.isdir(root):
        sys.exit("not a folder: %s" % root)

    scanner = Scanner(root)
    token = _token(fresh=args.new_token)

    Handler.scanner = scanner
    Handler.trash = TrashWatch()
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
