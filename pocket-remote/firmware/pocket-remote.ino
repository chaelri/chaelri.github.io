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
//   TAP  (<500 ms)  -> fire the current mode (CLICK or AC).
//   HOLD (>=800 ms) -> flip the mode (CLICK <-> AC). The new mode is
//                      persisted in NVS so it survives reboots and brown-outs.
//
// What the 72x40 OLED shows:
//
//   Row 0  : WiFi bars + battery percent
//   Row 1+ : Big mode label   ">CLICK" or ">AC"
//   Bottom : Last action / result (e.g. "sent OK · 12:34" or "no wifi")
//
// Hardware (single rail, USB-C chargeable):
//
//   LiPo 3.7 V 1000 mAh  ->  TP4056 B+/B-           (protection + charging)
//   TP4056 OUT+/OUT-     ->  ESP32-C3 5V / GD       (LDO drops to 3.3 V)
//   USB-C charge cable   ->  TP4056 USB-C           (NOT the ESP32's own port)
//   BOOT button          ->  GPIO9, INPUT_PULLUP    (already on the board)
//   OLED                 ->  GPIO5 (SDA) / GPIO6 (SCL), already on the board
//
// No battery sense / fuel gauge. Charlie's "low-battery indicator" is the
// OLED itself: below ~3.5 V the LDO starts dropping out and the screen
// flickers, which is the cue to plug in the TP4056's USB-C. The DW01 cuts
// the cell at 3.0 V before anything bad happens.
//
// You CAN keep using the device while it is plugged in -- the TP4056 with the
// DW01 protection IC powers the load and tops the battery up at the same time.
// If the load draw exceeds the charge current, the battery still slowly drains;
// it never sees less than 3.0 V (protection cutoff) or more than 4.2 V.
//
// Skipping the MT3608 boost is deliberate. The ESP32-C3's onboard 3.3 V LDO
// drops only ~250 mV, so a fully-charged 4.2 V cell -> 3.95 V on the 3.3 V
// rail with margin. Below ~3.5 V the LDO starts to drop out; the user will
// notice OLED flicker and that is the cue to charge. The TP4056 still kills
// the cell at 3.0 V to keep the chemistry healthy.
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

// --- WiFi --------------------------------------------------------------------
// Same network pool as the autoclicker and aircon firmwares so the remote
// roams onto whichever known WiFi (or Charlie's iPhone hotspot) is currently
// strongest. iPhone hotspot must have "Maximize Compatibility" ON so it
// broadcasts on 2.4 GHz -- the ESP32-C3 radio is 2.4 GHz only.
WiFiMulti wifiMulti;

// --- Firebase RTDB endpoints -------------------------------------------------
// Both devices live under the same project (test-database-55379, asia-southeast1).
// Sending to /autoclicker/command and /aircon/command mirrors exactly what
// their respective phone remotes write today, so the firmware on each device
// reacts as if a real human tapped its phone UI.
const char* CLICK_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/autoclicker/command.json";
const char* AC_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/aircon/command.json";

// --- OLED --------------------------------------------------------------------
// 01space ESP32-C3 + 0.42" OLED board: SSD1306 controller wired to GPIO5 (SDA)
// and GPIO6 (SCL). The visible window is 72x40 pixels even though the
// controller can address 128x64; U8g2's 72x40 constructor handles the column
// offset automatically.
U8G2_SSD1306_72X40_ER_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);
const int OLED_SDA = 5;
const int OLED_SCL = 6;

// --- Pins / timing -----------------------------------------------------------
const int BTN_PIN       = 9;       // BOOT button (active LOW, INPUT_PULLUP)
const unsigned long DEBOUNCE_MS  = 30;
const unsigned long TAP_MAX_MS   = 500;   // anything shorter than this is a tap
const unsigned long HOLD_MS      = 800;   // crossing this while still pressed = hold
const unsigned long STATUS_HOLD_MS = 2500; // how long the bottom-row status sticks

// Operating modes ------------------------------------------------------------
enum Mode { MODE_CLICK = 0, MODE_AC = 1 };
Mode currentMode = MODE_CLICK;

Preferences prefs;

// Button state machine --------------------------------------------------------
bool          btnPressed   = false;       // debounced state
unsigned long btnDownAt    = 0;
unsigned long btnLastEdge  = 0;
int           btnLastLevel = HIGH;
bool          holdFired    = false;       // true once the hold action ran for this press

// OLED status text (bottom row) ----------------------------------------------
String        statusMsg     = "ready";
unsigned long statusSetAt   = 0;
bool          needsRedraw   = true;

// ----------------------------------------------------------------------------
// NVS-backed mode persistence
// ----------------------------------------------------------------------------
void loadMode() {
  prefs.begin("remote", true);   // read-only
  uint8_t m = prefs.getUChar("mode", MODE_CLICK);
  prefs.end();
  currentMode = (m == MODE_AC) ? MODE_AC : MODE_CLICK;
}

void saveMode() {
  prefs.begin("remote", false);  // read-write
  prefs.putUChar("mode", (uint8_t)currentMode);
  prefs.end();
}

// ----------------------------------------------------------------------------
// OLED rendering -- 72x40 visible area. Keep it punchy: WiFi bars top-left,
// big centered mode label, single bottom status line.
// ----------------------------------------------------------------------------
void drawWiFiBars(int x, int y) {
  // Crude 4-bar WiFi glyph driven by current RSSI. Each bar is 2 px wide.
  int rssi  = WiFi.RSSI();          // 0 when not connected (= no bars)
  bool up   = (WiFi.status() == WL_CONNECTED);
  int bars  = 0;
  if (up) {
    if      (rssi >= -55) bars = 4;
    else if (rssi >= -65) bars = 3;
    else if (rssi >= -75) bars = 2;
    else                  bars = 1;
  }
  for (int i = 0; i < 4; i++) {
    int h = 2 + i * 2;        // 2, 4, 6, 8
    int bx = x + i * 3;
    int by = y - h;
    if (i < bars) oled.drawBox(bx, by, 2, h);
    else          oled.drawFrame(bx, by, 2, h);
  }
}

