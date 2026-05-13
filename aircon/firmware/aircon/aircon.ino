// ===========================================================================
// aircon.ino — ESP32-C3 SuperMini firmware for the DIY WiFi aircon controller.
//              CONTINUOUS-ROTATION SERVO version (SG90 360°).
// ---------------------------------------------------------------------------
// What this does:
//   The ESP32 drives a continuous-rotation SG90 servo. On "click", the servo
//   bursts forward (PUSH_US) for PUSH_MS to physically depress the POWER
//   button on the real TCL remote, briefly waits so the button registers,
//   then bursts in the opposite direction (RETURN_US) for the same duration
//   to bring the arm back to rest.
//
//   Continuous-rotation servos do NOT take angle values. Instead:
//     - writeMicroseconds(1500) = STOP (motor off)
//     - writeMicroseconds(1000) = full speed one way
//     - writeMicroseconds(2000) = full speed the other way
//   So the amount of travel is controlled by HOW LONG you hold a non-1500
//   pulse, not by an angle. To rotate further: increase PUSH_MS / RETURN_MS.
//   PUSH_MS and RETURN_MS MUST be equal so the arm lands back at rest.
//
//   If the servo rotates the WRONG direction on press, just swap the values
//   of PUSH_US and RETURN_US below. No rewiring needed.
//
// THREE WAYS TO TRIGGER (every command goes through the same path):
//   1. Phone remote (online)     -> writes {"cmd":"click"} to Firebase RTDB
//                                   at /aircon/command. Firmware polls every 1 s.
//   2. Local web UI (online)     -> any device on the same WiFi opens
//                                   http://<esp32-ip>/ — one tap button.
//   3. SoftAP fallback (offline) -> if no known WiFi joins within 15 s, the
//                                   ESP32 broadcasts "Aircon-AP".
//
// Wiring (SG90 360° continuous-rotation):
//   ESP32 5V    -> SG90 RED    (Vcc)
//   ESP32 GND   -> SG90 BROWN  (GND)
//   ESP32 GPIO3 -> SG90 ORANGE/YELLOW (signal)
//
// Library: ESP32Servo by Kevin Harrington (Arduino IDE Library Manager).
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
const int SERVO_PIN     = 3;     // GPIO3 -> SG90 signal (orange/yellow)
const int LED_PIN       = 8;     // onboard blue LED, active LOW
const int POLL_MS       = 1000;

// Continuous-rotation servo pulses (microseconds). Tune only if needed:
//   STOP_US:   1500 is the spec neutral. If the arm creeps when "stopped",
//              nudge by ±10 (try 1490 / 1510) until it sits still.
//   PUSH_US:   below STOP_US = one direction at full speed.
//   RETURN_US: above STOP_US = the other direction at full speed.
//   If servo rotates the WRONG way on press, SWAP PUSH_US and RETURN_US.
const int STOP_US       = 1500;
const int PUSH_US       = 1000;
const int RETURN_US     = 2000;

// Travel duration (how far the arm sweeps). Continuous-rotation SG90 spec
// is ~60 RPM = 360°/sec = ~167 µs per degree of travel at full speed.
// 700 ms ≈ 120° of rotation (Charlie's "90° + a bit more for the press").
// MUST be equal so the arm lands back at rest after press+release.
const int PUSH_MS       = 200;
const int RETURN_MS     = 150;

// How long to keep the arm depressed on the button so the IR remote
// registers the press electronically. 300 ms is plenty for any remote.
const int CLICK_HOLD_MS = 300;

Servo finger;
WebServer server(80);
bool inSoftAP = false;
String   lastCmd     = "";
uint32_t lastClickMs = 0;
uint32_t clickCount  = 0;

// --- Click cycle: push -> hold -> return -> stop ----------------------------
void doClick() {
  digitalWrite(LED_PIN, LOW);
  uint32_t t0 = millis();

  finger.writeMicroseconds(PUSH_US);     // burst onto the button
  delay(PUSH_MS);
  finger.writeMicroseconds(STOP_US);     // motor off — arm pressed on button
  delay(CLICK_HOLD_MS);                  // hold so remote registers the press

  finger.writeMicroseconds(RETURN_US);   // mirrored burst back to rest
  delay(RETURN_MS);
  finger.writeMicroseconds(STOP_US);     // motor off at rest

  uint32_t t1 = millis();
  digitalWrite(LED_PIN, HIGH);

  lastCmd     = "click";
  lastClickMs = t1 - t0;
  clickCount++;
  Serial.printf("CLICK -> %u ms (#%u)\n",
                (unsigned)lastClickMs, (unsigned)clickCount);
}

