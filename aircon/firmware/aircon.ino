// ===========================================================================
// aircon.ino — ESP32-C3 SuperMini firmware for the DIY WiFi aircon controller
// ---------------------------------------------------------------------------
// What this does:
//   The ESP32 BECOMES your TCL aircon's IR remote. It pulses an IR LED at
//   38 kHz in the exact pattern the aircon expects (TCL112AC protocol),
//   replacing the physical remote entirely. Your phone sends a desired
//   state object to Firebase; this firmware reads it, encodes the TCL
//   protocol, and flashes the IR LED at the aircon.
//
// THREE WAYS TO TRIGGER (any state change goes through the same path):
//   1. Phone remote (online)   -> writes a JSON state object to Firebase
//                                 RTDB at /aircon/command. Firmware polls
//                                 every 1 s.
//   2. Local web UI (online)   -> any device on the same WiFi opens
//                                 http://<esp32-ip>/ for a fallback remote.
//   3. SoftAP fallback (offline) -> if no known WiFi is reachable, the ESP32
//                                 broadcasts its own network "Aircon-AP".
//
// IR transmitter: a single 940 nm IR LED driven directly from GPIO3 through
// a 100 ohm current-limit resistor. No transistor — peak current sits within
// the ESP32-C3's 40 mA per-pin budget at 38 kHz / ~33 % duty cycle. Range is
// ~2-3 m line-of-sight, plenty when the device is mounted near the aircon.
//
// Wiring (no soldering — two jumpers + USB-C):
//
//   GPIO3 -> 100 ohm resistor -> IR LED anode (long leg, +)
//   GND   ----------------------> IR LED cathode (short leg, -)
//   USB-C wall charger -> ESP32 USB-C
//
// Library: IRremoteESP8266 (Arduino IDE Library Manager -> search
// "IRremoteESP8266" by David Conran et al). It runs on ESP32 too despite
// the name. We use the IRTcl112Ac class which handles power/mode/temp/
// fan/swing/turbo/eco for current TCL splits including TAC-09CSA/KEI.
//
// Command schema at /aircon/command (JSON object):
//   {
//     "power": "on" | "off",
//     "mode":  "cool" | "dry" | "fan" | "heat" | "auto",
//     "temp":  16..30,            // Celsius
//     "fan":   "auto" | "low" | "med" | "high",
//     "swing": true | false       // vertical swing
//   }
//
// State mirror at /aircon/state (same shape) — updated AFTER every send so
// any subscriber (phone remote, dashboards) reflects the truth in real time.
//
// Board: "ESP32C3 Dev Module"   USB CDC On Boot: Enabled
// Baud:  115200
// ===========================================================================

#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <ir_Tcl.h>

// --- WiFi --------------------------------------------------------------------
WiFiMulti wifiMulti;

// --- SoftAP fallback (offline mode) ------------------------------------------
const char* AP_SSID = "Aircon-AP";
const char* AP_PASS = "aircon24";   // must be >= 8 chars for WPA2
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;

// --- Firebase RTDB -----------------------------------------------------------
const char* DB_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/aircon/command.json";
const char* STATE_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/aircon/state.json";

// --- Pins / timing -----------------------------------------------------------
const int IR_LED_PIN = 3;     // GPIO3 -> 100 ohm -> IR LED anode
const int LED_PIN    = 8;     // onboard blue LED (active LOW) — blinks on send
const int POLL_MS    = 1000;  // Firebase poll interval

// --- IR transmitter ----------------------------------------------------------
IRTcl112Ac ac(IR_LED_PIN);

// --- Authoritative current state ---------------------------------------------
struct AcState {
  bool   power = false;
  uint8_t mode = kTcl112AcCool;        // cool by default
  float   temp = 24.0f;
  uint8_t fan  = kTcl112AcFanAuto;
  bool   swing = false;
} state;

WebServer server(80);
bool inSoftAP = false;

