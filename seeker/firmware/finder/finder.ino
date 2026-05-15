// =====================================================================
//  Seeker · FINDER (Board B — the one with the 0.42" OLED)
//  ---------------------------------------------------------------------
//  Role:
//    • Receives ESP-NOW packets from the Beacon.
//    • Reads RSSI from the radio rx-control header.
//    • Smooths with a 15-sample rolling average.
//    • Converts RSSI → distance via the log-distance path-loss model.
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
//    NORMAL:
//      Short press  →  clear the RSSI rolling buffer (re-zero)
//      Long press   →  enter the multi-distance calibration wizard
//    INSIDE WIZARD:
//      Short press  →  capture this step (2.5 s) / dismiss DONE screen
//      Long press   →  abort wizard, keep previous values
//
//  Multi-distance calibration (option #2 from the roadmap):
//    The wizard walks you through CALIB_STEPS reference distances
//    (default 1, 3, 6, 10 m). At each step:
//      1. OLED prompts "CAL X/N  |  Xm  |  hit BOOT"
//      2. You stand at that distance, short-press BOOT.
//      3. Finder averages RSSI for 2.5 s.
//      4. Repeat for the next distance.
//    On the last step, a least-squares fit derives MEASURED_POWER and
//    N_FACTOR together — much more accurate than the old single-point
//    1 m calibration. Both values are saved to NVS.
//
//  Required libraries (install via Arduino Library Manager):
//    • U8g2  by Oliver Kraus
//    • Preferences (built-in)
//
//  Arduino board settings:
//    Board:            ESP32C3 Dev Module
//    USB CDC On Boot:  Enabled
//    CPU Freq:         160 MHz
//
//  Compile requirements:
//    • Arduino-ESP32 core v3.1.0 or newer (recv-cb + send-cb signature changes).
//    • U8g2 ≥ 2.28.
// =====================================================================

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <Preferences.h>
#include <math.h>

// ===== EDIT THIS: the Beacon board's MAC address =====================
uint8_t BEACON_MAC[6] = { 0xDC, 0x06, 0x75, 0x67, 0xCC, 0xCC };

// ===== Calibration constants — easy editable defaults ================
// Overridden at runtime by the wizard and saved to NVS.
float MEASURED_POWER = -50.0f;   // RSSI (dBm) at 1 m  — defaults if no NVS
float N_FACTOR       =  2.5f;    // path-loss exponent — defaults if no NVS

// ===== Pins ==========================================================
const int LED_PIN = 8;   // onboard status LED (active LOW)
const int BTN_PIN = 9;   // BOOT button (active LOW, internal pull-up)
const int SDA_PIN = 5;   // I2C data  (try 6 if your OLED is blank)
const int SCL_PIN = 6;   // I2C clock (try 7 if your OLED is blank)

// ===== TX-power boost (option #1) ====================================
// Higher TX = more range + more stable RSSI through walls.
// 0.25 dBm units. 80 = 20 dBm (safe near-max). 84 = 21 dBm (chip max).
// MUST match the value set on the Beacon.
const int8_t TX_POWER = 80;

// ===== OLED ==========================================================
U8G2_SSD1306_72X40_ER_F_HW_I2C oled(U8G2_R0, /*reset=*/ U8X8_PIN_NONE);

// ===== RSSI smoothing ================================================
const int      SAMPLES        = 15;
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

// ===== Multi-distance calibration ====================================
// Distances (metres) you'll stand at, in order. Edit if your space
// can't accommodate 10 m — e.g. {1.0, 2.0, 4.0, 7.0}.
const float    CALIB_DISTANCES[]  = { 1.0f, 3.0f, 6.0f, 10.0f };
const int      CALIB_STEPS        = sizeof(CALIB_DISTANCES) / sizeof(CALIB_DISTANCES[0]);
const uint32_t CALIB_CAPTURE_MS   = 2500;   // averaging window per step
const uint32_t CALIB_DONE_SHOW_MS = 3500;   // how long the result screen stays
const int      CALIB_MIN_SAMPLES  = 10;     // re-prompt if step gathered fewer than this

