// ===========================================================================
// servo-sweep.ino — ESP32-C3 SuperMini: servo follows /servo/angle from Firebase
// ---------------------------------------------------------------------------
// This firmware is a DUMB FOLLOWER. All the intelligence (manual left/right,
// record, playback, loop) lives in the phone web app at /servo/. The app just
// writes an integer angle (0..180) to RTDB path /servo/angle; this firmware
// mirrors it onto the servo and echoes the value back to /servo/pos.
//
// Servo (3-pin module):
//   brown  (GND)    -> ESP32 GND
//   red    (VCC)    -> ESP32 5V
//   yellow (signal) -> ESP32 GPIO3
//
// POWER NOTE: a servo can dip the shared USB 5V rail enough to reboot the C3
// ("Brownout detector was triggered"). If that happens, add a 470-1000 uF
// electrolytic cap across the servo V+/GND (right at the servo), or power the
// servo from a separate 5V supply sharing GND with the ESP32.
//
// Library: ESP32Servo (Kevin Harrington). Board: "ESP32C3 Dev Module",
// USB CDC On Boot: Enabled, Baud 115200.
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
const char* STREAM_PATH = "/servo/angle.json";   // integer 0..180 the app writes

// --- Servo -------------------------------------------------------------------
const int SERVO_PIN = 3;                 // GPIO3 -> yellow signal wire
Servo servo;
bool attached  = false;                  // is the servo signal currently driven?
int  curAngle  = 90;                     // last angle written
unsigned long lastCmd = 0;               // millis of the last angle command
const unsigned long IDLE_DETACH_MS = 120000;  // release the servo after 2 min idle

// --- SSE command stream ------------------------------------------------------
WiFiClientSecure streamClient;
unsigned long lastStreamAttempt = 0;
const unsigned long STREAM_RECONNECT_MS = 1500;

// Echo the current angle to /servo/pos so the app can confirm the device saw it.
void publishPos(int a) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(String("https://") + FB_HOST + "/servo/pos.json");
  http.addHeader("Content-Type", "application/json");
  http.PUT(String(a));
  http.end();
}

// Snap the servo to an angle (proven stable — no slow ramp). Attaches lazily so
// the servo stays quiet until the first command arrives.
void applyAngle(int a) {
  a = constrain(a, 0, 180);
  if (!attached) { servo.attach(SERVO_PIN, 500, 2400); attached = true; }
  servo.write(a);
  curAngle = a;
  lastCmd = millis();
  publishPos(a);
  Serial.printf("angle -> %d\n", a);
}

// --- Firebase command stream -------------------------------------------------
void connectStream() {
  streamClient.stop();
  streamClient.setInsecure();
  streamClient.setTimeout(15000);
  if (!streamClient.connect(FB_HOST, 443)) {
    Serial.println("Stream connect failed");
    return;
  }
  String req =
    String("GET ") + STREAM_PATH + " HTTP/1.1\r\n" +
    "Host: " + FB_HOST + "\r\n" +
    "Accept: text/event-stream\r\n" +
    "Cache-Control: no-cache\r\n" +
    "Connection: keep-alive\r\n\r\n";
  streamClient.print(req);
  Serial.println("Stream connected — following /servo/angle");
}

// Firebase frames each change as:  data: {"path":"/","data":90}
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
  applyAngle(val.toInt());
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
  servo.setPeriodHertz(50);              // standard 50 Hz hobby-servo PWM

  wifiMulti.addAP("CharLa", "Kahitano1!");
  wifiMulti.addAP("CAYNO", "lokomoko");
  wifiMulti.addAP("Chaelri", "charlie24");

  Serial.print("Connecting to WiFi");
  while (wifiMulti.run() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.println();
  Serial.println("WiFi: " + WiFi.SSID() + " · " + WiFi.localIP().toString());
  WiFi.setSleep(false);

  publishPos(curAngle);                  // heartbeat: booted + online (no attach yet)
  connectStream();
}

void loop() {
  if (streamClient.connected()) {
    processStream();
  } else if (millis() - lastStreamAttempt >= STREAM_RECONNECT_MS) {
    lastStreamAttempt = millis();
    if (WiFi.status() == WL_CONNECTED) connectStream();
  }

  // Release the servo after a long idle so it isn't held/buzzing forever.
  if (attached && millis() - lastCmd > IDLE_DETACH_MS) {
    servo.detach();
    attached = false;
    Serial.println("idle -> detached");
  }

  delay(1);
}
