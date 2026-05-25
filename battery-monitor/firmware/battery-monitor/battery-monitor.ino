// ===========================================================================
// battery-monitor.ino — ESP32-C3 + 0.42" OLED desk battery widget.
// ---------------------------------------------------------------------------
// LiPo 1000 mAh on a TP4056 (USB-C charge + DW01 protection). The ESP32-C3
// reads two things off the board:
//
//   - Battery voltage   -> GPIO3 (ADC1_CH3) via a 220k / 100k divider.
//   - Charging state    -> GPIO4, wired to the TP4056 CHRG pad.
//                          CHRG is open-drain inside the TP4056: pulled to
//                          GND while a charge cycle is active, floating
//                          otherwise. With INPUT_PULLUP on the ESP32 side
//                          we read LOW = charging, HIGH = not charging.
//
// What the 72x40 OLED shows (refreshes every second so the bolt animates):
//
//   Row 1 (y=10): HH:MM AM/PM            (large-ish, centered)
//   Row 2 (y=22): Mon May 25             (date, centered)
//   Row 3 (y=37): [icon]  62%   <state>  (battery + percent + state glyph)
//
// "state" is one of:
//   "CHG"  while charging (animated lightning bolt over the icon)
//   "FULL" when not charging AND battery >= 95%
//   ""     when discharging (just the bar level + percentage)
//
// Time is pulled via NTP after WiFi associates. Philippines = GMT+8, no DST.
// Until NTP settles, the time row shows "--:--" and the date is hidden so
// the cold-boot window doesn't render nonsense like "Thu Jan 1".
//
// Hardware (USB-C chargeable, no boost, no protection beyond the TP4056):
//
//   LiPo 3.7 V 1000 mAh -> TP4056 B+/B-          (charge + DW01 protection)
//   TP4056 OUT+/OUT-    -> ESP32-C3 5V / GD      (onboard LDO drops to 3.3 V)
//   TP4056 OUT+         -> 220k -> GPIO3 -> 100k -> GND   (battery sense)
//   TP4056 CHRG pad     -> GPIO4                 (active-LOW, INPUT_PULLUP)
//   USB-C cable         -> TP4056 USB-C          (NOT the ESP32's port)
//   OLED                -> GPIO5 (SDA) / GPIO6 (SCL), already on the board
//
// Use-while-charging works because of the TP4056 + DW01 pairing -- USB-C
// runs the load and tops up the cell at the same time.
//
// Board: "ESP32C3 Dev Module"   USB CDC On Boot: Enabled
// Baud:  115200
// ===========================================================================

#include <WiFi.h>
#include <WiFiMulti.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <time.h>

// --- WiFi --------------------------------------------------------------------
WiFiMulti wifiMulti;

// --- OLED --------------------------------------------------------------------
U8G2_SSD1306_72X40_ER_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);
const int OLED_SDA = 5;
const int OLED_SCL = 6;

// --- Pins --------------------------------------------------------------------
const int BAT_ADC_PIN = 3;   // ADC1_CH3 -- battery sense (220k / 100k divider)
const int CHRG_PIN    = 4;   // TP4056 CHRG -- LOW while charging

// --- Battery calibration -----------------------------------------------------
// Divider: V_pin = V_bat * R_low / (R_high + R_low).
// With R_high = 220k and R_low = 100k, ratio is 100 / 320 = 0.3125, so V_bat
// is V_pin * (R_high + R_low) / R_low = V_pin * 3.20.
// V_BAT_FULL / V_BAT_EMPTY are the endpoints we map 0-100% across. 3.30 V is
// where the DW01 protection cuts the cell so anything below that is moot.
const float DIVIDER_RATIO = 3.20f;
const float V_BAT_FULL    = 4.20f;
const float V_BAT_EMPTY   = 3.30f;
const int   ADC_SAMPLES   = 16;   // averaged per read to smooth ADC noise

// --- Wedding countdown target (2026-07-02 PHT) -------------------------------
const int WED_YEAR  = 2026;
const int WED_MONTH = 7;
const int WED_DAY   = 2;

