// ===========================================================================
// aircon-ir.ino — ESP32-C3 SuperMini firmware for the IR-LED aircon remote.
//                 LIBRARY-ENCODED version (uses IRTcl112Ac).
// ---------------------------------------------------------------------------
// Why this isn't raw-replay anymore:
//   The first round of "raw timing" captures came from a cheap receiver that
//   truncated the second frame of each press. The library couldn't decode
//   them (they showed up as UNKNOWN at 107–110 bits instead of the proper
//   TCL112AC at 112 bits). Replaying those corrupt frames at the AC produced
//   nothing useful.
//
//   The re-sniff with a better receiver showed the real protocol:
//     * Frame 1 = a constant Type-2 preamble — same for every button press,
//                 carries no state.
//     * Frame 2 = a Type-1 state frame — carries the full new AC state
//                 (Power, Mode, Temp, Fan, Swing, etc.).
//
//   The IRTcl112Ac library encodes a clean Type-1 state frame natively.
//   Every command mutates the library's internal state and calls send().
//   No raw arrays, no preamble — just a clean 112-bit TCL112AC frame.
//
//   If for some reason this AC needs the preamble first, flip SEND_PREAMBLE
//   to true below and we'll send the captured preamble bytes ahead of the
//   state frame.
//
// FIVE COMMANDS (same RTDB schema as before — phone-ir/ remote works as-is):
//   {"cmd":"power_on"}   -> ac.on()
//   {"cmd":"power_off"}  -> ac.off()
//   {"cmd":"temp_up"}    -> ac.setTemp(ac.getTemp() + 1)
//   {"cmd":"temp_down"}  -> ac.setTemp(ac.getTemp() - 1)
//   {"cmd":"swing"}      -> ac.setSwingVertical(!ac.getSwingVertical())
//
// THREE WAYS TO TRIGGER (each one ends in sendCommand()):
//   1. Phone remote  -> /aircon/ir/command on RTDB, polled at 1 Hz
//   2. Local web UI  -> http://<esp32-ip>/  five buttons
//   3. SoftAP fallback "Aircon-IR-AP" if no known WiFi within 15 s
//
// Wiring (3-pin IR transmitter module):
//   ESP32 5V    -> module VCC
//   ESP32 GND   -> module GND
//   ESP32 GPIO3 -> module DAT
//
// Library: IRremoteESP8266 by David Conran et al. (Arduino IDE Library Manager).
// Board:   "ESP32C3 Dev Module"   USB CDC On Boot: Enabled
// Baud:    115200
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
const char* AP_SSID = "Aircon-IR-AP";
const char* AP_PASS = "aircon24";
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;

// --- Firebase RTDB -----------------------------------------------------------
const char* DB_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/aircon/ir/command.json";
const char* STATE_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/aircon/ir/state.json";

// --- Pins / timing -----------------------------------------------------------
const uint16_t IR_LED_PIN = 3;     // GPIO3 -> IR transmitter module DAT
const int      STATUS_LED = 8;     // onboard blue LED, active LOW
const int      POLL_MS    = 1000;

// --- AC controller (library) -------------------------------------------------
IRTcl112Ac ac(IR_LED_PIN);

// --- Optional preamble pass --------------------------------------------------
// The real remote sends a Type-2 preamble frame before the Type-1 state frame.
// Most TCL split-ACs obey the state frame alone, but if Charlie's TAC-09CSA/KEI
// turns out to need the preamble, flip this to true and we'll send it first.
const bool SEND_PREAMBLE = false;
const uint8_t kTclPreamble[14] = {
  0x23, 0xCB, 0x26, 0x02, 0x00, 0x40, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x65
};

// --- Runtime state -----------------------------------------------------------
WebServer server(80);
bool      inSoftAP        = false;
String    lastCmd         = "";
uint32_t  lastDurationMs  = 0;
uint32_t  sendCount       = 0;

// --- Defaults applied at boot (chosen to match the captured POWER-ON state) -
void setupAcDefaults() {
  ac.setMode(kTcl112AcCool);
  ac.setTemp(24);                  // °C
  ac.setFan(kTcl112AcFanHigh);     // matches captured Fan: 5 (High)
  ac.setSwingVertical(false);      // 0 (Auto)
  ac.setSwingHorizontal(true);     // matches captured Swing(H): On
  ac.setLight(true);               // matches captured Light: On
  ac.setEcono(false);
  ac.setHealth(false);
  ac.setTurbo(false);
  ac.setQuiet(false);
  ac.off();                         // start powered off; phone explicitly turns on
}

// --- Send the current AC state out the IR LED -------------------------------
void sendIR() {
  digitalWrite(STATUS_LED, LOW);
  uint32_t t0 = millis();

  if (SEND_PREAMBLE) {
    // Stash whatever state the library currently holds, send the constant
    // preamble bytes, then restore state so ac.send() sends what we want.
    uint8_t savedState[kTcl112AcStateLength];
    memcpy(savedState, ac.getRaw(), kTcl112AcStateLength);

    ac.setRaw(kTclPreamble, kTcl112AcStateLength);
    ac.send(/*repeat=*/0);
    delay(25);

    ac.setRaw(savedState, kTcl112AcStateLength);
  }

  ac.send();   // default repeat sends one state frame, then a second copy

  lastDurationMs = millis() - t0;
  sendCount++;
  digitalWrite(STATUS_LED, HIGH);

  Serial.printf("IR %s -> %u ms (#%u) | state: %s\n",
                lastCmd.c_str(),
                (unsigned)lastDurationMs,
                (unsigned)sendCount,
                ac.toString().c_str());
}

