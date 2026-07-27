// ===========================================================================
// servo-sweep.ino — ESP32-C3 SuperMini: Firebase-gated left/right servo sweep
// ---------------------------------------------------------------------------
// Behaviour:
//   A single boolean in Firebase RTDB at /servo/enabled turns the sweep loop
//   ON or OFF. While ON, the servo alternates LEFT_ANGLE <-> RIGHT_ANGLE once
//   every SWEEP_INTERVAL_MS (3 s). While OFF, the servo stops and detaches so
//   it doesn't buzz/hold.
//
//   /servo/enabled = true   -> start sweeping (moves immediately, then every 3 s)
//   /servo/enabled = false  -> stop
//
// The firmware listens on a long-lived HTTPS Server-Sent-Events stream, so an
// on/off flip from the phone/console lands in ~50-150 ms — no polling.
//
// Servo (3-pin module):
//   brown  (GND)    -> ESP32 GND
//   red    (VCC)    -> ESP32 5V
//   yellow (signal) -> ESP32 GPIO3
//
// Library: ESP32Servo (Kevin Harrington — Library Manager). NOT the AVR Servo.h.
// Board:  "ESP32C3 Dev Module", USB CDC On Boot: Enabled, Baud 115200.
// ===========================================================================

#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>

// --- WiFi --------------------------------------------------------------------
WiFiMulti wifiMulti;

// --- Firebase RTDB -----------------------------------------------------------
// Shared project test-database-55379 (asia-southeast1). Single boolean flag.
const char* FB_HOST = "test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app";
const char* STREAM_PATH = "/servo/enabled.json";

// --- Servo / sweep -----------------------------------------------------------
const int SERVO_PIN          = 3;      // GPIO3 -> yellow signal wire
const int LEFT_ANGLE         = 0;      // full left
const int RIGHT_ANGLE        = 180;    // full right
const unsigned long SWEEP_INTERVAL_MS = 3000;  // move every 3 s

Servo sweeper;
bool enabled     = false;   // mirror of /servo/enabled
bool attached    = false;   // is the servo signal currently driven?
bool atLeft      = false;   // which side we last moved to
unsigned long lastMove = 0; // millis of the last sweep step

// --- SSE command stream ------------------------------------------------------
WiFiClientSecure streamClient;
unsigned long lastStreamAttempt = 0;
const unsigned long STREAM_RECONNECT_MS = 1500;

// Publish a short status string to /servo/pos so the device is observable from
// the cloud (remote page + quick REST checks) without needing a serial cable.
void publish(const char* what) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(String("https://") + FB_HOST + "/servo/pos.json");
  http.addHeader("Content-Type", "application/json");
  http.PUT(String("\"") + what + "\"");
  http.end();
}

// ----------------------------------------------------------------------------
void moveTo(int angle) {
  if (!attached) {
    sweeper.attach(SERVO_PIN, 500, 2400);
    attached = true;
  }
  sweeper.write(angle);
}

void startSweep() {
  if (enabled) return;
  enabled = true;
  atLeft  = false;             // so the first step goes LEFT
  lastMove = millis() - SWEEP_INTERVAL_MS;  // force an immediate first move
  Serial.println(">>> enabled -> sweeping");
}

void stopSweep() {
  if (!enabled && !attached) return;
  enabled = false;
  if (attached) { sweeper.detach(); attached = false; }
  publish("stopped");
  Serial.println(">>> disabled -> stopped");
}

// Toggle sides. Called from loop() on the 3 s cadence while enabled.
void sweepStep() {
  atLeft = !atLeft;
  int angle = atLeft ? LEFT_ANGLE : RIGHT_ANGLE;
  moveTo(angle);
  publish(atLeft ? "LEFT" : "RIGHT");
  Serial.printf("sweep -> %s (%d deg)\n", atLeft ? "LEFT" : "RIGHT", angle);
}

// --- Firebase command stream -------------------------------------------------
void connectStream() {
  streamClient.stop();
  streamClient.setInsecure();          // flag holds no secret; skip cert check
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
  Serial.println("Stream connected — listening on /servo/enabled");
}

// Firebase frames each change as:  data: {"path":"/","data":true}
// We only care about the boolean after "data": inside that JSON.
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
  if      (val == "true")  startSweep();
  else if (val == "false") stopSweep();
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

  sweeper.setPeriodHertz(50);          // standard 50 Hz hobby-servo PWM
  // (attach happens lazily in moveTo so a disabled servo stays quiet)

  wifiMulti.addAP("CharLa", "Kahitano1!");
  wifiMulti.addAP("CAYNO", "lokomoko");
  wifiMulti.addAP("Chaelri", "charlie24");

  Serial.print("Connecting to WiFi");
  while (wifiMulti.run() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.println();
  Serial.println("WiFi: " + WiFi.SSID() + " · " + WiFi.localIP().toString());
  WiFi.setSleep(false);                // wall-powered — keep radio awake

  publish("online");                   // cloud heartbeat: device booted + joined WiFi
  connectStream();
}

void loop() {
  // Keep the SSE stream alive so on/off flips land fast.
  if (streamClient.connected()) {
    processStream();
  } else if (millis() - lastStreamAttempt >= STREAM_RECONNECT_MS) {
    lastStreamAttempt = millis();
    if (WiFi.status() == WL_CONNECTED) connectStream();
  }

  // Non-blocking sweep so the stream stays responsive to an OFF mid-cycle.
  if (enabled && millis() - lastMove >= SWEEP_INTERVAL_MS) {
    lastMove = millis();
    sweepStep();
  }

  delay(1);
}