// --- Helpers: convert string <-> TCL constants -------------------------------
uint8_t modeFromString(const String& s) {
  if (s == "cool") return kTcl112AcCool;
  if (s == "dry")  return kTcl112AcDry;
  if (s == "fan")  return kTcl112AcFan;
  if (s == "heat") return kTcl112AcHeat;
  return kTcl112AcAuto;
}
const char* modeToString(uint8_t m) {
  switch (m) {
    case kTcl112AcCool: return "cool";
    case kTcl112AcDry:  return "dry";
    case kTcl112AcFan:  return "fan";
    case kTcl112AcHeat: return "heat";
    default:            return "auto";
  }
}
uint8_t fanFromString(const String& s) {
  if (s == "low")  return kTcl112AcFanLow;
  if (s == "med")  return kTcl112AcFanMed;
  if (s == "high") return kTcl112AcFanHigh;
  return kTcl112AcFanAuto;
}
const char* fanToString(uint8_t f) {
  switch (f) {
    case kTcl112AcFanLow:  return "low";
    case kTcl112AcFanMed:  return "med";
    case kTcl112AcFanHigh: return "high";
    default:               return "auto";
  }
}

// --- Send the current state out the IR LED -----------------------------------
// TCL protocol transmits the FULL state every press — we mirror that. ~150 ms
// per send. The library handles 38 kHz modulation + the 112-bit blink pattern.
void sendIR() {
  digitalWrite(LED_PIN, LOW);          // onboard blue LED on while transmitting
  ac.setPower(state.power);
  ac.setMode(state.mode);
  ac.setTemp(state.temp);
  ac.setFan(state.fan);
  ac.setSwingVertical(state.swing);
  ac.send();
  digitalWrite(LED_PIN, HIGH);
  Serial.printf("IR sent -> power=%s mode=%s temp=%.0f fan=%s swing=%d\n",
                state.power ? "on" : "off",
                modeToString(state.mode), state.temp,
                fanToString(state.fan), state.swing);
}

