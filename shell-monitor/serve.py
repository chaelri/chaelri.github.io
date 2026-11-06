#!/usr/bin/env python3
"""
shell-monitor — a live terminal view of what Claude Code is running in the background.

Claude's background shells write to <session>/tasks/<id>.output and otherwise happen out
of sight: the transcript says "running in background" and then nothing until it finishes.
This serves a page that tails those files and lists the live processes behind them, so a
long deploy or render is visible while it runs instead of only in hindsight.

Stdlib only (/usr/bin/python3, 3.9), no pip, no venv, no build step — same constraints as
diskscope in this repo.

    python3 serve.py                 # newest session for the current project
    python3 serve.py --all           # every project, every session
    python3 serve.py --port 8781

Security follows diskscope: bound to 127.0.0.1, a per-run random token on every /api call,
and Host/Origin must be localhost so a web page cannot reach it by DNS rebinding.
"""

import argparse, http.server, json, os, re, secrets, socket, subprocess, sys, threading
import time, webbrowser
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path("/private/tmp") / f"claude-{os.getuid()}"
TAIL_LINES = 40          # lines of each task shown in its pane
TAIL_BYTES = 200_000     # never read more than this from the end of a file
LIVE_WINDOW = 8.0        # a file touched this recently counts as actively writing
TOKEN = secrets.token_urlsafe(24)

# ---------------------------------------------------------------- discovery

def project_key(cwd: Path) -> str:
    """Claude flattens the cwd into a directory name: /a/b -> -a-b."""
    return str(cwd).replace("/", "-")


def sessions(all_projects: bool, cwd: Path):
    """Session dirs that have a tasks/ folder, newest activity first."""
    if not ROOT.is_dir():
        return []
    projects = ROOT.iterdir() if all_projects else [ROOT / project_key(cwd)]
    found = []
    for proj in projects:
        if not proj.is_dir():
            continue
        for sess in proj.iterdir():
            tasks = sess / "tasks"
            if tasks.is_dir():
                outs = list(tasks.glob("*.output"))
                touched = max((f.stat().st_mtime for f in outs), default=sess.stat().st_mtime)
                found.append({"project": proj.name, "session": sess.name,
                              "tasks_dir": tasks, "touched": touched})
    found.sort(key=lambda s: s["touched"], reverse=True)
    return found

# ---------------------------------------------------------------- processes

# Claude wraps every shell in `zsh -c source <snapshot> ... && eval '<the real command>'`.
# The eval body is the only part worth showing; the wrapper is noise.
EVAL = re.compile(r"eval '(.*?)'(?: < /dev/null)?(?: && pwd -P)", re.S)


def unwrap(command: str) -> str:
    m = EVAL.search(command)
    body = m.group(1) if m else command
    body = body.replace("\\012", "\n").replace("'\"'\"'", "'")
    return "\n".join(ln.rstrip() for ln in body.strip().splitlines() if ln.strip())