void drawScreen() {
  oled.clearBuffer();

  // --- Top row: WiFi bars (top-left), small mode-name hint to the right.
  // We have ~62 px of horizontal room next to the bars now that the battery
  // icon is gone -- but a tiny WiFi-only indicator is less visual noise than
  // a stretched second widget. Leave it sparse.
  drawWiFiBars(0, 9);   // baseline at y=9, bars grow upward

  // --- Middle: big mode label, centered
  oled.setFont(u8g2_font_helvB12_tf);
  const char* label = (currentMode == MODE_CLICK) ? ">CLICK" : ">AC";
  int lw = oled.getStrWidth(label);
  oled.drawStr((72 - lw) / 2, 26, label);

  // --- Bottom: status line (truncated to fit)
  oled.setFont(u8g2_font_5x7_tf);
  // 5x7 font: 72 / 5 = ~14 chars max. Trim to be safe.
  String s = statusMsg;
  if (s.length() > 14) s = s.substring(0, 14);
  int sw = oled.getStrWidth(s.c_str());
  oled.drawStr((72 - sw) / 2, 39, s.c_str());

  oled.sendBuffer();
}

void setStatus(const String& s) {
  statusMsg   = s;
  statusSetAt = millis();
  needsRedraw = true;
}

// ----------------------------------------------------------------------------
// Firebase writes -- one PUT per tap. Both endpoints accept the same shape
// their phone remotes use today, so each target device sees the command as
// if a human had tapped its on-screen button.
//
//   Autoclicker: writes the bare JSON string "toggle"
//                -> firmware flips its latched press/release state.
//   Aircon:      writes {"cmd":"click"}
//                -> firmware does one push-hold-return on the power button.
//
// Returns true on HTTP 200, false otherwise. Caller decides what to surface
// on the OLED.
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

bool fireClick() { return putJson(CLICK_URL, "\"toggle\""); }
bool fireAC()    { return putJson(AC_URL,    "{\"cmd\":\"click\"}"); }

// ----------------------------------------------------------------------------
// Tap / hold dispatch -- driven by the button state machine in readButton().
// ----------------------------------------------------------------------------
void doTap() {
  if (WiFi.status() != WL_CONNECTED) {
    setStatus("no wifi");
    return;
  }
  setStatus("sending...");
  drawScreen();   // redraw immediately so the user sees feedback during the PUT
  bool ok = (currentMode == MODE_CLICK) ? fireClick() : fireAC();
  if (ok) {
    char buf[16];
    snprintf(buf, sizeof(buf), "sent %s",
             (currentMode == MODE_CLICK) ? "CLICK" : "AC");
    setStatus(buf);
  } else {
    setStatus("send failed");
  }
}

void doHold() {
  currentMode = (currentMode == MODE_CLICK) ? MODE_AC : MODE_CLICK;
  saveMode();
  setStatus(currentMode == MODE_CLICK ? "-> CLICK" : "-> AC");
  Serial.printf("Mode toggled to %s\n",
                currentMode == MODE_CLICK ? "CLICK" : "AC");
}

// ----------------------------------------------------------------------------
// Button polling. Active-LOW on GPIO9 (the BOOT button), INPUT_PULLUP.
//
//   - Debounce: only accept a level change if it has been stable for
//     DEBOUNCE_MS. Cheap tactiles bounce for ~5..15 ms; 30 ms is forgiving.
//   - On press edge: remember the timestamp, clear holdFired.
//   - On release edge: if NO hold has fired and the press was shorter than
//     TAP_MAX_MS, treat it as a tap.
//   - While still pressed: the moment the press duration crosses HOLD_MS,
//     fire the hold action and latch holdFired so the release becomes a
//     no-op. This is the standard "tap vs hold" decomposition; the user
//     gets immediate hold feedback rather than waiting for the release.
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

  // OLED first so we can show progress while WiFi is connecting.
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

  // Same WiFi list as autoclicker/aircon so the remote roams onto whichever
  // known network is currently the strongest, including Charlie's iPhone
  // hotspot when out of the house.
  wifiMulti.addAP("CAYNO", "lokomoko");
  wifiMulti.addAP("Charlie's iPhone", "charlie24");

  WiFi.mode(WIFI_STA);
  // Modem sleep (default Arduino-ESP32 behavior) -- the radio naps between
  // beacons, dropping average current from ~80 mA to ~20-30 mA. Critical for
  // a battery-powered device. Don't call WiFi.setSleep(false) here.

  unsigned long t0 = millis();
  while (wifiMulti.run() != WL_CONNECTED && millis() - t0 < 15000) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("WiFi: %s  IP: %s\n",
                  WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
    setStatus("ready");
  } else {
    Serial.println("WiFi join failed -- will keep retrying in loop()");
    setStatus("no wifi");
  }

  drawScreen();
}

void loop() {
  readButton();

  // Auto-clear the bottom status line after STATUS_HOLD_MS so transient
  // messages don't sit on screen forever. The "ready" idle text reappears
  // until the next tap.
  if (statusMsg != "ready" && millis() - statusSetAt > STATUS_HOLD_MS) {
    setStatus("ready");
  }

  // Cheap recovery if WiFi drops while we're sitting around -- wifiMulti
  // re-associates on call. Throttled so we don't hammer the radio when
  // every network is genuinely out of range.
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
