// ===========================================================================
// spinner.ino - ESP32-C3 SuperMini (with built-in 0.42" 72x40 OLED)
// ---------------------------------------------------------------------------
// Continuously-rotating 360 servo controller. Phone UI writes desired state to
// Firebase RTDB at /spinner/state; this firmware polls every second and applies
// the new state to the servo. While the spinner is ON, the servo spins at the
// configured speed and direction. While OFF, the motor is pulsed at STOP_US
// (1500 us) and stops.
//
// Firebase state shape (single JSON object):
//   {
//     "on":        true | false,
//     "direction": "cw" | "ccw",
//     "speed":     0..100
//   }
//
// Wiring (three jumpers; same shape as autoclicker):
//   Servo signal (orange/yellow) -> ESP32 GPIO3
//   Servo VCC    (red)           -> ESP32 5V
//   Servo GND    (brown)         -> ESP32 GND
//
// OLED is the on-board 0.42" 72x40 SSD1306 (GPIO5=SDA, GPIO6=SCL on the
// SuperMini-with-OLED variant). U8g2 driver class: SSD1306_72X40_ER.
//
// OLED layout (5x7 font, ~10 px line pitch, 4 rows in 40 px):
//   Row 1 (y=7):  SPINNER      *      <- title + WiFi dot at top-right
//   Row 2 (y=17): ON  CW              <- state + direction (with arrow)
//   Row 3 (y=27): SPD 75%             <- speed percentage
//   Row 4 (y=33+): solid speed bar    <- visual speed gauge; replaced by a
//                                        transient status message ("updated",
//                                        "no wifi", IP address...) when needed.
//
// Polling cadence is 1 s by design (same as autoclicker's original poll loop
// before it moved to SSE). Continuous-rotation does not need sub-second
// responsiveness here - the user mostly toggles on/off and tweaks the slider.
//
// Library deps (Arduino IDE Library Manager):
//   - ESP32Servo  (by Kevin Harrington) - servo PWM on ESP32-C3
//   - U8g2        (by olikraus)          - SSD1306 driver
//   - WiFi / WiFiMulti / HTTPClient / Wire - all in the ESP32 core
//
// Board: "ESP32C3 Dev Module"   USB CDC On Boot: Enabled
// Baud:  115200
// ===========================================================================

#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <ESP32Servo.h>

// --- WiFi --------------------------------------------------------------------
// Same pool as the autoclicker / aircon / pocket-remote firmwares.
WiFiMulti wifiMulti;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;

// --- Firebase RTDB endpoint --------------------------------------------------
// Single JSON object at /spinner/state. We poll the .json REST endpoint with
// HTTPClient. Cert validation is left off (no secrets here) by relying on the
// HTTPClient's default insecure mode for https:// URLs without a CA.
const char* STATE_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/spinner/state.json";

// --- OLED --------------------------------------------------------------------
// On-board 0.42" 72x40 OLED on the ESP32-C3 SuperMini "with display" variant.
// U8g2 sets up I2C; we just point Wire at the right pins first.
U8G2_SSD1306_72X40_ER_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);
const int OLED_SDA = 5;
const int OLED_SCL = 6;

// --- Servo (360 continuous rotation) -----------------------------------------
// Pulse width = speed + direction (NOT angle). STOP_US is the neutral pulse;
// cheap CR servos rarely stop at exactly 1500 us, tweak STOP_US to 1480..1520
// if the horn creeps when speed=0.
//
// Speed maps linearly from 0..100 to 0..MAX_DEV_US deviation from STOP_US.
// CW  -> pulse = STOP_US - dev   (1500 down to 1500-MAX = 1000)
// CCW -> pulse = STOP_US + dev   (1500 up   to 1500+MAX = 2000)
// If the rotation direction is reversed for your wiring, swap the sign by
// inverting the boolean check in applyServo() or flipping CW/CCW in the phone
// UI - no firmware re-flash needed.
const int SERVO_PIN   = 3;
const int STOP_US     = 1500;
const int MAX_DEV_US  = 500;   // full-speed deviation either direction

Servo motor;

// --- Operating state ---------------------------------------------------------
// Mirrors what's in Firebase. Sensible defaults so the OLED shows something
// useful on first boot before the first poll completes.
bool spinOn   = false;
bool dirCW    = true;     // true = clockwise (pulse < STOP_US)
int  speedPct = 50;       // 0..100

// --- Poll loop bookkeeping ---------------------------------------------------
unsigned long lastPoll = 0;
const unsigned long POLL_INTERVAL_MS = 1000;

