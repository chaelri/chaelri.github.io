#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
diskscope/editor — the cutting-room half.

A project is a JSON file. It holds a list of *assets* (paths on disk, plus what
ffprobe said about them) and a list of *clips* — an ordered sequence, each one a
window into an asset with its own framing. Nothing here ever copies or moves the
footage: an export reads the originals and writes one new file.

    project = {
      "id", "name", "created", "updated",
      "aspect": "source" | "16:9" | "9:16" | "1:1" | "4:5",
      "assets": [ {"id", "path", "name", "dur", "w", "h", "fps", "codec", ...} ],
      "clips":  [ {"id", "asset", "in", "out", "scale", "x", "y"} ],
    }

`in`/`out` are seconds into the source. `scale`/`x`/`y` are the punch-in: 1.0 is
the whole frame, 2.0 is a 2x close-up, and x/y are the centre of the visible
window in 0..1 of the source frame.

Why not just shell out to ffmpeg per cut and concat the pieces? Because every
intermediate is a full re-encode of footage that is about to be re-encoded
again. One filter_complex does the whole sequence in a single pass, which is
both faster and one generation of quality better.

Stdlib only, same as serve.py. ffmpeg and ffprobe are found on PATH.
"""

import copy
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid

EDITOR_DIR = os.path.expanduser("~/Library/Application Support/diskscope")
PROJECT_DIR = os.path.join(EDITOR_DIR, "projects")

ASPECTS = {
    "source": None,
    "16:9": (16, 9),
    "9:16": (9, 16),
    "1:1": (1, 1),
    "4:5": (4, 5),
}

VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm", ".m2ts", ".mts",
              ".insv", ".3gp", ".mpg", ".mpeg", ".wmv", ".flv"}
AUDIO_EXTS = {".mp3", ".m4a", ".wav", ".aac", ".flac", ".aif", ".aiff"}
STILL_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tiff", ".tif"}


def _tool(name):
    return shutil.which(name)


def _quiet_rm(path):
    try:
        os.remove(path)
    except OSError:
        pass


def have_ffmpeg():
    return bool(_tool("ffmpeg") and _tool("ffprobe"))


# --------------------------------------------------------------------------- #
# Probing
# --------------------------------------------------------------------------- #

def _fraction(text, fallback=0.0):
    try:
        if "/" in str(text):
            num, den = str(text).split("/", 1)
            den = float(den)
            return float(num) / den if den else fallback
        return float(text)
    except (TypeError, ValueError):
        return fallback


def probe(path):
    """What ffprobe knows about a file, flattened to the handful of fields the
    editor actually needs. Returns None when the file is not media we can use."""
    ffprobe = _tool("ffprobe")
    if not ffprobe:
        return None
    try:
        out = subprocess.run(
            [ffprobe, "-v", "quiet", "-print_format", "json",
             "-show_format", "-show_streams", path],
            capture_output=True, timeout=60, text=True)
    except (subprocess.SubprocessError, OSError):
        return None
    if out.returncode != 0:
        return None
    try:
        blob = json.loads(out.stdout)
    except ValueError:
        return None

    streams = blob.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    fmt = blob.get("format") or {}
    dur = _fraction(fmt.get("duration"), 0.0)

    ext = os.path.splitext(path)[1].lower()
    if video is None and audio is None:
        return None

    info = {
        "dur": round(dur, 3),
        "hasVideo": video is not None,
        "hasAudio": audio is not None,
        "codec": (video or audio or {}).get("codec_name", ""),
        "w": int(video.get("width", 0)) if video else 0,
        "h": int(video.get("height", 0)) if video else 0,
        "fps": round(_fraction((video or {}).get("r_frame_rate"), 0.0), 3),
        "still": ext in STILL_EXTS,
    }

    # A phone clip is stored landscape with a rotation flag; the editor has to
    # lay it out the way it will actually play, not the way it is stored.
    rotation = 0
    for entry in (video or {}).get("side_data_list", []) or []:
        if "rotation" in entry:
            rotation = int(abs(_fraction(entry["rotation"], 0)))
    tag_rot = ((video or {}).get("tags") or {}).get("rotate")
    if tag_rot:
        rotation = int(abs(_fraction(tag_rot, 0)))
    info["rotation"] = rotation % 360
    if info["rotation"] in (90, 270):
        info["w"], info["h"] = info["h"], info["w"]

    if info["still"]:
        info["dur"] = 0.0        # stills get their length from the timeline
    return info


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #

_store_lock = threading.Lock()


def _project_path(pid):
    return os.path.join(PROJECT_DIR, "%s.json" % pid)


def _now():
    return int(time.time())


def new_id(prefix=""):
    return prefix + uuid.uuid4().hex[:12]


def list_projects():
    try:
        names = os.listdir(PROJECT_DIR)
    except OSError:
        return []
    out = []
    for name in names:
        if not name.endswith(".json"):
            continue
        data = read_project(name[:-5], light=True)
        if not data:
            continue
        # One-time adoption for projects exported before any of this existed.
        # Only when nothing has ever been recorded, so a project whose export
        # was deliberately deleted does not keep re-adopting a stale file.
        if not data.pop("everExported", False):
            found = _adopt_export(data.get("name"), data.get("created"))
            if found:
                record_export(data["id"], found["path"], at=found["at"])
                data["export"] = {"path": found["path"], "at": found["at"],
                                  "name": os.path.basename(found["path"]),
                                  "bytes": os.path.getsize(found["path"])}
        out.append(data)
    out.sort(key=lambda p: -(p.get("updated") or 0))
    return out


def latest_export(data):
    """The most recent export that is still on disk, or None.

    Checked against the filesystem every read rather than trusted from the
    record: a card offering to walk you to a file that was moved or trashed
    weeks ago is worse than a card that says nothing.
    """
    for entry in data.get("exports") or []:
        path = entry.get("path")
        try:
            stat = os.stat(path)
        except (OSError, TypeError):
            continue
        return {"path": path, "name": os.path.basename(path),
                "bytes": stat.st_size, "at": entry.get("at") or int(stat.st_mtime)}
    return None


EXPORT_DIR = os.path.expanduser("~/Movies/diskscope")


def _adopt_export(name, created):
    """Find an export made before projects started recording them.

    The output filename is derived from the project name by a fixed rule, so
    this is a lookup rather than a guess. Numbered variants (-2, -3) are
    deliberately left alone: two projects can reduce to the same safe name, and
    hanging the wrong file off a card is worse than hanging none.
    """
    safe = re.sub(r"[^A-Za-z0-9 ._-]", "", name or "").strip()
    if not safe:
        return None
    path = os.path.join(EXPORT_DIR, "%s.mp4" % safe)
    try:
        stat = os.stat(path)
    except OSError:
        return None
    if created and stat.st_mtime < created - 1:
        return None                      # older than the project — not from it
    return {"path": path, "at": int(stat.st_mtime)}


def record_export(pid, out_path, at=None):
    """Remember that this project produced this file. Newest first.

    Deliberately does not go through write_project(): exporting is not editing,
    and bumping `updated` would make every card claim it was edited just now.
    """
    with _store_lock:
        try:
            with open(_project_path(pid), "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            return
        exports = [e for e in (data.get("exports") or []) if e.get("path") != out_path]
        exports.insert(0, {"path": out_path, "at": at or _now()})
        data["exports"] = exports[:10]
        tmp = _project_path(pid) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, separators=(",", ":"))
        os.replace(tmp, _project_path(pid))


def read_project(pid, light=False):
    try:
        with open(_project_path(pid), "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return None
    if light:
        # The picker only needs the spine, not every clip.
        return {
            "id": data.get("id"),
            "name": data.get("name"),
            "created": data.get("created"),
            "updated": data.get("updated"),
            "aspect": data.get("aspect", "source"),
            "assets": len(data.get("assets") or []),
            "clips": len(data.get("clips") or []),
            "duration": timeline_duration(data),
            "poster": (data.get("assets") or [{}])[0].get("path") if data.get("assets") else None,
            "export": latest_export(data),
            # Not for the client — list_projects() strips it. It is the only way
            # to tell "never exported" from "exported, then the file went away"
            # without reading the whole project a second time.
            "everExported": bool(data.get("exports")),
        }
    data["export"] = latest_export(data)
    return data


def write_project(data):
    data["updated"] = _now()
    # `export` is derived from `exports` on every read. Letting a saved copy of
    # it back into the file would leave a size and a path that stopped being
    # true the moment the file moved.
    data.pop("export", None)
    os.makedirs(PROJECT_DIR, exist_ok=True)
    tmp = _project_path(data["id"]) + ".tmp"
    with _store_lock:
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, separators=(",", ":"))
        os.replace(tmp, _project_path(data["id"]))
    return data


def create_project(name=None):
    pid = new_id("p")
    data = {
        "id": pid,
        "name": name or "Untitled project",
        "created": _now(),
        "updated": _now(),
        "aspect": "source",
        "assets": [],
        "clips": [],
    }
    return write_project(data)


def delete_project(pid):
    try:
        os.remove(_project_path(pid))
        return True
    except OSError:
        return False


def add_assets(pid, paths):
    """Attach files to a project. Anything ffprobe cannot read is reported back
    rather than silently dropped — a folder of 400 clips will have a dud."""
    data = read_project(pid)
    if not data:
        return None, []
    known = {a["path"] for a in data["assets"]}
    added, skipped = [], []
    for path in paths:
        if path in known:
            continue
        if not os.path.isfile(path):
            skipped.append({"path": path, "why": "not a file"})
            continue
        info = probe(path)
        if not info:
            skipped.append({"path": path, "why": "not media ffmpeg can read"})
            continue
        asset = dict(info)
        asset.update({
            "id": new_id("a"),
            "path": path,
            "name": os.path.basename(path),
            "added": _now(),
        })
        data["assets"].append(asset)
        known.add(path)
        added.append(asset)
    write_project(data)
    return data, {"added": added, "skipped": skipped}


def remove_asset(pid, asset_id):
    data = read_project(pid)
    if not data:
        return None
    data["assets"] = [a for a in data["assets"] if a["id"] != asset_id]
    data["clips"] = [c for c in data["clips"] if c["asset"] != asset_id]
    return write_project(data)


def set_clips(pid, clips, aspect=None, name=None):
    data = read_project(pid)
    if not data:
        return None
    by_id = {a["id"]: a for a in data["assets"]}
    clean = []
    for clip in clips or []:
        asset = by_id.get(clip.get("asset"))
        if not asset:
            continue
        dur = float(asset.get("dur") or 0)
        start = max(0.0, float(clip.get("in", 0) or 0))
        end = float(clip.get("out", dur) or dur)
        if asset.get("still"):
            # A still has no duration of its own; in/out is simply how long it
            # should sit on screen.
            start = 0.0
            end = max(0.1, end or 3.0)
        else:
            end = min(end, dur) if dur else end
            if end <= start:
                continue
        keys = []
        for k in clip.get("keys") or []:
            try:
                kt = float(k.get("t"))
            except (TypeError, ValueError):
                continue
            keys.append({
                "t": round(max(start, min(end, kt)), 3),
                "scale": max(1.0, min(8.0, float(k.get("scale", 1) or 1))),
                "x": max(0.0, min(1.0, float(k.get("x", 0.5)))),
                "y": max(0.0, min(1.0, float(k.get("y", 0.5)))),
            })
        keys.sort(key=lambda k: k["t"])

        clean.append({
            "id": clip.get("id") or new_id("c"),
            "asset": asset["id"],
            "in": round(start, 3),
            "out": round(end, 3),
            "scale": max(1.0, min(8.0, float(clip.get("scale", 1) or 1))),
            "x": max(0.0, min(1.0, float(clip.get("x", 0.5)))),
            "y": max(0.0, min(1.0, float(clip.get("y", 0.5)))),
            "keys": keys,
            "ease": bool(clip.get("ease")),
            "mute": bool(clip.get("mute")),
            # Provenance: was this moment chosen, or is it the editor's default
            # "lay every asset down whole"? Review has to tell them apart, and a
            # short clip whose moment covers all of it looks identical either
            # way from the numbers alone.
            "auto": bool(clip.get("auto")),
        })
    data["clips"] = clean
    if aspect in ASPECTS:
        data["aspect"] = aspect
    if name:
        data["name"] = name[:120]
    return write_project(data)


def timeline_duration(data):
    total = 0.0
    for clip in data.get("clips") or []:
        total += max(0.0, float(clip.get("out", 0)) - float(clip.get("in", 0)))
    return round(total, 3)


# --------------------------------------------------------------------------- #
# Jobs (export)
# --------------------------------------------------------------------------- #
#
# Every long ffmpeg run reports a live percentage and an ETA. `-progress pipe:1`
# gives `out_time_us` on a steady tick, which against a known total duration is
# a real percentage rather than a spinner pretending to be one.

class Job:
    def __init__(self, kind, label, total_seconds):
        self.id = new_id("j")
        self.kind = kind                 # export | merge | auto | analyse
        self.label = label
        self.total = max(0.001, total_seconds)
        self.done_seconds = 0.0
        self.state = "running"           # running | done | error | cancelled
        self.error = None
        self.output = None
        self.started = time.time()
        self.finished = 0.0
        self.step = 1
        self.steps = 1
        self.proc = None
        self.link = None
        self.meta = {}
        self.lock = threading.Lock()

    def snapshot(self):
        with self.lock:
            frac = min(1.0, self.done_seconds / self.total) if self.total else 0.0
            elapsed = (self.finished or time.time()) - self.started
            eta = None
            if self.state == "running" and frac > 0.01:
                eta = max(0, int(elapsed / frac - elapsed))
            return {
                "id": self.id,
                "kind": self.kind,
                "label": self.label,
                "state": self.state,
                "percent": round(frac * 100, 1),
                "elapsed": int(elapsed),
                "eta": eta,
                "error": self.error,
                "output": self.output,
                "link": self.link,
                "meta": self.meta,
                "step": self.step,
                "steps": self.steps,
            }

    def cancel(self):
        with self.lock:
            proc = self.proc
            if self.state == "running":
                self.state = "cancelled"
        if proc:
            try:
                proc.terminate()
            except OSError:
                pass


JOBS = {}
JOBS_LOCK = threading.Lock()


def get_job(job_id):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    return job.snapshot() if job else None


def active_jobs():
    with JOBS_LOCK:
        jobs = list(JOBS.values())
    out = [j.snapshot() for j in jobs]
    # Keep finished jobs around briefly so the UI can show the result, then let
    # them fall off rather than growing without bound.
    stale = [j.id for j in jobs
             if j.finished and time.time() - j.finished > 300]
    if stale:
        with JOBS_LOCK:
            for jid in stale:
                JOBS.pop(jid, None)
    return [j for j in out if j["id"] not in stale]


_PROGRESS_RE = re.compile(r"^out_time_us=(-?\d+)", re.M)


def _run_ffmpeg(job, args, seconds_for_step):
    """Run one ffmpeg invocation, feeding the job's progress as it goes."""
    ffmpeg = _tool("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is not on PATH")
    base = [ffmpeg, "-hide_banner", "-nostdin", "-y",
            "-progress", "pipe:1", "-loglevel", "error"]
    proc = subprocess.Popen(base + args, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, bufsize=1)
    with job.lock:
        job.proc = proc
        base_done = job.done_seconds

    for line in proc.stdout:
        if line.startswith("out_time_us="):
            try:
                micros = int(line.split("=", 1)[1])
            except ValueError:
                continue
            if micros < 0:
                continue
            with job.lock:
                job.done_seconds = base_done + min(seconds_for_step, micros / 1e6)
    proc.stdout.close()
    err = proc.stderr.read()
    proc.stderr.close()
    code = proc.wait()
    with job.lock:
        job.proc = None
        cancelled = job.state == "cancelled"
        # Only a finished step is a completed step. Filling the bar on the way
        # out made a cancelled render read as 100% done.
        if not cancelled:
            job.done_seconds = base_done + seconds_for_step
    if cancelled:
        raise RuntimeError("cancelled")
    if code != 0:
        # ffmpeg's last stderr line is the one that says what actually broke.
        tail = [l for l in (err or "").strip().splitlines() if l.strip()]
        raise RuntimeError(tail[-1] if tail else "ffmpeg exited %d" % code)