bool sendCommand(const String& cmd) {
  if (cmd == "power_on") {
    ac.on();
  } else if (cmd == "power_off") {
    ac.off();
  } else if (cmd == "temp_up") {
    ac.setTemp(ac.getTemp() + 1);      // library clamps to its kTcl112AcTempMax
  } else if (cmd == "temp_down") {
    ac.setTemp(ac.getTemp() - 1);      // library clamps to its kTcl112AcTempMin
  } else if (cmd == "swing") {
    ac.setSwingVertical(!ac.getSwingVertical());
  } else {
    return false;
  }

  lastCmd = cmd;
  sendIR();
  return true;
}

// --- Publish current state to Firebase /aircon/ir/state ---------------------
String stateJson() {
  String s = "{";
  s += "\"last\":\"";        s += lastCmd;                  s += "\",";
  s += "\"duration_ms\":";   s += String(lastDurationMs);   s += ",";
  s += "\"count\":";         s += String(sendCount);        s += ",";
  s += "\"power\":";         s += (ac.getPower() ? "true" : "false"); s += ",";
  s += "\"temp\":";          s += String((int)ac.getTemp());          s += ",";
  s += "\"swing\":";         s += (ac.getSwingVertical() ? "true" : "false"); s += ",";
  s += "\"ts\":";            s += String(millis());
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

// --- Naive JSON extractor (same shape as autoclicker / servo aircon) --------
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

// --- Built-in web UI --------------------------------------------------------
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b1220">
<title>Aircon IR</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
  html,body{height:100%}
  body{background:radial-gradient(1200px 800px at 50% -10%,#0c4a6e 0%,#0b1220 55%,#020617 100%);
       color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;
       min-height:100dvh;display:flex;flex-direction:column;align-items:center;
       padding:env(safe-area-inset-top) 1.25rem env(safe-area-inset-bottom)}
  header{width:100%;padding:1.25rem 0 .5rem;display:flex;justify-content:space-between;align-items:center}
  .brand{font-size:.78rem;letter-spacing:.22em;text-transform:uppercase;color:#cbd5e1;font-weight:600}
  .pill{font-size:.65rem;letter-spacing:.18em;text-transform:uppercase;color:#67e8f9;
       padding:.35rem .7rem;border-radius:999px;border:1px solid rgba(103,232,249,.25);background:rgba(8,47,73,.5)}
  main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;width:100%;max-width:22rem;padding:1.5rem 0}
  .row{display:flex;gap:.75rem;width:100%}
  .btn{flex:1;border:none;cursor:pointer;color:#fff;border-radius:1rem;padding:1.1rem .75rem;
       font-family:inherit;font-size:.85rem;letter-spacing:.18em;text-transform:uppercase;font-weight:700;
       background:rgba(15,23,42,.7);border:1px solid rgba(148,163,184,.18);
       transition:transform .1s ease, background .15s ease}
  .btn:active{transform:scale(.96)}
  .btn-on{background:linear-gradient(160deg,#22d3ee 0%,#0ea5e9 60%,#0369a1 100%);border-color:rgba(125,211,252,.35)}
  .btn-off{background:linear-gradient(160deg,#475569 0%,#334155 60%,#1e293b 100%);border-color:rgba(148,163,184,.25)}
  .btn-warm{background:rgba(15,23,42,.7)}
  footer{width:100%;padding:1rem 0 1.5rem}
  .status{display:inline-flex;align-items:center;gap:.55rem;padding:.55rem 1.1rem;border-radius:999px;
       background:rgba(15,23,42,.7);border:1px solid rgba(148,163,184,.15);
       font-size:.7rem;letter-spacing:.12em;font-family:"JetBrains Mono",ui-monospace,monospace;color:#94a3b8}
  .status-dot{width:.45rem;height:.45rem;border-radius:50%;background:#475569}
</style>
</head>
<body>
<header>
  <div class="brand">Aircon · IR</div>
  <div class="pill" id="lastPill">idle</div>
</header>
<main>
  <div class="row">
    <button class="btn btn-on"  data-cmd="power_on">Power On</button>
    <button class="btn btn-off" data-cmd="power_off">Power Off</button>
  </div>
  <div class="row">
    <button class="btn btn-warm" data-cmd="temp_down">Temp &minus;</button>
    <button class="btn btn-warm" data-cmd="temp_up">Temp +</button>
  </div>
  <div class="row">
    <button class="btn btn-warm" data-cmd="swing">Swing</button>
  </div>
</main>
<footer style="display:flex;justify-content:center">
  <span class="status"><span class="status-dot"></span><span id="statusText">ready</span></span>
</footer>
<script>
const $=id=>document.getElementById(id);
async function fire(cmd){
  $("statusText").textContent="sending "+cmd+"...";
  try{
    const r=await fetch("/set",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cmd})});
    const j=await r.json();
    $("lastPill").textContent=j.last+" · #"+(j.count|0);
    $("statusText").textContent=(j.last||"sent")+" · "+(j.duration_ms|0)+" ms · temp "+(j.temp|0)+"\u00B0C";
  }catch(e){$("statusText").textContent="failed";}
}
document.querySelectorAll("button[data-cmd]").forEach(b=>{
  b.addEventListener("click",()=>fire(b.dataset.cmd));
});
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
  setupAcDefaults();

  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, HIGH);

  wifiMulti.addAP("CAYNO", "lokomoko");
  wifiMulti.addAP("Charlie's iPhone", "charlie24");

  // WiFi station mode first; SoftAP only if no known network shows up.
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
