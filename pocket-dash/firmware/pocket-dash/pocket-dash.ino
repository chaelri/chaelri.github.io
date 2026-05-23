// ===========================================================================
// pocket-dash.ino -- ESP32-C3 SuperMini (built-in 0.42" OLED) + 4 tactile buttons.
// ---------------------------------------------------------------------------
// Pocket-sized WiFi dashboard with 3 screens and one-tap sibling toggles.
//
//   B1 (GPIO0)  MODE     -> cycles screens CLOCK -> TIMER -> MOOD -> CLOCK
//   B2 (GPIO1)  ACTION   -> context: on TIMER tap = start/pause, hold = reset;
//                           on MOOD  tap = next face,  hold = send to /tayo/moods
//                           on CLOCK = no-op
//   B3 (GPIO3)  LIGHTS   -> always fires "toggle" -> /autoclicker/command
//   B4 (GPIO4)  AIRCON   -> always fires {"cmd":"power"} -> /aircon/command
//
// 0.42" SSD1306 OLED is on the same I2C pins as the autoclicker/pocket-remote
// boards (GPIO5 SDA / GPIO6 SCL). Blue onboard LED is on GPIO8 (active LOW).
// All four buttons are wired to GND with INPUT_PULLUP doing the resistor side.
//
// Power: plug a USB-C mini powerbank straight into the ESP32-C3's USB-C port.
// No TP4056, no LiPo, no boost converter -- the powerbank IS the battery.
//
// Persistence (NVS, namespace "pdash"):
//   "scr"  uint8  current screen index (0=CLOCK, 1=TIMER, 2=MOOD)
//   "mood" uint8  last-selected mood index
//
// Board: "ESP32C3 Dev Module"   USB CDC On Boot: Enabled
// Baud:  115200
// ===========================================================================

#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <time.h>

// --- WiFi ------------------------------------------------------------------
WiFiMulti wifiMulti;

// --- Firebase RTDB endpoints ----------------------------------------------
const char* CLICK_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/autoclicker/command.json";
const char* AC_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/aircon/command.json";
// Mood ping POSTs to .../tayo/moods/charlie.json -- RTDB auto-generates the
// push-id child key so each mood gets its own entry in the feed.
const char* MOOD_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/tayo/moods/charlie.json";

// --- OLED ------------------------------------------------------------------
U8G2_SSD1306_72X40_ER_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);
const int OLED_SDA = 5;
const int OLED_SCL = 6;

// --- Pins / timing ---------------------------------------------------------
const int B_MODE_PIN   = 0;     // B1
const int B_ACTION_PIN = 1;     // B2
const int B_LIGHT_PIN  = 3;     // B3
const int B_AC_PIN     = 4;     // B4
const int LED_PIN      = 8;     // onboard blue LED, active LOW

const unsigned long DEBOUNCE_MS     = 25;
const unsigned long TAP_MAX_MS      = 500;
const unsigned long HOLD_MS         = 800;
const unsigned long STATUS_HOLD_MS  = 1800;
const unsigned long TIMER_TOTAL_MS  = 5UL * 60UL * 1000UL;   // 5:00
const unsigned long FLASH_PERIOD_MS = 280;                   // invert + LED beat

// --- Wedding countdown (2026-07-02 PHT) -----------------------------------
const int WED_YEAR  = 2026;
const int WED_MONTH = 7;
const int WED_DAY   = 2;

// --- Screens ---------------------------------------------------------------
enum Screen { SCR_CLOCK = 0, SCR_TIMER = 1, SCR_MOOD = 2, SCR_COUNT = 3 };
Screen currentScreen = SCR_CLOCK;

