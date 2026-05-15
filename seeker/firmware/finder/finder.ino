// =====================================================================
//  Seeker · FINDER (Board B — the one with the 0.42" OLED)
//  ---------------------------------------------------------------------
//  Role:
//    • Receives ESP-NOW packets from the Beacon.
//    • Reads RSSI from the radio rx-control header.
//    • Smooths with a 15-sample rolling average.
//    • Converts RSSI → distance (log-distance path loss model).
//    • Renders distance + RSSI + hot/cold label on the 72×40 OLED.
//    • Echoes a 1-byte ack so the Beacon LED knows we're hearing.
//
//  Hardware:
//    ESP32-C3 Super Mini with onboard 0.42" SSD1306 OLED (72×40, white).
//    I2C pins on the typical "EGG" / 0.42" Super-Mini variant:
//      SDA = GPIO 5
//      SCL = GPIO 6
//    If your OLED stays blank, try swapping to SDA=6 / SCL=7 (some
//    clones rewire the bus — check your board's silkscreen).
//
//  Button (BOOT, GPIO 9, active LOW):
//    Short press  →  clear the RSSI rolling buffer (re-zero)
//    Long press   →  enter 5-second 1-metre calibration mode;
//                    on exit, the averaged RSSI becomes the new
//                    MEASURED_POWER and is saved to NVS so it
//                    survives reboot.
//
//  Required libraries (install via Arduino Library Manager):
//    • U8g2  by Oliver Kraus     (handles the 0.42" SSD1306 panel)
//    • Preferences (built-in to ESP32 core — no install needed)
//
//  Arduino board settings:
//    Board:            ESP32C3 Dev Module
//    USB CDC On Boot:  Enabled
//    CPU Freq:         160 MHz
//
//  Compile requirements (IMPORTANT — read or you'll get errors):
//    • Arduino-ESP32 core v3.0.0 or newer (recv-callback signature change).
//      If you see "invalid conversion from 'void(*)(const esp_now_recv_info_t*"
//      then update via Boards Manager → "esp32 by Espressif Systems" → 3.0.0+.
//    • U8g2 library by Oliver Kraus — install via Sketch → Include Library →
//      Manage Libraries → search "U8g2" → install (any version ≥ 2.28).
//    • Preferences library — built into the ESP32 core, no install needed.
// =====================================================================

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <Preferences.h>

// ===== EDIT THIS: the Beacon board's MAC address =====================
uint8_t BEACON_MAC[6] = { 0xDC, 0x06, 0x75, 0x67, 0xCC, 0xCC };

// ===== Calibration constants — easy editable defaults ================
// Override at runtime by long-pressing BOOT at 1 m and saving to NVS.
float MEASURED_POWER = -50.0f;   // RSSI (dBm) measured at exactly 1 m
float N_FACTOR       =  2.5f;    // path-loss exponent
//   2.0  = free space (line of sight, outdoors)
//   2.5  = typical indoor (some walls, furniture)
//   3.0+ = heavy obstruction (concrete, metal)

// ===== Pins ==========================================================
const int LED_PIN = 8;   // onboard status LED (active LOW)
const int BTN_PIN = 9;   // BOOT button (active LOW, internal pull-up)
const int SDA_PIN = 5;   // I2C data  (try 6 if your OLED is blank)
const int SCL_PIN = 6;   // I2C clock (try 7 if your OLED is blank)

// ===== OLED ==========================================================
// The 0.42" panel is a 72×40 window inside a 128×64-addressable SSD1306.
// u8g2 handles the column offset for us via this constructor:
U8G2_SSD1306_72X40_ER_F_HW_I2C oled(U8G2_R0, /*reset=*/ U8X8_PIN_NONE);

// ===== RSSI smoothing ================================================
const int   SAMPLES           = 15;
const uint32_t SIGNAL_TIMEOUT = 1500;  // ms with no packet → "NO SIGNAL"
int rssiBuf[SAMPLES] = {0};
int rssiIdx          = 0;
int rssiCount        = 0;
uint32_t lastPacketMs = 0;

// ===== Button ========================================================
const uint32_t LONG_PRESS_MS = 1500;
bool     btnLast      = HIGH;
uint32_t btnDownMs    = 0;
bool     longFired    = false;

// ===== Calibration mode ==============================================
const uint32_t CALIB_DURATION_MS = 5000;
bool     calibActive = false;
uint32_t calibStartMs = 0;
long     calibSum    = 0;
int      calibCount  = 0;

