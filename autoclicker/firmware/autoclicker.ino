// ===========================================================================
// autoclicker.ino — ESP32-C3 SuperMini firmware for the DIY WiFi auto-clicker
// ---------------------------------------------------------------------------
// Polls Firebase Realtime DB at /autoclicker/command every 1 s.
// On "click"  -> 1 pulse on GPIO3 (200 ms)
// On "double" -> 2 pulses, 150 ms apart
// On "auto_N" -> N pulses (1..50)
// After firing, clears the command field with an empty string.
//
// Wiring:
//   ESP32 5V    -> MOSFET VCC   (red)
//   ESP32 GND   -> MOSFET GND   (black)
//   ESP32 GPIO3 -> MOSFET SIG   (green)
//   Solenoid    -> MOSFET V+ / V-
//   USB-C 5V/2A -> ESP32
//
// Board: "ESP32C3 Dev Module"   USB CDC On Boot: Enabled
// Baud:  115200
// ===========================================================================

#include <WiFi.h>
#include <HTTPClient.h>

// --- WiFi --------------------------------------------------------------------
const char* WIFI_SSID = "CAYNO";
const char* WIFI_PASS = "lokomoko";

// --- Firebase RTDB -----------------------------------------------------------
const char* DB_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/autoclicker/command.json";

// --- Pin / timing ------------------------------------------------------------
const int SOLENOID_PIN = 3;     // GPIO3 -> MOSFET SIG (drives the solenoid)
const int LED_PIN      = 8;     // GPIO8 -> onboard blue LED (active LOW)
const int CLICK_MS     = 200;   // pulse width per press
const int POLL_MS      = 1000;  // Firebase poll interval

void setup() {
  Serial.begin(115200);
  pinMode(SOLENOID_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(SOLENOID_PIN, LOW);
  digitalWrite(LED_PIN, HIGH);   // LED off (active LOW: HIGH = off)

  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.println();
  Serial.println("WiFi connected: " + WiFi.localIP().toString());
}

void click(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(SOLENOID_PIN, HIGH);
    digitalWrite(LED_PIN, LOW);    // LED on (active LOW)
    delay(CLICK_MS);
    digitalWrite(SOLENOID_PIN, LOW);
    digitalWrite(LED_PIN, HIGH);   // LED off
    if (i < times - 1) delay(150);
  }
}

void clearCommand() {
  HTTPClient http;
  http.begin(DB_URL);
  http.addHeader("Content-Type", "application/json");
  http.PUT("\"\"");
  http.end();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(POLL_MS);
    return;
  }

  HTTPClient http;
  http.begin(DB_URL);
  int code = http.GET();

  if (code == 200) {
    String body = http.getString();
    body.replace("\"", "");
    body.trim();

    if (body.length() > 0) {
      Serial.println(">>> received: " + body);
    }

    if (body == "click")            { click(1); clearCommand(); }
    else if (body == "double")      { click(2); clearCommand(); }
    else if (body.startsWith("auto_")) {
      int n = body.substring(5).toInt();
      if (n > 0 && n <= 50) { click(n); clearCommand(); }
    }
  }
  http.end();
  delay(POLL_MS);
}
