#!/usr/bin/env python3
# bling.py "Title" "Message" -> 8-bit alert window in the middle of the screen; chimes on a loop until GOT IT.
# Works on macOS, Windows and Linux (Chrome, or Edge on Windows). Runtime files live in ~/bling.
import html, http.server, os, platform, shutil, subprocess, sys, tempfile, threading, time
TITLE = sys.argv[1] if len(sys.argv) > 1 else 'DONE!'
MSG = sys.argv[2] if len(sys.argv) > 2 else 'Task finished.'
PORT = 48797
OS = platform.system()  # 'Darwin', 'Windows', 'Linux'
HOME = os.path.join(os.path.expanduser('~'), 'bling')
os.makedirs(HOME, exist_ok=True)
LOCK = os.path.join(HOME, '.ringing')
with open(LOCK, 'w') as f:
    f.write(str(os.getpid()))
acked = threading.Event()

PAGE = r'''<!doctype html><html><head><meta charset="utf-8"><title>BLING!</title>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
<style>
:root{--bg:#0d0221;--ink:#fff;--gold:#ffd23f;--pink:#ff3864;--cyan:#2de2e6;--box:#261447}
*{box-sizing:border-box;margin:0}html,body{height:100%}
body{background:var(--bg);color:var(--ink);font-family:'Press Start 2P',monospace;display:grid;place-items:center;overflow:hidden;
 background-image:radial-gradient(#ffffff22 1px,transparent 1px);background-size:16px 16px;image-rendering:pixelated}
.stars{position:fixed;inset:0;pointer-events:none}
.stars i{position:absolute;width:4px;height:4px;background:var(--gold);animation:tw 1s steps(2) infinite}
@keyframes tw{50%{opacity:0}}
.card{position:relative;background:var(--box);padding:34px 30px 30px;text-align:center;width:min(560px,92vw);
 box-shadow:0 0 0 4px #fff,0 0 0 8px var(--pink),0 0 0 12px #000,12px 12px 0 12px #000;margin:0 12px 12px 0;animation:shake 3.5s linear infinite}
/* Short burst, then a long still stretch so the text can be read. */
@keyframes shake{0%,14%,100%{transform:translate(0,0)}2%{transform:translate(-4px,1px)}4%{transform:translate(3px,-2px)}6%{transform:translate(-3px,2px)}8%{transform:translate(3px,1px)}10%{transform:translate(-2px,-1px)}12%{transform:translate(1px,1px)}}
.coin{width:64px;height:64px;margin:0 auto 22px;animation:spin .6s steps(4) infinite}
@keyframes spin{0%{transform:scaleX(1)}25%{transform:scaleX(.5)}50%{transform:scaleX(.1)}75%{transform:scaleX(.5)}}
h1{font-size:26px;color:var(--gold);text-shadow:4px 4px 0 var(--pink),8px 8px 0 #000;margin-bottom:22px;line-height:1.4;animation:blink 1s steps(2) infinite}
@keyframes blink{50%{color:var(--cyan)}}
p{font-size:11px;line-height:2;margin-bottom:28px;color:#e8e3ff;text-align:left;max-height:40vh;overflow:auto}
button{font:inherit;font-size:16px;color:#000;background:var(--gold);border:0;padding:16px 26px;cursor:pointer;
 box-shadow:0 0 0 4px #000,6px 6px 0 4px #000;animation:pulse .8s steps(2) infinite}
button:hover{background:var(--cyan)}button:active{transform:translate(4px,4px);box-shadow:0 0 0 4px #000,2px 2px 0 4px #000}
@keyframes pulse{50%{transform:scale(1.06)}}
.hint{margin-top:22px;font-size:9px;color:#9d8ec9}
.done .card{animation:none}.done h1{animation:none;color:var(--cyan)}.done .coin,.done button{animation:none}
</style></head><body>
<div class="stars" id="stars"></div>
<div class="card">
 <svg class="coin" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <rect x="5" y="1" width="6" height="1" fill="#000"/><rect x="3" y="2" width="2" height="1" fill="#000"/><rect x="11" y="2" width="2" height="1" fill="#000"/>
  <rect x="2" y="3" width="1" height="10" fill="#000"/><rect x="13" y="3" width="1" height="10" fill="#000"/>
  <rect x="3" y="13" width="2" height="1" fill="#000"/><rect x="11" y="13" width="2" height="1" fill="#000"/><rect x="5" y="14" width="6" height="1" fill="#000"/>
  <rect x="5" y="2" width="6" height="12" fill="#ffd23f"/><rect x="3" y="3" width="10" height="10" fill="#ffd23f"/>
  <rect x="7" y="4" width="2" height="8" fill="#c99700"/><rect x="4" y="4" width="1" height="3" fill="#fff6c2"/>
 </svg>
 <h1>__TITLE__</h1>
 <p>__MSG__</p>
 <button id="ok">&#9654; GOT IT</button>
 <div class="hint">press ENTER or click to stop the bling</div>
</div>
<script>
const s=document.getElementById('stars');for(let i=0;i<40;i++){const e=document.createElement('i');e.style.left=Math.random()*100+'vw';e.style.top=Math.random()*100+'vh';e.style.animationDelay=Math.random()+'s';s.appendChild(e)}
async function ack(){document.body.classList.add('done');document.querySelector('h1').textContent='NOTED!';document.getElementById('ok').textContent='✔ OK';
 try{await fetch('/ack',{method:'POST'})}catch(e){} setTimeout(()=>window.close(),700)}
document.getElementById('ok').onclick=ack;addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')ack()});
</script></body></html>'''.replace('__TITLE__', html.escape(TITLE)).replace('__MSG__', html.escape(MSG))

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.end_headers(); self.wfile.write(PAGE.encode())
    def do_POST(self):
        acked.set(); self.send_response(204); self.end_headers()

