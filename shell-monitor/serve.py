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
    python3 serve.py --port 8770

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
        })
    return out


def snapshot(all_projects: bool, cwd: Path):
    procs = live_processes()
    sess = sessions(all_projects, cwd)
    return {
        "now": time.time(),
        "running": len(procs),
        "processes": procs,
        "sessions": [{
            "project": s["project"],
            "session": s["session"],
            "short": s["session"][:8],
            "tasks": tasks_for(s["tasks_dir"]),
        } for s in sess[: (12 if all_projects else 3)]],
    }

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
<html><head><meta charset="utf-8"><title>shell-monitor</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{--bg:#0b0e14;--panel:#111722;--line:#1e2836;--ink:#c8d3e0;--dim:#67748a;
        --run:#7ee787;--idle:#4b5563;--warn:#e3b341;--bad:#f85149;--acc:#58a6ff}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
       font:13px/1.5 "SF Mono",ui-monospace,Menlo,Consolas,monospace}
  header{position:sticky;top:0;z-index:5;background:#080b10;border-bottom:1px solid var(--line);
         padding:10px 16px;display:flex;align-items:center;gap:14px}
  .dot{width:9px;height:9px;border-radius:50%;background:var(--run);
       box-shadow:0 0 8px var(--run);animation:pulse 1.6s infinite}
  @keyframes pulse{50%{opacity:.35}}
  .dot.off{background:var(--dim);box-shadow:none;animation:none}
  h1{font-size:13px;margin:0;font-weight:600;letter-spacing:.02em}
  .meta{color:var(--dim);font-size:12px;margin-left:auto}
  main{padding:14px 16px 40px;max-width:1100px;margin:0 auto}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:8px;
        margin-bottom:12px;overflow:hidden}
  .card.live{border-color:#22402c}
  .chead{display:flex;align-items:center;gap:10px;padding:9px 12px;
         border-bottom:1px solid var(--line);background:#0d131d}
  .id{color:var(--acc);font-weight:600}
  .tag{font-size:10.5px;padding:1px 7px;border-radius:99px;border:1px solid var(--line);
       color:var(--dim);text-transform:uppercase;letter-spacing:.06em}
  .tag.run{color:var(--run);border-color:#22402c;background:#0e1c14}
  .tag.done{color:var(--dim)}
  .spin{color:var(--run)}
  .right{margin-left:auto;color:var(--dim);font-size:11.5px}
  pre{margin:0;padding:10px 12px;white-space:pre-wrap;word-break:break-word;
      max-height:300px;overflow:auto;font-size:12px;color:#aebacb;background:#0b1017}
  .bar{height:3px;background:#161d29}
  .bar i{display:block;height:100%;background:linear-gradient(90deg,#2ea043,#7ee787);
         transition:width .4s ease}
  .sig{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;border-top:1px solid var(--line)}
  .sig span{font-size:11px;padding:1px 7px;border-radius:4px;background:#161d29;color:var(--dim)}
  .sig span.bad{color:var(--bad);background:#201314}
  .sig span.ok{color:var(--run);background:#0e1c14}
  .proc{padding:9px 12px;border-bottom:1px solid var(--line)}
  .proc:last-child{border-bottom:0}
  .proc pre{background:transparent;padding:6px 0 0;max-height:120px;color:#8fa3ba}
  .empty{color:var(--dim);padding:24px;text-align:center}
  h2{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.1em;
     margin:18px 0 8px;font-weight:600}
</style></head><body>
<header>
  <span class="dot off" id="dot"></span>
  <h1>shell-monitor</h1>
  <span class="meta" id="meta">connecting…</span>
</header>
<main id="main"><div class="empty">loading…</div></main>
<script>
const TOKEN="__TOKEN__";
const FRAMES="⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
let tick=0;
const esc=s=>s.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const ago=s=>s<60?Math.round(s)+"s":s<3600?Math.round(s/60)+"m":Math.round(s/3600)+"h";
const kb=n=>n<1024?n+" B":n<1048576?(n/1024).toFixed(1)+" KB":(n/1048576).toFixed(1)+" MB";

function sigClass(t){
  if(/ERROR|FAILED|Traceback|Failing:\s*[1-9]/.test(t))return "bad";
  if(/Succeeded|Successfully|Passing:\s*[1-9]/.test(t))return "ok";
  return "";
}

function taskCard(t){
  const live=t.writing;
  const spin=live?`<span class="spin">${FRAMES[tick%FRAMES.length]}</span>`:"";
  const bar=t.progress!=null
    ? `<div class="bar"><i style="width:${t.progress}%"></i></div>`:"";
  const sig=t.signals.length
    ? `<div class="sig">${t.signals.map(s=>`<span class="${sigClass(s)}">${esc(s)}</span>`).join("")}</div>`:"";
  return `<div class="card ${live?"live":""}">
    <div class="chead">
      ${spin}<span class="id">${esc(t.id)}</span>
      <span class="tag ${live?"run":"done"}">${live?"writing":"idle"}</span>
      ${t.progress!=null?`<span class="tag">${t.progress}%</span>`:""}
      <span class="right">${kb(t.size)} · ${ago(t.age)} ago</span>
    </div>${bar}
    <pre>${esc(t.tail)}</pre>${sig}</div>`;
}

function procCard(p){
  return `<div class="proc">
    <div class="chead" style="padding:0;border:0;background:none">
      <span class="spin">${FRAMES[tick%FRAMES.length]}</span>
      <span class="id">pid ${p.pid}</span>
      <span class="tag run">running</span>
      <span class="right">${esc(p.elapsed)}</span>
    </div>
    <pre>${esc(p.command)}</pre></div>`;
}

async function poll(){
  tick++;
  try{
    const r=await fetch(`/api/state?token=${TOKEN}`,{cache:"no-store"});
    if(!r.ok)throw new Error(r.status);
    const d=await r.json();
    document.getElementById("dot").className="dot"+(d.running?"":" off");
    document.getElementById("meta").textContent=
      `${d.running} running · ${new Date(d.now*1000).toLocaleTimeString()}`;
    let html="";
    if(d.processes.length){
      html+=`<h2>live processes</h2><div class="card">${d.processes.map(procCard).join("")}</div>`;
    }
    for(const s of d.sessions){
      if(!s.tasks.length)continue;
      html+=`<h2>${esc(s.short)} · ${s.tasks.length} task${s.tasks.length>1?"s":""}</h2>`;
      html+=s.tasks.map(taskCard).join("");
    }
    document.getElementById("main").innerHTML=
      html||`<div class="empty">no background shells yet — they'll appear here the moment one starts</div>`;
  }catch(e){
    document.getElementById("meta").textContent="disconnected — is serve.py still running?";
    document.getElementById("dot").className="dot off";
  }
}
poll();setInterval(poll,1000);
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
    ap.add_argument("--port", type=int, default=8770)
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
