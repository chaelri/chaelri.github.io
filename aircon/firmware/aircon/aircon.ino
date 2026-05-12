// ===========================================================================
// aircon.ino — ESP32-C3 SuperMini firmware for the DIY WiFi aircon controller
// ---------------------------------------------------------------------------
// What this does:
//   The ESP32 BECOMES Charlie's TCL aircon remote. It pulses an IR LED at
//   38 kHz in the exact two-burst pattern the aircon expects, replaying
//   raw captures sniffed from the real TAC-09CSA/KEI remote with a TSOP4838.
//
//   We do NOT use IRTcl112Ac — sniffing revealed the KEI variant sends a
//   handshake + button-specific payload, and the library only knows the
//   handshake. So aircon_ir_codes.h carries the exact raw timings for each
//   button, and IRsend::sendRaw replays them verbatim.
//
// THREE WAYS TO TRIGGER (any command goes through the same path):
//   1. Phone remote (online)     -> writes {"cmd":"..."} to Firebase RTDB at
//                                   /aircon/command. Firmware polls every 1 s.
//   2. Local web UI (online)     -> any device on the same WiFi opens
//                                   http://<esp32-ip>/ — five tap buttons.
//   3. SoftAP fallback (offline) -> if no known WiFi joins within 15 s, the
//                                   ESP32 broadcasts "Aircon-AP".
//
// Supported commands (the only ones Charlie cares about):
//   power_on  power_off  temp_up  temp_down  swing
//
// Wiring:
//   GPIO3 -> 100 ohm resistor -> IR LED anode (long leg, +)
//   GND   ----------------------> IR LED cathode (short leg, -)
//   USB-C wall charger -> ESP32 USB-C
//
// Library: IRremoteESP8266 (Arduino IDE Library Manager). We only use IRsend
// from it — the AC-specific classes are unused.
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

#include "aircon_ir_codes.h"

// --- WiFi --------------------------------------------------------------------
WiFiMulti wifiMulti;

// --- SoftAP fallback (offline mode) ------------------------------------------
const char* AP_SSID = "Aircon-AP";
const char* AP_PASS = "aircon24";
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;

// --- Firebase RTDB -----------------------------------------------------------
const char* DB_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/aircon/command.json";
const char* STATE_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/aircon/state.json";

// --- Pins / timing -----------------------------------------------------------
const int IR_LED_PIN          = 3;     // GPIO3 -> 100 ohm -> IR LED anode
const int LED_PIN             = 8;     // onboard blue LED, active LOW
const int TSOP_WITNESS_PIN    = 2;     // OPTIONAL TSOP4838 OUT -> GPIO2. If
                                       // wired, every send is hardware-
                                       // witnessed: TSOP sees the LED's own
                                       // pulses and we count falling edges.
                                       // If not wired, GPIO2 floats HIGH via
                                       // internal pull-up; edge count stays
                                       // at 0 and the phone UI prints
                                       // "no IR detected (TSOP not connected?)"
const int POLL_MS             = 1000;
const uint16_t IR_CARRIER_HZ      = 38;
const uint16_t kInterBurstGapMs   = 50;

IRsend irsend(IR_LED_PIN);
WebServer server(80);
bool inSoftAP = false;
String   lastCmd     = "";
uint32_t lastSendMs  = 0;     // wall-clock duration of last sendRaw pair
uint32_t lastEdges   = 0;     // # of falling edges the TSOP saw during it
uint32_t sendCount   = 0;

volatile uint32_t irEdgeCount = 0;
void IRAM_ATTR onIrEdge() { irEdgeCount++; }

// --- IR send -----------------------------------------------------------------
// Every supported button: replay handshake (frame 1) + button-specific payload
// (frame 2) with a 50 ms inter-burst gap. Matches what the real remote does.
// If the TSOP4838 is wired on GPIO2 as a witness, we measure how many falling
// edges fired during the send — non-zero == IR physically emitted.
bool sendCommand(const String& cmd) {
  const uint16_t* payload = nullptr;
  uint16_t payloadLen = 0;

  if      (cmd == "power_on")  { payload = POWER_ON_RAW;  payloadLen = POWER_ON_LEN; }
  else if (cmd == "power_off") { payload = POWER_OFF_RAW; payloadLen = POWER_OFF_LEN; }
  else if (cmd == "temp_up")   { payload = TEMP_UP_RAW;   payloadLen = TEMP_UP_LEN; }
  else if (cmd == "temp_down") { payload = TEMP_DOWN_RAW; payloadLen = TEMP_DOWN_LEN; }
  else if (cmd == "swing")     { payload = SWING_RAW;     payloadLen = SWING_LEN; }
  else                         { return false; }

  irEdgeCount = 0;
  uint32_t t0 = millis();

  digitalWrite(LED_PIN, LOW);
  irsend.sendRaw(FRAME1_RAW, FRAME1_LEN, IR_CARRIER_HZ);
  delay(kInterBurstGapMs);
  irsend.sendRaw(payload, payloadLen, IR_CARRIER_HZ);
  digitalWrite(LED_PIN, HIGH);

  uint32_t t1 = millis();

  lastCmd    = cmd;
  lastSendMs = t1 - t0;
  lastEdges  = irEdgeCount;
  sendCount++;

  Serial.printf("IR sent -> %s | %u ms | %u edges witnessed\n",
                cmd.c_str(), (unsigned)lastSendMs, (unsigned)lastEdges);
  return true;
}