// --- Mood faces ------------------------------------------------------------
// Each face is hand-drawn with U8g2 primitives inside drawFace(). The name
// doubles as the label below the face and as the payload sent to Firebase.
struct MoodDef {
  const char* name;
  uint8_t     eye;     // 0=dots, 1=stars(+), 2=closed lines, 3=angry brows
  uint8_t     mouth;   // 0=smile, 1=frown, 2=flat, 3=o-mouth
  uint8_t     extra;   // 0=none,  1=z's, 2=little arms
};
const MoodDef MOODS[] = {
  { "HAPPY",    0, 0, 0 },
  { "SAD",      0, 1, 0 },
  { "IN LOVE",  1, 0, 0 },
  { "SLEEPY",   2, 3, 1 },
  { "ANGRY",    3, 2, 0 },
  { "NEED HUG", 0, 0, 2 },
};
const int MOOD_COUNT = sizeof(MOODS) / sizeof(MOODS[0]);
int moodIdx = 0;

// --- Timer state ----------------------------------------------------------
// timerEndMs:
//   0                  -> idle (showing 5:00)
//   millis() in future -> running
// timerDone:
//   true while the screen+LED are flashing at the end. Cleared by any button.
unsigned long timerEndMs    = 0;
bool          timerDone     = false;
bool          timerInvert   = false;
unsigned long timerLastBeat = 0;

// --- Button state machines (one Btn per physical button) ------------------
struct Btn {
  uint8_t       pin;
  bool          emitsHold;   // only B2 cares about hold
  int           lastLevel;
  bool          pressed;
  bool          holdFired;
  unsigned long lastEdge;
  unsigned long downAt;
};
Btn B[4] = {
  { (uint8_t)B_MODE_PIN,   false, HIGH, false, false, 0, 0 },
  { (uint8_t)B_ACTION_PIN, true,  HIGH, false, false, 0, 0 },
  { (uint8_t)B_LIGHT_PIN,  false, HIGH, false, false, 0, 0 },
  { (uint8_t)B_AC_PIN,     false, HIGH, false, false, 0, 0 },
};

// --- Transient status -----------------------------------------------------
// "sent lights" / "fail" / "paused" etc. -- wins the bottom strip of the
// current screen for STATUS_HOLD_MS, then disappears.
String        transientMsg   = "";
unsigned long transientUntil = 0;
bool          needsRedraw    = true;

Preferences prefs;

// ===========================================================================
// NVS persistence
// ===========================================================================
void loadState() {
  prefs.begin("pdash", true);
  uint8_t s = prefs.getUChar("scr",  SCR_CLOCK);
  uint8_t m = prefs.getUChar("mood", 0);
  prefs.end();
  currentScreen = (s < SCR_COUNT)   ? (Screen)s : SCR_CLOCK;
  moodIdx       = (m < MOOD_COUNT)  ? (int)m    : 0;
}
void saveScreen() { prefs.begin("pdash", false); prefs.putUChar("scr",  (uint8_t)currentScreen); prefs.end(); }
void saveMood()   { prefs.begin("pdash", false); prefs.putUChar("mood", (uint8_t)moodIdx);       prefs.end(); }

// ===========================================================================
// Status helpers
// ===========================================================================
void flashStatus(const String& s) {
  transientMsg   = s;
  transientUntil = millis() + STATUS_HOLD_MS;
  needsRedraw    = true;
}

// ===========================================================================
// Time helpers
// ===========================================================================
static const char* DOW_NAMES[] = {"Sun","Mon","Tue","Wed","Thu","Fri","Sat"};
static const char* MON_NAMES[] = {"Jan","Feb","Mar","Apr","May","Jun","Jul",
                                  "Aug","Sep","Oct","Nov","Dec"};

bool getManilaTime(struct tm& lt) {
  time_t now = time(nullptr);
  if (now < 1700000000) return false;     // NTP not yet synced
  localtime_r(&now, &lt);
  return true;
}

long daysToWedding(const struct tm& lt) {
  struct tm today = lt;
  today.tm_hour = 0; today.tm_min = 0; today.tm_sec = 0; today.tm_isdst = 0;
  time_t todayMid = mktime(&today);
  struct tm target = {0};
  target.tm_year  = WED_YEAR  - 1900;
  target.tm_mon   = WED_MONTH - 1;
  target.tm_mday  = WED_DAY;
  target.tm_isdst = 0;
  time_t targetMid = mktime(&target);
  return (long)((targetMid - todayMid) / 86400);
}