Preferences prefs;

// =====================================================================
//  ESP-NOW RECEIVE CALLBACK
// =====================================================================
// Arduino-ESP32 core v3.x signature. `info->rx_ctrl->rssi` is the RSSI
// of the just-received frame, in dBm. Negative — closer to 0 = stronger.
void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  int rssi = info->rx_ctrl->rssi;
  lastPacketMs = millis();

  // Insert into the circular buffer.
  rssiBuf[rssiIdx] = rssi;
  rssiIdx = (rssiIdx + 1) % SAMPLES;
  if (rssiCount < SAMPLES) rssiCount++;

  // While calibrating, also accumulate.
  if (calibActive) {
    calibSum   += rssi;
    calibCount += 1;
  }

  // Echo a single byte back to the Beacon so its LED can change pattern.
  uint8_t ack = 0x01;
  esp_now_send(info->src_addr, &ack, 1);
}

// =====================================================================
//  Math
// =====================================================================
float averageRssi() {
  if (rssiCount == 0) return 0;
  long sum = 0;
  for (int i = 0; i < rssiCount; i++) sum += rssiBuf[i];
  return (float)sum / rssiCount;
}

// Log-distance path-loss model:
//   distance = 10 ^ ( (MEASURED_POWER - RSSI) / (10 * N) )
float rssiToDistance(float rssi) {
  return powf(10.0f, (MEASURED_POWER - rssi) / (10.0f * N_FACTOR));
}

const char *hotColdLabel(float d) {
  if (d < 0.5f)  return "BURNING";
  if (d < 1.5f)  return "HOT";
  if (d < 4.0f)  return "WARM";
  if (d < 10.0f) return "COOL";
  return "COLD";
}

// =====================================================================
//  Drawing
// =====================================================================
void drawScreen() {
  oled.clearBuffer();
  uint32_t now = millis();
  bool haveSignal = (rssiCount > 0) && (now - lastPacketMs < SIGNAL_TIMEOUT);

  // ---- Calibration overlay takes priority ----
  if (calibActive) {
    uint32_t elapsed = now - calibStartMs;
    int pct = (int)((elapsed * 100) / CALIB_DURATION_MS);
    if (pct > 100) pct = 100;

    oled.setFont(u8g2_font_6x10_tf);
    oled.drawStr(0, 9, "CALIBRATE @1m");

    char buf[24];
    snprintf(buf, sizeof(buf), "n=%d", calibCount);
    oled.drawStr(0, 21, buf);

    // Progress bar
    oled.drawFrame(0, 28, 72, 8);
    int w = (pct * 70) / 100;
    oled.drawBox(1, 29, w, 6);
    oled.sendBuffer();
    return;
  }

  // ---- No signal state ----
  if (!haveSignal) {
    oled.setFont(u8g2_font_6x10_tf);
    oled.drawStr(0, 9,  "NO SIGNAL");
    oled.drawStr(0, 22, "Searching");
    int dots = (now / 300) % 4;
    int x = 6 * 9;  // after "Searching"
    for (int i = 0; i < dots; i++) {
      oled.drawStr(x + i * 4, 22, ".");
    }
    oled.setFont(u8g2_font_5x7_tf);
    char buf[24];
    snprintf(buf, sizeof(buf), "MP=%.0f N=%.1f", MEASURED_POWER, N_FACTOR);
    oled.drawStr(0, 38, buf);
    oled.sendBuffer();
    return;
  }

  // ---- Normal readout ----
  float rssi = averageRssi();
  float dist = rssiToDistance(rssi);
  if (dist > 99.9f) dist = 99.9f;
  if (dist < 0.0f)  dist = 0.0f;

  char buf[16];

  // Big distance — centred
  snprintf(buf, sizeof(buf), "%.1fm", dist);
  oled.setFont(u8g2_font_logisoso16_tf);
  int w = oled.getStrWidth(buf);
  oled.drawStr((72 - w) / 2, 17, buf);

  // Small RSSI — centred underneath
  snprintf(buf, sizeof(buf), "%ddBm", (int)rssi);
  oled.setFont(u8g2_font_5x7_tf);
  w = oled.getStrWidth(buf);
  oled.drawStr((72 - w) / 2, 27, buf);

  // Hot/cold label — bottom, centred
  const char *label = hotColdLabel(dist);
  oled.setFont(u8g2_font_6x10_tf);
  w = oled.getStrWidth(label);
  oled.drawStr((72 - w) / 2, 39, label);

  oled.sendBuffer();
}