// --- OLED transient status ---------------------------------------------------
// Pops up over the speed bar for STATUS_HOLD_MS after a successful poll or an
// error, then the bar comes back. Keeps the display useful without flicker.
String        statusMsg   = "";
unsigned long statusUntil = 0;
const unsigned long STATUS_HOLD_MS = 1800;

void flashStatus(const String& msg) {
  statusMsg   = msg;
  statusUntil = millis() + STATUS_HOLD_MS;
}

// --- Servo: apply current state ---------------------------------------------
// Single source of truth for what pulse width to send to the servo. Called
// from setup() (initial stop) and any time a poll changes state.
void applyServo() {
  if (!spinOn || speedPct <= 0) {
    motor.writeMicroseconds(STOP_US);
    return;
  }
  int pct = speedPct;
  if (pct < 0)   pct = 0;
  if (pct > 100) pct = 100;
  int dev = (pct * MAX_DEV_US) / 100;
  int us  = dirCW ? (STOP_US - dev) : (STOP_US + dev);
  motor.writeMicroseconds(us);
}

// --- OLED: render one frame --------------------------------------------------
// Called every loop() iteration. U8g2 full-buffer mode means we redraw the
// whole 72x40 each time; at 50 Hz this is well within budget for the SSD1306.
void drawOled() {
  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tf);

  // Row 1: title + WiFi indicator (filled dot = connected; struck-through = not).
  oled.setCursor(0, 7);
  oled.print(F("SPINNER"));
  bool wifiOk = (WiFi.status() == WL_CONNECTED);
  oled.drawDisc(68, 3, 2);
  if (!wifiOk) {
    oled.drawHLine(64, 3, 9);   // strike through the dot
  }

  // Row 2: state + direction arrow.
  oled.setCursor(0, 17);
  if (spinOn) {
    oled.print(F("ON  "));
    oled.print(dirCW ? F("CW") : F("CCW"));
    // Direction arrow, right side. Triangle pointing right for CW, left for CCW.
    // Coordinates picked so the arrow sits to the right of the CW/CCW text and
    // inside the 72 px width.
    int ax = dirCW ? 56 : 62;
    int ay = 14;
    if (dirCW) {
      oled.drawTriangle(ax, ay, ax, ay + 6, ax + 6, ay + 3);
    } else {
      oled.drawTriangle(ax, ay, ax, ay + 6, ax - 6, ay + 3);
    }
  } else {
    oled.print(F("OFF"));
  }

  // Row 3: speed percentage.
  oled.setCursor(0, 27);
  oled.print(F("SPD "));
  oled.print(speedPct);
  oled.print(F("%"));

  // Row 4 (bottom strip): either the speed bar OR a transient status message.
  bool showStatus = (statusMsg.length() > 0) && (millis() < statusUntil);
  if (showStatus) {
    oled.setCursor(0, 39);
    oled.print(statusMsg);
  } else {
    // Speed bar: 72 px wide frame at y=33, height 5 px. Fill proportional.
    const int barX = 0, barY = 33, barW = 72, barH = 5;
    oled.drawFrame(barX, barY, barW, barH);
    int fillW = (speedPct * (barW - 2)) / 100;
    if (fillW > 0 && spinOn) {
      oled.drawBox(barX + 1, barY + 1, fillW, barH - 2);
    }
  }

  oled.sendBuffer();
}

// --- Tiny JSON helpers -------------------------------------------------------
// Body fits in ~50 bytes so we hand-parse with indexOf rather than pulling in
// ArduinoJson. Each helper returns true and writes the value through the
// pointer if it found the key.
static bool extractBool(const String& body, const char* key, bool* out) {
  String needle = String("\"") + key + "\":";
  int p = body.indexOf(needle);
  if (p < 0) return false;
  int s = p + needle.length();
  while (s < (int)body.length() && body[s] == ' ') s++;
  if (s + 4 <= (int)body.length() && body.substring(s, s + 4) == "true") {
    *out = true; return true;
  }
  if (s + 5 <= (int)body.length() && body.substring(s, s + 5) == "false") {
    *out = false; return true;
  }
  return false;
}

static bool extractInt(const String& body, const char* key, int* out) {
  String needle = String("\"") + key + "\":";
  int p = body.indexOf(needle);
  if (p < 0) return false;
  int s = p + needle.length();
  while (s < (int)body.length() && body[s] == ' ') s++;
  int e = s;
  if (e < (int)body.length() && (body[e] == '-' || body[e] == '+')) e++;
  while (e < (int)body.length() && isDigit(body[e])) e++;
  if (e == s) return false;
  *out = body.substring(s, e).toInt();
  return true;
}