// ===========================================================================
// Drawing -- one function per screen, all called from drawScreen() so the
// transient status overlay can be applied consistently.
// ===========================================================================
void drawCentered(const char* s, int y) {
  int w = oled.getStrWidth(s);
  oled.drawStr((72 - w) / 2, y, s);
}

void drawClockScreen() {
  struct tm lt;
  bool haveTime = getManilaTime(lt);

  // Big HH:MM in logisoso16 digits, AM/PM tucked next to it in 5x7.
  char hhmm[8] = "--:--";
  const char* ampm = "  ";
  if (haveTime) {
    int h12 = lt.tm_hour % 12; if (h12 == 0) h12 = 12;
    snprintf(hhmm, sizeof(hhmm), "%d:%02d", h12, lt.tm_min);
    ampm = (lt.tm_hour < 12) ? "AM" : "PM";
  }

  oled.setFont(u8g2_font_logisoso16_tn);
  int wTime = oled.getStrWidth(hhmm);
  oled.setFont(u8g2_font_5x7_tf);
  int wAmpm = oled.getStrWidth(ampm);
  int totalW = wTime + 2 + wAmpm;
  int xStart = (72 - totalW) / 2;
  if (xStart < 0) xStart = 0;

  oled.setFont(u8g2_font_logisoso16_tn);
  oled.drawStr(xStart, 17, hhmm);
  oled.setFont(u8g2_font_5x7_tf);
  oled.drawStr(xStart + wTime + 2, 17, ampm);

  // Date + countdown (or "syncing..." if no NTP yet).
  if (haveTime) {
    char row2[20];
    snprintf(row2, sizeof(row2), "%s, %s %d",
             DOW_NAMES[lt.tm_wday], MON_NAMES[lt.tm_mon], lt.tm_mday);
    drawCentered(row2, 28);

    char row3[20];
    long d = daysToWedding(lt);
    if      (d  > 1) snprintf(row3, sizeof(row3), "in %ld days", d);
    else if (d == 1) strcpy(row3, "tomorrow!");
    else if (d == 0) strcpy(row3, "WEDDING DAY");
    else             snprintf(row3, sizeof(row3), "+%ldd married", -d);
    drawCentered(row3, 38);
  } else {
    drawCentered("syncing...", 28);
    drawCentered(WiFi.status() == WL_CONNECTED ? "ntp pending" : "no wifi", 38);
  }
}

void drawTimerScreen() {
  long remainMs;
  if (timerDone)             remainMs = 0;
  else if (timerEndMs > 0)   remainMs = (long)timerEndMs - (long)millis();
  else                       remainMs = TIMER_TOTAL_MS;
  if (remainMs < 0) remainMs = 0;

  int totalSec = (remainMs + 999) / 1000;
  int mm = totalSec / 60;
  int ss = totalSec % 60;

  // Title + digits
  oled.setFont(u8g2_font_5x7_tf);
  drawCentered(timerDone ? "TIME UP" : "TIMER", 8);

  char digits[8];
  snprintf(digits, sizeof(digits), "%d:%02d", mm, ss);
  oled.setFont(u8g2_font_logisoso16_tn);
  int w = oled.getStrWidth(digits);
  oled.drawStr((72 - w) / 2, 29, digits);

  // Hint
  oled.setFont(u8g2_font_5x7_tf);
  const char* hint;
  if (timerDone)              hint = "any to dismiss";
  else if (timerEndMs > 0)    hint = "tap=pause";
  else                        hint = "tap to start";
  drawCentered(hint, 38);
}