// --- Publish current state to Firebase /aircon/state -------------------------
String stateJson() {
  String s = "{";
  s += "\"power\":\"";  s += (state.power ? "on" : "off"); s += "\",";
  s += "\"mode\":\"";   s += modeToString(state.mode);     s += "\",";
  s += "\"temp\":";     s += String((int)state.temp);      s += ",";
  s += "\"fan\":\"";    s += fanToString(state.fan);       s += "\",";
  s += "\"swing\":";    s += (state.swing ? "true" : "false");
  s += "}";
  return s;
}
void publishState() {
  if (inSoftAP || WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(STATE_URL);
  http.addHeader("Content-Type", "application/json");
  http.PUT(stateJson());
  http.end();
}

// --- Apply a JSON command body (partial state allowed) -----------------------
// Naive parser — we only need a handful of fields. Avoids ArduinoJson dep.
String extractStr(const String& body, const char* key) {
  String pat = String("\"") + key + "\":\"";
  int i = body.indexOf(pat);
  if (i < 0) return "";
  i += pat.length();
  int j = body.indexOf('"', i);
  if (j < 0) return "";
  return body.substring(i, j);
}
int extractInt(const String& body, const char* key, int fallback) {
  String pat = String("\"") + key + "\":";
  int i = body.indexOf(pat);
  if (i < 0) return fallback;
  i += pat.length();
  int j = i;
  while (j < (int)body.length() && (isDigit(body[j]) || body[j] == '-')) j++;
  if (j == i) return fallback;
  return body.substring(i, j).toInt();
}
bool extractBool(const String& body, const char* key, bool fallback) {
  String pat = String("\"") + key + "\":";
  int i = body.indexOf(pat);
  if (i < 0) return fallback;
  i += pat.length();
  if (body.substring(i, i + 4)  == "true")  return true;
  if (body.substring(i, i + 5)  == "false") return false;
  return fallback;
}
void applyCommand(const String& body) {
  String p = extractStr(body, "power");
  if (p == "on")       state.power = true;
  else if (p == "off") state.power = false;

  String m = extractStr(body, "mode");
  if (m.length()) state.mode = modeFromString(m);

  int t = extractInt(body, "temp", -1);
  if (t >= 16 && t <= 30) state.temp = (float)t;

  String f = extractStr(body, "fan");
  if (f.length()) state.fan = fanFromString(f);

  // swing is optional — only override if present
  if (body.indexOf("\"swing\":") >= 0) {
    state.swing = extractBool(body, "swing", state.swing);
  }

  sendIR();
  publishState();
}

// --- Built-in web UI ---------------------------------------------------------
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b1220">
<title>Aircon</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
  html,body{height:100%}
  body{background:radial-gradient(1200px 800px at 50% -10%,#0c4a6e 0%,#0b1220 55%,#020617 100%);
       color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;
       min-height:100dvh;display:flex;flex-direction:column;align-items:center;
       padding:env(safe-area-inset-top) 1.25rem env(safe-area-inset-bottom);overflow:hidden}
  header{width:100%;padding:1.25rem 0 .5rem;display:flex;justify-content:space-between;align-items:center}
  .brand{font-size:.78rem;letter-spacing:.22em;text-transform:uppercase;color:#cbd5e1;font-weight:600}
  .mode-pill{font-size:.65rem;letter-spacing:.18em;text-transform:uppercase;color:#67e8f9;
       padding:.35rem .7rem;border-radius:999px;border:1px solid rgba(103,232,249,.25);background:rgba(8,47,73,.5)}
  main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5rem;width:100%;max-width:22rem}
  .temp{font-size:5.5rem;font-weight:300;color:#fff;letter-spacing:-.04em;line-height:1;font-variant-numeric:tabular-nums}
  .temp-deg{font-size:2rem;color:#67e8f9;font-weight:300}
  .temp-row{display:flex;align-items:center;gap:1.25rem}
  .step-btn{width:3.25rem;height:3.25rem;border-radius:50%;border:1px solid rgba(103,232,249,.25);
       background:rgba(8,47,73,.4);color:#67e8f9;font-size:1.5rem;font-weight:600;cursor:pointer;
       transition:transform .1s,background .2s}
  .step-btn:active{transform:scale(.92);background:rgba(8,47,73,.7)}
  .power-btn{width:9rem;height:9rem;border-radius:50%;border:none;cursor:pointer;color:#fff;
       background:radial-gradient(circle at 32% 28%,#7dd3fc 0%,#0ea5e9 40%,#075985 100%);
       box-shadow:0 0 0 1px rgba(255,255,255,.08) inset,0 12px 40px -8px rgba(14,165,233,.55),
                  inset 0 -10px 22px rgba(0,0,0,.35),inset 0 6px 14px rgba(255,255,255,.2);
       font-family:inherit;font-size:.85rem;letter-spacing:.18em;text-transform:uppercase;font-weight:700;
       display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.4rem;
       transition:transform .1s ease}
  .power-btn:active{transform:scale(.95)}
  .power-btn.off{background:radial-gradient(circle at 32% 28%,#475569 0%,#1e293b 60%,#0f172a 100%);
       box-shadow:0 0 0 1px rgba(255,255,255,.04) inset,0 8px 20px -8px rgba(0,0,0,.6)}
  .row{display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center}
  .chip{padding:.55rem 1rem;border-radius:999px;border:1px solid rgba(148,163,184,.18);
       background:rgba(15,23,42,.5);color:#94a3b8;font-size:.75rem;font-weight:600;
       text-transform:uppercase;letter-spacing:.12em;cursor:pointer;transition:all .2s}
  .chip.active{background:rgba(8,145,178,.3);border-color:rgba(103,232,249,.5);color:#cffafe}
  .chip:active{transform:scale(.95)}
  footer{width:100%;padding:1rem 0 1.5rem}
  .status{display:inline-flex;align-items:center;gap:.55rem;padding:.55rem 1.1rem;border-radius:999px;
       background:rgba(15,23,42,.7);border:1px solid rgba(148,163,184,.15);
       font-size:.7rem;letter-spacing:.12em;font-family:"JetBrains Mono",ui-monospace,monospace;color:#94a3b8}
  .status-dot{width:.45rem;height:.45rem;border-radius:50%;background:#475569}
</style>
</head>
<body>
<header>
  <div class="brand">Aircon · TCL112AC</div>
  <div class="mode-pill" id="modeMode">cool</div>
</header>
<main>
  <div class="temp-row">
    <button class="step-btn" id="tempDown">−</button>
    <div><span class="temp" id="tempVal">24</span><span class="temp-deg">°C</span></div>
    <button class="step-btn" id="tempUp">+</button>
  </div>
  <button class="power-btn off" id="powerBtn"><span id="powerLabel">OFF</span></button>
  <div class="row" id="modeRow">
    <button class="chip" data-mode="cool">cool</button>
    <button class="chip" data-mode="dry">dry</button>
    <button class="chip" data-mode="fan">fan</button>
    <button class="chip" data-mode="auto">auto</button>
  </div>
  <div class="row" id="fanRow">
    <button class="chip" data-fan="auto">fan auto</button>
    <button class="chip" data-fan="low">low</button>
    <button class="chip" data-fan="med">med</button>
    <button class="chip" data-fan="high">high</button>
  </div>
</main>
<footer style="display:flex;justify-content:center">
  <span class="status"><span class="status-dot"></span><span id="statusText">ready</span></span>
</footer>
<script>
let s={power:false,mode:"cool",temp:24,fan:"auto",swing:false};
const $=id=>document.getElementById(id);
function render(){
  $("tempVal").textContent=s.temp;
  $("modeMode").textContent=s.mode;
  $("powerLabel").textContent=s.power?"ON":"OFF";
  $("powerBtn").classList.toggle("off",!s.power);
  document.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode===s.mode));
  document.querySelectorAll("[data-fan]").forEach(b=>b.classList.toggle("active",b.dataset.fan===s.fan));
}
async function send(){
  $("statusText").textContent="sending...";
  try{
    const r=await fetch("/set",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)});
    const j=await r.json();
    s=j;render();
    $("statusText").textContent="sent";
  }catch(e){$("statusText").textContent="failed";}
}
async function load(){
  try{const j=await(await fetch("/state")).json();s=j;render();}catch(e){}
}
$("powerBtn").addEventListener("click",()=>{s.power=!s.power;render();send();});
$("tempUp").addEventListener("click",()=>{if(s.temp<30){s.temp++;render();send();}});
$("tempDown").addEventListener("click",()=>{if(s.temp>16){s.temp--;render();send();}});
document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>{s.mode=b.dataset.mode;render();send();}));
document.querySelectorAll("[data-fan]").forEach(b=>b.addEventListener("click",()=>{s.fan=b.dataset.fan;render();send();}));
load();
</script>
</body>
</html>
)rawliteral";

void sendStateResp() {
  server.send(200, "application/json", stateJson());
}

void handleRoot()  { server.send_P(200, "text/html; charset=utf-8", INDEX_HTML); }
void handleState() { sendStateResp(); }
void handleSet() {
  if (!server.hasArg("plain")) { server.send(400, "text/plain", "missing body"); return; }
  applyCommand(server.arg("plain"));
  sendStateResp();
}

void clearCommand() {
  HTTPClient http;
  http.begin(DB_URL);
  http.addHeader("Content-Type", "application/json");
  http.PUT("\"\"");
  http.end();
}

void startSoftAP() {
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  inSoftAP = true;
  Serial.println("SoftAP up: " + String(AP_SSID) + " · " + WiFi.softAPIP().toString());
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

  ac.begin();

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);          // off (active LOW)

  wifiMulti.addAP("CAYNO", "lokomoko");
  wifiMulti.addAP("Charlie's iPhone", "charlie24");

  if (!tryStation()) startSoftAP();

  server.on("/", handleRoot);
  server.on("/state", HTTP_GET,  handleState);
  server.on("/set",   HTTP_POST, handleSet);
  server.onNotFound(handleRoot);
  server.begin();

  String ip = inSoftAP ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
  Serial.println("Web UI: http://" + ip + "/");

  publishState();
}

void loop() {
  server.handleClient();

  static unsigned long lastPoll = 0;
  if (!inSoftAP && millis() - lastPoll >= POLL_MS) {
    lastPoll = millis();
    if (wifiMulti.run() != WL_CONNECTED) return;

    HTTPClient http;
    http.begin(DB_URL);
    int code = http.GET();
    if (code == 200) {
      String body = http.getString();
      body.trim();
      if (body.length() > 2 && body != "null" && body != "\"\"") {
        Serial.println(">>> received: " + body);
        applyCommand(body);
        clearCommand();
      }
    }
    http.end();
  }

  delay(2);
}
