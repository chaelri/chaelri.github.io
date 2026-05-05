// ===========================================================================
// autoclicker.ino — ESP32-C3 SuperMini firmware for the DIY WiFi auto-clicker
// ---------------------------------------------------------------------------
// THREE WAYS TO TRIGGER A CLICK:
//   1. Phone remote (online)   -> writes "click" to Firebase RTDB; firmware
//                                 polls /autoclicker/command every 1 s.
//   2. Local web UI (online)   -> any device on the same WiFi opens
//                                 http://<esp32-ip>/ and taps the big button.
//   3. SoftAP fallback (offline) -> if no known WiFi is reachable, the ESP32
//                                 broadcasts its own network "AutoClicker-AP".
//                                 Connect from your phone, open
//                                 http://192.168.4.1/, tap the button.
//
// Switch element: MG90S micro-servo (metal-gear). Fires a tap by sweeping a
// short stick / stylus from REST_ANGLE down to PRESS_ANGLE and back.
//
// Wiring (no soldering — three jumpers only):
//
//   Servo signal (orange) -> ESP32 GPIO3
//   Servo VCC    (red)    -> ESP32 5V
//   Servo GND    (brown)  -> ESP32 GND
//
//   USB-C charger / powerbank -> ESP32 USB-C
//
// Power note: MG90S draws ~250–400 mA while moving, ~50 mA while holding.
// A normal USB-C powerbank (2 A) handles both ESP32 and servo on the same
// rail with margin. To avoid stall current (a servo physically blocked from
// reaching its target angle keeps pulling 700 mA+), keep PRESS_ANGLE within
// a few degrees of REST_ANGLE — just enough travel to push the button.
//
// Library: ESP32Servo (Arduino IDE Library Manager → search "ESP32Servo" by
// Kevin Harrington). Do NOT use the classic AVR Servo.h — it does not work
// on ESP32-C3.
//
// Tuning: REST_ANGLE / PRESS_ANGLE / PRESS_HOLD_MS are the only knobs you
// should touch. If the press is too soft, raise PRESS_ANGLE in 5° steps.
// If it overshoots and rams the button, lower it.
//
// Board: "ESP32C3 Dev Module"   USB CDC On Boot: Enabled
// Baud:  115200
// ===========================================================================

#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>
#include <WebServer.h>
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
const char* DB_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/autoclicker/command.json";

// --- Pins / timing -----------------------------------------------------------
const int SERVO_PIN     = 3;     // GPIO3 -> servo signal (orange)
const int LED_PIN       = 8;     // GPIO8 -> onboard blue LED (active LOW)
const int REST_ANGLE    = 0;     // arm raised, not touching button
const int PRESS_ANGLE   = 35;    // arm pressed down on button (tune per build)
const int PRESS_HOLD_MS = 300;   // how long the press is held
const int RELEASE_MS    = 200;   // settle time after returning to REST
const int POLL_MS       = 1000;  // Firebase poll interval

Servo finger;
WebServer server(80);
bool inSoftAP = false;
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
</style>
</head>
<body>
  <header>
    <div class="brand"><span class="brand-dot"></span>AutoClicker</div>
    <div class="mode" id="mode">local</div>
  </header>
  <main>
    <div class="stage">
      <div class="halo"></div>
      <button class="click-btn" id="clickBtn" aria-label="Fire one click">
        <span class="label">Click</span>
        <span class="sub">SERVO PRESS</span>
      </button>
      <span class="ring" id="ring"></span>
    </div>
  </main>
  <footer>
    <span class="status" id="status">
      <span class="status-dot"></span>
      <span id="statusText">idle</span>
    </span>
  </footer>
<script>
const btn=document.getElementById('clickBtn');
const ring=document.getElementById('ring');
const status=document.getElementById('status');
const statusText=document.getElementById('statusText');
function setStatus(s,t){status.className='status '+s;statusText.textContent=t;}
btn.addEventListener('click',async()=>{
  if(navigator.vibrate)navigator.vibrate(15);
  ring.classList.remove('fire');void ring.offsetWidth;ring.classList.add('fire');
  setStatus('send','firing');
  try{
    const r=await fetch('/click',{method:'POST'});
    if(!r.ok)throw new Error(r.status);
    setStatus('ok','fired');
    setTimeout(()=>setStatus('','idle'),1100);
  }catch(e){
    setStatus('err','failed');
    setTimeout(()=>setStatus('','idle'),1800);
  }
});
</script>
</body>
</html>
)rawliteral";

void click(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, LOW);          // LED on (active LOW) during press
    finger.write(PRESS_ANGLE);
    delay(PRESS_HOLD_MS);
    finger.write(REST_ANGLE);
    digitalWrite(LED_PIN, HIGH);         // LED off
    delay(RELEASE_MS);                   // let arm settle before next press
    if (i < times - 1) delay(150);
  }
  lastFiredAt = millis();
}

void clearCommand() {
  HTTPClient http;
  http.begin(DB_URL);
  http.addHeader("Content-Type", "application/json");
  http.PUT("\"\"");
  http.end();
}

void handleRoot()  { server.send_P(200, "text/html; charset=utf-8", INDEX_HTML); }
void handleClick() { click(1); server.send(200, "application/json", "{\"ok\":true}"); }

void startSoftAP() {
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  inSoftAP = true;
  Serial.println("SoftAP up: SSID=" + String(AP_SSID) + " · IP=" + WiFi.softAPIP().toString());
}

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

void setup() {
  Serial.begin(115200);

  // Servo init — attach to GPIO3 with standard 500–2400 us pulse range.
  // ESP32Servo allocates one of the four LEDC PWM channels under the hood.
  finger.setPeriodHertz(50);            // standard 50 Hz hobby-servo PWM
  finger.attach(SERVO_PIN, 500, 2400);
  finger.write(REST_ANGLE);             // park at rest immediately

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);          // LED off (active LOW)

  wifiMulti.addAP("CAYNO", "lokomoko");
  wifiMulti.addAP("Charlie's iPhone", "charlie24");

  if (!tryStation()) {
    Serial.println("No known WiFi reachable — starting SoftAP fallback");
    startSoftAP();
  }

  server.on("/", handleRoot);
  server.on("/click", HTTP_POST, handleClick);
  server.on("/click", HTTP_GET, handleClick);
  server.onNotFound(handleRoot);   // captive-portal-ish: any unknown URL serves the UI
  server.begin();

  String ip = inSoftAP ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
  Serial.println("Web UI: http://" + ip + "/");
}

void loop() {
  server.handleClient();

  // Firebase polling only in station mode (SoftAP has no internet)
  static unsigned long lastPoll = 0;
  if (!inSoftAP && millis() - lastPoll >= POLL_MS) {
    lastPoll = millis();
    if (wifiMulti.run() != WL_CONNECTED) return;

    HTTPClient http;
    http.begin(DB_URL);
    int code = http.GET();
    if (code == 200) {
      String body = http.getString();
      body.replace("\"", "");
      body.trim();
      if (body.length() > 0) Serial.println(">>> received: " + body);

      if (body == "click")           { click(1); clearCommand(); }
      else if (body == "double")     { click(2); clearCommand(); }
      else if (body.startsWith("auto_")) {
        int n = body.substring(5).toInt();
        if (n > 0 && n <= 50) { click(n); clearCommand(); }
      }
    }
    http.end();
  }

  delay(2);  // keep web server responsive
}