// Draw a 28-px diameter mood face centered at (cx, cy). Uses U8g2 primitives
// only -- no bitmap atlas -- so adding a new face is just another switch arm.
void drawFace(int cx, int cy, int idx) {
  const MoodDef& m = MOODS[idx];

  // Head outline
  oled.drawCircle(cx, cy, 12);

  // Eyes
  switch (m.eye) {
    case 0:  // dots
      oled.drawDisc(cx - 4, cy - 3, 1);
      oled.drawDisc(cx + 4, cy - 3, 1);
      break;
    case 1:  // stars/twinkle (+)
      oled.drawHLine(cx - 6, cy - 3, 5);
      oled.drawVLine(cx - 4, cy - 5, 5);
      oled.drawHLine(cx + 2, cy - 3, 5);
      oled.drawVLine(cx + 4, cy - 5, 5);
      break;
    case 2:  // closed (sleepy lines)
      oled.drawHLine(cx - 6, cy - 3, 4);
      oled.drawHLine(cx + 2, cy - 3, 4);
      break;
    case 3:  // angry brows + dots
      oled.drawLine(cx - 7, cy - 5, cx - 1, cy - 2);
      oled.drawLine(cx + 7, cy - 5, cx + 1, cy - 2);
      oled.drawPixel(cx - 4, cy - 1);
      oled.drawPixel(cx + 4, cy - 1);
      break;
  }

  // Mouth
  switch (m.mouth) {
    case 0:  // smile (lower-half ellipse)
      oled.drawEllipse(cx, cy + 3, 4, 3,
                       U8G2_DRAW_LOWER_LEFT | U8G2_DRAW_LOWER_RIGHT);
      break;
    case 1:  // frown (upper-half ellipse)
      oled.drawEllipse(cx, cy + 6, 4, 3,
                       U8G2_DRAW_UPPER_LEFT | U8G2_DRAW_UPPER_RIGHT);
      break;
    case 2:  // flat
      oled.drawHLine(cx - 4, cy + 4, 9);
      break;
    case 3:  // small "o"
      oled.drawCircle(cx, cy + 4, 1);
      break;
  }

  // Extras
  switch (m.extra) {
    case 1: { // sleepy z's outside the top-right of the head
      oled.setFont(u8g2_font_5x7_tf);
      oled.drawStr(cx + 11, cy - 8, "z");
      oled.drawStr(cx + 15, cy - 3, "z");
      break;
    }
    case 2: { // arms (hugs) outside both sides
      oled.drawCircle(cx - 14, cy + 4, 3, U8G2_DRAW_UPPER_RIGHT);
      oled.drawCircle(cx + 14, cy + 4, 3, U8G2_DRAW_UPPER_LEFT);
      break;
    }
  }
}

void drawMoodScreen() {
  oled.setFont(u8g2_font_5x7_tf);
  drawCentered("HOW R U?", 7);

  drawFace(36, 22, moodIdx);

  oled.setFont(u8g2_font_5x7_tf);
  drawCentered(MOODS[moodIdx].name, 38);
}

// Master draw: clear, paint the current screen, overlay transient status,
// honor the timer-done invert flag.
void drawScreen() {
  oled.clearBuffer();

  // Timer-done invert: fill the buffer white, then draw text in black.
  if (timerDone && timerInvert) {
    oled.setDrawColor(1);
    oled.drawBox(0, 0, 72, 40);
    oled.setDrawColor(0);
  } else {
    oled.setDrawColor(1);
  }

  switch (currentScreen) {
    case SCR_CLOCK: drawClockScreen(); break;
    case SCR_TIMER: drawTimerScreen(); break;
    case SCR_MOOD:  drawMoodScreen();  break;
    default: break;
  }

  // Transient overlay: clear the bottom strip and write the message centered.
  // Skipped during the timer-done flash so the flashing isn't fighting toast.
  if (!timerDone &&
      transientUntil > millis() &&
      transientMsg.length() > 0) {
    oled.setDrawColor(0);
    oled.drawBox(0, 31, 72, 9);
    oled.setDrawColor(1);
    oled.setFont(u8g2_font_5x7_tf);
    String row = transientMsg;
    if (row.length() > 13) row = row.substring(0, 13);
    int w = oled.getStrWidth(row.c_str());
    oled.drawStr((72 - w) / 2, 38, row.c_str());
  }

  oled.setDrawColor(1);
  oled.sendBuffer();
}

// ===========================================================================
// Firebase writes -- single thin helper, three callers.
// ===========================================================================
bool putJson(const char* url, const char* body) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  if (!http.begin(url)) return false;
  http.addHeader("Content-Type", "application/json");
  int code = http.PUT(body);
  http.end();
  return (code >= 200 && code < 300);
}