// --- Day/month name tables (5x7 friendly) ------------------------------------
static const char* DOW_NAMES[] = {"Sun","Mon","Tue","Wed","Thu","Fri","Sat"};
static const char* MON_NAMES[] = {"Jan","Feb","Mar","Apr","May","Jun","Jul",
                                  "Aug","Sep","Oct","Nov","Dec"};

// ----------------------------------------------------------------------------
// Battery read -- average a handful of analogReadMilliVolts() samples so the
// percentage doesn't jitter every redraw. analogReadMilliVolts uses the eFuse
// calibration on the C3, which is far more accurate than raw analogRead().
// ----------------------------------------------------------------------------
float readBatteryVolts() {
  uint32_t acc = 0;
  for (int i = 0; i < ADC_SAMPLES; i++) {
    acc += analogReadMilliVolts(BAT_ADC_PIN);
    delay(2);
  }
  float vPin = (acc / (float)ADC_SAMPLES) / 1000.0f;   // mV avg -> V
  return vPin * DIVIDER_RATIO;
}

int voltsToPercent(float v) {
  float pct = (v - V_BAT_EMPTY) / (V_BAT_FULL - V_BAT_EMPTY) * 100.0f;
  if (pct < 0)   pct = 0;
  if (pct > 100) pct = 100;
  return (int)(pct + 0.5f);
}

bool isCharging() {
  // INPUT_PULLUP + open-drain CHRG = LOW means a charge cycle is active.
  // When the cell is full the TP4056 stops driving CHRG, so it floats high
  // and we read HIGH (= not charging, possibly "full" depending on V_bat).
  return digitalRead(CHRG_PIN) == LOW;
}

// ----------------------------------------------------------------------------
// Custom battery icon -- u8g2 doesn't ship one tiny enough for 72x40, so we
// draw a 18x10 outline at (x, y) with a 2x4 positive-terminal nub on the
// right. fillPct in [0,100] decides how much of the inside is solid.
// When charging, the caller layers drawBolt() on top.
// ----------------------------------------------------------------------------
void drawBatteryIcon(int x, int y, int fillPct) {
  oled.drawFrame(x, y, 18, 10);            // outer body
  oled.drawBox  (x + 18, y + 3, 2, 4);     // positive nub
  int innerW = 14;                          // 18 - 2 (border) - 2 (gap)
  int barW = (innerW * fillPct + 50) / 100;
  if (barW > 0) oled.drawBox(x + 2, y + 2, barW, 6);
}

// Animated lightning bolt for the charging state. `frame` is incremented every
// redraw so the bolt blinks at ~1 Hz alongside the rest of the screen.
void drawBolt(int x, int y, int frame) {
  if ((frame & 1) == 0) return;            // blink: even frames = bolt hidden
  // Tiny 5-pixel zig-zag, eyeballed for the 18x10 icon. Centered on the icon.
  oled.drawLine(x + 9,  y + 1, x + 7,  y + 5);
  oled.drawLine(x + 7,  y + 5, x + 11, y + 5);
  oled.drawLine(x + 11, y + 5, x + 9,  y + 9);
}