def _start(job, target, *args):
    with JOBS_LOCK:
        JOBS[job.id] = job

    def run():
        try:
            target(job, *args)
            with job.lock:
                if job.state == "running":
                    job.state = "done"
        except Exception as exc:                       # noqa: BLE001 — shown in UI
            with job.lock:
                if job.state != "cancelled":
                    job.state = "error"
                    job.error = str(exc)
        finally:
            with job.lock:
                job.finished = time.time()

    threading.Thread(target=run, daemon=True).start()
    return job.snapshot()


# --------------------------------------------------------------------------- #
# Listening for the good bits
# --------------------------------------------------------------------------- #
#
# One ffmpeg pass per asset reads the audio only — no video decode at all — and
# reports RMS loudness every half second. On this machine that runs at roughly
# a thousand times real time, so ten hours of footage is measured in about a
# minute, which is what makes "suggest me the good parts" usable at all.
#
# Loudness is a blunt instrument and it is worth being honest about that: it
# finds talking, laughing, waves and music. It cannot tell a joke from a
# motorbike. That is exactly why every suggestion it makes is a window you can
# slide rather than a decision it made for you.

ANALYSIS_DIR = os.path.join(EDITOR_DIR, "analysis")
STEP = 0.5                      # seconds per loudness sample
QUIET_DB, LOUD_DB = -55.0, -14.0