bool postJson(const char* url, const char* body) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  if (!http.begin(url)) return false;
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  http.end();
  return (code >= 200 && code < 300);
}

bool fireLights() { return putJson(CLICK_URL, "\"toggle\""); }
bool fireAircon() { return putJson(AC_URL,    "{\"cmd\":\"power\"}"); }

bool sendMood(int idx) {
  // RTDB server timestamp -- replaced by epoch-millis server-side, so the
  // Tayo PWA sees a reliable number even if local NTP is wonky.
  char body[160];
  snprintf(body, sizeof(body),
    "{\"emotion\":\"%s\",\"ts\":{\".sv\":\"timestamp\"},\"source\":\"pocket-dash\"}",
    MOODS[idx].name);
  return postJson(MOOD_URL, body);
}

// ===========================================================================
// Dispatch -- per-button + per-screen action mapping.
// ===========================================================================

void cycleScreen() {
  currentScreen = (Screen)((currentScreen + 1) % SCR_COUNT);
  saveScreen();
  needsRedraw = true;
}

void timerToggle() {
  if (timerEndMs == 0) {
    timerEndMs = millis() + TIMER_TOTAL_MS;
    flashStatus("start 5:00");
  } else {
    timerEndMs = 0;            // pause -> back to idle (5:00)
    flashStatus("paused");
  }
  needsRedraw = true;
}

void timerResetAction() {
  timerEndMs = 0;
  timerDone  = false;
  digitalWrite(LED_PIN, HIGH);  // LED off
  flashStatus("reset 5:00");
  needsRedraw = true;
}

// Common entry for the on-MOOD hold and for the Lights/Aircon taps -- they
// all do "paint sending..., fire, paint result".
void firePut(bool (*fn)(), const char* okLabel) {
  if (WiFi.status() != WL_CONNECTED) { flashStatus("no wifi"); return; }
  flashStatus("sending...");
  drawScreen();
  flashStatus(fn() ? okLabel : "fail");
}

void doMoodSend() {
  if (WiFi.status() != WL_CONNECTED) { flashStatus("no wifi"); return; }
  flashStatus("sending...");
  drawScreen();
  bool ok = sendMood(moodIdx);
  flashStatus(ok ? "sent mood" : "fail");
}

// B2 tap behavior is screen-dependent. CLOCK = no-op.
void actionTap() {
  switch (currentScreen) {
    case SCR_CLOCK: break;
    case SCR_TIMER: timerToggle(); break;
    case SCR_MOOD:
      moodIdx = (moodIdx + 1) % MOOD_COUNT;
      saveMood();
      needsRedraw = true;
      break;
    default: break;
  }
}

// B2 hold behavior is also screen-dependent. CLOCK = no-op.
void actionHold() {
  switch (currentScreen) {
    case SCR_CLOCK: break;
    case SCR_TIMER: timerResetAction(); break;
    case SCR_MOOD:  doMoodSend(); break;
    default: break;
  }
}

void dispatchTap(int i) {
  // Any button press while the timer-done flash is active just dismisses it
  // (and the button does NOT also fire its normal action -- consistent w/
  // the way an alarm clock works).
  if (timerDone) {
    timerDone = false;
    timerEndMs = 0;
    digitalWrite(LED_PIN, HIGH);
    needsRedraw = true;
    return;
  }
  switch (i) {
    case 0: cycleScreen();                       break;  // B1 MODE
    case 1: actionTap();                         break;  // B2 ACTION
    case 2: firePut(&fireLights, "sent lights"); break;  // B3 LIGHTS
    case 3: firePut(&fireAircon, "sent aircon"); break;  // B4 AIRCON
  }
}

void dispatchHold(int i) {
  if (timerDone) {
    timerDone = false;
    timerEndMs = 0;
    digitalWrite(LED_PIN, HIGH);
    needsRedraw = true;
    return;
  }
  if (i == 1) actionHold();   // only B2 emits hold
}

