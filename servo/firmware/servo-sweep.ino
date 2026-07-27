// ===========================================================================
// servo-sweep.ino — ESP32-C3 SuperMini: CONTINUOUS-ROTATION servo "click"
// ---------------------------------------------------------------------------
// Same functionality as autoclicker/aircon: on "click", the servo bursts
// forward (PUSH_US) for PUSH_MS, briefly waits, then bursts the opposite
// direction (RETURN_US) for the SAME duration (RETURN_MS) to land back at rest.
// -> it goes, then comes right back. Triggered from the phone via Firebase.
//
// Continuous-rotation servos do NOT take angles. Pulse width = speed+direction:
//   writeMicroseconds(1500) = STOP (motor off)
//   writeMicroseconds(1000) = full speed one way
//   writeMicroseconds(2000) = full speed the other way
// Travel = HOW LONG a non-1500 pulse is held (PUSH_MS / RETURN_MS), not an angle.
// To rotate FURTHER, increase PUSH_MS/RETURN_MS (keep them EQUAL so it returns
// exactly to rest). If it spins the WRONG way on press, swap PUSH_US/RETURN_US.
//
// Servo (3-pin module):
//   brown  (GND)    -> ESP32 GND
//   red    (VCC)    -> ESP32 5V
//   yellow (signal) -> ESP32 GPIO3
//
// RTDB paths (shared project test-database-55379):
//   /servo/command — phone writes "click" (or press/release/toggle); firmware
//                    acts on it and clears it back to "".
//   /servo/state   — firmware echoes latched state (true/false) after each act.
//
// Library: ESP32Servo. Board: "ESP32C3 Dev Module", USB CDC On Boot: Enabled.
// ===========================================================================

#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>

// --- WiFi --------------------------------------------------------------------
WiFiMulti wifiMulti;

// --- Firebase RTDB -----------------------------------------------------------
const char* FB_HOST = "test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app";
const char* STREAM_PATH = "/servo/command.json";
const char* CMD_URL   = "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app/servo/command.json";
const char* STATE_URL = "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app/servo/state.json";

// --- Pins / CR-servo timing (tune these) -------------------------------------
const int SERVO_PIN   = 3;      // GPIO3 -> yellow signal wire
const int STOP_US     = 1500;   // neutral — motor off (try 1480..1520 if it creeps)
const int PUSH_US     = 1000;   // press direction  (swap with RETURN_US if reversed)
const int RETURN_US   = 2000;   // release direction
const int PUSH_MS     = 400;    // burst duration -> how far it turns (bigger = more)
const int RETURN_MS   = 400;    // MUST equal PUSH_MS so it lands back at rest
const int CLICK_HOLD_MS = 200;  // pause at the far end before returning

Servo servo;
bool isPressed = false;         // latched state (for press/release/toggle)

// --- SSE command stream ------------------------------------------------------
WiFiClientSecure streamClient;
unsigned long lastStreamAttempt = 0;
const unsigned long STREAM_RECONNECT_MS = 1500;

void publishState() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(STATE_URL);
  http.addHeader("Content-Type", "application/json");
  http.PUT(isPressed ? "true" : "false");
  http.end();
}

void clearCommand() {
  HTTPClient http;
  http.begin(CMD_URL);
  http.addHeader("Content-Type", "application/json");
  http.PUT("\"\"");
  http.end();
}

// --- Press / release / toggle / click (CR-servo bursts) ----------------------
void doPress() {
  if (isPressed) return;
  servo.writeMicroseconds(PUSH_US);     // burst forward
  delay(PUSH_MS);
  servo.writeMicroseconds(STOP_US);     // motor off — arm stays put
  isPressed = true;
  publishState();
  Serial.println("press");
}

void doRelease() {
  if (!isPressed) return;
  servo.writeMicroseconds(RETURN_US);   // mirrored burst back to rest
  delay(RETURN_MS);
  servo.writeMicroseconds(STOP_US);
  isPressed = false;
  publishState();
  Serial.println("release");
}

void doToggle() { isPressed ? doRelease() : doPress(); }

// Momentary click: go, brief hold, come right back. Always ends at rest.
void doClick() {
  if (isPressed) doRelease();
  servo.writeMicroseconds(PUSH_US);
  delay(PUSH_MS);
  servo.writeMicroseconds(STOP_US);
  delay(CLICK_HOLD_MS);
  servo.writeMicroseconds(RETURN_US);
  delay(RETURN_MS);
  servo.writeMicroseconds(STOP_US);
  isPressed = false;
  publishState();
  Serial.println("click -> go & back");
}

// --- Firebase command stream -------------------------------------------------
void connectStream() {
  streamClient.stop();
  streamClient.setInsecure();
  streamClient.setTimeout(15000);
  if (!streamClient.connect(FB_HOST, 443)) { Serial.println("Stream connect failed"); return; }
  String req =
    String("GET ") + STREAM_PATH + " HTTP/1.1\r\n" +
    "Host: " + FB_HOST + "\r\n" +
    "Accept: text/event-stream\r\n" +
    "Cache-Control: no-cache\r\n" +
    "Connection: keep-alive\r\n\r\n";
  streamClient.print(req);
  Serial.println("Stream connected — listening on /servo/command");
}

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
  Serial.println(">>> " + val);
  if      (val == "click")   { doClick();   clearCommand(); }
  else if (val == "press")   { doPress();   clearCommand(); }
  else if (val == "release") { doRelease(); clearCommand(); }
  else if (val == "toggle")  { doToggle();  clearCommand(); }
}

void processStream() {
  while (streamClient.connected() && streamClient.available()) {
    String line = streamClient.readStringUntil('\n');
    line.trim();
    if (line.startsWith("data:")) handleStreamData(line.substring(5));
  }
}

// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  servo.setPeriodHertz(50);
  servo.attach(SERVO_PIN, 500, 2400);
  servo.writeMicroseconds(STOP_US);     // motor stopped at boot

  wifiMulti.addAP("CharLa", "Kahitano1!");
  wifiMulti.addAP("CAYNO", "lokomoko");
  wifiMulti.addAP("Chaelri", "charlie24");

  Serial.print("Connecting to WiFi");
  while (wifiMulti.run() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.println();
  Serial.println("WiFi: " + WiFi.SSID() + " · " + WiFi.localIP().toString());
  WiFi.setSleep(false);

  publishState();
  connectStream();
}

void loop() {
  if (streamClient.connected()) {
    processStream();
  } else if (millis() - lastStreamAttempt >= STREAM_RECONNECT_MS) {
    lastStreamAttempt = millis();
    if (WiFi.status() == WL_CONNECTED) connectStream();
  }
  delay(1);
}