bool sendCommand(const String& cmd) {
  if (cmd == "click") { doClick(); return true; }
  return false;
}

// --- Publish current state to Firebase /aircon/state -------------------------
String stateJson() {
  String s = "{";
  s += "\"last\":\"";    s += lastCmd;             s += "\",";
  s += "\"click_ms\":";  s += String(lastClickMs); s += ",";
  s += "\"count\":";     s += String(clickCount);  s += ",";
  s += "\"ts\":";        s += String(millis());
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
// Schema: {"cmd":"click"}
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
       padding:env(safe-area-inset-top) 1.25rem env(safe-area-inset-bottom)}
  header{width:100%;padding:1.25rem 0 .5rem;display:flex;justify-content:space-between;align-items:center}
  .brand{font-size:.78rem;letter-spacing:.22em;text-transform:uppercase;color:#cbd5e1;font-weight:600}
  .pill{font-size:.65rem;letter-spacing:.18em;text-transform:uppercase;color:#67e8f9;
       padding:.35rem .7rem;border-radius:999px;border:1px solid rgba(103,232,249,.25);background:rgba(8,47,73,.5)}
  main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5rem;width:100%;max-width:22rem}
  .click-btn{width:12rem;height:12rem;border-radius:50%;border:none;cursor:pointer;color:#fff;
       background:radial-gradient(circle at 32% 28%,#7dd3fc 0%,#0ea5e9 40%,#075985 100%);
       box-shadow:0 0 0 1px rgba(255,255,255,.08) inset,0 18px 50px -10px rgba(14,165,233,.55),
                  inset 0 -12px 26px rgba(0,0,0,.35),inset 0 8px 18px rgba(255,255,255,.22);
       font-family:inherit;font-size:.95rem;letter-spacing:.2em;text-transform:uppercase;font-weight:800;
       display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.4rem;
       transition:transform .1s ease}
  .click-btn:active{transform:scale(.96)}
  .hint{font-size:.7rem;color:#94a3b8;letter-spacing:.12em;text-transform:uppercase}
  footer{width:100%;padding:1rem 0 1.5rem}
  .status{display:inline-flex;align-items:center;gap:.55rem;padding:.55rem 1.1rem;border-radius:999px;
       background:rgba(15,23,42,.7);border:1px solid rgba(148,163,184,.15);
       font-size:.7rem;letter-spacing:.12em;font-family:"JetBrains Mono",ui-monospace,monospace;color:#94a3b8}
  .status-dot{width:.45rem;height:.45rem;border-radius:50%;background:#475569}
</style>
</head>
<body>
<header>
  <div class="brand">Aircon · Servo</div>
  <div class="pill" id="lastPill">idle</div>
</header>
<main>
  <button class="click-btn" id="clickBtn">Power</button>
  <div class="hint">tap to press the remote's power button</div>
</main>
<footer style="display:flex;justify-content:center">
  <span class="status"><span class="status-dot"></span><span id="statusText">ready</span></span>
</footer>
<script>
const $=id=>document.getElementById(id);
async function fire(){
  $("statusText").textContent="clicking...";
  try{
    const r=await fetch("/set",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cmd:"click"})});
    const j=await r.json();
    $("lastPill").textContent="click #"+(j.count|0);
    $("statusText").textContent="clicked · "+(j.click_ms|0)+" ms";
  }catch(e){$("statusText").textContent="failed";}
}
$("clickBtn").addEventListener("click",fire);
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

  // Servo init — ESP32Servo uses LEDC, 50 Hz hobby-servo PWM. Standard
  // pulse range 500-2400 µs covers both positional and 360° continuous-
  // rotation servos.
  ESP32PWM::allocateTimer(0);
  finger.setPeriodHertz(50);
  finger.attach(SERVO_PIN, 500, 2400);
  finger.writeMicroseconds(STOP_US);    // motor stopped at boot

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);

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