// --- Publish current state to Firebase /aircon/state -------------------------
String stateJson() {
  String s = "{";
  s += "\"last\":\"";  s += lastCmd;             s += "\",";
  s += "\"send_ms\":"; s += String(lastSendMs);  s += ",";
  s += "\"edges\":";   s += String(lastEdges);   s += ",";
  s += "\"count\":";   s += String(sendCount);   s += ",";
  s += "\"ts\":";      s += String(millis());
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

// --- Apply a JSON command body -----------------------------------------------
// Schema: {"cmd":"power_on" | "power_off" | "temp_up" | "temp_down" | "swing"}
String extractStr(const String& body, const char* key) {
  String pat = String("\"") + key + "\":\"";
  int i = body.indexOf(pat);
  if (i < 0) return "";
  i += pat.length();
  int j = body.indexOf('"', i);
  if (j < 0) return "";
  return body.substring(i, j);
}
void applyCommand(const String& body) {
  String cmd = extractStr(body, "cmd");
  if (cmd.length() == 0) return;
  if (sendCommand(cmd)) publishState();
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
  .pill{font-size:.65rem;letter-spacing:.18em;text-transform:uppercase;color:#67e8f9;
       padding:.35rem .7rem;border-radius:999px;border:1px solid rgba(103,232,249,.25);background:rgba(8,47,73,.5)}
  main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5rem;width:100%;max-width:22rem}
  .row{display:flex;gap:1rem;width:100%;justify-content:center}
  .power{flex:1;height:5rem;border-radius:1.25rem;border:none;cursor:pointer;color:#fff;
       font-family:inherit;font-size:.78rem;letter-spacing:.2em;text-transform:uppercase;font-weight:700;
       transition:transform .1s}
  .power.on{background:radial-gradient(circle at 32% 28%,#7dd3fc 0%,#0ea5e9 40%,#075985 100%);
       box-shadow:inset 0 -8px 16px rgba(0,0,0,.35),0 10px 24px -8px rgba(14,165,233,.5)}
  .power.off{background:radial-gradient(circle at 32% 28%,#475569 0%,#1e293b 60%,#0f172a 100%);
       box-shadow:inset 0 -6px 14px rgba(0,0,0,.5),0 6px 16px -8px rgba(0,0,0,.4)}
  .power:active{transform:scale(.96)}
  .step-row{display:flex;gap:1rem;align-items:center}
  .step{width:5rem;height:5rem;border-radius:50%;border:1px solid rgba(103,232,249,.25);
       background:rgba(8,47,73,.4);color:#67e8f9;font-size:1.8rem;font-weight:600;cursor:pointer;
       transition:transform .1s,background .2s}
  .step:active{transform:scale(.92);background:rgba(8,47,73,.7)}
  .step-label{font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;color:#94a3b8;font-weight:600}
  .swing{padding:.85rem 1.6rem;border-radius:999px;border:1px solid rgba(148,163,184,.18);
       background:rgba(15,23,42,.5);color:#cbd5e1;font-size:.75rem;font-weight:600;
       text-transform:uppercase;letter-spacing:.16em;cursor:pointer;transition:all .2s;
       display:inline-flex;gap:.5rem;align-items:center}
  .swing:active{transform:scale(.95)}
  footer{width:100%;padding:1rem 0 1.5rem}
  .status{display:inline-flex;align-items:center;gap:.55rem;padding:.55rem 1.1rem;border-radius:999px;
       background:rgba(15,23,42,.7);border:1px solid rgba(148,163,184,.15);
       font-size:.7rem;letter-spacing:.12em;font-family:"JetBrains Mono",ui-monospace,monospace;color:#94a3b8}
  .status-dot{width:.45rem;height:.45rem;border-radius:50%;background:#475569}
</style>
</head>
<body>
<header>
  <div class="brand">Aircon · Raw IR</div>
  <div class="pill" id="lastPill">idle</div>
</header>
<main>
  <div class="row">
    <button class="power on"  id="powerOnBtn">Power On</button>
    <button class="power off" id="powerOffBtn">Power Off</button>
  </div>
  <div class="step-row">
    <button class="step" id="tempDown">−</button>
    <div class="step-label">Temp</div>
    <button class="step" id="tempUp">+</button>
  </div>
  <button class="swing" id="swingBtn">Swing</button>
</main>
<footer style="display:flex;justify-content:center">
  <span class="status"><span class="status-dot"></span><span id="statusText">ready</span></span>
</footer>
<script>
const $=id=>document.getElementById(id);
function fmtVerdict(j){
  const e=j.edges|0, ms=j.send_ms|0;
  if(e>50) return "OK · IR confirmed ("+e+" edges, "+ms+"ms)";
  if(e>0)  return "weak · only "+e+" edges in "+ms+"ms";
  return "NO IR detected ("+ms+"ms) — TSOP not wired? or LED dead?";
}
async function fire(cmd){
  $("statusText").textContent="sending "+cmd+"...";
  try{
    const r=await fetch("/set",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cmd})});
    const j=await r.json();
    $("lastPill").textContent=(j.last||cmd)+" #"+(j.count|0);
    $("statusText").textContent=fmtVerdict(j);
  }catch(e){$("statusText").textContent="failed";}
}
$("powerOnBtn").addEventListener("click",()=>fire("power_on"));
$("powerOffBtn").addEventListener("click",()=>fire("power_off"));
$("tempUp").addEventListener("click",()=>fire("temp_up"));
$("tempDown").addEventListener("click",()=>fire("temp_down"));
$("swingBtn").addEventListener("click",()=>fire("swing"));
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

  irsend.begin();

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);

  // TSOP4838 self-witness: idle HIGH via internal pull-up, drops LOW each
  // time it detects 38 kHz carrier. We count falling edges during sends.
  pinMode(TSOP_WITNESS_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(TSOP_WITNESS_PIN), onIrEdge, FALLING);

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
