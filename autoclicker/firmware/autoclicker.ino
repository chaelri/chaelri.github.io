// ===========================================================================
// autoclicker.ino — ESP32-C3 SuperMini firmware for the DIY WiFi auto-clicker
// ---------------------------------------------------------------------------
// Polls Firebase Realtime DB at /autoclicker/command every 1 s.
// On "click"  -> 1 pulse on GPIO3 (200 ms)
// On "double" -> 2 pulses, 150 ms apart
// On "auto_N" -> N pulses (1..50)
// After firing, clears the command field with an empty string.
//
// Switch element: 5V 1-channel relay module with optocoupler.
// IRF520 MOSFET module was tried first but failed — the ESP32-C3 GPIO is
// 3.3V and the IRF520 needs ~4–10 V Vgs to fully saturate. The relay's
// optocoupler input is happy with a 3.3 V drive, so this swap removes
// the level-shift problem entirely.
//
// Wiring (no soldering — male jumper pins press-fit into ESP32 holes):
//
//   ESP32 5V hole:
//     - red jumper #1 -> Relay VCC pin
//     - red jumper #2 (sandwiched) -> Relay COM screw   (load supply)
//   ESP32 GND hole:
//     - black jumper -> Relay GND pin
//     - solenoid wire 2 (bare, sandwiched with black pin) -> ESP32 GND
//   ESP32 GPIO3 hole:
//     - green jumper -> Relay IN pin
//   Relay NO screw:
//     - solenoid wire 1 (bare)
//   Relay NC screw: empty
//   USB-C charger -> ESP32 USB-C
//
// When IN is asserted, the coil energizes and COM connects to NO. That
// puts +5 V on solenoid wire 1; wire 2 is permanently at GND, so the
// coil energizes and the plunger fires.
//
// Polarity: most cheap optocoupler relay boards are Active-HIGH. If yours
// is Active-LOW (some are — solenoid fires at boot, or fires while idle),
// flip ACTIVE_LOW below to true and re-upload.
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
const int RELAY_PIN = 3;     // GPIO3 -> Relay IN
const int LED_PIN   = 8;     // GPIO8 -> onboard blue LED (active LOW, mirrors pulse)
const int CLICK_MS  = 200;   // pulse width per press
const int POLL_MS   = 1000;  // Firebase poll interval

// Flip to true if your relay module is Active-LOW (solenoid fires at boot
// or behaves inverted with the default).
const bool ACTIVE_LOW = false;

inline int relayOn()  { return ACTIVE_LOW ? LOW  : HIGH; }
inline int relayOff() { return ACTIVE_LOW ? HIGH : LOW;  }

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, relayOff());
  digitalWrite(LED_PIN, HIGH);   // LED off (active LOW: HIGH = off)

  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.println();
  Serial.println("WiFi connected: " + WiFi.localIP().toString());
}

void click(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(RELAY_PIN, relayOn());
    digitalWrite(LED_PIN, LOW);    // LED on (active LOW)
    delay(CLICK_MS);
    digitalWrite(RELAY_PIN, relayOff());
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
