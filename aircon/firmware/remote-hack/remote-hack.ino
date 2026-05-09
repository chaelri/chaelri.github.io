// ===========================================================================
// remote-hack.ino — ESP32 electronically "presses" the real TCL remote's
// buttons by shorting their PCB contacts. Bypasses all IR protocol guessing.
// ---------------------------------------------------------------------------
// CONCEPT:
//   Inside the TCL remote, each button is two carbon pads on the PCB. When
//   you press the rubber, a conductive disc shorts the two pads together,
//   and the remote's chip detects this and fires the IR signal. We do the
//   exact same thing electrically: ESP32 GPIO pulled LOW briefly = pads
//   shorted = button "pressed" = real IR fires from the real remote.
//
// WHY THIS IS GUARANTEED TO WORK:
//   The remote already controls your aircon perfectly. We're not faking
//   anything — we're literally pressing its buttons via wire.
//
// VERSION 1 — POWER ONLY:
//   Just toggles aircon on/off via the remote's POWER button. Once this
//   works, we expand to TEMP+/TEMP-/MODE/FAN (one wire per button).
//
// WIRING (3 wires total — uses scrap wires you already have, no extra parts):
//
//   ESP32 GPIO4 -----------------> PCB pad A of POWER button (inside remote)
//   ESP32 GND   -----------------> PCB pad B of POWER button (inside remote)
//   ESP32 GND   -----------------> Remote's battery GND (any battery -)
//
//   Last wire is the "common ground reference." Without it the signal floats.
//
//   Keep the remote's batteries IN. The remote's chip still runs normally,
//   we're just simulating button presses electrically.
//
// SAFE GPIO TECHNIQUE:
//   We NEVER drive GPIO4 HIGH (would push 3.3V into the remote's 3V chip).
//   We only switch between INPUT (high-impedance, button "released") and
//   OUTPUT-LOW (shorts to GND, button "pressed"). Voltage-safe across the
//   ESP32/remote domains.
// ===========================================================================

#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>

// --- Pins --------------------------------------------------------------------
const int POWER_PIN = 4;     // GPIO4 -> remote's POWER button pad A
const int LED_PIN   = 8;     // onboard blue LED, active LOW
const int PRESS_HOLD_MS = 120;   // how long to "hold" the button

// --- WiFi --------------------------------------------------------------------
WiFiMulti wifiMulti;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;

// --- Firebase RTDB -----------------------------------------------------------
const char* DB_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/aircon/command.json";
const char* STATE_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/aircon/state.json";
const int POLL_MS = 1000;

// --- Local state -------------------------------------------------------------
bool powerOn = false;

void releaseButton(int pin) {
  pinMode(pin, INPUT);                 // high-impedance = button up
}
void pressButton(int pin) {
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);              // short to GND = button pressed
  delay(PRESS_HOLD_MS);
  releaseButton(pin);
}

void pressPower() {
  digitalWrite(LED_PIN, LOW);          // onboard LED on while pressing
  Serial.println("PRESS power");
  pressButton(POWER_PIN);
  digitalWrite(LED_PIN, HIGH);
}

void publishState() {
  HTTPClient http;
  http.begin(STATE_URL);
  http.addHeader("Content-Type", "application/json");
  String body = "{\"power\":\"";
  body += (powerOn ? "on" : "off");
  body += "\"}";
  http.PUT(body);
  http.end();
}

void clearCommand() {
  HTTPClient http;
  http.begin(DB_URL);
  http.addHeader("Content-Type", "application/json");
  http.PUT("\"\"");
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);
  releaseButton(POWER_PIN);            // start with button "up"

  wifiMulti.addAP("CAYNO", "lokomoko");
  wifiMulti.addAP("Charlie's iPhone", "charlie24");

  Serial.print("Connecting WiFi");
  unsigned long t0 = millis();
  while (wifiMulti.run() != WL_CONNECTED && millis() - t0 < WIFI_CONNECT_TIMEOUT_MS) {
    delay(300); Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi: " + WiFi.SSID() + " · " + WiFi.localIP().toString());
  } else {
    Serial.println("WiFi failed — running offline (no Firebase poll).");
  }

  publishState();
  Serial.println("\nReady. Tap power on the phone remote.");
  Serial.println("Onboard blue LED will flash on every button-press.\n");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    delay(500);
    return;
  }

  static unsigned long lastPoll = 0;
  if (millis() - lastPoll < POLL_MS) { delay(2); return; }
  lastPoll = millis();

  HTTPClient http;
  http.begin(DB_URL);
  int code = http.GET();
  if (code == 200) {
    String body = http.getString();
    body.trim();
    if (body.length() > 2 && body != "null" && body != "\"\"") {
      Serial.println(">>> received: " + body);

      // Naive parse of "power":"on" / "power":"off"
      bool wantOn = (body.indexOf("\"power\":\"on\"") >= 0);
      bool wantOff = (body.indexOf("\"power\":\"off\"") >= 0);

      if ((wantOn && !powerOn) || (wantOff && powerOn)) {
        pressPower();                  // toggle the real remote's POWER
        powerOn = wantOn;
        publishState();
      } else {
        Serial.println("(no power-state change — skipping press)");
      }
      clearCommand();
    }
  }
  http.end();
}