enum CalibState { CAL_IDLE, CAL_PROMPT, CAL_CAPTURING, CAL_DONE_OK, CAL_DONE_BAD };
volatile CalibState calibState = CAL_IDLE;   // volatile: read by recv-cb (other task)
int      calibStep       = 0;
float    calibRssi[CALIB_STEPS] = {0};
uint32_t calibStateStart = 0;
long     calibSum        = 0;
int      calibSamples    = 0;

Preferences prefs;

// =====================================================================
//  ESP-NOW RECEIVE CALLBACK  (v3.x signature)
// =====================================================================
void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  int rssi = info->rx_ctrl->rssi;
  lastPacketMs = millis();

  // Circular buffer for the smoothed-readout average.
  rssiBuf[rssiIdx] = rssi;
  rssiIdx = (rssiIdx + 1) % SAMPLES;
  if (rssiCount < SAMPLES) rssiCount++;

  // While capturing a calibration step, also accumulate into the per-step sum.
  if (calibState == CAL_CAPTURING) {
    calibSum += rssi;
    calibSamples++;
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
//  Least-squares fit (multi-distance calibration)
// =====================================================================
// Model:  RSSI = MP - 10·N·log10(d)         ←  linear in x=log10(d):
//         y    = a  +  b·x       with  a = MP,  b = -10·N
// Standard linear regression on (x_i = log10(d_i), y_i = avg_rssi_i):
//   b = (n·Σxy − Σx·Σy) / (n·Σxx − (Σx)²)
//   a = (Σy − b·Σx) / n
// Returns true on success (and saves to NVS); false on math-fail or
// out-of-range sanity check (calibration values left untouched).
bool fitCalibration() {
  const int n = CALIB_STEPS;
  float sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (int i = 0; i < n; i++) {
    float x = log10f(CALIB_DISTANCES[i]);
    float y = calibRssi[i];
    sumX  += x;
    sumY  += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  float denom = (float)n * sumXX - sumX * sumX;
  if (fabsf(denom) < 1e-6f) {
    Serial.println("[calib] fit FAILED — degenerate distances");
    return false;
  }
  float b = ((float)n * sumXY - sumX * sumY) / denom;
  float a = (sumY - b * sumX) / (float)n;
  float newMP = a;
  float newN  = -b / 10.0f;

  Serial.printf("[calib] raw fit: MP=%.2f dBm  N=%.3f\n", newMP, newN);

  // Sanity bounds — refuse garbage so a bad capture doesn't poison NVS.
  if (newN < 1.5f || newN > 5.5f) {
    Serial.printf("[calib] fit REJECTED — N=%.2f out of [1.5, 5.5]\n", newN);
    return false;
  }
  if (newMP > -20.0f || newMP < -85.0f) {
    Serial.printf("[calib] fit REJECTED — MP=%.2f out of [-85, -20] dBm\n", newMP);
    return false;
  }

  MEASURED_POWER = newMP;
  N_FACTOR       = newN;

  prefs.begin("seeker", false);
  prefs.putFloat("mp", MEASURED_POWER);
  prefs.putFloat("n",  N_FACTOR);
  prefs.end();

  Serial.printf("[calib] saved → MP=%.2f dBm  N=%.2f\n", MEASURED_POWER, N_FACTOR);
  return true;
}

// =====================================================================
//  Calibration state transitions
// =====================================================================
void startWizard() {
  calibState      = CAL_PROMPT;
  calibStep       = 0;
  calibStateStart = millis();
  for (int i = 0; i < CALIB_STEPS; i++) calibRssi[i] = 0;
  Serial.println("[calib] wizard started");
  Serial.printf("[calib] step 1/%d — stand at %.1f m, short-press BOOT to capture\n",
                CALIB_STEPS, CALIB_DISTANCES[0]);
}

void abortWizard() {
  if (calibState != CAL_IDLE) {
    calibState = CAL_IDLE;
    Serial.println("[calib] wizard aborted — values unchanged");
  }
}

void startCaptureStep() {
  calibState      = CAL_CAPTURING;
  calibStateStart = millis();
  calibSum        = 0;
  calibSamples    = 0;
  Serial.printf("[calib] capturing step %d/%d at %.1f m (%.1fs)\n",
                calibStep + 1, CALIB_STEPS, CALIB_DISTANCES[calibStep],
                CALIB_CAPTURE_MS / 1000.0f);
}

void finishCaptureStep() {
  if (calibSamples < CALIB_MIN_SAMPLES) {
    Serial.printf("[calib] only %d samples — re-do step %d\n",
                  calibSamples, calibStep + 1);
    calibState      = CAL_PROMPT;
    calibStateStart = millis();
    return;
  }

  calibRssi[calibStep] = (float)calibSum / (float)calibSamples;
  Serial.printf("[calib] step %d done → avg RSSI = %.2f dBm (%d samples)\n",
                calibStep + 1, calibRssi[calibStep], calibSamples);
  calibStep++;

  if (calibStep >= CALIB_STEPS) {
    // All steps captured — run the fit.
    bool ok = fitCalibration();
    calibState      = ok ? CAL_DONE_OK : CAL_DONE_BAD;
    calibStateStart = millis();
  } else {
    Serial.printf("[calib] next: step %d/%d — stand at %.1f m\n",
                  calibStep + 1, CALIB_STEPS, CALIB_DISTANCES[calibStep]);
    calibState      = CAL_PROMPT;
    calibStateStart = millis();
  }
}

// =====================================================================
//  Drawing
// =====================================================================
void drawScreen() {
  oled.clearBuffer();
  uint32_t now = millis();

  // ---- Calibration wizard takes priority ----
  if (calibState != CAL_IDLE) {
    char buf[24];

    if (calibState == CAL_DONE_OK || calibState == CAL_DONE_BAD) {
      oled.setFont(u8g2_font_6x10_tf);
      const char *title = (calibState == CAL_DONE_OK) ? "SAVED" : "BAD FIT";
      oled.drawStr(0, 9, title);
      snprintf(buf, sizeof(buf), "MP %d", (int)roundf(MEASURED_POWER));
      oled.drawStr(0, 22, buf);
      snprintf(buf, sizeof(buf), "N  %.2f", N_FACTOR);
      oled.drawStr(0, 35, buf);
      oled.sendBuffer();
      return;
    }

    // CAL_PROMPT or CAL_CAPTURING — both show "CAL X/N" + the distance.
    oled.setFont(u8g2_font_6x10_tf);
    snprintf(buf, sizeof(buf), "CAL %d/%d", calibStep + 1, CALIB_STEPS);
    oled.drawStr(0, 9, buf);

    // Distance — big and centred
    snprintf(buf, sizeof(buf), "%.0fm", CALIB_DISTANCES[calibStep]);
    oled.setFont(u8g2_font_logisoso16_tf);
    int w = oled.getStrWidth(buf);
    oled.drawStr((72 - w) / 2, 28, buf);

    if (calibState == CAL_PROMPT) {
      // Blink "hit BOOT" so it's obvious the device is waiting on you.
      if (((now - calibStateStart) / 400) % 2 == 0) {
        oled.setFont(u8g2_font_5x7_tf);
        const char *m = "hit BOOT";
        w = oled.getStrWidth(m);
        oled.drawStr((72 - w) / 2, 39, m);
      }
    } else {
      // CAL_CAPTURING — progress bar at the bottom
      uint32_t elapsed = now - calibStateStart;
      int pct = (int)((elapsed * 100) / CALIB_CAPTURE_MS);
      if (pct > 100) pct = 100;
      oled.drawFrame(0, 34, 72, 5);
      int pw = (pct * 70) / 100;
      oled.drawBox(1, 35, pw, 3);
    }
    oled.sendBuffer();
    return;
  }

  // ---- Normal modes (no signal / readout) ----
  bool haveSignal = (rssiCount > 0) && (now - lastPacketMs < SIGNAL_TIMEOUT);

  if (!haveSignal) {
    oled.setFont(u8g2_font_6x10_tf);
    oled.drawStr(0, 9,  "NO SIGNAL");
    oled.drawStr(0, 22, "Searching");
    int dots = (now / 300) % 4;
    int x = 6 * 9;
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

  float rssi = averageRssi();
  float dist = rssiToDistance(rssi);
  if (dist > 99.9f) dist = 99.9f;
  if (dist < 0.0f)  dist = 0.0f;

  char buf[16];

  snprintf(buf, sizeof(buf), "%.1fm", dist);
  oled.setFont(u8g2_font_logisoso16_tf);
  int w = oled.getStrWidth(buf);
  oled.drawStr((72 - w) / 2, 17, buf);

  snprintf(buf, sizeof(buf), "%ddBm", (int)rssi);
  oled.setFont(u8g2_font_5x7_tf);
  w = oled.getStrWidth(buf);
  oled.drawStr((72 - w) / 2, 27, buf);

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

void onShortPress() {
  switch (calibState) {
    case CAL_IDLE:        resetBuffer();      break;
    case CAL_PROMPT:      startCaptureStep(); break;
    case CAL_DONE_OK:
    case CAL_DONE_BAD:    calibState = CAL_IDLE; break;   // dismiss early
    case CAL_CAPTURING:   /* ignore — wait for auto-finish */ break;
  }
}

void onLongPress() {
  if (calibState == CAL_IDLE) startWizard();
  else                        abortWizard();
}

void handleButton() {
  bool btn = digitalRead(BTN_PIN);
  uint32_t now = millis();

  if (btnLast == HIGH && btn == LOW) {
    // Falling edge — button just pressed
    btnDownMs = now;
    longFired = false;
  } else if (btnLast == LOW && btn == LOW) {
    // Held — fire long-press once after threshold
    if (!longFired && (now - btnDownMs >= LONG_PRESS_MS)) {
      longFired = true;
      onLongPress();
    }
  } else if (btnLast == LOW && btn == HIGH) {
    // Rising edge — released
    if (!longFired && (now - btnDownMs < LONG_PRESS_MS)) {
      onShortPress();
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
  }
  if (prefs.isKey("n")) {
    N_FACTOR = prefs.getFloat("n", N_FACTOR);
  }
  prefs.end();

  // ---- WiFi / ESP-NOW ----
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  // ---- TX-power boost (option #1) ----
  esp_err_t txErr = esp_wifi_set_max_tx_power(TX_POWER);
  if (txErr == ESP_OK) {
    Serial.printf("[seeker · finder] TX power set to %d (= %.2f dBm)\n",
                  TX_POWER, TX_POWER * 0.25f);
  } else {
    Serial.printf("[seeker · finder] TX power set FAILED (err 0x%x) — using default\n",
                  txErr);
  }

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
  Serial.printf("[seeker · finder] MP=%.2f dBm  N=%.2f\n", MEASURED_POWER, N_FACTOR);
  Serial.println("[seeker · finder] ready");
  Serial.print  ("[seeker · finder] long-press BOOT to start calibration · steps: ");
  for (int i = 0; i < CALIB_STEPS; i++) {
    Serial.printf("%.1f ", CALIB_DISTANCES[i]);
  }
  Serial.println("m");
}

// =====================================================================
//  Loop
// =====================================================================
void loop() {
  handleButton();

  uint32_t now = millis();

  // ---- Calibration state machine: auto-advance ----
  if (calibState == CAL_CAPTURING && (now - calibStateStart >= CALIB_CAPTURE_MS)) {
    finishCaptureStep();
  } else if ((calibState == CAL_DONE_OK || calibState == CAL_DONE_BAD)
             && (now - calibStateStart >= CALIB_DONE_SHOW_MS)) {
    calibState = CAL_IDLE;
  }

  // Heartbeat LED — short blink every second so you know it's alive.
  uint32_t t = now % 1000;
  digitalWrite(LED_PIN, (t < 30) ? LOW : HIGH);

  drawScreen();
  delay(40);   // ~25 fps redraw is plenty for a 72×40 panel
}