static bool extractString(const String& body, const char* key, String* out) {
  String needle = String("\"") + key + "\":";
  int p = body.indexOf(needle);
  if (p < 0) return false;
  int s = body.indexOf('"', p + needle.length());
  if (s < 0) return false;
  int e = body.indexOf('"', s + 1);
  if (e < 0) return false;
  *out = body.substring(s + 1, e);
  return true;
}

// --- Poll Firebase -----------------------------------------------------------
// Fetch /spinner/state, parse out on/direction/speed, apply changes locally.
// Returns silently on transport errors so the OLED can keep refreshing.
void pollState() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.setTimeout(4000);
  if (!http.begin(STATE_URL)) {
    flashStatus(F("http err"));
    return;
  }
  int code = http.GET();
  if (code != 200) {
    http.end();
    flashStatus(String("http ") + code);
    return;
  }
  String body = http.getString();
  http.end();

  body.trim();
  if (body.length() == 0 || body == "null") return;

  bool newOn  = spinOn;
  bool newDir = dirCW;
  int  newSpd = speedPct;

  extractBool(body, "on", &newOn);
  String d;
  if (extractString(body, "direction", &d)) {
    d.toLowerCase();
    newDir = (d == "cw");
  }
  if (extractInt(body, "speed", &newSpd)) {
    if (newSpd < 0)   newSpd = 0;
    if (newSpd > 100) newSpd = 100;
  }

  bool changed = (newOn != spinOn) || (newDir != dirCW) || (newSpd != speedPct);
  spinOn   = newOn;
  dirCW    = newDir;
  speedPct = newSpd;
  if (changed) {
    applyServo();
    flashStatus(F("updated"));
  }
}

void setup() {
  Serial.begin(115200);

  // OLED must come up first so the user sees boot progress. Wire.setPins MUST
  // run BEFORE oled.begin() - U8g2 starts I2C on default pins otherwise and
  // the on-board OLED stays blank.
  Wire.setPins(OLED_SDA, OLED_SCL);
  oled.begin();
  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tf);
  oled.setCursor(0, 7);   oled.print(F("SPINNER"));
  oled.setCursor(0, 17);  oled.print(F("booting..."));
  oled.sendBuffer();

  // Servo init - attach to GPIO3 with standard 500..2400 us pulse range.
  // ESP32Servo allocates one of the four LEDC PWM channels under the hood.
  motor.setPeriodHertz(50);
  motor.attach(SERVO_PIN, 500, 2400);
  motor.writeMicroseconds(STOP_US);   // motor stopped at boot

  // WiFi pool - identical to autoclicker/aircon/pocket-remote so the spinner
  // joins whichever known network is reachable.
  wifiMulti.addAP("CAYNO",   "lokomoko");
  wifiMulti.addAP("Chaelri", "charlie24");

  oled.clearBuffer();
  oled.setCursor(0, 7);   oled.print(F("SPINNER"));
  oled.setCursor(0, 17);  oled.print(F("wifi..."));
  oled.sendBuffer();

  unsigned long t0 = millis();
  while (wifiMulti.run() != WL_CONNECTED && millis() - t0 < WIFI_CONNECT_TIMEOUT_MS) {
    delay(300);
  }
  // Wall-powered (or powerbank-powered) device; we want a hot radio for snappy
  // 1 s polls, so disable modem sleep like autoclicker does.
  WiFi.setSleep(false);

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi: " + WiFi.SSID() + " " + WiFi.localIP().toString());
    flashStatus(WiFi.localIP().toString());
    pollState();      // pick up whatever Firebase already has so we don't
                      // sit at defaults until the first scheduled poll
  } else {
    Serial.println("WiFi: not connected (will keep retrying)");
    flashStatus(F("no wifi"));
  }

  drawOled();
}

void loop() {
  unsigned long now = millis();

  // Background WiFi retry - WiFiMulti.run() is cheap when already connected,
  // and reconnects in place if the link dropped.
  static unsigned long lastWifiCheck = 0;
  if (now - lastWifiCheck >= 5000) {
    lastWifiCheck = now;
    wifiMulti.run();
  }

  if (now - lastPoll >= POLL_INTERVAL_MS) {
    lastPoll = now;
    pollState();
  }

  // Refresh the OLED at ~10 Hz - enough for the status message to feel
  // responsive without burning CPU on redraws.
  static unsigned long lastDraw = 0;
  if (now - lastDraw >= 100) {
    lastDraw = now;
    drawOled();
  }

  delay(5);
}