// ===========================================================================
// Button polling
// ===========================================================================
void scanButtons() {
  unsigned long now = millis();
  for (int i = 0; i < 4; i++) {
    Btn& b = B[i];
    int level = digitalRead(b.pin);
    if (level != b.lastLevel) { b.lastLevel = level; b.lastEdge = now; continue; }
    if (now - b.lastEdge < DEBOUNCE_MS) continue;

    bool nowPressed = (level == LOW);
    if (nowPressed != b.pressed) {
      b.pressed = nowPressed;
      if (b.pressed) {
        b.downAt    = now;
        b.holdFired = false;
      } else {
        if (!b.holdFired && (now - b.downAt) <= TAP_MAX_MS) dispatchTap(i);
      }
    } else if (b.pressed && !b.holdFired &&
               b.emitsHold && (now - b.downAt) >= HOLD_MS) {
      b.holdFired = true;
      dispatchHold(i);
    }
  }
}

// ===========================================================================
// Setup / loop
// ===========================================================================
void setup() {
  Serial.begin(115200);

  Wire.setPins(OLED_SDA, OLED_SCL);
  oled.begin();
  oled.setBusClock(400000);
  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tf);
  oled.drawStr(0, 10, "Pocket");
  oled.drawStr(0, 20, "Dash");
  oled.drawStr(0, 36, "booting...");
  oled.sendBuffer();

  // Buttons -- internal pull-up, switch closes to GND.
  for (int i = 0; i < 4; i++) pinMode(B[i].pin, INPUT_PULLUP);

  // Blue LED on GPIO8 is active LOW; HIGH = off.
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);

  loadState();

  wifiMulti.addAP("CAYNO",   "lokomoko");
  wifiMulti.addAP("Chaelri", "charlie24");
  WiFi.mode(WIFI_STA);

  unsigned long t0 = millis();
  while (wifiMulti.run() != WL_CONNECTED && millis() - t0 < 15000) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("WiFi: %s  IP: %s\n",
                  WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
    // Manila is GMT+8, no DST. Two NTP servers for resilience.
    configTime(8 * 3600, 0, "pool.ntp.org", "time.google.com");
  } else {
    Serial.println("WiFi join failed -- will keep retrying in loop()");
  }

  drawScreen();
}

void loop() {
  scanButtons();

  unsigned long now = millis();

  // ---- Timer reaching zero --> enter the flashing "TIME UP" state --------
  if (!timerDone && timerEndMs != 0 && now >= timerEndMs) {
    timerEndMs    = 0;
    timerDone     = true;
    timerInvert   = false;
    timerLastBeat = now;
    digitalWrite(LED_PIN, LOW);   // LED on (active LOW)
    needsRedraw   = true;
  }

  // ---- Timer-done beat: flip invert + LED every FLASH_PERIOD_MS ----------
  if (timerDone && (now - timerLastBeat) >= FLASH_PERIOD_MS) {
    timerLastBeat = now;
    timerInvert   = !timerInvert;
    digitalWrite(LED_PIN, timerInvert ? LOW : HIGH);
    needsRedraw   = true;
  }

  // ---- Live tick for whichever screen is showing -------------------------
  static int lastSec = -1;
  static unsigned long lastTimerDraw = 0;
  time_t tnow = time(nullptr);
  if (tnow > 1700000000) {
    struct tm lt; localtime_r(&tnow, &lt);
    if (currentScreen == SCR_CLOCK && lt.tm_sec != lastSec) {
      lastSec     = lt.tm_sec;
      needsRedraw = true;
    }
  }
  if (currentScreen == SCR_TIMER && timerEndMs != 0 &&
      (now - lastTimerDraw) >= 100) {
    lastTimerDraw = now;
    needsRedraw   = true;
  }

  // ---- Transient status expiry ------------------------------------------
  if (transientUntil > 0 && now > transientUntil) {
    transientUntil = 0;
    needsRedraw    = true;
  }

  // ---- Cheap WiFi recovery ----------------------------------------------
  static unsigned long lastWifiCheck = 0;
  if (WiFi.status() != WL_CONNECTED && now - lastWifiCheck > 10000) {
    lastWifiCheck = now;
    wifiMulti.run();
    needsRedraw   = true;
  }

  if (needsRedraw) {
    needsRedraw = false;
    drawScreen();
  }

  delay(5);
}
