// ===========================================================================
// pocket-remote.ino — ESP32-C3 + 0.42" OLED pocket remote.
// ---------------------------------------------------------------------------
// Battery-powered hand-held remote that talks to BOTH of Charlie's Firebase
// devices over WiFi:
//
//   - autoclicker (servo arm)   -> writes "toggle"          to /autoclicker/command
//   - aircon       (IR or servo) -> writes {"cmd":"click"}   to /aircon/command
//
// ONE BUTTON (the board's built-in BOOT button on GPIO9) does both jobs:
//
//   TAP  (<500 ms)  -> fire the current mode (LIGHTS or AIRCON).
//   HOLD (>=800 ms) -> flip the mode (LIGHTS <-> AIRCON). The new mode is
//                      persisted in NVS so it survives reboots and brown-outs.
//
// What the 72x40 OLED shows (live, refreshes every minute so the clock ticks):
//
//   Row 1 (y=7):  HH:MM ............... LIGHTS   <- time left, mode right
//   Row 2 (y=17): Thu, May 21                    <- day-of-week + date
//   Row 3 (y=27): in 42 days                     <- countdown to 2026-07-02 (Charlie's wedding)
//   Row 4 (y=37): [transient: "sent" / "no wifi" / etc.]
//
// All four rows use the u8g2_font_5x7_tf bitmap font (5x7 px glyphs, ~6 px
// advance) so the line spacing comes out to 10 px and the whole stack lands
// inside the 40 px visible area with a 3 px top/bottom margin.
//
// Time is pulled via NTP after WiFi associates. Philippines doesn't observe
// DST so the GMT offset is a static +8 hours. Until NTP settles the time
// rows show "syncing time..." (which gracefully covers the cold-boot window).
//
// Hardware (single rail, USB-C chargeable, no battery sense, no boost):
//
//   LiPo 3.7 V 1000 mAh  ->  TP4056 B+/B-           (protection + charging)
//   TP4056 OUT+/OUT-     ->  ESP32-C3 5V / GD       (LDO drops to 3.3 V)
//   USB-C charge cable   ->  TP4056 USB-C           (NOT the ESP32's own port)
//   BOOT button          ->  GPIO9, INPUT_PULLUP    (already on the board)
//   OLED                 ->  GPIO5 (SDA) / GPIO6 (SCL), already on the board
//
// You CAN keep using the device while it is plugged in -- the TP4056 with the
// DW01 protection IC powers the load and tops the battery up at the same time.
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

// --- WiFi --------------------------------------------------------------------
WiFiMulti wifiMulti;

// --- Firebase RTDB endpoints -------------------------------------------------
const char* CLICK_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/autoclicker/command.json";
const char* AC_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/aircon/command.json";

// --- OLED --------------------------------------------------------------------
U8G2_SSD1306_72X40_ER_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);
const int OLED_SDA = 5;
const int OLED_SCL = 6;

// --- Pins / timing -----------------------------------------------------------
const int BTN_PIN       = 9;       // BOOT button (active LOW, INPUT_PULLUP)
const unsigned long DEBOUNCE_MS    = 30;
const unsigned long TAP_MAX_MS     = 500;
const unsigned long HOLD_MS        = 800;
const unsigned long STATUS_HOLD_MS = 2500;

// --- Wedding countdown target (2026-07-02 PHT) -------------------------------
// Charlie + Karla's wedding day. Day-zero shows "WEDDING DAY", anything past
// shows "+Nd married" so the device stays useful past the date.
const int WED_YEAR  = 2026;
const int WED_MONTH = 7;    // 1-based for readability; converted at use site
const int WED_DAY   = 2;

// Operating modes ------------------------------------------------------------
// NVS uint8: 0 = LIGHTS (was MODE_CLICK in earlier sketches), 1 = AIRCON.
// The numeric values are preserved across the rename so existing NVS state
// from earlier firmware versions still loads correctly.
enum Mode { MODE_LIGHTS = 0, MODE_AIRCON = 1 };
Mode currentMode = MODE_LIGHTS;

Preferences prefs;

// Button state machine --------------------------------------------------------
bool          btnPressed   = false;
unsigned long btnDownAt    = 0;
unsigned long btnLastEdge  = 0;
int           btnLastLevel = HIGH;
bool          holdFired    = false;

// OLED status (bottom row) ----------------------------------------------------
// Transient messages (sent / fail / mode flip) win for STATUS_HOLD_MS, then
// the row reverts to a WiFi-derived default ("" when online, "no wifi" when
// offline). This keeps the bottom row meaningful without it being chatty.
String        transientMsg   = "";
unsigned long transientUntil = 0;
bool          needsRedraw    = true;