_RMS_RE = re.compile(r"RMS_level=(-?\d+\.?\d*|-?inf)")


def analysis_path(asset):
    key = hashlib.sha1(("%s|%s" % (asset["path"], asset.get("dur"))).encode("utf-8"))
    return os.path.join(ANALYSIS_DIR, key.hexdigest()[:20] + ".json")


def read_analysis(asset):
    try:
        with open(analysis_path(asset), "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def analyse_asset(asset):
    """Loudness every STEP seconds, 0..1, cached."""
    cached = read_analysis(asset)
    if cached:
        return cached
    ffmpeg = _tool("ffmpeg")
    if not ffmpeg or not asset.get("hasAudio"):
        # No audio to listen to — a flat series still lets the UI offer a window.
        data = {"step": STEP, "levels": [], "silent": True}
        _save_analysis(asset, data)
        return data

    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tmp:
        out = tmp.name
    try:
        subprocess.run([
            ffmpeg, "-hide_banner", "-nostdin", "-v", "error", "-i", asset["path"],
            "-vn",
            "-af", ("aresample=8000,asetnsamples=n=%d:p=0,astats=metadata=1:reset=1,"
                    "ametadata=print:file=%s:key=lavfi.astats.Overall.RMS_level"
                    % (int(8000 * STEP), out.replace(":", "\\:"))),
            "-f", "null", "-",
        ], capture_output=True, timeout=600)
        with open(out, "r", encoding="utf-8", errors="replace") as fh:
            body = fh.read()
    except (subprocess.SubprocessError, OSError):
        body = ""
    finally:
        _quiet_rm(out)

    levels = []
    for hit in _RMS_RE.findall(body):
        db = QUIET_DB if "inf" in hit else float(hit)
        # Straight to 0..1 so the browser gets something it can draw directly.
        norm = (db - QUIET_DB) / (LOUD_DB - QUIET_DB)
        levels.append(round(max(0.0, min(1.0, norm)), 3))

    data = {"step": STEP, "levels": levels, "silent": not levels}
    _save_analysis(asset, data)
    return data


def _save_analysis(asset, data):
    try:
        os.makedirs(ANALYSIS_DIR, exist_ok=True)
        with open(analysis_path(asset), "w", encoding="utf-8") as fh:
            json.dump(data, fh, separators=(",", ":"))
    except OSError:
        pass


def _smooth(levels, span):
    """Moving average. A single loud clap is not a moment; a lively stretch is."""
    if span <= 1 or not levels:
        return list(levels)
    out = []
    half = span // 2
    run = 0.0
    for i in range(len(levels)):
        lo, hi = max(0, i - half), min(len(levels), i + half + 1)
        run = sum(levels[lo:hi]) / float(hi - lo)
        out.append(run)
    return out


def suggest(asset, length=8.0, count=1, avoid_edges=1.0):
    """Pick the liveliest non-overlapping windows of `length` seconds."""
    dur = float(asset.get("dur") or 0)
    length = max(1.0, min(length, max(1.0, dur)))
    data = read_analysis(asset) or {"levels": [], "step": STEP}
    levels = data.get("levels") or []
    step = data.get("step") or STEP

    if not levels:
        # Nothing to go on: offer the middle, which beats offering the start
        # where the camera is still being aimed.
        start = max(0.0, min(dur - length, (dur - length) / 2.0))
        return [{"start": round(start, 2), "end": round(min(dur, start + length), 2),
                 "score": 0.0, "guess": True}]

    smooth = _smooth(levels, max(3, int(2.0 / step)))
    win = max(1, int(round(length / step)))
    # Prefix sums make every candidate window a subtraction.
    acc = [0.0]
    for v in smooth:
        acc.append(acc[-1] + v)

    lo_i = int(avoid_edges / step)
    hi_i = len(smooth) - win - int(avoid_edges / step)
    scores = []
    for i in range(max(0, lo_i), max(1, hi_i + 1)):
        scores.append(((acc[i + win] - acc[i]) / win, i))
    if not scores:
        scores = [((acc[-1] - acc[0]) / max(1, len(smooth)), 0)]
    scores.sort(reverse=True)

    picks, taken = [], []
    gap = win * 0.8
    for score, i in scores:
        if any(abs(i - j) < gap for j in taken):
            continue
        taken.append(i)
        start = i * step
        picks.append({"start": round(start, 2),
                      "end": round(min(dur, start + length), 2),
                      "score": round(score, 3), "guess": False})
        if len(picks) >= count:
            break
    picks.sort(key=lambda p: p["start"])
    return picks


def auto_edit(pid, target=300.0, moment=8.0, per_clip=0):
    """Listen to everything, then lay down the liveliest moments as a timeline.

    Two shapes, both useful and both one number apart:
      per_clip=1  — every clip contributes its best moment. A covering cut.
      per_clip=0  — the best moments anywhere, until `target` is filled. A
                    highlight reel, which will skip whole clips that had
                    nothing going on.

    Candidates are capped per asset and taken in rounds, so one loud scene
    cannot eat the entire edit while quieter ones never get a look in.
    """
    src = read_project(pid)
    if not src:
        return None
    assets = [a for a in src["assets"] if a.get("hasVideo") and not a.get("still")]
    if not assets:
        raise RuntimeError("no video in this project")

    # A cut is a new project, never an overwrite. The bin is the same footage,
    # so running it again at a different length costs nothing and leaves both
    # results side by side to compare.
    label = "every clip" if per_clip else "%d min" % max(1, round(target / 60.0))
    dest = create_project("%s · auto %s" % (src["name"], label))
    dest["assets"] = copy.deepcopy(src["assets"])
    dest["aspect"] = src.get("aspect", "source")
    write_project(dest)

    job = Job("auto", "Auto clip · %s" % label, float(len(assets)) + 1.0)
    job.steps = len(assets)
    job.meta = {"project": dest["id"], "name": dest["name"], "from": src["name"]}
    return _start(job, _auto_worker, dest["id"], assets, target, moment, per_clip)


def _auto_worker(job, pid, assets, target, moment, per_clip):
    order = {a["id"]: i for i, a in enumerate(assets)}
    candidates = []
    for i, asset in enumerate(assets, 1):
        with job.lock:
            if job.state == "cancelled":
                raise RuntimeError("cancelled")
            job.step = i
            job.label = "Listening %d/%d · %s" % (i, len(assets), asset["name"])
            job.done_seconds = float(i)
        analyse_asset(asset)
        # Three per clip is enough to choose from without letting one clip
        # dominate; the cap below decides how many actually get used.
        for pick in suggest(asset, moment, 3):
            pick = dict(pick, asset=asset["id"])
            candidates.append(pick)

    with job.lock:
        job.label = "Choosing the moments"

    chosen = []
    if per_clip:
        best = {}
        for c in candidates:
            if c["score"] > best.get(c["asset"], {"score": -1})["score"]:
                best[c["asset"]] = c
        chosen = list(best.values())
    else:
        ranked = sorted(candidates, key=lambda c: -c["score"])
        used, total = {}, 0.0
        # Rounds: one moment from each clip that deserves one, then seconds, and
        # so on, until the target length is met.
        for cap in (1, 2, 3):
            for c in ranked:
                if total >= target:
                    break
                if used.get(c["asset"], 0) >= cap:
                    continue
                if any(o["asset"] == c["asset"] and abs(o["start"] - c["start"]) < moment
                       for o in chosen):
                    continue
                chosen.append(c)
                used[c["asset"]] = used.get(c["asset"], 0) + 1
                total += c["end"] - c["start"]
            if total >= target:
                break

    # Chronological, which for a trip is the order it happened in.
    chosen.sort(key=lambda c: (order.get(c["asset"], 0), c["start"]))
    clips = [{"asset": c["asset"], "in": c["start"], "out": c["end"],
              "scale": 1, "x": 0.5, "y": 0.5, "auto": True} for c in chosen]
    set_clips(pid, clips)

    secs = sum(c["out"] - c["in"] for c in clips)
    with job.lock:
        job.done_seconds = job.total
        job.meta = dict(job.meta, clips=len(clips), seconds=round(secs))
        job.label = "%s · %d moments · %d:%02d" % (
            job.meta.get("name", "Auto clip"), len(clips),
            int(secs // 60), int(secs % 60))


def analyse_project(pid):
    data = read_project(pid)
    if not data:
        return None
    todo = [a for a in data["assets"] if a.get("hasVideo") and not a.get("still")
            and not read_analysis(a)]
    if not todo:
        return {"nothing": True}
    job = Job("analyse", "Listening to %s" % data["name"], float(len(todo)))
    job.steps = len(todo)
    return _start(job, _analyse_worker, todo)


def _analyse_worker(job, assets):
    for i, asset in enumerate(assets, 1):
        with job.lock:
            if job.state == "cancelled":
                raise RuntimeError("cancelled")
            job.step = i
            job.label = "Listening %d/%d · %s" % (i, len(assets), asset["name"])
        analyse_asset(asset)
        with job.lock:
            job.done_seconds = float(i)


# --------------------------------------------------------------------------- #
# Export
# --------------------------------------------------------------------------- #

def _out_size(data, assets_by_id):
    """The canvas every clip is fitted into."""
    ratio = ASPECTS.get(data.get("aspect") or "source")
    first = None
    for clip in data.get("clips") or []:
        asset = assets_by_id.get(clip["asset"])
        if asset and asset.get("w"):
            first = asset
            break
    src_w = (first or {}).get("w") or 1920
    src_h = (first or {}).get("h") or 1080

    if ratio is None:
        # Follow the footage, but cap the long edge at 1080p — a 4K export of
        # phone clips is mostly a bigger file, not a better one.
        long_edge = max(src_w, src_h)
        if long_edge > 1920:
            k = 1920.0 / long_edge
            src_w, src_h = int(src_w * k), int(src_h * k)
        return _even(src_w), _even(src_h)

    num, den = ratio
    if num >= den:
        w = 1920
        h = int(round(w * den / float(num)))
    else:
        h = 1920
        w = int(round(h * num / float(den)))
    return _even(w), _even(h)


def _even(n):
    n = int(round(n))
    return n - (n % 2) if n > 1 else 2


# --------------------------------------------------------------------------- #
# Keyframed motion
# --------------------------------------------------------------------------- #
#
# A keyframed clip cannot use `crop`: its w/h expressions are evaluated once,
# when the graph is built, so a window that changes size over time is not
# something it can express. `zoompan` can — but it scales whatever it crops to
# its output size regardless of shape, so feeding it a 16:9 source and asking
# for a 9:16 output stretches faces.
#
# So the clip is first cropped, statically, to the smallest canvas-shaped box
# that contains every frame of the move. Inside that box the aspect already
# matches the output, and zoompan is free to fly around without distorting
# anything. The static box also means zoompan never sees more pixels than the
# move actually needs.

def _ease(u, smooth):
    if not smooth:
        return u
    return u * u * (3.0 - 2.0 * u)        # smoothstep: ease in and out


def sample_motion(clip, at_t):
    """The framing at a moment, in source seconds. Outside the keys it holds."""
    keys = clip.get("keys") or []
    if not keys:
        return clip.get("scale", 1) or 1, clip.get("x", 0.5), clip.get("y", 0.5)
    if at_t <= keys[0]["t"]:
        k = keys[0]
        return k["scale"], k["x"], k["y"]
    if at_t >= keys[-1]["t"]:
        k = keys[-1]
        return k["scale"], k["x"], k["y"]
    for i in range(len(keys) - 1):
        a, b = keys[i], keys[i + 1]
        if a["t"] <= at_t <= b["t"]:
            span = b["t"] - a["t"]
            u = 0.0 if span <= 0 else _ease((at_t - a["t"]) / span, clip.get("ease"))
            return (a["scale"] + (b["scale"] - a["scale"]) * u,
                    a["x"] + (b["x"] - a["x"]) * u,
                    a["y"] + (b["y"] - a["y"]) * u)
    k = keys[-1]
    return k["scale"], k["x"], k["y"]


def _window(src_w, src_h, view_w, view_h, scale, x, y):
    """The rectangle of the source that ends up on screen."""
    w = view_w / scale
    h = view_h / scale
    return (src_w - w) * x, (src_h - h) * y, w, h


def _motion_box(clip, asset, view_w, view_h):
    """The union of every window the move passes through.

    left = (iw - w)*x is a product of two things that both change, so the widest
    point of a move is not necessarily at a keyframe — sampling the path is
    cheaper than solving it and cannot be wrong.
    """
    keys = clip["keys"]
    src_w, src_h = asset["w"], asset["h"]
    t0, t1 = clip["in"], clip["out"]
    x0 = y0 = float("inf")
    x1 = y1 = float("-inf")
    steps = max(24, min(400, int((t1 - t0) * 12)))
    for i in range(steps + 1):
        t = t0 + (t1 - t0) * (i / float(steps))
        s, kx, ky = sample_motion(clip, t)
        left, top, w, h = _window(src_w, src_h, view_w, view_h, s, kx, ky)
        x0 = min(x0, left)
        y0 = min(y0, top)
        x1 = max(x1, left + w)
        y1 = max(y1, top + h)
    # Grow the box back to the view's shape so zoompan keeps proportions.
    bw, bh = x1 - x0, y1 - y0
    ar = view_w / float(view_h)
    if bw / bh < ar:
        need = bh * ar
        x0 -= (need - bw) / 2.0
        bw = need
    else:
        need = bw / ar
        y0 -= (need - bh) / 2.0
        bh = need
    # Clamp inside the source without changing the shape.
    bw = min(bw, src_w)
    bh = min(bh, src_h)
    x0 = max(0.0, min(src_w - bw, x0))
    y0 = max(0.0, min(src_h - bh, y0))
    return _even(x0), _even(y0), _even(bw), _even(bh)


def _piecewise(points, default):
    """An ffmpeg expression: linear between samples, held at both ends."""
    if not points:
        return "%.5f" % default
    if len(points) == 1:
        return "%.5f" % points[0][1]
    expr = "%.5f" % points[-1][1]
    for i in range(len(points) - 2, -1, -1):
        (ta, va), (tb, vb) = points[i], points[i + 1]
        span = max(1e-6, tb - ta)
        seg = ("(%.5f+(%.5f)*(clip(time\\,%.5f\\,%.5f)-%.5f)/%.5f)"
               % (va, vb - va, ta, tb, ta, span))
        expr = "if(lt(time\\,%.5f)\\,%s\\,%s)" % (tb, seg, expr)
    return "if(lt(time\\,%.5f)\\,%.5f\\,%s)" % (points[0][0], points[0][1], expr)


def _motion_filter(clip, asset, view_w, view_h, out_w, out_h):
    """crop to the union box, then zoompan through the move inside it."""
    bx, by, bw, bh = _motion_box(clip, asset, view_w, view_h)
    parts = ["crop=%d:%d:%d:%d" % (bw, bh, bx, by)]

    # Sample the move densely enough that the expression tracks it. Easing is
    # baked into the samples, so the expression itself stays linear.
    t0, t1 = clip["in"], clip["out"]
    steps = max(12, min(240, int((t1 - t0) * 8)))
    zs, xs, ys = [], [], []
    for i in range(steps + 1):
        t = t0 + (t1 - t0) * (i / float(steps))
        s, kx, ky = sample_motion(clip, t)
        left, top, w, h = _window(asset["w"], asset["h"], view_w, view_h, s, kx, ky)
        rel = t - t0                       # trim resets the clock to zero
        zs.append((rel, max(1.0, bw / max(1.0, w))))
        xs.append((rel, left - bx))
        ys.append((rel, top - by))

    parts.append(
        "zoompan=z='%s':x='%s':y='%s':d=1:s=%dx%d:fps=30"
        % (_piecewise(zs, 1.0), _piecewise(xs, 0.0), _piecewise(ys, 0.0),
           out_w, out_h))
    return parts


def _clip_filter(idx, clip, asset, out_w, out_h, fill):
    """One clip's video chain: trim, punch in, fit the canvas, normalise.

    The punch-in is a crop *before* scaling — cropping a 4K frame to the visible
    window and then scaling it to 1080p keeps every pixel the sensor captured,
    where scaling first and cropping after would throw them away.

    `fill` decides what happens when the clip and the canvas disagree in shape.
    Asking for 9:16 means "reframe this", so the frame is cropped to fill and
    x/y choose which part survives. On a source-shaped canvas there is nothing
    to reframe, so mixed orientations are fitted and padded instead of having
    their sides cut off.
    """
    v = "[%d:v]" % idx
    parts = []
    dur = max(0.001, clip["out"] - clip["in"])
    scale = max(1.0, float(clip.get("scale") or 1))
    x = float(clip.get("x", 0.5))
    y = float(clip.get("y", 0.5))

    if asset.get("still"):
        parts.append("loop=loop=-1:size=1:start=0")
        parts.append("trim=duration=%.3f" % dur)
    else:
        parts.append("trim=start=%.3f:end=%.3f" % (clip["in"], clip["out"]))
    parts.append("setpts=PTS-STARTPTS")

    keyed = bool(clip.get("keys")) and not asset.get("still") and asset.get("w")

    if keyed:
        # zoompan reads `time`, so the frames must already be at the output rate
        # and starting from zero before it sees them.
        parts.append("fps=30")
        if fill:
            view_w = min(asset["w"], asset["h"] * (out_w / float(out_h)))
            view_h = view_w * out_h / float(out_w)
            parts += _motion_filter(clip, asset, view_w, view_h, out_w, out_h)
        else:
            # Source shape: the move happens inside the clip's own frame, then
            # the result is fitted and padded exactly as a static clip would be.
            fit_w, fit_h = _fit(asset["w"], asset["h"], out_w, out_h)
            parts += _motion_filter(clip, asset, asset["w"], asset["h"], fit_w, fit_h)
            parts.append("pad=%d:%d:(ow-iw)/2:(oh-ih)/2:color=black" % (out_w, out_h))
    elif fill:
        # The largest canvas-shaped rectangle that fits the source, divided by
        # the punch-in. iw/ih are the source's real dimensions, so x/y keep
        # meaning whatever the footage resolution is.
        ar = out_w / float(out_h)
        cw = "min(iw\\,ih*%.6f)/%.4f" % (ar, scale)
        ch = "(%s)/%.6f" % (cw, ar)
        parts.append("crop=%s:%s:(iw-(%s))*%.4f:(ih-(%s))*%.4f"
                     % (cw, ch, cw, x, ch, y))
        parts.append("scale=%d:%d" % (out_w, out_h))
    else:
        if scale > 1.001:
            cw = "iw/%.4f" % scale
            ch = "ih/%.4f" % scale
            parts.append("crop=%s:%s:(iw-(%s))*%.4f:(ih-(%s))*%.4f"
                         % (cw, ch, cw, x, ch, y))
        # decrease + pad is what stops a vertical clip being stretched across a
        # landscape frame.
        parts.append("scale=%d:%d:force_original_aspect_ratio=decrease" % (out_w, out_h))
        parts.append("pad=%d:%d:(ow-iw)/2:(oh-ih)/2:color=black" % (out_w, out_h))

    parts.append("setsar=1")
    if not keyed:
        parts.append("fps=30")
    parts.append("format=yuv420p")
    return "%s%s[v%d]" % (v, ",".join(parts), idx)


def _fit(src_w, src_h, box_w, box_h):
    """Largest box_w×box_h-bounded rectangle keeping the source's shape."""
    k = min(box_w / float(src_w), box_h / float(src_h))
    return _even(src_w * k), _even(src_h * k)


def _audio_filter(idx, clip, asset):
    dur = max(0.001, clip["out"] - clip["in"])
    if clip.get("mute") or not asset.get("hasAudio") or asset.get("still"):
        # Silence still has to exist, or concat loses sync on the next clip.
        return ("anullsrc=channel_layout=stereo:sample_rate=48000,"
                "atrim=duration=%.3f,asetpts=PTS-STARTPTS[a%d]" % (dur, idx))
    return ("[%d:a]atrim=start=%.3f:end=%.3f,asetpts=PTS-STARTPTS,"
            "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"
            "[a%d]" % (idx, clip["in"], clip["out"], idx))


def build_export_command(data, out_path):
    """The whole timeline as one ffmpeg invocation."""
    assets = {a["id"]: a for a in data.get("assets") or []}
    clips = [c for c in (data.get("clips") or []) if c["asset"] in assets]
    if not clips:
        raise RuntimeError("this project has no clips yet")

    out_w, out_h = _out_size(data, assets)
    fill = ASPECTS.get(data.get("aspect") or "source") is not None
    args = []
    graph = []
    silent_inputs = []

    for i, clip in enumerate(clips):
        asset = assets[clip["asset"]]
        if asset.get("still"):
            args += ["-loop", "1", "-t", "%.3f" % max(0.001, clip["out"] - clip["in"]),
                     "-i", asset["path"]]
        else:
            args += ["-i", asset["path"]]

    for i, clip in enumerate(clips):
        asset = assets[clip["asset"]]
        graph.append(_clip_filter(i, clip, asset, out_w, out_h, fill))
        af = _audio_filter(i, clip, asset)
        if af.startswith("anullsrc"):
            silent_inputs.append(af)
        else:
            graph.append(af)
    graph.extend(silent_inputs)

    joins = "".join("[v%d][a%d]" % (i, i) for i in range(len(clips)))
    graph.append("%sconcat=n=%d:v=1:a=1[vout][aout]" % (joins, len(clips)))

    args += [
        "-filter_complex", ";".join(graph),
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "h264_videotoolbox", "-b:v", "12000k",
        "-profile:v", "high",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        out_path,
    ]
    return args, out_w, out_h


# --------------------------------------------------------------------------- #
# Merge & upload
# --------------------------------------------------------------------------- #
#
# This does not reimplement the merge — camera01-archive/merge-upload.sh is the
# settled pipeline and stays the single source of truth for how a batch is
# encoded, concatenated and pushed to YouTube. What is added here is a way to
# start it from the browser and watch it without a terminal, which is exactly
# what DISKSCOPE_NO_POPUP was already there for.
#
# Progress comes from the two artefacts the pipeline already writes:
#   _render/*.prog     ffmpeg -progress, one per clip, during the encode
#   _render/upload.json yt-helper's own byte counter, during the upload

MERGE_SH = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "camera01-archive", "merge-upload.sh"))

ENCODE_SHARE = 0.86     # the encode is the long pole; the upload is the tail


def have_merge():
    return os.path.isfile(MERGE_SH) and os.access(MERGE_SH, os.X_OK)


# --------------------------------------------------------------------------- #
# Does this actually need encoding?
# --------------------------------------------------------------------------- #
#
# The merge script normalises every clip to 1080p H.264 because a folder of
# mixed camera footage has to be made uniform before it can be concatenated.
# A file this app exported five minutes ago is already exactly that, and
# encoding it a second time costs minutes and loses a generation for nothing.
#
# "Ready" means: it is already what the encode would have produced. Anything
# above 1080p is deliberately NOT ready — re-encoding a 4K source down is the
# difference between uploading 30 GB and uploading 2 GB.

COPY_MAX_W, COPY_MAX_H = 1920, 1080
_READY_EXTS = {".mp4", ".m4v", ".mov"}


def _mux_probe(path):
    """The stream facts a remux cares about, which probe() does not carry."""
    ffprobe = _tool("ffprobe")
    if not ffprobe:
        return None
    try:
        out = subprocess.run(
            [ffprobe, "-v", "quiet", "-print_format", "json",
             "-show_streams", path],
            capture_output=True, timeout=60, text=True)
        blob = json.loads(out.stdout) if out.returncode == 0 else {}
    except (subprocess.SubprocessError, OSError, ValueError):
        return None
    streams = blob.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if not video:
        return None
    return {
        "vcodec": video.get("codec_name", ""),
        "w": int(video.get("width") or 0),
        "h": int(video.get("height") or 0),
        "pix": video.get("pix_fmt", ""),
        "fps": video.get("r_frame_rate", ""),
        "acodec": (audio or {}).get("codec_name", ""),
        "ar": (audio or {}).get("sample_rate", ""),
        "ac": (audio or {}).get("channels", 0),
    }


def upload_ready(paths):
    """Can these go to YouTube with no encode? Returns {ok, why}.

    `why` is written to be shown to a person, because a toggle that silently
    decides something this expensive is worse than one that says its reason.
    """
    paths = [p for p in paths if os.path.isfile(p)]
    if not paths:
        return {"ok": False, "why": "nothing to check"}

    infos = []
    for path in paths:
        if os.path.splitext(path)[1].lower() not in _READY_EXTS:
            return {"ok": False, "why": "%s isn't an mp4" % os.path.basename(path)}
        info = _mux_probe(path)
        if not info:
            return {"ok": False, "why": "couldn't read %s" % os.path.basename(path)}
        if info["vcodec"] != "h264":
            return {"ok": False, "why": "%s is %s, not H.264"
                                       % (os.path.basename(path), info["vcodec"] or "unknown")}
        # Orientation-agnostic: a 1080x1920 portrait clip is the same pixel
        # budget as 1920x1080 and is already fine. Comparing width to 1920
        # would send every vertical export back through the encoder — which
        # pillarboxes it into a 16:9 frame, so that is not just slow, it is wrong.
        if max(info["w"], info["h"]) > COPY_MAX_W or min(info["w"], info["h"]) > COPY_MAX_H:
            return {"ok": False, "why": "%dx%d — encoding it down makes the upload smaller"
                                       % (info["w"], info["h"])}
        if info["pix"] not in ("yuv420p", "yuvj420p"):
            return {"ok": False, "why": "%s is %s" % (os.path.basename(path), info["pix"])}
        if info["acodec"] and info["acodec"] != "aac":
            return {"ok": False, "why": "%s has %s audio"
                                       % (os.path.basename(path), info["acodec"])}
        infos.append(info)

    # One clip is just an upload. Several have to be stitched, and the concat
    # demuxer's -c copy is only legal when the streams match each other too.
    if len(infos) > 1:
        first = infos[0]
        for path, info in zip(paths[1:], infos[1:]):
            if any(info[k] != first[k] for k in ("w", "h", "pix", "fps", "acodec", "ar", "ac")):
                return {"ok": False,
                        "why": "%s doesn't match the first clip" % os.path.basename(path)}
        return {"ok": True, "why": "already 1080p H.264 and all matching — copy, don't encode"}
    return {"ok": True, "why": "already 1080p H.264 — nothing to encode"}


def _durations(paths):
    total = 0.0
    for path in paths:
        info = probe(path)
        if info:
            total += info.get("dur") or 0
    return total


def trash_paths(paths):
    """Finder's move-to-Trash for a batch. Returns the paths that actually went."""
    gone = []
    for chunk in [paths[i:i + 150] for i in range(0, len(paths), 150)]:
        items = ", ".join('POSIX file "%s"' % p.replace('"', '\\"') for p in chunk)
        try:
            subprocess.run(["/usr/bin/osascript", "-e",
                            'tell application "Finder" to delete {%s}' % items],
                           check=True, timeout=180, capture_output=True)
            gone.extend(chunk)
        except (subprocess.SubprocessError, OSError):
            continue
    return gone


def merge_upload(paths, title, privacy="unlisted", upload=True, sort=True,
                 trash_after=False, encode=True):
    if not have_merge():
        raise RuntimeError("camera01-archive/merge-upload.sh is missing")
    paths = [p for p in paths if os.path.isfile(p)]
    if not paths:
        raise RuntimeError("no readable clips in that selection")
    title = (title or "").strip()
    if not title:
        raise RuntimeError("give it a title")
    # The script writes its parts and logs beside the first clip.
    render_dir = os.path.join(os.path.dirname(paths[0]), "_render")
    seconds = _durations(paths)

    job = Job("merge", "%s · %d clip%s" % (title, len(paths), "" if len(paths) == 1 else "s"), 1.0)
    job.steps = len(paths)
    job.meta = {"title": title, "clips": len(paths), "seconds": round(seconds),
                "upload": bool(upload), "encode": bool(encode)}
    return _start(job, _merge_worker, paths, title, privacy, upload, sort,
                  render_dir, seconds, bool(trash_after and upload), bool(encode))


def _fresh(path, after):
    """Was this written by the run we are watching, or left by an earlier one?

    Every batch shares one `_render` folder, so yesterday's upload.json — which
    says 100% — is sitting right where this run's will go. Reading it once is
    enough to pin a monotonic bar at 100% for the rest of the job.
    """
    try:
        return os.path.getmtime(path) >= after - 1
    except OSError:
        return False


def _read_prog_seconds(render_dir, after=0):
    """Sum how far every per-clip ffmpeg has got."""
    total = 0.0
    try:
        names = [n for n in os.listdir(render_dir) if n.endswith(".prog")]
    except OSError:
        return 0.0
    for name in names:
        full = os.path.join(render_dir, name)
        if not _fresh(full, after):
            continue
        try:
            with open(full, "r", encoding="utf-8") as fh:
                body = fh.read()
        except OSError:
            continue
        hits = _PROGRESS_RE.findall(body)
        if hits:
            try:
                total += max(0, int(hits[-1])) / 1e6
            except ValueError:
                pass
    return total


def _read_upload_json(render_dir, after=0):
    path = os.path.join(render_dir, "upload.json")
    if not _fresh(path, after):
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _merge_worker(job, paths, title, privacy, upload, sort, render_dir, seconds,
                  trash_after=False, encode=True):
    args = [MERGE_SH, "--title", title, "--privacy", privacy]
    if not sort:
        args.append("--no-sort")
    if not upload:
        args.append("--no-upload")
    if not encode:
        args.append("--no-encode")
    args += paths

    # With no encode there is no encode phase to give the bar its first 86% —
    # the whole job is the upload, so let it have the whole bar.
    enc_share = ENCODE_SHARE if encode else 0.0

    env = dict(os.environ)
    env["DISKSCOPE_NO_POPUP"] = "1"      # the browser is the progress window now

    # Anything in _render older than this belongs to a previous batch.
    started = time.time()

    proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, env=env,
                            cwd=os.path.dirname(MERGE_SH))
    with job.lock:
        job.proc = proc

    stop = threading.Event()

    def watch():
        """Translate the pipeline's own artefacts into one moving number.

        The bar only ever goes forwards. It has to: the script deletes its
        .prog files the moment the encode finishes, so reading them straight
        would drop the bar to zero for the whole concat — which reads as a
        crash, not as progress.
        """
        best = 0.0
        while not stop.is_set():
            done = _read_prog_seconds(render_dir, started)
            up = _read_upload_json(render_dir, started)
            with job.lock:
                if up:
                    pct = float(up.get("percent") or 0)
                    target = enc_share + (1 - enc_share) * min(1.0, pct / 100.0)
                    mbps = float(up.get("mbps") or 0)
                    job.label = ("%s · uploading %.0f%%" % (title, pct)
                                 + (" · %.1f MB/s" % mbps if mbps > 0.05 else ""))
                elif seconds > 0 and done > 0:
                    frac = min(1.0, done / seconds)
                    target = enc_share * frac
                    job.label = "%s · encoding %.0f%%" % (title, frac * 100)
                else:
                    # No .prog files: either the encode hasn't started yet, or
                    # it is over and the parts are being stitched. With
                    # --no-encode there never are any, and the wait is short.
                    target = best
                    if not encode:
                        job.label = "%s · getting ready to upload" % title
                    elif best > 0:
                        job.label = "%s · merging the parts" % title
                best = max(best, target)
                job.done_seconds = best
            stop.wait(0.8)

    watcher = threading.Thread(target=watch, daemon=True)
    watcher.start()

    tail = []
    for line in proc.stdout:
        line = line.rstrip()
        if line:
            tail.append(line)
            del tail[:-40]
    proc.stdout.close()
    code = proc.wait()
    stop.set()
    watcher.join(timeout=2)

    with job.lock:
        job.proc = None
        cancelled = job.state == "cancelled"
    if cancelled:
        raise RuntimeError("cancelled")
    if code != 0:
        raise RuntimeError(tail[-1] if tail else "merge-upload.sh exited %d" % code)

    link = None
    for line in reversed(tail):
        hit = re.search(r"https://youtu\.be/[A-Za-z0-9_-]+", line)
        if hit:
            link = hit.group(0)
            break
    out = os.path.join(render_dir, "%s.mp4" % title)

    # Only ever after a link comes back. "The upload finished" is the one piece
    # of evidence that makes deleting the source safe, and a run with no link is
    # a run that failed somewhere — the sources stay put.
    trashed = []
    if trash_after and link:
        trashed = trash_paths([p for p in paths if os.path.isfile(p)])

    with job.lock:
        job.done_seconds = 1.0
        job.output = out if os.path.isfile(out) else render_dir
        job.link = link
        job.meta = dict(job.meta, trashed=len(trashed))
        job.label = "%s · %s" % (title, "on YouTube" if link else "merged")
        if trashed:
            job.label += " · %d source%s trashed" % (
                len(trashed), "" if len(trashed) == 1 else "s")