// ----------------------------------------------------------------------------
// OLED rendering -- three rows, 5x7 font, time row centered and slightly
// taller via the 6x10 font so it reads as the focal point.
// ----------------------------------------------------------------------------
void drawScreen(float vBat, int pct, bool charging, int frame) {
  oled.clearBuffer();

  time_t now = time(nullptr);
  struct tm lt;
  bool haveTime = (now > 1700000000);
  if (haveTime) localtime_r(&now, &lt);

  // ---- Row 1 (y=10): time HH:MM AM/PM, centered, 6x10 font -----------------
  oled.setFont(u8g2_font_6x10_tf);
  char timeBuf[12];
  if (haveTime) {
    int h12 = lt.tm_hour % 12;
    if (h12 == 0) h12 = 12;
    const char* ampm = (lt.tm_hour < 12) ? "AM" : "PM";
    snprintf(timeBuf, sizeof(timeBuf), "%d:%02d %s", h12, lt.tm_min, ampm);
  } else {
    strcpy(timeBuf, "--:--");
  }
  {
    int w = oled.getStrWidth(timeBuf);
    oled.drawStr((72 - w) / 2, 10, timeBuf);
  }

  // ---- Row 2 (y=22): day-of-week + date, centered, 5x7 ---------------------
  oled.setFont(u8g2_font_5x7_tf);
  if (haveTime) {
    char row2[24];
    snprintf(row2, sizeof(row2), "%s %s %d",
             DOW_NAMES[lt.tm_wday], MON_NAMES[lt.tm_mon], lt.tm_mday);
    int w = oled.getStrWidth(row2);
    oled.drawStr((72 - w) / 2, 22, row2);
  } else if (WiFi.status() != WL_CONNECTED) {
    const char* msg = "no wifi";
    int w = oled.getStrWidth(msg);
    oled.drawStr((72 - w) / 2, 22, msg);
  } else {
    const char* msg = "syncing time...";
    int w = oled.getStrWidth(msg);
    oled.drawStr((72 - w) / 2, 22, msg);
  }

  // ---- Row 3 (y=37): battery icon + percent + state ------------------------
  // Icon at x=0, percent right-aligned around x=46, state glyph on the right
  // edge so the eye reads icon -> number -> word in a single sweep.
  drawBatteryIcon(0, 28, pct);
  if (charging) drawBolt(0, 28, frame);

  char pctBuf[6];
  snprintf(pctBuf, sizeof(pctBuf), "%d%%", pct);
  oled.drawStr(24, 37, pctBuf);

  const char* state = "";
  if (charging)               state = "CHG";
  else if (pct >= 95)         state = "FULL";
  // else discharging -- no glyph, the percentage alone is the indicator.
  if (state[0]) {
    int w = oled.getStrWidth(state);
    oled.drawStr(72 - w, 37, state);
  }

  oled.sendBuffer();
}

// ----------------------------------------------------------------------------
// Setup / loop
// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  // OLED first so even a stalled WiFi join has something on the screen.
  Wire.setPins(OLED_SDA, OLED_SCL);
  oled.begin();
  oled.setBusClock(400000);
  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tf);
  oled.drawStr(0, 10, "Battery");
  oled.drawStr(0, 20, "Monitor");
  oled.drawStr(0, 36, "booting...");
  oled.sendBuffer();

  pinMode(CHRG_PIN, INPUT_PULLUP);
  // analogReadMilliVolts on the C3 needs 12-bit width + 11 dB attenuation
  // (the default in current cores). Setting them explicitly anyway so an
  // older core revision doesn't quietly clamp the range.
  analogReadResolution(12);
  analogSetPinAttenuation(BAT_ADC_PIN, ADC_11db);

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
    configTime(8 * 3600, 0, "pool.ntp.org", "time.google.com");
  } else {
    Serial.println("WiFi join failed -- clock will stay at --:--");
  }
}

void loop() {
  static unsigned long lastTick = 0;
  static int frame = 0;

  // 1 Hz redraw -- fine for the clock (minute resolution) and slow enough
  // that the ADC averaging doesn't dominate the loop. The bolt animation
  // ticks at this rate too, which is exactly what we want.
  if (millis() - lastTick >= 1000) {
    lastTick = millis();
    frame++;

    float v   = readBatteryVolts();
    int   pct = voltsToPercent(v);
    bool  chg = isCharging();

    Serial.printf("V=%.3f  pct=%d  chg=%d\n", v, pct, (int)chg);
    drawScreen(v, pct, chg, frame);

    // Cheap WiFi recovery -- wifiMulti.run() re-associates if it can. The
    // clock keeps ticking on the existing system time after the first sync,
    // so a dropped connection doesn't freeze the display.
    if (WiFi.status() != WL_CONNECTED) wifiMulti.run();
  }

  delay(10);
}