// ----------------------------------------------------------------------------
// NVS-backed mode persistence
// ----------------------------------------------------------------------------
void loadMode() {
  prefs.begin("remote", true);
  uint8_t m = prefs.getUChar("mode", MODE_LIGHTS);
  prefs.end();
  currentMode = (m == MODE_AIRCON) ? MODE_AIRCON : MODE_LIGHTS;
}

void saveMode() {
  prefs.begin("remote", false);
  prefs.putUChar("mode", (uint8_t)currentMode);
  prefs.end();
}

// ----------------------------------------------------------------------------
// Transient status helper -- "sent", "fail", "-> AIRCON", etc. expire after
// STATUS_HOLD_MS and the row falls back to a WiFi-derived default.
// ----------------------------------------------------------------------------
void flashStatus(const String& s) {
  transientMsg   = s;
  transientUntil = millis() + STATUS_HOLD_MS;
  needsRedraw    = true;
}

// ----------------------------------------------------------------------------
// OLED rendering -- 5x7 font for all four rows. Time row left-aligned, mode
// label right-aligned so they read as two distinct things at a glance.
// ----------------------------------------------------------------------------
static const char* DOW_NAMES[] = {"Sun","Mon","Tue","Wed","Thu","Fri","Sat"};
static const char* MON_NAMES[] = {"Jan","Feb","Mar","Apr","May","Jun","Jul",
                                  "Aug","Sep","Oct","Nov","Dec"};

void drawScreen() {
  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tf);

  time_t now = time(nullptr);
  struct tm lt;
  // Epoch > 2023-11 sentinel means NTP has synced. Pre-sync, time() returns
  // a small number (seconds since boot or the 1970 epoch) and we surface
  // "syncing time..." instead of nonsense like "00:00 Thu, Jan 1".
  bool haveTime = (now > 1700000000);
  if (haveTime) localtime_r(&now, &lt);

  const char* modeLabel = (currentMode == MODE_LIGHTS) ? "LIGHTS" : "AIRCON";

  // ---- Row 1 (y=7): time (left) + mode (right) -----------------------------
  char timeBuf[8];
  if (haveTime) snprintf(timeBuf, sizeof(timeBuf), "%02d:%02d", lt.tm_hour, lt.tm_min);
  else          strcpy(timeBuf, "--:--");
  oled.drawStr(0, 7, timeBuf);
  int mw = oled.getStrWidth(modeLabel);
  oled.drawStr(72 - mw, 7, modeLabel);

  // ---- Row 2 (y=17): day-of-week + date ------------------------------------
  char row2[20];
  if (haveTime) {
    snprintf(row2, sizeof(row2), "%s, %s %d",
             DOW_NAMES[lt.tm_wday], MON_NAMES[lt.tm_mon], lt.tm_mday);
  } else {
    strcpy(row2, "syncing time...");
  }
  oled.drawStr(0, 17, row2);

  // ---- Row 3 (y=27): days until 2026-07-02 PHT -----------------------------
  // mktime() interprets the struct tm as local time, which (after configTime
  // with a +8 h offset) is PHT. We zero today's clock too so both sides of
  // the subtraction are midnights and the diff is whole days.
  char row3[20];
  if (haveTime) {
    struct tm today = lt;
    today.tm_hour = 0; today.tm_min = 0; today.tm_sec = 0; today.tm_isdst = 0;
    time_t todayMid = mktime(&today);
    struct tm target = {0};
    target.tm_year  = WED_YEAR  - 1900;
    target.tm_mon   = WED_MONTH - 1;     // tm_mon is 0-indexed
    target.tm_mday  = WED_DAY;
    target.tm_isdst = 0;
    time_t targetMid = mktime(&target);
    long days = (long)((targetMid - todayMid) / 86400);
    if      (days  > 1) snprintf(row3, sizeof(row3), "in %ld days", days);
    else if (days == 1) strcpy(row3, "tomorrow!");
    else if (days == 0) strcpy(row3, "WEDDING DAY");
    else                snprintf(row3, sizeof(row3), "+%ldd married", -days);
  } else {
    row3[0] = '\0';
  }
  if (row3[0]) oled.drawStr(0, 27, row3);

  // ---- Row 4 (y=37): transient status or WiFi fallback ---------------------
  String row4;
  if (transientUntil > millis() && transientMsg.length() > 0) {
    row4 = transientMsg;
  } else if (WiFi.status() != WL_CONNECTED) {
    row4 = "no wifi";
  } else {
    row4 = "";
  }
  if (row4.length() > 0) {
    if (row4.length() > 14) row4 = row4.substring(0, 14);
    int sw = oled.getStrWidth(row4.c_str());
    oled.drawStr((72 - sw) / 2, 37, row4.c_str());
  }

  oled.sendBuffer();
}