def running_job(kind, pid):
    """An already-running job of this kind for this project, if any."""
    with JOBS_LOCK:
        for job in JOBS.values():
            with job.lock:
                if (job.kind == kind and job.state == "running"
                        and job.meta.get("project") == pid):
                    return job
    return None


def export(pid, out_path=None):
    data = read_project(pid)
    if not data:
        return None
    # Pressing Export twice should not start a second encode of the same
    # timeline — hand back the one already going.
    busy = running_job("export", pid)
    if busy:
        return dict(busy.snapshot(), already=True)
    total = timeline_duration(data)
    if total <= 0:
        raise RuntimeError("this project has no clips yet")

    if not out_path:
        safe = re.sub(r"[^A-Za-z0-9 ._-]", "", data["name"]).strip() or "export"
        folder = os.path.expanduser("~/Movies/diskscope")
        os.makedirs(folder, exist_ok=True)
        out_path = os.path.join(folder, "%s.mp4" % safe)
        n = 2
        while os.path.exists(out_path):
            out_path = os.path.join(folder, "%s-%d.mp4" % (safe, n))
            n += 1

    args, w, h = build_export_command(data, out_path)
    job = Job("export", "%s · %dx%d" % (data["name"], w, h), total)
    return _start(job, _export_worker, args, out_path, total, pid)


def _export_worker(job, args, out_path, total, pid=None):
    _run_ffmpeg(job, args, total)
    # Only after ffmpeg returns cleanly — a half-written file that the run
    # abandoned is not something the project should offer to take you to.
    if pid:
        record_export(pid, out_path)
    with job.lock:
        job.output = out_path
