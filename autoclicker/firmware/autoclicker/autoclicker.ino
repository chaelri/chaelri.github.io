// ===========================================================================
// autoclicker.ino — ESP32-C3 SuperMini firmware for the DIY WiFi auto-clicker
// ---------------------------------------------------------------------------
// TWO ACTION MODES:
//   click   -> momentary press: forward burst, brief hold, mirrored return.
//              Always ends back at rest. Use for "tap this button once."
//   toggle  -> latched press: stays engaged until you toggle off again.
//              Use for "hold this button down" (keys, reset switches, etc.).
//   press / release -> explicit on / off (alternative to toggle).
//
// FOUR WAYS TO TRIGGER (any of the above commands):
//   1. Phone remote (online)   -> writes the command string to Firebase RTDB;
//                                 firmware listens on a long-lived REST stream
//                                 (Server-Sent Events) so commands land within
//                                 one round-trip (~50-150 ms typical). PRIMARY
//                                 PATH — internet/WiFi is treated as the
//                                 normal mode of operation.
//   2. Local web UI (online)   -> any device on the same WiFi opens
//                                 http://<esp32-ip>/ and taps either button.
//   3. SoftAP fallback (offline) -> ONLY when no known WiFi is reachable, the
//                                 ESP32 broadcasts its own network
//                                 "AutoClicker-AP". Meanwhile it keeps scanning
//                                 for known WiFi and drops the AP the moment
//                                 a station network comes back, so the single
//                                 radio is dedicated to station traffic in the
//                                 normal case (no AP_STA overhead).
//   4. Physical button (always) -> 6x6x5 tactile pushbutton between GPIO4 and
//                                 GND, with INPUT_PULLUP. Each press toggles
//                                 the latched state (doToggle), exactly like
//                                 the big PRESS button in the built-in web UI.
//                                 Works in any mode — no WiFi needed.
//
// Switch element: continuous-rotation (360°) micro-servo. Pulse width controls
// SPEED + DIRECTION, not angle. The press cycle is a state machine:
//
//   isPressed=false + press   -> burst PUSH_US for PUSH_MS, then STOP_US.
//                                Motor is off; arm stays where it landed
//                                because the button mechanically holds it.
//                                isPressed becomes true.
//   isPressed=true  + release -> burst RETURN_US for RETURN_MS (same time as
//                                PUSH_MS, opposite direction → arm lands back
//                                at rest), then STOP_US. isPressed becomes false.
//   toggle                    -> flips whichever state is current.
//   No idle drain: motor is OFF (STOP_US) the whole time you're not bursting.
//
// Wiring (three servo jumpers + two button leads):
//
//   Servo signal (orange or yellow) -> ESP32 GPIO3
//   Servo VCC    (red)              -> ESP32 5V
//   Servo GND    (brown)            -> ESP32 GND
//
//   Tactile button pin 1            -> ESP32 GPIO4
//   Tactile button pin 2            -> ESP32 GND (any GND pad)
//
//   USB-C charger / powerbank -> ESP32 USB-C
//
// Power note: a 360° MG90S draws ~250–400 mA while bursting, ~5–10 mA while
// stopped at neutral. A normal USB-C powerbank (2 A) handles ESP32 + servo
// on one rail with margin. Keep PUSH_MS short enough that the arm doesn't
// ram into a hard stop and stall (stall current is 700 mA+).
//
// Library: ESP32Servo (Arduino IDE Library Manager → search "ESP32Servo" by
// Kevin Harrington). Do NOT use the classic AVR Servo.h.
//
// Tuning order:
//   1. STOP_US — adjust 1480..1520 until the horn truly stops at idle. Cheap
//      CR servos rarely stop at exactly 1500.
//   2. PUSH_US / RETURN_US — if the arm spins the wrong way on press, swap
//      these two values. Keep them symmetric around STOP_US.
//   3. PUSH_MS / RETURN_MS — burst length controls how far the arm travels.
//      Longer = more push depth / more torque against the button. KEEP THEM
//      EQUAL so release lands the arm back where it started.
//
// CR-servo gotcha: there is NO position feedback. If PUSH and RETURN times
// drift apart, the arm walks. Add a soft mechanical stop (foam pad, 3D-
// printed tab) at the rest position so each release bumps back home.
//
// Board: "ESP32C3 Dev Module"   USB CDC On Boot: Enabled
// Baud:  115200
// ===========================================================================

#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <Preferences.h>
#include <ESP32Servo.h>

// --- WiFi --------------------------------------------------------------------
// Add as many networks as you want — WiFiMulti picks the strongest visible one.
// iPhone hotspot note: Personal Hotspot defaults to 5 GHz on modern iPhones, but
// the ESP32-C3 is 2.4 GHz only. Turn ON Settings → Personal Hotspot → Maximize
// Compatibility so the hotspot broadcasts on 2.4 GHz.
WiFiMulti wifiMulti;