// ----------------------------------------------------------------------------
// Firebase writes
// ----------------------------------------------------------------------------
bool putJson(const char* url, const char* body) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  if (!http.begin(url)) return false;
  http.addHeader("Content-Type", "application/json");
  int code = http.PUT(body);
  http.end();
  return (code >= 200 && code < 300);
}

bool fireLights() { return putJson(CLICK_URL, "\"toggle\""); }
bool fireAircon() { return putJson(AC_URL,    "{\"cmd\":\"click\"}"); }

// ----------------------------------------------------------------------------
// Tap / hold dispatch
// ----------------------------------------------------------------------------
void doTap() {
  if (WiFi.status() != WL_CONNECTED) {
    flashStatus("no wifi");
    return;
  }
  flashStatus("sending...");
  drawScreen();    // immediate feedback during the PUT (~100-300 ms)
  bool ok = (currentMode == MODE_LIGHTS) ? fireLights() : fireAircon();
  flashStatus(ok ? "sent" : "fail");
}

void doHold() {
  currentMode = (currentMode == MODE_LIGHTS) ? MODE_AIRCON : MODE_LIGHTS;
  saveMode();
  flashStatus(currentMode == MODE_LIGHTS ? "-> LIGHTS" : "-> AIRCON");
  Serial.printf("Mode flipped to %s\n",
                currentMode == MODE_LIGHTS ? "LIGHTS" : "AIRCON");
}

// ----------------------------------------------------------------------------
// Button polling -- debounced tap / hold state machine on GPIO9 (BOOT).
// ----------------------------------------------------------------------------
void readButton() {
  int level = digitalRead(BTN_PIN);
  unsigned long now = millis();

  if (level != btnLastLevel) {
    btnLastLevel = level;
    btnLastEdge  = now;
    return;
  }
  if (now - btnLastEdge < DEBOUNCE_MS) return;

  bool nowPressed = (level == LOW);
  if (nowPressed != btnPressed) {
    btnPressed = nowPressed;
    if (btnPressed) {
      btnDownAt = now;
      holdFired = false;
    } else {
      unsigned long heldFor = now - btnDownAt;
      if (!holdFired && heldFor <= TAP_MAX_MS) doTap();
    }
  } else if (btnPressed && !holdFired && (now - btnDownAt >= HOLD_MS)) {
    holdFired = true;
    doHold();
  }
}

// ----------------------------------------------------------------------------
// Setup / loop
// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  Wire.setPins(OLED_SDA, OLED_SCL);
  oled.begin();
  oled.setBusClock(400000);
  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tf);
  oled.drawStr(0, 10, "Pocket");
  oled.drawStr(0, 20, "Remote");
  oled.drawStr(0, 36, "booting...");
  oled.sendBuffer();

  pinMode(BTN_PIN, INPUT_PULLUP);
  loadMode();

  wifiMulti.addAP("CAYNO", "lokomoko");
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
    // NTP: Manila is GMT+8, no DST. Pool + Google as fallback so a flaky
    // pool server doesn't leave the clock stuck on "syncing time...".
    configTime(8 * 3600, 0, "pool.ntp.org", "time.google.com");
  } else {
    Serial.println("WiFi join failed -- will keep retrying in loop()");
  }

  drawScreen();
}

void loop() {
  readButton();

  // Auto-redraw when the minute changes so the on-screen clock ticks live.
  // Cheaper than a 1 Hz timer: we just compare against the last-rendered
  // minute and flag a redraw if it has rolled over.
  static int lastDrawnMin = -1;
  time_t now = time(nullptr);
  if (now > 1700000000) {
    struct tm lt;
    localtime_r(&now, &lt);
    if (lt.tm_min != lastDrawnMin) {
      lastDrawnMin = lt.tm_min;
      needsRedraw = true;
    }
  }

  // Expire transient status (sent / fail / mode flip) back to the WiFi
  // default so the bottom row doesn't sit on stale text.
  if (transientUntil > 0 && millis() > transientUntil) {
    transientUntil = 0;
    needsRedraw    = true;
  }

  // Cheap WiFi recovery -- wifiMulti.run() re-associates if it can.
  static unsigned long lastWifiCheck = 0;
  if (WiFi.status() != WL_CONNECTED && millis() - lastWifiCheck > 10000) {
    lastWifiCheck = millis();
    wifiMulti.run();
    needsRedraw = true;
  }

  if (needsRedraw) {
    needsRedraw = false;
    drawScreen();
  }

  delay(5);
}