def live_processes():
    """Claude-spawned shells and their children, with elapsed time."""
    try:
        raw = subprocess.run(["ps", "-eo", "pid,ppid,etime,command"],
                             capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return []
    rows, by_pid = [], {}
    for line in raw.splitlines()[1:]:
        parts = line.split(None, 3)
        if len(parts) < 4:
            continue
        pid, ppid, etime, cmd = parts
        by_pid[pid] = (ppid, etime, cmd)
    me = str(os.getpid())
    for pid, (ppid, etime, cmd) in by_pid.items():
        if "shell-snapshots" not in cmd or "eval " not in cmd:
            continue
        if pid == me or "shell-monitor" in cmd:
            continue
        # the wrapper is the shell; the interesting child is what it actually launched
        child = next((c for p, (pp, _e, c) in by_pid.items()
                      if pp == pid and "shell-snapshots" not in c), None)
        rows.append({"pid": pid, "elapsed": etime, "command": unwrap(cmd),
                     "child": (child or "")[:160]})
    rows.sort(key=lambda r: r["pid"])
    return rows

# ---------------------------------------------------------------- progress

PATTERNS = [
    # sf deploy: "Components: 3/5 (60%)"
    (re.compile(r"Components:\s*(\d+)\s*/\s*(\d+)"), "ratio"),
    # generic "42%" — last one wins
    (re.compile(r"(\d{1,3})\s*%"), "pct"),
    # generic "17/120"
    (re.compile(r"\b(\d+)\s*/\s*(\d+)\b"), "ratio"),
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
                v = int(last)
            else:
                done, total = int(last[0]), int(last[1])
                if total <= 0:
                    continue
                v = round(done * 100 / total)
        except (ValueError, IndexError, TypeError):
            continue
        if 0 <= v <= 100:
            return v
    return None


STATUS = re.compile(r"(Status:\s*\w+|exited with code \d+|Passing:\s*\d+|Failing:\s*\d+"
                    r"|\bERROR\b|\bFAILED\b|Traceback|Successfully \w+)")


def signals(text: str):
    """Lines a person would actually act on, pulled out of the noise."""
    return list(dict.fromkeys(STATUS.findall(text[-8000:])))[-6:]

# ---------------------------------------------------------------- tasks

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
    return data.decode("utf-8", "replace"), size


def strip_ansi(s: str) -> str:
    return re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", s)


def tasks_for(tasks_dir: Path):
    now = time.time()
    out = []
    for f in sorted(tasks_dir.glob("*.output"), key=lambda p: p.stat().st_mtime, reverse=True):
        st = f.stat()
        text, size = read_tail(f)
        text = strip_ansi(text)
        lines = text.splitlines()
        age = now - st.st_mtime
        out.append({
            "id": f.stem,
            "size": size,
            "age": round(age, 1),
            "modified": st.st_mtime,
            "writing": age < LIVE_WINDOW,
            "empty": size == 0,
            "progress": progress(text),
            "signals": signals(text),
            "tail": "\n".join(lines[-TAIL_LINES:]) or "(no output yet)",
            "full": text,
        })
    return out


def snapshot(all_projects: bool, cwd: Path):
    procs = live_processes()
    sess = sessions(all_projects, cwd)
    picked = [dict(s, tasks=tasks_for(s["tasks_dir"])) for s in sess[: (12 if all_projects else 3)]]
    return {"now": time.time(), "jobs": build_jobs(procs, picked)}

# ---------------------------------------------------------------- jobs (plain-language view)

TRANSCRIPTS = Path.home() / ".claude" / "projects"
RECENT = 3 * 3600        # finished jobs stay on the page this long
QUIET = 30 * 60          # a running job silent this long gets flagged
_scan = {}               # transcript path -> {"offset", "pending", "tasks"}
BAR_LINE = re.compile(r"\[[#=>\-. ]*\]\s*(\d+)\s*/\s*(\d+)\s*(.*)")
TASK_ID = re.compile(r"running in background with ID: (\w+)")


def squash(cmd: str) -> str:
    return re.sub(r"\s+", " ", cmd).strip()[:80]


def job_names(project: str, session: str):
    """Task id -> what Claude said the job was. Reads only what's new in the transcript."""
    path = TRANSCRIPTS / project / f"{session}.jsonl"
    st = _scan.setdefault(str(path), {"offset": 0, "pending": {}, "tasks": {}})
    try:
        with path.open("rb") as fh:
            fh.seek(st["offset"])
            chunk = fh.read()
    except OSError:
        return st["tasks"]
    end = chunk.rfind(b"\n") + 1
    st["offset"] += end
    for raw in chunk[:end].split(b"\n"):
        if b"run_in_background" not in raw and b"running in background with ID" not in raw:
            continue
        try:
            row = json.loads(raw)
        except ValueError:
            continue
        content = (row.get("message") or {}).get("content")
        if row.get("type") not in ("user", "assistant") or not isinstance(content, list):
            continue
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") == "tool_use" and (part.get("input") or {}).get("run_in_background"):
                st["pending"][part.get("id")] = part["input"]
            elif part.get("type") == "tool_result":
                body = part.get("content")
                text = body if isinstance(body, str) else json.dumps(body)
                m = TASK_ID.search(text or "")
                call = st["pending"].get(part.get("tool_use_id"))
                if m and call:
                    st["tasks"][m.group(1)] = {"title": call.get("description") or "",
                                               "command": call.get("command") or ""}
    return st["tasks"]


def seconds(etime: str) -> int:
    """ps etime: [[dd-]hh:]mm:ss"""
    days, _, rest = etime.rpartition("-")
    total = 0
    for part in rest.split(":"):
        total = total * 60 + int(part)
    return total + int(days or 0) * 86400


def describe(text: str):
    """Count, pass/fail tallies and the latest human line from a job's output."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    body = [ln for ln in lines if not ln.startswith("[exited with code")]
    count, latest = None, body[-1] if body else ""
    for ln in reversed(body):
        m = BAR_LINE.search(ln)
        if m:
            count = [int(m.group(1)), int(m.group(2))]
            latest = re.sub(r"^(PASS|FAIL)\s+", "", m.group(3)).strip() or latest
            break
    else:
        m = re.search(r"Components:\s*(\d+)\s*/\s*(\d+)", text[-4000:])
        if m:
            count = [int(m.group(1)), int(m.group(2))]
    passed = len(re.findall(r"\bPASS\b", text))
    failed = len(re.findall(r"\bFAIL\b", text))
    code = re.findall(r"\[?exited with code (\d+)", text)
    return count, latest[:160], passed, failed, (int(code[-1]) if code else None)


def build_jobs(procs, sess):
    now = time.time()
    by_cmd = {}
    for p in procs:
        by_cmd.setdefault(squash(p["command"]), p)
    jobs, used = [], set()
    for s in sess:
        names = job_names(s["project"], s["session"])
        for t in s["tasks"]:
            info = names.get(t["id"], {})
            command = info.get("command", "")
            text = t["full"]
            if "shell-monitor" in command or "shell-monitor" in text[:200] or "s8889-progress" in command:
                continue
            count, latest, passed, failed, code = describe(text)
            proc = by_cmd.get(squash(command)) if command else None
            if proc:
                used.add(proc["pid"])
            running = bool(proc) or (t["writing"] and code is None)
            if running:
                state = "quiet" if t["age"] > QUIET else "running"
            elif failed or (code not in (None, 0)):
                state = "failed"
            else:
                state = "done"
            if not running and t["age"] > RECENT:
                continue
            elapsed = seconds(proc["elapsed"]) if proc else None
            left = None
            if running and count and count[0] and elapsed:
                left = round(elapsed / count[0] * (count[1] - count[0]))
            jobs.append({"id": t["id"], "title": info.get("title") or "Background job", "state": state,
                         "latest": latest, "count": count, "percent": t["progress"] if running else None,
                         "passed": passed, "failed": failed, "elapsed": elapsed, "left": left,
                         "age": t["age"], "code": code, "command": command, "tail": t["tail"]})
    for p in procs:
        hidden = "shell-monitor" in p["command"] or "s8889-progress" in p["command"]
        elapsed = seconds(p["elapsed"])
        if p["pid"] in used or hidden or elapsed < 60:      # under a minute = a quick foreground command
            continue
        folder = re.search(r"\bcd\s+([^\s;&]+)", p["command"])
        title = f"Unnamed job in {folder.group(1).rstrip('/').rsplit('/', 1)[-1]}" if folder else "Unnamed job"
        jobs.append({"id": p["pid"], "title": title, "state": "quiet" if elapsed > QUIET else "running",
                     "latest": "", "count": None, "percent": None, "passed": 0, "failed": 0,
                     "elapsed": elapsed, "left": None, "age": elapsed, "code": None,
                     "command": p["command"], "tail": ""})
    rank = {"failed": 0, "quiet": 1, "running": 2, "done": 3}
    jobs.sort(key=lambda j: (rank[j["state"]], j["age"] if j["age"] is not None else 0))
    return jobs

# ---------------------------------------------------------------- server

class Handler(http.server.BaseHTTPRequestHandler):
    all_projects = False
    cwd = Path.cwd()

    def log_message(self, *a):
        pass

    def _guard(self) -> bool:
        host = (self.headers.get("Host") or "").split(":")[0]
        if host not in ("127.0.0.1", "localhost"):
            self.send_error(403, "bad host")
            return False
        origin = self.headers.get("Origin")
        if origin and urlparse(origin).hostname not in ("127.0.0.1", "localhost"):
            self.send_error(403, "bad origin")
            return False
        return True

    def _send(self, body: bytes, ctype: str):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self._guard():
            return
        url = urlparse(self.path)
        qs = parse_qs(url.query)
        if url.path == "/":
            if qs.get("token", [""])[0] != TOKEN:
                self.send_error(403, "bad token")
                return
            self._send(PAGE.replace("__TOKEN__", TOKEN).encode(), "text/html; charset=utf-8")
        elif url.path == "/api/state":
            if qs.get("token", [""])[0] != TOKEN:
                self.send_error(403, "bad token")
                return
            data = snapshot(self.all_projects, self.cwd)
            self._send(json.dumps(data).encode(), "application/json")
        else:
            self.send_error(404)


PAGE = r"""<!doctype html>
<html><head><meta charset="utf-8"><title>Background Jobs</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{--bg:#f6f7f9;--card:#fff;--line:#e4e7ec;--ink:#111827;--soft:#667085;
        --blue:#2563eb;--green:#16a34a;--amber:#b45309;--red:#dc2626;--track:#eceff3;--code:#f6f7f9}
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#111317;--card:#1a1d23;--line:#2b2f37;
        --ink:#f1f3f6;--soft:#9aa3b2;--blue:#60a5fa;--green:#4ade80;--amber:#fbbf24;--red:#f87171;--track:#2b2f37;--code:#14161b}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  main{max-width:720px;margin:0 auto;padding:28px 16px 48px}
  h1{font-size:24px;margin:0;font-weight:650}
  .sum{color:var(--soft);margin:2px 0 24px}
  h2{font-size:14px;font-weight:600;color:var(--soft);margin:24px 0 8px}
  .job{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:10px}
  .top{display:flex;align-items:flex-start;gap:12px;justify-content:space-between}
  .title{font-size:17px;font-weight:600}
  .pill{flex:none;font-size:13px;font-weight:600;white-space:nowrap}
  .running .pill{color:var(--blue)}.done .pill{color:var(--green)}.quiet .pill{color:var(--amber)}.failed .pill{color:var(--red)}
  .track{height:10px;background:var(--track);border-radius:6px;overflow:hidden;margin:12px 0 8px}
  .track i{display:block;height:100%;background:var(--blue);border-radius:6px;transition:width .5s}
  .track.wait i{width:30%;animation:slide 1.5s ease-in-out infinite alternate}
  @keyframes slide{from{margin-left:0}to{margin-left:70%}}
  .facts{color:var(--soft);font-size:14px}
  .now{font-size:14px;margin-top:4px;overflow-wrap:anywhere}
  details{margin-top:10px;font-size:13px}
  summary{cursor:pointer;color:var(--soft)}
  pre{background:var(--code);border:1px solid var(--line);border-radius:8px;padding:10px;margin:8px 0 0;max-height:260px;
      overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,Menlo,monospace}
  .empty{color:var(--soft);padding:32px 0;text-align:center}
</style></head><body><main>
<h1>Background jobs</h1><p class="sum" id="sum">Connecting…</p><div id="list"></div>
</main><script>
const TOKEN="__TOKEN__",open_=new Set();let last="";
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const span=s=>s<60?"less than a minute":s<3600?Math.round(s/60)+" min":s<86400?(s/3600).toFixed(s<36000?1:0).replace(".0","")+" hours":Math.round(s/86400)+" days";
const LABEL={running:"Running",quiet:"May be stuck",done:"Done",failed:"Needs a look"};
function card(j){
  const on=j.state==="running"||j.state==="quiet",bits=[];
  let bar="";
  if(on){
    const pct=j.count?Math.round(j.count[0]*100/j.count[1]):j.percent;
    bar=pct!=null?`<div class="track"><i style="width:${pct}%"></i></div>`:`<div class="track wait"><i></i></div>`;
  }
  if(j.count)bits.push(`${j.count[0]} of ${j.count[1]}`);
  if(j.passed||j.failed)bits.push(`${j.passed} passed`,`${j.failed} failed`);
  if(j.left!=null)bits.push(`about ${span(j.left)} left`);
  else if(j.state==="running"&&j.elapsed!=null)bits.push(`running for ${span(j.elapsed)}`);
  if(j.state==="quiet")bits.push(`no update for ${span(j.age)}`);
  if(!on&&j.age!=null)bits.push(`finished ${span(j.age)} ago`);
  if(!on&&j.code>0)bits.push(`stopped with an error`);
  const tech=[j.command&&`Command\n${j.command}`,j.tail&&`Output\n${j.tail}`].filter(Boolean).join("\n\n");
  return `<div class="job ${j.state}"><div class="top"><div class="title">${esc(j.title)}</div><div class="pill">${LABEL[j.state]}</div></div>
    ${bar}${bits.length?`<div class="facts">${esc(bits.join(" · "))}</div>`:""}
    ${j.latest?`<div class="now">Latest: ${esc(j.latest)}</div>`:""}
    ${tech?`<details data-id="${esc(j.id)}" ${open_.has(String(j.id))?"open":""}><summary>Technical details</summary><pre>${esc(tech)}</pre></details>`:""}</div>`;
}
function section(name,jobs){return jobs.length?`<h2>${name}</h2>`+jobs.map(card).join(""):""}
document.addEventListener("toggle",e=>{const d=e.target;if(d.tagName!=="DETAILS")return;
  d.open?open_.add(d.dataset.id):open_.delete(d.dataset.id)},true);
async function poll(){
  try{
    const r=await fetch(`/api/state?token=${TOKEN}`,{cache:"no-store"});
    if(!r.ok)throw 0;
    const {jobs}=await r.json();
    const by=s=>jobs.filter(j=>s.includes(j.state));
    const run=by(["running"]).length,look=by(["quiet","failed"]).length;
    document.getElementById("sum").textContent=
      (run?`${run} running`:"Nothing running")+(look?` · ${look} to look at`:"");
    const html=section("Needs a look",by(["quiet","failed"]))+section("Running",by(["running"]))+section("Finished recently",by(["done"]).slice(0,10));
    const out=html||`<div class="empty">Nothing in the background right now.</div>`;
    if(out!==last&&!document.querySelector("pre:hover")){document.getElementById("list").innerHTML=out;last=out}
  }catch(e){document.getElementById("sum").textContent="Lost connection to the monitor."}
}
poll();setInterval(poll,2000);
</script></body></html>"""


def free_port(preferred: int) -> int:
    for port in [preferred] + list(range(preferred + 1, preferred + 20)):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise SystemExit("no free port near %d" % preferred)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    # 8781, not 8770: 8770 is diskscope's front door, and this server walks up
    # when a port is taken while diskscope does not, so defaulting to the same
    # number meant whoever started first won and diskscope's Dock icon opened
    # a stranger's page.
    ap.add_argument("--port", type=int, default=8781)
    ap.add_argument("--all", action="store_true", help="every project, not just this one")
    ap.add_argument("--cwd", default=os.getcwd(), help="project dir to match (default: cwd)")
    ap.add_argument("--no-open", action="store_true")
    args = ap.parse_args()

    Handler.all_projects = args.all
    Handler.cwd = Path(args.cwd).resolve()

    found = sessions(args.all, Handler.cwd)
    if not found and not args.all:
        print(f"No Claude sessions with background tasks found for {Handler.cwd}")
        print("Try --all to see every project.")

    port = free_port(args.port)
    url = f"http://127.0.0.1:{port}/?token={TOKEN}"
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"shell-monitor  ->  {url}")
    print(f"watching {len(found)} session(s); Ctrl-C to stop")
    if not args.no_open:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