// --- SoftAP fallback (offline mode) ------------------------------------------
const char* AP_SSID = "AutoClicker-AP";
const char* AP_PASS = "click1234";   // must be >= 8 chars for WPA2
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;  // 15 s before falling to SoftAP

// --- Firebase RTDB -----------------------------------------------------------
// Two paths:
//   /autoclicker/command — transient signal. Phone writes a string ("press",
//                          "release", "toggle", "click"); firmware acts on it
//                          and clears it back to "".
//   /autoclicker/state   — authoritative latched state (boolean). Firmware
//                          writes here AFTER every action so any subscriber
//                          (phone remote, dashboards) sees the truth in real
//                          time, regardless of which platform triggered it.
const char* FB_HOST   = "test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app";
const char* DB_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/autoclicker/command.json";
const char* STATE_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/autoclicker/state.json";

// --- Realtime command stream -------------------------------------------------
// Long-lived HTTPS connection to Firebase that delivers Server-Sent Events the
// moment /autoclicker/command changes. Replaces 1 Hz polling for end-to-end
// latency of one round-trip (~50-150 ms) instead of 0-1000 ms wait + handshake.
WiFiClientSecure streamClient;
unsigned long lastStreamAttempt = 0;
const unsigned long STREAM_RECONNECT_MS = 1500;  // backoff after a drop

// --- Pins / timing -----------------------------------------------------------
const int SERVO_PIN     = 3;     // GPIO3 -> servo signal (orange/yellow)
const int LED_PIN       = 8;     // GPIO8 -> onboard blue LED (active LOW)
const int BTN_PIN       = 4;     // GPIO4 -> tactile pushbutton (other lead -> GND)
const unsigned long BTN_DEBOUNCE_MS = 30;   // ignore bounces < 30 ms

// Continuous-rotation servo: pulse width = speed + direction. STOP_US is the
// neutral pulse where the motor is supposed to be still. PUSH/RETURN sit on
// either side of it; the further from STOP_US, the faster the rotation.
const int STOP_US       = 1500;  // neutral — try 1480..1520 if horn creeps
const int PUSH_US       = 1000;  // press direction (swap with RETURN_US if reversed)
const int RETURN_US     = 2000;  // release direction
const int PUSH_MS       = 150;   // burst duration onto the button — longer = more travel/torque
const int RETURN_MS     = 150;   // MUST equal PUSH_MS so release lands at rest

Servo finger;
WebServer server(80);
Preferences preferences;           // NVS-backed storage for user-saved WiFi creds
bool inSoftAP = false;             // true only while the AP fallback is active
bool isPressed = false;            // latched press state (toggle target)
unsigned long lastFiredAt = 0;