def chime():
    """One bling. Blocks for the length of the sound."""
    if OS == 'Darwin':
        for f in ('/System/Library/Sounds/Glass.aiff', '/System/Library/Sounds/Hero.aiff'):
            if acked.is_set():
                return
            subprocess.run(['afplay', f])
    elif OS == 'Windows':
        import winsound
        for alias in ('SystemAsterisk', 'SystemExclamation'):
            if acked.is_set():
                return
            winsound.PlaySound(alias, winsound.SND_ALIAS)
    else:
        for f in ('/usr/share/sounds/freedesktop/stereo/complete.oga', '/usr/share/sounds/freedesktop/stereo/bell.oga'):
            if shutil.which('paplay') and os.path.exists(f):
                subprocess.run(['paplay', f])
            else:
                sys.stdout.write('\a'); sys.stdout.flush(); time.sleep(.5)

def ring():
    while not acked.is_set():
        chime()
        acked.wait(1.2)

def screen():
    """(x, y, width, height) of the screen under the mouse, top-left origin."""
    try:
        if OS == 'Darwin':
            jxa = ("ObjC.import('AppKit');const m=$.NSEvent.mouseLocation,s=$.NSScreen.screens,H=s.objectAtIndex(0).frame.size.height;"
                   "let f=s.objectAtIndex(0).frame;for(let i=0;i<s.count;i++){const r=s.objectAtIndex(i).frame;"
                   "if(m.x>=r.origin.x&&m.x<r.origin.x+r.size.width&&m.y>=r.origin.y&&m.y<r.origin.y+r.size.height)f=r}"
                   "[f.origin.x,H-(f.origin.y+f.size.height),f.size.width,f.size.height].map(Math.round).join(',')")
            out = subprocess.run(['osascript', '-l', 'JavaScript', '-e', jxa], capture_output=True, text=True).stdout
            return tuple(map(int, out.strip().split(',')))
        if OS == 'Windows':
            import ctypes
            from ctypes import wintypes
            u = ctypes.windll.user32
            pt = wintypes.POINT(); u.GetCursorPos(ctypes.byref(pt))
            class MI(ctypes.Structure):
                _fields_ = [('cbSize', wintypes.DWORD), ('rcMonitor', wintypes.RECT), ('rcWork', wintypes.RECT), ('dwFlags', wintypes.DWORD)]
            mi = MI(); mi.cbSize = ctypes.sizeof(MI)
            u.GetMonitorInfoW(u.MonitorFromPoint(pt, 2), ctypes.byref(mi))
            r = mi.rcWork
            return r.left, r.top, r.right - r.left, r.bottom - r.top
    except Exception:
        pass
    return 0, 0, 1512, 982

def browser():
    """Chrome (or Edge on Windows) executable, as an argv prefix."""
    if OS == 'Darwin':
        return ['open', '-na', 'Google Chrome', '--args']
    if OS == 'Windows':
        roots = [os.environ.get(k, '') for k in ('PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA')]
        for rel in (r'Google\Chrome\Application\chrome.exe', r'Microsoft\Edge\Application\msedge.exe'):
            for root in roots:
                exe = os.path.join(root, rel)
                if root and os.path.exists(exe):
                    return [exe]
        return ['msedge']
    for name in ('google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge'):
        if shutil.which(name):
            return [name]
    return ['xdg-open']

def quit_browser(profile):
    """Quit this alert's own browser copy (matched by its throwaway profile), or it lingers in the Dock/taskbar."""
    if OS == 'Windows':
        ps = ("Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*%s*' } | "
              "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" % profile)
        subprocess.run(['powershell', '-NoProfile', '-Command', ps], capture_output=True)
    else:
        subprocess.run(['pkill', '-f', 'user-data-dir=' + profile])

srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
threading.Thread(target=ring, daemon=True).start()
X, Y, W, Hh = screen()
w, h = 760, 560
# Fresh profile each time: the browser otherwise restores the last window spot and ignores --window-position.
PROFILE = tempfile.mkdtemp(prefix='bling-chrome-')
args = [f'--app=http://127.0.0.1:{PORT}/', f'--window-size={w},{h}', f'--window-position={X + (W - w) // 2},{Y + (Hh - h) // 2}',
        '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check']
cmd = browser()
subprocess.Popen(cmd + ([f'http://127.0.0.1:{PORT}/'] if cmd == ['xdg-open'] else args))
acked.wait(3600)
time.sleep(1); srv.shutdown()
quit_browser(PROFILE); time.sleep(1)
shutil.rmtree(PROFILE, ignore_errors=True)
try:
    os.remove(LOCK)
except OSError:
    pass
