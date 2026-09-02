"""
Shared reading logic for shell-monitor.

Claude's background shells write to <session>/tasks/<id>.output and otherwise happen out of
sight. This module finds those files, works out which are still being written, unwraps the
real command out of Claude's shell wrapper, and derives a progress reading from a job's own
output. Both the curses front end (tui.py) and the web one (serve.py) read through here so
they can never disagree about what is running.

Stdlib only (/usr/bin/python3, 3.9) — no pip, no venv.
"""

import os, re, subprocess, time
from pathlib import Path

ROOT = Path("/private/tmp") / f"claude-{os.getuid()}"
TAIL_BYTES = 200_000     # never read more than this from the end of a file
LIVE_WINDOW = 8.0        # a file touched this recently counts as actively writing


def project_key(cwd: Path) -> str:
    """Claude flattens the cwd into a directory name: /a/b -> -a-b."""
    return str(cwd).replace("/", "-")


def sessions(all_projects: bool, cwd: Path):
    """Session dirs that have a tasks/ folder, most recent activity first."""
    if not ROOT.is_dir():
        return []
    projects = list(ROOT.iterdir()) if all_projects else [ROOT / project_key(cwd)]
    found = []
    for proj in projects:
        if not proj.is_dir():
            continue
        for sess in proj.iterdir():
            tasks = sess / "tasks"
            if not tasks.is_dir():
                continue
            outs = list(tasks.glob("*.output"))
            touched = max((f.stat().st_mtime for f in outs), default=sess.stat().st_mtime)
            found.append({"project": proj.name, "session": sess.name,
                          "tasks_dir": tasks, "touched": touched})
    found.sort(key=lambda s: s["touched"], reverse=True)
    return found


# Claude wraps every shell in `zsh -c source <snapshot> ... && eval '<the real command>'`.
# The eval body is the only part worth showing; the wrapper is noise.
EVAL = re.compile(r"eval '(.*?)'(?: < /dev/null)?(?: && pwd -P)", re.S)


def unwrap(command: str) -> str:
    m = EVAL.search(command)
    body = m.group(1) if m else command
    body = body.replace("\\012", "\n").replace("'\"'\"'", "'")
    return "\n".join(ln.rstrip() for ln in body.strip().splitlines() if ln.strip())


def live_processes():
    """Claude-spawned shells still alive, with elapsed time and the command they ran."""
    try:
        raw = subprocess.run(["ps", "-eo", "pid,ppid,etime,command"],
                             capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return []
    by_pid = {}
    for line in raw.splitlines()[1:]:
        parts = line.split(None, 3)
        if len(parts) == 4:
            by_pid[parts[0]] = (parts[1], parts[2], parts[3])
    me = str(os.getpid())
    rows = []
    for pid, (ppid, etime, cmd) in by_pid.items():
        if "shell-snapshots" not in cmd or "eval " not in cmd:
            continue
        if pid == me or "shell-monitor" in cmd:
            continue
        rows.append({"pid": pid, "elapsed": etime, "command": unwrap(cmd)})
    rows.sort(key=lambda r: int(r["pid"]))
    return rows


PATTERNS = [
    (re.compile(r"Components:\s*(\d+)\s*/\s*(\d+)"), "ratio"),   # sf deploy
    (re.compile(r"(\d{1,3})\s*%"), "pct"),                       # generic 42%
    (re.compile(r"\b(\d+)\s*/\s*(\d+)\b"), "ratio"),             # generic 17/120
]


def progress(text: str):
    """Best-effort percentage from a job's own output. None when nothing looks like one."""
    tail = text[-4000:]
    for pattern, kind in PATTERNS:
        hits = pattern.findall(tail)
        if not hits:
            continue
        last = hits[-1]
        try:
            if kind == "pct":
                value = int(last)
            else:
                done, total = int(last[0]), int(last[1])
                if total <= 0:
                    continue
                value = round(done * 100 / total)
        except (ValueError, IndexError, TypeError):
            continue
        if 0 <= value <= 100:
            return value
    return None


STATUS = re.compile(r"(Status:\s*\w+|exited with code \d+|Passing:\s*\d+|Failing:\s*\d+"
                    r"|\bERROR\b|\bFAILED\b|Traceback|Successfully \w+)")


def signals(text: str):
    """Lines a person would actually act on, deduped, most recent last."""
    return list(dict.fromkeys(STATUS.findall(text[-8000:])))[-6:]


BAD = re.compile(r"ERROR|FAILED|Traceback|Failing:\s*[1-9]|exited with code [1-9]")
OK = re.compile(r"Succeeded|Successfully|Passing:\s*[1-9]")


def signal_kind(text: str) -> str:
    if BAD.search(text):
        return "bad"
    if OK.search(text):
        return "ok"
    return "flat"


ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def read_tail(path: Path):
    try:
        size = path.stat().st_size
        with path.open("rb") as fh:
            if size > TAIL_BYTES:
                fh.seek(size - TAIL_BYTES)
                fh.readline()
            data = fh.read()
    except OSError:
        return "", 0
    return ANSI.sub("", data.decode("utf-8", "replace")), size


def tasks_for(tasks_dir: Path, tail_lines: int = 40):
    now = time.time()
    out = []
    files = sorted(tasks_dir.glob("*.output"), key=lambda p: p.stat().st_mtime, reverse=True)
    for f in files:
        st = f.stat()
        text, size = read_tail(f)
        age = now - st.st_mtime
        lines = text.splitlines()
        out.append({
            "id": f.stem,
            "size": size,
            "age": round(age, 1),
            "writing": age < LIVE_WINDOW,
            "progress": progress(text),
            "signals": signals(text),
            "kind": signal_kind(text[-8000:]),
            "lines": lines[-tail_lines:] or ["(no output yet)"],
        })
    return out


def snapshot(all_projects: bool, cwd: Path, tail_lines: int = 40, max_sessions: int = 3):
    found = sessions(all_projects, cwd)
    return {
        "now": time.time(),
        "processes": live_processes(),
        "sessions": [{
            "project": s["project"],
            "session": s["session"],
            "short": s["session"][:8],
            "tasks": tasks_for(s["tasks_dir"], tail_lines),
        } for s in found[:max_sessions]],
    }


def human_size(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n/1024:.1f} KB"
    return f"{n/1048576:.1f} MB"


def human_age(s: float) -> str:
    if s < 60:
        return f"{s:.0f}s"
    if s < 3600:
        return f"{s/60:.0f}m"
    return f"{s/3600:.0f}h"