// --- Built-in web UI (served at "/" in both station and SoftAP modes) --------
// Custom CSS, no external CDNs — works fully offline in SoftAP mode.
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b1220">
<title>AutoClicker</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
  html,body{height:100%}
  body{
    background:radial-gradient(1200px 800px at 50% -10%,#1e293b 0%,#0b1220 55%,#020617 100%);
    color:#e2e8f0;
    font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;
    min-height:100dvh;
    display:flex;flex-direction:column;align-items:center;justify-content:space-between;
    padding:env(safe-area-inset-top) 1.25rem env(safe-area-inset-bottom);
    overflow:hidden;
    position:relative;
  }
  body::before{
    content:"";position:absolute;inset:0;
    background:
      radial-gradient(2px 2px at 20% 30%,rgba(249,115,22,.15),transparent 50%),
      radial-gradient(1px 1px at 80% 70%,rgba(56,189,248,.12),transparent 50%),
      radial-gradient(1px 1px at 60% 20%,rgba(168,85,247,.1),transparent 50%);
    pointer-events:none;
  }
  header{
    width:100%;padding:1.5rem 0 .5rem;
    display:flex;justify-content:space-between;align-items:center;
    z-index:1;
  }
  .brand{
    display:flex;align-items:center;gap:.55rem;
    font-size:.78rem;letter-spacing:.22em;text-transform:uppercase;
    color:#cbd5e1;font-weight:600;
  }
  .brand-dot{
    width:.5rem;height:.5rem;border-radius:50%;
    background:#10b981;
    box-shadow:0 0 12px #10b981,0 0 4px #10b981 inset;
    animation:breathe 2.4s ease-in-out infinite;
  }
  @keyframes breathe{
    0%,100%{opacity:1;transform:scale(1)}
    50%{opacity:.55;transform:scale(.85)}
  }
  .mode{
    font-size:.65rem;letter-spacing:.18em;text-transform:uppercase;
    color:#64748b;
    padding:.35rem .7rem;border-radius:999px;
    border:1px solid rgba(148,163,184,.15);
    background:rgba(15,23,42,.5);
    backdrop-filter:blur(6px);
  }
  main{flex:1;display:flex;align-items:center;justify-content:center;width:100%;z-index:1}
  .stage{position:relative;width:min(72vw,18rem);aspect-ratio:1}
  .halo{
    position:absolute;inset:-30%;border-radius:50%;
    background:radial-gradient(circle,rgba(249,115,22,.18) 0%,rgba(249,115,22,0) 60%);
    pointer-events:none;
    animation:haloFloat 4s ease-in-out infinite;
  }
  @keyframes haloFloat{
    0%,100%{transform:scale(1);opacity:.9}
    50%{transform:scale(1.08);opacity:1}
  }
  .click-btn{
    position:absolute;inset:0;
    width:100%;height:100%;
    border-radius:50%;border:none;cursor:pointer;
    background:
      radial-gradient(circle at 32% 28%,#fdba74 0%,#f97316 35%,#ea580c 65%,#9a3412 100%);
    color:#fff;
    font-family:inherit;
    font-size:1.4rem;font-weight:800;letter-spacing:.28em;text-transform:uppercase;
    box-shadow:
      0 0 0 8px rgba(249,115,22,.10),
      0 0 0 1px rgba(255,255,255,.08) inset,
      0 12px 40px -8px rgba(249,115,22,.55),
      0 0 80px -10px rgba(249,115,22,.45),
      inset 0 -14px 28px rgba(0,0,0,.35),
      inset 0 6px 14px rgba(255,255,255,.25);
    transition:transform .1s ease,box-shadow .25s ease;
    user-select:none;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:.45rem;
  }
  .click-btn:active{
    transform:scale(.96);
    box-shadow:
      0 0 0 4px rgba(249,115,22,.18),
      0 0 0 1px rgba(255,255,255,.08) inset,
      0 4px 18px -4px rgba(249,115,22,.6),
      0 0 40px -10px rgba(249,115,22,.55),
      inset 0 -6px 16px rgba(0,0,0,.45),
      inset 0 10px 22px rgba(255,255,255,.18);
  }
  .click-btn .label{display:block}
  .click-btn .sub{
    font-size:.6rem;letter-spacing:.22em;
    font-weight:500;opacity:.78;
    text-shadow:0 1px 2px rgba(0,0,0,.3);
  }
  .ring{
    position:absolute;inset:0;border-radius:50%;
    border:2px solid rgba(249,115,22,.7);
    pointer-events:none;opacity:0;
  }
  .ring.fire{animation:pulseRing .65s cubic-bezier(.22,.61,.36,1)}
  @keyframes pulseRing{
    0%{transform:scale(1);opacity:.8;border-width:3px}
    100%{transform:scale(1.55);opacity:0;border-width:1px}
  }
  footer{
    width:100%;padding:1.25rem 0 1.75rem;
    display:flex;justify-content:center;
    z-index:1;
  }
  .status{
    display:inline-flex;align-items:center;gap:.55rem;
    padding:.55rem 1.1rem;border-radius:999px;
    background:rgba(15,23,42,.7);
    border:1px solid rgba(148,163,184,.15);
    backdrop-filter:blur(8px);
    font-size:.72rem;letter-spacing:.12em;
    font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,monospace;
    color:#94a3b8;
    transition:color .25s,border-color .25s;
  }
  .status-dot{
    width:.45rem;height:.45rem;border-radius:50%;
    background:#475569;
    transition:background .25s,box-shadow .25s;
  }
  .status.send{color:#fbbf24;border-color:rgba(251,191,36,.3)}
  .status.send .status-dot{background:#fbbf24;box-shadow:0 0 10px #fbbf24}
  .status.ok{color:#34d399;border-color:rgba(52,211,153,.3)}
  .status.ok .status-dot{background:#34d399;box-shadow:0 0 10px #34d399}
  .status.err{color:#f87171;border-color:rgba(248,113,113,.3)}
  .status.err .status-dot{background:#f87171;box-shadow:0 0 10px #f87171}
  .secondary-btn{
    margin:0 auto 1rem;display:inline-flex;align-items:center;gap:.5rem;
    padding:.65rem 1.4rem;border-radius:999px;
    background:rgba(99,102,241,.15);border:1px solid rgba(129,140,248,.35);
    color:#c7d2fe;font-family:inherit;font-size:.78rem;font-weight:600;
    letter-spacing:.18em;text-transform:uppercase;cursor:pointer;
    transition:background .2s,color .2s,transform .1s;
    z-index:1;
  }
  .secondary-btn:active{transform:scale(.96);background:rgba(99,102,241,.25);color:#fff}
  /* WiFi setup */
  details.wifi{
    width:100%;max-width:22rem;margin:0 auto 1rem;
    background:rgba(15,23,42,.55);border:1px solid rgba(148,163,184,.15);
    border-radius:.75rem;padding:.5rem .9rem;backdrop-filter:blur(6px);
    font-size:.75rem;z-index:1;
  }
  details.wifi summary{
    cursor:pointer;list-style:none;display:flex;align-items:center;gap:.55rem;
    color:#cbd5e1;letter-spacing:.18em;text-transform:uppercase;
    font-weight:600;font-size:.65rem;padding:.3rem 0;
  }
  details.wifi summary::-webkit-details-marker{display:none}
  details.wifi summary::after{
    content:"›";margin-left:auto;font-size:1rem;opacity:.55;
    transform:rotate(90deg);transition:transform .2s;
  }
  details.wifi[open] summary::after{transform:rotate(270deg)}
  details.wifi .row{display:flex;gap:.4rem;margin-top:.5rem}
  details.wifi input{
    flex:1;min-width:0;background:rgba(0,0,0,.3);
    border:1px solid rgba(148,163,184,.2);color:#e2e8f0;
    padding:.5rem .65rem;border-radius:.45rem;
    font-family:inherit;font-size:.78rem;
  }
  details.wifi input:focus{outline:none;border-color:rgba(249,115,22,.5)}
  details.wifi button{
    background:rgba(249,115,22,.18);border:1px solid rgba(249,115,22,.4);
    color:#fed7aa;padding:.5rem .8rem;border-radius:.45rem;
    font-family:inherit;font-size:.65rem;font-weight:700;
    letter-spacing:.14em;text-transform:uppercase;cursor:pointer;
    white-space:nowrap;
  }
  details.wifi button:active{transform:scale(.96);background:rgba(249,115,22,.28)}
  details.wifi button:disabled{opacity:.5;cursor:wait}
  .wifi-list{
    margin-top:.6rem;display:flex;flex-direction:column;gap:.25rem;
    max-height:11rem;overflow:auto;
  }
  .wifi-list .item{
    display:flex;justify-content:space-between;align-items:center;gap:.5rem;
    padding:.4rem .6rem;border-radius:.4rem;background:rgba(255,255,255,.04);
    cursor:pointer;font-family:'JetBrains Mono',ui-monospace,monospace;
    font-size:.7rem;color:#cbd5e1;
  }
  .wifi-list .item:hover,.wifi-list .item.sel{background:rgba(249,115,22,.16)}
  .wifi-list .ssid{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .wifi-list .meta{color:#94a3b8;flex-shrink:0;font-size:.65rem}
  .wifi-msg{margin-top:.55rem;font-size:.68rem;color:#94a3b8;min-height:1em}
  .wifi-msg.ok{color:#34d399}
  .wifi-msg.err{color:#f87171}
</style>
</head>
<body>
  <header>
    <div class="brand"><span class="brand-dot"></span>AutoClicker</div>
    <div class="mode" id="mode">local</div>
  </header>
  <main>
    <div class="stage">
      <div class="halo" id="halo"></div>
      <button class="click-btn" id="toggleBtn" aria-label="Toggle servo press">
        <span class="label" id="btnLabel">PRESS</span>
        <span class="sub" id="btnSub">tap to engage</span>
      </button>
      <span class="ring" id="ring"></span>
    </div>
  </main>
  <button class="secondary-btn" id="clickBtn" aria-label="Single momentary click">
    <span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle">ads_click</span>
    <span style="vertical-align:middle">single click</span>
  </button>
  <details class="wifi">
    <summary>WiFi setup</summary>
    <div class="row">
      <input id="ssidInput" placeholder="SSID" autocomplete="off" autocapitalize="none" spellcheck="false" />
      <button id="scanBtn" type="button">Scan</button>
    </div>
    <div class="wifi-list" id="wifiList"></div>
    <div class="row">
      <input id="passInput" type="password" placeholder="password" autocomplete="off" />
      <button id="saveBtn" type="button">Save</button>
    </div>
    <div id="wifiMsg" class="wifi-msg">enter an SSID or scan to pick one</div>
  </details>
  <footer>
    <span class="status" id="status">
      <span class="status-dot"></span>
      <span id="statusText">released</span>
    </span>
  </footer>
<script>
const btn=document.getElementById('toggleBtn');
const halo=document.getElementById('halo');
const ring=document.getElementById('ring');
const status=document.getElementById('status');
const statusText=document.getElementById('statusText');
const btnLabel=document.getElementById('btnLabel');
const btnSub=document.getElementById('btnSub');
function setStatus(s,t){status.className='status '+s;statusText.textContent=t;}
function applyState(pressed){
  if(pressed){
    btn.style.background='radial-gradient(circle at 32% 28%,#fca5a5 0%,#ef4444 35%,#b91c1c 65%,#7f1d1d 100%)';
    halo.style.background='radial-gradient(circle,rgba(239,68,68,.22) 0%,rgba(239,68,68,0) 60%)';
    btnLabel.textContent='PRESSED';
    btnSub.textContent='tap to release';
  }else{
    btn.style.background='';
    halo.style.background='';
    btnLabel.textContent='PRESS';
    btnSub.textContent='tap to engage';
  }
}
async function syncState(){
  try{
    const r=await fetch('/state');
    if(!r.ok)return;
    const j=await r.json();
    applyState(!!j.pressed);
    setStatus('',j.pressed?'pressed':'released');
  }catch(e){}
}
syncState();
btn.addEventListener('click',async()=>{
  if(navigator.vibrate)navigator.vibrate(15);
  ring.classList.remove('fire');void ring.offsetWidth;ring.classList.add('fire');
  setStatus('send','toggling');
  try{
    const r=await fetch('/toggle',{method:'POST'});
    if(!r.ok)throw new Error(r.status);
    const j=await r.json();
    applyState(!!j.pressed);
    setStatus('ok',j.pressed?'pressed':'released');
  }catch(e){
    setStatus('err','failed');
    setTimeout(()=>setStatus('','idle'),1800);
  }
});
const clickBtn=document.getElementById('clickBtn');
clickBtn.addEventListener('click',async()=>{
  if(navigator.vibrate)navigator.vibrate(10);
  setStatus('send','clicking');
  try{
    const r=await fetch('/click',{method:'POST'});
    if(!r.ok)throw new Error(r.status);
    const j=await r.json();
    applyState(!!j.pressed);
    setStatus('ok','clicked');
    setTimeout(()=>setStatus('','released'),900);
  }catch(e){
    setStatus('err','failed');
    setTimeout(()=>setStatus('','idle'),1800);
  }
});

// --- WiFi setup -----------------------------------------------------------
// Scan nearby networks, let the user pick one, save credentials. The save
// hits POST /wifi which persists the SSID/password to NVS and adds it to
// the wifiMulti pool — next station retry picks it up automatically.
const ssidInput=document.getElementById('ssidInput');
const passInput=document.getElementById('passInput');
const wifiList =document.getElementById('wifiList');
const wifiMsg  =document.getElementById('wifiMsg');
const scanBtn  =document.getElementById('scanBtn');
const saveBtn  =document.getElementById('saveBtn');
function setMsg(t,cls){wifiMsg.textContent=t;wifiMsg.className='wifi-msg '+(cls||'');}
scanBtn.addEventListener('click',async()=>{
  scanBtn.disabled=true;setMsg('scanning…');
  try{
    const r=await fetch('/scan');
    if(!r.ok)throw new Error('HTTP '+r.status);
    const list=await r.json();
    list.sort((a,b)=>b.rssi-a.rssi);
    wifiList.innerHTML='';
    list.forEach(n=>{
      const div=document.createElement('div');
      div.className='item';
      const ssid=document.createElement('span');
      ssid.className='ssid';ssid.textContent=n.ssid||'(hidden)';
      const meta=document.createElement('span');
      meta.className='meta';meta.textContent=n.rssi+' dBm'+(n.open?' · open':'');
      div.appendChild(ssid);div.appendChild(meta);
      div.addEventListener('click',()=>{
        ssidInput.value=n.ssid;
        document.querySelectorAll('.wifi-list .item.sel').forEach(el=>el.classList.remove('sel'));
        div.classList.add('sel');
        passInput.focus();
      });
      wifiList.appendChild(div);
    });
    setMsg(list.length+' networks found · tap one to pick','ok');
  }catch(e){setMsg('scan failed: '+e.message,'err');}
  finally{scanBtn.disabled=false;}
});
saveBtn.addEventListener('click',async()=>{
  const ssid=ssidInput.value.trim();
  const pass=passInput.value;
  if(!ssid){setMsg('enter an SSID first','err');return;}
  saveBtn.disabled=true;setMsg('saving…');
  try{
    const body=new URLSearchParams({ssid,pass});
    const r=await fetch('/wifi',{method:'POST',body,headers:{'Content-Type':'application/x-www-form-urlencoded'}});
    if(!r.ok)throw new Error('HTTP '+r.status);
    setMsg('saved — ESP32 will try this WiFi on next reconnect (~20 s)','ok');
    passInput.value='';
  }catch(e){setMsg('save failed: '+e.message,'err');}
  finally{saveBtn.disabled=false;}
});
</script>
</body>
</html>
)rawliteral";

// Publish the current latched state to Firebase so any remote (phone, web
// dashboard) reflects the truth in real time. No-op when the station radio
// has no internet (SoftAP is always up alongside, but it can't reach Firebase).
void publishState() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(STATE_URL);
  http.addHeader("Content-Type", "application/json");
  http.PUT(isPressed ? "true" : "false");
  http.end();
}

// --- Press / release / toggle state machine ---------------------------------
// The arm is LATCHED. doPress() bursts forward and parks (motor off, button
// holds the arm). doRelease() bursts the equal-and-opposite amount, returning
// the arm exactly to its starting position. Both publish the new state to
// Firebase so subscribers update immediately.
void doPress() {
  if (isPressed) return;                         // already pressed — no-op
  digitalWrite(LED_PIN, LOW);                    // LED on while pressed
  finger.writeMicroseconds(PUSH_US);             // burst onto the button
  delay(PUSH_MS);
  finger.writeMicroseconds(STOP_US);             // motor off — arm stays put
  isPressed = true;
  lastFiredAt = millis();
  publishState();
  Serial.println("press   -> isPressed=true");
}

void doRelease() {
  if (!isPressed) return;                        // already released — no-op
  finger.writeMicroseconds(RETURN_US);           // mirrored burst back to rest
  delay(RETURN_MS);
  finger.writeMicroseconds(STOP_US);             // motor off at rest
  digitalWrite(LED_PIN, HIGH);                   // LED off
  isPressed = false;
  lastFiredAt = millis();
  publishState();
  Serial.println("release -> isPressed=false");
}

void doToggle() { isPressed ? doRelease() : doPress(); }

// Momentary click: force a full press-then-release cycle that always ends
// back at rest. If we're already latched-pressed, release first to start
// from a known state. CLICK_HOLD_MS is short — just enough for the button
// to register the press.
const int CLICK_HOLD_MS = 150;
void doClick() {
  if (isPressed) doRelease();
  doPress();
  delay(CLICK_HOLD_MS);
  doRelease();
  Serial.println("click   -> momentary cycle");
}

void clearCommand() {
  HTTPClient http;
  http.begin(DB_URL);
  http.addHeader("Content-Type", "application/json");
  http.PUT("\"\"");
  http.end();
}

void sendState() {
  String body = String("{\"pressed\":") + (isPressed ? "true" : "false") + "}";
  server.send(200, "application/json", body);
}

void handleRoot()    { server.send_P(200, "text/html; charset=utf-8", INDEX_HTML); }
void handlePress()   { doPress();   sendState(); }
void handleRelease() { doRelease(); sendState(); }
void handleToggle()  { doToggle();  sendState(); }
void handleClick()   { doClick();   sendState(); }
void handleStateGet(){ sendState(); }

// Scan nearby WiFi networks and return them as JSON. Blocks for ~2-4 s while
// the radio sweeps channels; clients on AutoClicker-AP may see a brief beacon
// gap, which mainstream supplicants tolerate without reconnecting.
void handleScan() {
  int n = WiFi.scanNetworks(false, true);   // sync, include hidden
  String json = "[";
  for (int i = 0; i < n; i++) {
    if (i > 0) json += ",";
    String ssid = WiFi.SSID(i);
    ssid.replace("\\", "\\\\");
    ssid.replace("\"", "\\\"");
    json += "{\"ssid\":\"" + ssid + "\",";
    json += "\"rssi\":" + String(WiFi.RSSI(i)) + ",";
    json += "\"open\":" + String(WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "true" : "false") + "}";
  }
  json += "]";
  server.send(200, "application/json", json);
  WiFi.scanDelete();
}

// Persist a user-chosen network to NVS and add it to wifiMulti so the next
// background reconnect picks it up. Only one user slot — saving again
// overwrites. Hardcoded networks (CAYNO / iPhone) remain in the pool too.
void handleWifiSave() {
  String ssid = server.arg("ssid");
  String pass = server.arg("pass");
  ssid.trim();
  if (ssid.length() == 0) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"empty ssid\"}");
    return;
  }
  preferences.begin("wifi", false);
  preferences.putString("ssid", ssid);
  preferences.putString("pass", pass);
  preferences.end();
  wifiMulti.addAP(ssid.c_str(), pass.c_str());
  server.send(200, "application/json", "{\"ok\":true}");
  Serial.println("Saved user WiFi: " + ssid);
}

// Pure station mode. WiFi is the priority path: the radio is dedicated to
// scan + associate + traffic with the upstream router, no AP beacons stealing
// time slices. Returns true on successful join, false if the timeout elapses.
bool tryStation() {
  WiFi.mode(WIFI_STA);
  Serial.print("Connecting to WiFi");
  unsigned long t0 = millis();
  while (wifiMulti.run() != WL_CONNECTED && millis() - t0 < WIFI_CONNECT_TIMEOUT_MS) {
    delay(300); Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected: " + WiFi.SSID() + " · " + WiFi.localIP().toString());
    return true;
  }
  return false;
}

// Fallback: bring up AutoClicker-AP so the user has SOMETHING to connect to,
// AND keep the station radio scanning in the background so we can upgrade out
// of this mode as soon as a real WiFi is reachable.
void startSoftAP() {
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(AP_SSID, AP_PASS);
  inSoftAP = true;
  Serial.println("SoftAP fallback up: SSID=" + String(AP_SSID) + " · IP=" + WiFi.softAPIP().toString());
  Serial.println("Will keep retrying known WiFi every 20 s and drop the AP on success.");
}

// Station came back — kill the AP and return to pure WIFI_STA so the radio is
// dedicated to Firebase / web requests again.
void stopSoftAP() {
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  inSoftAP = false;
  Serial.println("SoftAP down — back on station: " + WiFi.SSID() + " · " + WiFi.localIP().toString());
  publishState();   // we're online again — resync state to Firebase
}

// --- Firebase command stream -------------------------------------------------
// Open one HTTPS connection, ask for Server-Sent Events on the command path,
// and leave it open. Firebase pushes "put"/"patch" events the instant the
// value changes — we react immediately. setInsecure() skips cert validation
// because /autoclicker/command holds no secrets and TLS handshake time
// matters more than identity verification for this use case.
void connectStream() {
  streamClient.stop();
  streamClient.setInsecure();
  streamClient.setTimeout(15000);
  if (!streamClient.connect(FB_HOST, 443)) {
    Serial.println("Stream connect failed");
    return;
  }
  String req =
    String("GET /autoclicker/command.json HTTP/1.1\r\n") +
    "Host: " + FB_HOST + "\r\n" +
    "Accept: text/event-stream\r\n" +
    "Cache-Control: no-cache\r\n" +
    "Connection: keep-alive\r\n\r\n";
  streamClient.print(req);
  Serial.println("Stream connected — listening for commands");
}

// Parse one SSE data line and act on recognised commands. Firebase frames
// each event as:
//   event: put
//   data: {"path":"/","data":"click"}
// We only care about the value of "data" inside that JSON. Ignore null /
// empty / non-matching strings (those come from clearCommand() PUTs).
void handleStreamData(const String& line) {
  int p = line.indexOf("\"data\":");
  if (p < 0) return;
  String val = line.substring(p + 7);
  val.trim();
  if (val.endsWith("}")) val = val.substring(0, val.length() - 1);
  val.trim();
  val.replace("\"", "");
  val.trim();
  if (val.length() == 0 || val == "null") return;
  Serial.println(">>> stream received: " + val);
  if      (val == "press")    { doPress();   clearCommand(); }
  else if (val == "release")  { doRelease(); clearCommand(); }
  else if (val == "toggle")   { doToggle();  clearCommand(); }
  else if (val == "click")    { doClick();   clearCommand(); }
}

void processStream() {
  while (streamClient.connected() && streamClient.available()) {
    String line = streamClient.readStringUntil('\n');
    line.trim();
    if (line.startsWith("data:")) handleStreamData(line.substring(5));
  }
}

// --- Physical button --------------------------------------------------------
// Polled once per loop() iteration. Tracks the last stable reading and the
// timestamp of the most recent edge; only a HIGH->LOW transition that has
// settled for BTN_DEBOUNCE_MS counts as a real press. Mirrors the big PRESS
// button in the built-in web UI -> press once to latch, press again to release.
void readButton() {
  static int lastStableLevel = HIGH;
  static int lastReadLevel   = HIGH;
  static unsigned long lastEdgeAt = 0;

  int level = digitalRead(BTN_PIN);
  if (level != lastReadLevel) {
    lastReadLevel = level;
    lastEdgeAt = millis();
    return;                            // wait for the bounce window to close
  }
  if (millis() - lastEdgeAt < BTN_DEBOUNCE_MS) return;
  if (level == lastStableLevel) return;

  lastStableLevel = level;
  if (level == LOW) {                  // fresh press (active-LOW)
    Serial.println(">>> physical button pressed -> toggle");
    doToggle();
  }
}

void setup() {
  Serial.begin(115200);

  // Servo init — attach to GPIO3 with standard 500–2400 us pulse range.
  // ESP32Servo allocates one of the four LEDC PWM channels under the hood.
  finger.setPeriodHertz(50);            // standard 50 Hz hobby-servo PWM
  finger.attach(SERVO_PIN, 500, 2400);
  finger.writeMicroseconds(STOP_US);    // motor stopped at boot

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);          // LED off (active LOW)

  // Tactile button: one lead to GPIO4, other lead to GND. INPUT_PULLUP holds
  // the line HIGH at idle; a press shorts it to GND -> reads LOW.
  pinMode(BTN_PIN, INPUT_PULLUP);

  wifiMulti.addAP("CAYNO", "lokomoko");
  wifiMulti.addAP("Charlie's iPhone", "charlie24");

  // Pull a user-saved network out of NVS (if any) and stack it onto wifiMulti.
  // Added LAST so it's preferred when both it and a hardcoded network are
  // visible — wifiMulti picks the strongest, but addAP order biases ties.
  preferences.begin("wifi", true);
  String savedSsid = preferences.getString("ssid", "");
  String savedPass = preferences.getString("pass", "");
  preferences.end();
  if (savedSsid.length() > 0) {
    wifiMulti.addAP(savedSsid.c_str(), savedPass.c_str());
    Serial.println("Loaded saved WiFi: " + savedSsid);
  }

  // Try the upstream WiFi first. Only spin up the SoftAP fallback if every
  // known network fails — this keeps the radio fully dedicated to station
  // traffic in the normal case (no AP_STA time-slicing).
  if (!tryStation()) {
    Serial.println("No known WiFi reachable — starting SoftAP fallback");
    startSoftAP();
  }

  // Kill modem sleep. ESP32 normally power-cycles the radio between beacons
  // (~100 ms cadence) which can add jitter to outgoing requests and stretch
  // wake-from-idle to a few hundred ms. We do not care about battery here —
  // device is wall-powered — so keep the radio fully awake always.
  WiFi.setSleep(false);

  server.on("/", handleRoot);
  server.on("/press",   HTTP_POST, handlePress);
  server.on("/press",   HTTP_GET,  handlePress);
  server.on("/release", HTTP_POST, handleRelease);
  server.on("/release", HTTP_GET,  handleRelease);
  server.on("/toggle",  HTTP_POST, handleToggle);
  server.on("/toggle",  HTTP_GET,  handleToggle);
  server.on("/click",   HTTP_POST, handleClick);
  server.on("/click",   HTTP_GET,  handleClick);
  server.on("/state",   HTTP_GET,  handleStateGet);
  server.on("/scan",    HTTP_GET,  handleScan);
  server.on("/wifi",    HTTP_POST, handleWifiSave);
  server.onNotFound(handleRoot);   // captive-portal-ish: any unknown URL serves the UI
  server.begin();

  String ip = inSoftAP ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
  Serial.println("Web UI: http://" + ip + "/");

  // Publish initial released state so any subscriber starts in sync
  publishState();

  // Open the Firebase command stream if we're on a real network — otherwise
  // the loop() reconnect logic will pick it up once station comes back.
  if (!inSoftAP) connectStream();
}

void loop() {
  server.handleClient();
  readButton();

  // While the SoftAP fallback is active, keep scanning for a known WiFi in
  // the background. The wifiMulti.run() call does a scan + associate inline;
  // it briefly blocks the web server (~2-8 s), so we throttle the attempts.
  // The instant a known network is reachable, drop the AP and go pure STA.
  static unsigned long lastStaRetry = 0;
  const unsigned long STA_RETRY_MS = 20000;
  if (inSoftAP && millis() - lastStaRetry >= STA_RETRY_MS) {
    lastStaRetry = millis();
    Serial.println("SoftAP active — scanning for known WiFi…");
    if (wifiMulti.run() == WL_CONNECTED) {
      stopSoftAP();
    } else {
      Serial.println("No known WiFi yet — staying on SoftAP");
    }
  }

  // Firebase command stream — drain incoming SSE bytes when station is up,
  // else (re)connect with a short backoff. Skip entirely while in SoftAP
  // fallback (no internet anyway). Events are pushed, not polled, so the
  // only latency floor is the network round-trip.
  if (!inSoftAP) {
    if (streamClient.connected()) {
      processStream();
    } else if (millis() - lastStreamAttempt >= STREAM_RECONNECT_MS) {
      lastStreamAttempt = millis();
      if (WiFi.status() == WL_CONNECTED) connectStream();
    }
  } else if (streamClient.connected()) {
    streamClient.stop();   // tidy up — fell back to AP
  }

  delay(1);  // tiny yield — keep loop tight; setSleep(false) handles the rest
}