// =====================================================================
//  Button handling
// =====================================================================
void resetBuffer() {
  rssiCount = 0;
  rssiIdx   = 0;
  for (int i = 0; i < SAMPLES; i++) rssiBuf[i] = 0;
  Serial.println("[btn] short press — RSSI buffer cleared");
}

void enterCalibration() {
  calibActive  = true;
  calibStartMs = millis();
  calibSum     = 0;
  calibCount   = 0;
  Serial.println("[btn] long press — entering 1 m calibration for 5 s");
  Serial.println("        hold the Finder exactly 1 metre from the Beacon");
}

void finishCalibration() {
  calibActive = false;
  if (calibCount >= 10) {
    MEASURED_POWER = (float)calibSum / (float)calibCount;
    prefs.begin("seeker", false);
    prefs.putFloat("mp", MEASURED_POWER);
    prefs.end();
    Serial.printf("[calib] new MEASURED_POWER = %.2f dBm (saved to NVS)\n", MEASURED_POWER);
  } else {
    Serial.printf("[calib] only %d samples — kept old MEASURED_POWER = %.2f\n",
                  calibCount, MEASURED_POWER);
  }
}

void handleButton() {
  bool btn = digitalRead(BTN_PIN);
  uint32_t now = millis();

  if (btnLast == HIGH && btn == LOW) {
    // Falling edge — button just pressed
    btnDownMs  = now;
    longFired  = false;
  } else if (btnLast == LOW && btn == LOW) {
    // Held — fire long-press once after threshold
    if (!longFired && (now - btnDownMs >= LONG_PRESS_MS)) {
      longFired = true;
      enterCalibration();
    }
  } else if (btnLast == LOW && btn == HIGH) {
    // Rising edge — released
    if (!longFired && (now - btnDownMs < LONG_PRESS_MS)) {
      resetBuffer();
    }
  }
  btnLast = btn;
}

// =====================================================================
//  Setup
// =====================================================================
void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);   // OFF
  pinMode(BTN_PIN, INPUT_PULLUP);

  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println("[seeker · finder] booting...");

  // ---- OLED ----
  Wire.begin(SDA_PIN, SCL_PIN);
  oled.begin();
  oled.clearBuffer();
  oled.setFont(u8g2_font_6x10_tf);
  oled.drawStr(0, 12, "SEEKER");
  oled.drawStr(0, 25, "starting...");
  oled.sendBuffer();

  // ---- Load saved calibration (if any) ----
  prefs.begin("seeker", true);   // read-only
  if (prefs.isKey("mp")) {
    MEASURED_POWER = prefs.getFloat("mp", MEASURED_POWER);
    Serial.printf("[seeker · finder] loaded saved MEASURED_POWER = %.2f dBm\n",
                  MEASURED_POWER);
  }
  prefs.end();

  // ---- WiFi / ESP-NOW ----
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  if (esp_now_init() != ESP_OK) {
    Serial.println("[seeker · finder] ESP-NOW init FAILED — halting");
    while (true) { delay(1000); }
  }
  esp_now_register_recv_cb(onDataRecv);

  // Register the Beacon as a peer so we can send the ack back.
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, BEACON_MAC, 6);
  peer.channel = 0;
  peer.encrypt = false;
  esp_now_add_peer(&peer);

  Serial.printf("[seeker · finder] my MAC: %s\n", WiFi.macAddress().c_str());
  Serial.printf("[seeker · finder] listening for: %02X:%02X:%02X:%02X:%02X:%02X\n",
                BEACON_MAC[0], BEACON_MAC[1], BEACON_MAC[2],
                BEACON_MAC[3], BEACON_MAC[4], BEACON_MAC[5]);
  Serial.printf("[seeker · finder] MP=%.1f dBm  N=%.2f\n", MEASURED_POWER, N_FACTOR);
  Serial.println("[seeker · finder] ready");
}

// =====================================================================
//  Loop
// =====================================================================
void loop() {
  handleButton();

  // Auto-exit calibration after the 5 s window.
  if (calibActive && (millis() - calibStartMs >= CALIB_DURATION_MS)) {
    finishCalibration();
  }

  // Heartbeat LED — short blink every second so you know it's alive.
  uint32_t t = millis() % 1000;
  digitalWrite(LED_PIN, (t < 30) ? LOW : HIGH);

  drawScreen();
  delay(40);   // ~25 fps redraw is plenty for a 72×40 panel
}
