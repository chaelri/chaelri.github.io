// ===========================================================================
// aircon-ir.ino — ESP32-C3 SuperMini firmware for the IR-LED aircon remote.
//                 RAW-TIMING REPLAY version (no protocol encoder).
// ---------------------------------------------------------------------------
// What this does:
//   Drives an IR transmitter module (GND / VCC / DAT — the DAT pin gets
//   modulated at 38 kHz by the IRremoteESP8266 library, the module has the
//   carrier + current-limit resistor + LED on board) at Charlie's TCL
//   TAC-09CSA/KEI aircon. Each command replays the two raw frames captured
//   from the real remote (state frame + button-code frame), byte-for-byte.
//
//   Why raw instead of IRTcl112Ac.send():
//     - Frame 1 is standard TCL112AC and the library encodes it correctly.
//     - Frame 2 is an UNKNOWN protocol the library can't decode/encode. The
//       AC needs BOTH frames to obey a button. So we replay both verbatim.
//
// Five commands, mapped to the captured presses from tsop-decoder.ino:
//   power_on   = Press #1   (POWER ON)
//   power_off  = Press #16  (POWER OFF)
//   temp_up    = Press #7   (TEMP +1)
//   temp_down  = Press #8   (TEMP -1)
//   swing      = Press #13  (SWING vertical)
//
// THREE WAYS TO TRIGGER (each one ends in the same sendCommand() path):
//   1. Phone remote (online)     -> writes {"cmd":"power_on"} to RTDB at
//                                   /aircon/ir/command. Firmware polls 1 Hz.
//   2. Local web UI (online)     -> any device on the same WiFi opens
//                                   http://<esp32-ip>/ — 5 buttons.
//   3. SoftAP fallback (offline) -> if no known WiFi joins within 15 s, the
//                                   ESP32 broadcasts "Aircon-IR-AP".
//
// Wiring (IR transmitter module — 3 pins, GND / VCC / DAT):
//   ESP32 5V    -> module VCC
//   ESP32 GND   -> module GND
//   ESP32 GPIO3 -> module DAT  (carrier-modulated signal)
//
// Library: IRremoteESP8266 by David Conran et al (Arduino IDE Library Manager).
//
// Board: "ESP32C3 Dev Module"   USB CDC On Boot: Enabled
// Baud:  115200
// ===========================================================================

#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>

// --- WiFi --------------------------------------------------------------------
WiFiMulti wifiMulti;

// --- SoftAP fallback (offline mode) ------------------------------------------
const char* AP_SSID = "Aircon-IR-AP";
const char* AP_PASS = "aircon24";
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;

// --- Firebase RTDB -----------------------------------------------------------
const char* DB_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/aircon/ir/command.json";
const char* STATE_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/aircon/ir/state.json";

// --- Pins / timing -----------------------------------------------------------
const uint16_t IR_LED_PIN  = 3;     // GPIO3 -> module DAT
const int      STATUS_LED  = 8;     // onboard blue LED, active LOW
const int      POLL_MS     = 1000;
const uint16_t IR_CARRIER  = 38;    // kHz
const uint16_t FRAME_GAP_MS = 25;   // inter-frame gap between F1 and F2

IRsend irsend(IR_LED_PIN);
WebServer server(80);
bool      inSoftAP        = false;
String    lastCmd         = "";
uint32_t  lastDurationMs  = 0;
uint32_t  sendCount       = 0;

// ===========================================================================
// === Captured raw IR timings (microseconds, alternating mark/space) ========
// === All carriers are 38 kHz. Frame 1 = TCL112AC state. Frame 2 = button. ==
// ===========================================================================

// --- POWER ON (Press #1) ---------------------------------------------------
const uint16_t IR_POWER_ON_F1[227] = {
  3046, 1618,  462, 1120,  462, 1120,  460,  354,  462,  356,
   460,  356,  460, 1120,  488,  330,  488,  328,  490, 1090,
   492, 1090,  492,  326,  490, 1088,  518,  328,  464,  326,
   490, 1088,  494, 1086,  494,  326,  490, 1088,  492, 1090,
   490,  352,  462,  354,  460, 1120,  458,  358,  456,  360,
   454,  364,  452, 1128,  452,  388,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  388,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  432,  384,  426,  390,
   426,  390,  426,  390,  426, 1130,  450,  366,  450,  388,
   426,  366,  450,  366,  450,  366,  450,  366,  450,  390,
   426,  390,  426,  390,  426,  366,  450,  390,  426,  366,
   450,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  388,  426,  390,  426,  390,  426,  390,  428,  388,
   426,  390,  426,  390,  426,  388,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  388,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426, 1154,  426,  390,  426, 1130,
   450,  364,  452,  364,  450, 1130,  452, 1128,  452,  364,
   456
};
const uint16_t IR_POWER_ON_F2[216] = {
   388,  426, 1130,  450,  364,  452,  364,  450, 1130,  452,
  1128,  452,  364,  452, 1128,  452,  390,  426,  388,  426,
  1130,  452, 1128,  452,  364,  452, 1128,  452, 1128,  452,
   388,  426,  390,  426, 1130,  450,  366,  450,  364,  452,
  1128,  452,  364,  452,  364,  452,  364,  452,  364,  450,
   364,  452,  364,  452,  364,  452,  364,  450,  364,  452,
   364,  452,  364,  452,  364,  450,  364,  452,  364,  452,
   364,  452,  364,  452,  364,  452, 1128,  452,  364,  452,
   364,  452, 1128,  452,  388,  426,  390,  426, 1130,  450,
   366,  450,  366,  450,  364,  450,  366,  450,  366,  450,
   364,  450,  366,  450, 1130,  450, 1128,  452, 1128,  452,
   364,  452,  364,  452,  364,  452,  364,  450,  364,  452,
  1128,  452, 1128,  452,  364,  452, 1128,  452, 1128,  452,
  1128,  452,  364,  452,  364,  450,  364,  452,  364,  452,
   364,  452,  364,  452,  364,  452,  364,  450,  364,  452,
   364,  452,  364,  452,  364,  452,  364,  452,  364,  450,
   364,  452,  364,  452,  364,  450,  364,  452,  364,  450,
   364,  452,  364,  452,  364,  450,  364,  452,  364,  450,
   364,  452,  364,  452,  364,  450,  364,  452,  364,  450,
   366,  450,  364,  452,  364,  450,  364,  450,  366,  450,
   364,  452,  364,  450, 1130,  450, 1128,  452, 1128,  452,
  1128,  452, 1128,  452,  388,  426
};

// --- POWER OFF (Press #16) -------------------------------------------------
const uint16_t IR_POWER_OFF_F1[227] = {
  3044, 1618,  462, 1118,  462, 1120,  462,  356,  460,  356,
   460,  356,  462, 1118,  462,  354,  462,  354,  460, 1118,
   462, 1118,  462,  354,  462, 1116,  464,  382,  434,  382,
   488, 1064,  492, 1088,  492,  326,  488, 1090,  490, 1090,
   490,  352,  462,  354,  460, 1120,  460,  358,  456,  360,
   454,  364,  452, 1130,  450,  368,  448,  366,  450,  366,
   450,  366,  450,  366,  450,  366,  450,  366,  450,  366,
   450,  366,  450,  366,  450,  366,  450,  366,  450,  366,
   450,  366,  450,  366,  450,  366,  450,  390,  426,  366,
   450,  366,  450,  390,  426, 1130,  450,  366,  450,  366,
   450,  366,  450,  366,  450,  366,  450,  366,  450,  364,
   450,  366,  450,  366,  450,  366,  450,  366,  450,  366,
   450,  366,  450,  366,  450,  366,  450,  366,  450,  366,
   450,  366,  450,  366,  450,  366,  450,  366,  450,  366,
   450,  366,  450,  366,  450,  366,  450,  366,  450,  366,
   450,  366,  450,  366,  450,  366,  450,  366,  450,  366,
   450,  366,  450,  366,  450,  366,  450,  366,  450,  366,
   450,  366,  450,  366,  450,  366,  450,  366,  450,  366,
   450,  366,  450,  390,  426,  366,  450,  366,  450,  390,
   426,  390,  426,  366,  450,  366,  450,  390,  426,  366,
   450,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  366,  450, 1132,  450,  366,  450, 1130,  452,  364,
   452,  364,  450, 1130,  452, 1128,  452,  366,  450
};
const uint16_t IR_POWER_OFF_F2[214] = {
  1128,  450,  366,  450,  366,  450, 1130,  450, 1130,  452,
   364,  450, 1130,  452,  366,  450,  390,  426, 1130,  450,
  1130,  452,  364,  452, 1128,  452, 1130,  450,  364,  452,
   366,  450, 1128,  452,  366,  450,  366,  450, 1130,  452,
   364,  452,  364,  452,  364,  450,  366,  450,  366,  450,
   364,  452,  364,  452,  364,  450,  366,  450,  366,  450,
   366,  450,  364,  450,  366,  450,  364,  452,  364,  450,
   366,  450,  366,  450,  366,  450,  364,  450,  366,  450,
  1130,  450,  364,  452,  364,  452, 1128,  452,  366,  450,
   366,  450,  366,  450,  366,  450,  366,  450,  366,  450,
   366,  450,  366,  450,  366,  450,  366,  450, 1130,  450,
   366,  450,  366,  450,  364,  452,  364,  450, 1130,  450,
  1130,  452,  364,  450,  366,  450,  390,  426,  390,  426,
   390,  426,  390,  426,  366,  450,  390,  426,  390,  426,
   390,  426,  390,  426,  390,  426,  390,  426,  390,  426,
   390,  426,  390,  426,  390,  426,  390,  426,  390,  426,
   390,  426,  390,  426,  390,  426,  390,  426,  390,  426,
   390,  426,  390,  426,  390,  426,  390,  426,  390,  426,
   390,  426,  390,  426,  390,  426,  390,  426,  390,  426,
  1130,  450,  366,  450,  366,  450,  366,  450,  366,  450,
   366,  450, 1130,  450,  366,  450
};

// --- TEMP +1 (Press #7) ----------------------------------------------------
const uint16_t IR_TEMP_UP_F1[227] = {
  3074, 1588,  490, 1090,  490, 1090,  490,  326,  490,  326,
   490,  326,  490, 1090,  492,  326,  490,  326,  490, 1088,
   494, 1088,  494,  326,  514, 1062,  494,  326,  490,  326,
   490, 1088,  492, 1088,  492,  352,  464, 1090,  490, 1092,
   488,  354,  460,  356,  458, 1122,  456,  360,  454,  362,
   452,  390,  426, 1130,  452,  366,  450,  366,  454,  360,
   452,  364,  450,  370,  446,  366,  450,  366,  450,  366,
   450,  388,  428,  388,  428,  366,  450,  366,  450,  366,
   450,  390,  426,  366,  450,  390,  426,  366,  450,  388,
   428,  388,  426, 1130,  450,  364,  452,  364,  452,  364,
   450,  366,  450,  366,  450,  366,  450,  364,  452,  364,
   450,  366,  450,  366,  448,  366,  450,  366,  450,  366,
   450,  366,  450,  364,  450,  366,  450,  366,  450,  366,
   450,  366,  450,  366,  450,  366,  450,  366,  450,  390,
   426,  390,  426,  366,  450,  366,  450,  366,  450,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  366,
   450,  390,  426,  390,  426,  388,  426,  390,  426,  390,
   426,  390,  426,  388,  426,  390,  426,  390,  426,  390,
   426,  388,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  388,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426, 1154,
   426,  388,  426, 1130,  450,  366,  450,  366,  450, 1128,
   452, 1128,  452,  364,  452
};
const uint16_t IR_TEMP_UP_F2[215] = {
   426, 1130,  452,  364,  450,  366,  450, 1130,  450, 1130,
   452,  364,  452, 1128,  452,  364,  450,  366,  450, 1130,
   450, 1128,  452,  364,  452, 1128,  452, 1128,  452,  364,
   452,  364,  452, 1128,  452,  366,  450,  366,  450, 1130,
   450,  366,  450,  366,  450,  364,  452,  364,  450,  366,
   450,  364,  452,  364,  452,  364,  450,  364,  452,  364,
   450,  366,  450,  364,  452,  366,  450,  364,  450,  364,
   452,  364,  452,  364,  450, 1128,  452,  364,  452,  364,
   452, 1128,  452,  364,  452,  364,  452, 1128,  452,  364,
   450,  366,  450,  364,  450,  366,  450,  366,  450,  388,
   426,  390,  426, 1130,  450, 1128,  452, 1128,  452,  364,
   452,  364,  452,  364,  452,  364,  452,  364,  452, 1128,
   452, 1128,  452,  364,  452, 1128,  452, 1128,  452, 1128,
   450,  364,  452,  364,  450,  366,  450,  364,  452,  364,
   450,  366,  450,  364,  450,  366,  450,  364,  452,  364,
   450,  366,  450,  364,  450,  366,  450,  364,  452,  364,
   450,  366,  450,  364,  450,  364,  452,  364,  450,  366,
   450,  364,  450,  366,  450,  364,  450,  366,  450,  364,
   450,  366,  450,  364,  452,  364,  450,  366,  450,  364,
   450,  366,  450,  364,  450,  366,  450,  364,  450,  366,
   450,  364,  450, 1130,  450, 1128,  452, 1128,  452, 1128,
   452, 1128,  452,  364,  452
};

// --- TEMP -1 (Press #8) ----------------------------------------------------
const uint16_t IR_TEMP_DOWN_F1[227] = {
  3046, 1618,  460, 1118,  464, 1118,  488,  328,  488,  328,
   488,  328,  490, 1090,  490,  326,  490,  326,  490, 1088,
   492, 1088,  492,  326,  490, 1088,  518,  326,  464,  326,
   490, 1088,  494, 1088,  494,  326,  488, 1090,  490, 1090,
   488,  354,  462,  354,  460, 1120,  458,  360,  454,  362,
   452,  364,  450, 1130,  452,  364,  452,  364,  452,  364,
   452,  364,  452,  364,  452,  364,  452,  364,  452,  364,
   452,  364,  450,  366,  450,  366,  450,  364,  452,  364,
   452,  364,  452,  364,  452,  364,  452,  364,  452,  364,
   452,  364,  452,  364,  450, 1130,  452,  364,  452,  364,
   452,  364,  452,  364,  452,  364,  452,  364,  452,  364,
   452,  364,  452,  364,  452,  364,  452,  364,  452,  364,
   452,  364,  452,  364,  452,  364,  452,  364,  452,  364,
   452,  364,  452,  364,  450,  364,  452,  364,  452,  364,
   452,  364,  452,  364,  450,  364,  452,  364,  452,  364,
   452,  364,  452,  364,  450,  366,  450,  364,  452,  364,
   452,  364,  450,  364,  452,  364,  452,  364,  452,  364,
   450,  366,  450,  364,  452,  364,  452,  364,  450,  366,
   450,  366,  450,  364,  452,  364,  450,  366,  450,  366,
   450,  364,  452,  364,  452,  364,  450,  366,  450,  364,
   452,  388,  426,  366,  450,  366,  450, 1128,  452,  364,
   452, 1128,  452,  364,  452,  364,  452, 1128,  452, 1128,
   452,  364,  450
};
const uint16_t IR_TEMP_DOWN_F2[215] = {
   426, 1130,  450,  366,  450,  366,  450, 1128,  452, 1130,
   452,  364,  452, 1128,  452,  388,  426,  390,  426, 1130,
   450, 1130,  452,  364,  452, 1128,  452, 1128,  452,  364,
   452,  364,  452, 1128,  452,  388,  426,  390,  426, 1130,
   450,  366,  450,  366,  450,  366,  450,  364,  450,  366,
   450,  366,  450,  364,  452,  364,  450,  366,  450,  366,
   450,  364,  450,  366,  450,  366,  450,  364,  452,  364,
   450,  366,  450,  366,  450, 1130,  452,  364,  452,  366,
   450, 1128,  452,  364,  452,  364,  452, 1128,  452,  388,
   426,  390,  426,  390,  426,  388,  426,  390,  426,  390,
   426,  388,  426,  390,  426,  390,  426,  388,  426, 1130,
   450,  366,  450,  366,  450,  388,  426,  366,  450, 1128,
   452, 1128,  452,  364,  452, 1128,  452, 1130,  450, 1130,
   450,  364,  452,  364,  452,  364,  452,  364,  452,  364,
   452,  364,  450,  364,  452,  364,  452,  364,  450,  364,
   452,  364,  452,  364,  450,  364,  452,  364,  452,  364,
   450,  364,  452,  364,  450,  364,  452,  364,  450,  366,
   450,  364,  452,  364,  450,  366,  450,  364,  452,  364,
   450,  366,  450,  364,  452,  364,  450,  366,  450,  364,
   450,  366,  450,  364,  450,  366,  450,  366,  450, 1128,
   452,  364,  452, 1128,  452, 1128,  452, 1128,  452, 1128,
   452, 1128,  452,  364,  452
};

// --- SWING (Press #13) -----------------------------------------------------
const uint16_t IR_SWING_F1[227] = {
  3068, 1594,  486, 1094,  488, 1094,  486,  332,  484,  332,
   462,  354,  462, 1118,  462,  354,  462,  356,  460, 1118,
   464, 1118,  464,  382,  434, 1116,  464,  382,  436,  380,
   434, 1116,  464, 1118,  464,  382,  434, 1118,  464, 1118,
   462,  382,  460,  356,  460, 1120,  460,  358,  458,  360,
   456,  360,  454, 1128,  452,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426, 1156,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426, 1154,  426,  366,  450, 1130,
   450,  364,  450,  366,  450, 1130,  450, 1130,  450,  366,
   450
};
const uint16_t IR_SWING_F2[219] = {
   426,  390,  426,  390,  426, 1156,  426,  390,  426,  390,
   426, 1130,  450, 1130,  452,  364,  450, 1130,  452,  390,
   426,  390,  426, 1130,  450, 1130,  450,  366,  450, 1130,
   450, 1130,  450,  366,  450,  366,  450, 1130,  452,  364,
   450,  366,  450, 1130,  452,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426, 1130,
   450,  366,  450,  366,  450, 1130,  450,  366,  450,  366,
   450, 1130,  456,  362,  450,  366,  450,  370,  446,  366,
   450,  364,  450,  366,  450,  366,  450,  364,  450,  366,
   450,  366,  450, 1128,  452,  366,  450,  366,  450,  366,
   450,  366,  450, 1130,  450, 1128,  452,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  394,  422,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  424,  390,  426,  390,  426,  390,
   426,  390,  426,  390,  426,  390,  424,  390,  426,  390,
   426,  390,  424,  390,  426,  390,  424, 1156,  426,  390,
   426, 1132,  450,  366,  450,  390,  426,  366,  450, 1130,
   450,  366,  450
};

// ===========================================================================
// === Send one captured command (frame 1 + 25 ms gap + frame 2) =============
// ===========================================================================
void sendPair(const uint16_t* f1, size_t f1_len,
              const uint16_t* f2, size_t f2_len,
              const char* label) {
  digitalWrite(STATUS_LED, LOW);
  uint32_t t0 = millis();

  irsend.sendRaw(f1, f1_len, IR_CARRIER);
  delay(FRAME_GAP_MS);
  irsend.sendRaw(f2, f2_len, IR_CARRIER);

  lastDurationMs = millis() - t0;
  sendCount++;
  lastCmd = String(label);
  digitalWrite(STATUS_LED, HIGH);
  Serial.printf("IR %s -> %u ms (#%u)\n",
                label, (unsigned)lastDurationMs, (unsigned)sendCount);
}

bool sendCommand(const String& cmd) {
  if      (cmd == "power_on")  sendPair(IR_POWER_ON_F1, 227, IR_POWER_ON_F2, 216, "power_on");
  else if (cmd == "power_off") sendPair(IR_POWER_OFF_F1, 227, IR_POWER_OFF_F2, 214, "power_off");
  else if (cmd == "temp_up")   sendPair(IR_TEMP_UP_F1, 227, IR_TEMP_UP_F2, 215, "temp_up");
  else if (cmd == "temp_down") sendPair(IR_TEMP_DOWN_F1, 227, IR_TEMP_DOWN_F2, 215, "temp_down");
  else if (cmd == "swing")     sendPair(IR_SWING_F1, 227, IR_SWING_F2, 219, "swing");
  else return false;
  return true;
}

// --- Publish current state to Firebase /aircon/ir/state ---------------------
String stateJson() {
  String s = "{";
  s += "\"last\":\"";       s += lastCmd;                  s += "\",";
  s += "\"duration_ms\":";  s += String(lastDurationMs);   s += ",";
  s += "\"count\":";        s += String(sendCount);        s += ",";
  s += "\"ts\":";           s += String(millis());
  s += "}";
  return s;
}
void publishState() {
  if (inSoftAP || WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(STATE_URL);
  http.addHeader("Content-Type", "application/json");
  http.PUT(stateJson());
  http.end();
}

// --- Naive JSON extractor (same shape as autoclicker / servo aircon) --------
String extractStr(const String& body, const char* key) {
  String pat = String("\"") + key + "\":\"";
  int i = body.indexOf(pat);
  if (i < 0) return "";
  i += pat.length();
  int j = body.indexOf('"', i);
  if (j < 0) return "";
  return body.substring(i, j);
}
void applyCommand(const String& body) {
  String cmd = extractStr(body, "cmd");
  if (cmd.length() == 0) return;
  if (sendCommand(cmd)) publishState();
}

// --- Built-in web UI --------------------------------------------------------
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b1220">
<title>Aircon IR</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
  html,body{height:100%}
  body{background:radial-gradient(1200px 800px at 50% -10%,#0c4a6e 0%,#0b1220 55%,#020617 100%);
       color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;
       min-height:100dvh;display:flex;flex-direction:column;align-items:center;
       padding:env(safe-area-inset-top) 1.25rem env(safe-area-inset-bottom)}
  header{width:100%;padding:1.25rem 0 .5rem;display:flex;justify-content:space-between;align-items:center}
  .brand{font-size:.78rem;letter-spacing:.22em;text-transform:uppercase;color:#cbd5e1;font-weight:600}
  .pill{font-size:.65rem;letter-spacing:.18em;text-transform:uppercase;color:#67e8f9;
       padding:.35rem .7rem;border-radius:999px;border:1px solid rgba(103,232,249,.25);background:rgba(8,47,73,.5)}
  main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;width:100%;max-width:22rem;padding:1.5rem 0}
  .row{display:flex;gap:.75rem;width:100%}
  .btn{flex:1;border:none;cursor:pointer;color:#fff;border-radius:1rem;padding:1.1rem .75rem;
       font-family:inherit;font-size:.85rem;letter-spacing:.18em;text-transform:uppercase;font-weight:700;
       background:rgba(15,23,42,.7);border:1px solid rgba(148,163,184,.18);
       transition:transform .1s ease, background .15s ease}
  .btn:active{transform:scale(.96)}
  .btn-on{background:linear-gradient(160deg,#22d3ee 0%,#0ea5e9 60%,#0369a1 100%);border-color:rgba(125,211,252,.35)}
  .btn-off{background:linear-gradient(160deg,#475569 0%,#334155 60%,#1e293b 100%);border-color:rgba(148,163,184,.25)}
  .btn-warm{background:rgba(15,23,42,.7)}
  footer{width:100%;padding:1rem 0 1.5rem}
  .status{display:inline-flex;align-items:center;gap:.55rem;padding:.55rem 1.1rem;border-radius:999px;
       background:rgba(15,23,42,.7);border:1px solid rgba(148,163,184,.15);
       font-size:.7rem;letter-spacing:.12em;font-family:"JetBrains Mono",ui-monospace,monospace;color:#94a3b8}
  .status-dot{width:.45rem;height:.45rem;border-radius:50%;background:#475569}
</style>
</head>
<body>
<header>
  <div class="brand">Aircon · IR</div>
  <div class="pill" id="lastPill">idle</div>
</header>
<main>
  <div class="row">
    <button class="btn btn-on"  data-cmd="power_on">Power On</button>
    <button class="btn btn-off" data-cmd="power_off">Power Off</button>
  </div>
  <div class="row">
    <button class="btn btn-warm" data-cmd="temp_down">Temp −</button>
    <button class="btn btn-warm" data-cmd="temp_up">Temp +</button>
  </div>
  <div class="row">
    <button class="btn btn-warm" data-cmd="swing">Swing</button>
  </div>
</main>
<footer style="display:flex;justify-content:center">
  <span class="status"><span class="status-dot"></span><span id="statusText">ready</span></span>
</footer>
<script>
const $=id=>document.getElementById(id);
async function fire(cmd){
  $("statusText").textContent="sending "+cmd+"...";
  try{
    const r=await fetch("/set",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cmd})});
    const j=await r.json();
    $("lastPill").textContent=j.last+" · #"+(j.count|0);
    $("statusText").textContent=(j.last||"sent")+" · "+(j.duration_ms|0)+" ms";
  }catch(e){$("statusText").textContent="failed";}
}
document.querySelectorAll("button[data-cmd]").forEach(b=>{
  b.addEventListener("click",()=>fire(b.dataset.cmd));
});
</script>
</body>
</html>
)rawliteral";

void sendStateResp() {
  server.send(200, "application/json", stateJson());
}

void handleRoot()  { server.send_P(200, "text/html; charset=utf-8", INDEX_HTML); }
void handleState() { sendStateResp(); }
void handleSet() {
  if (!server.hasArg("plain")) { server.send(400, "text/plain", "missing body"); return; }
  applyCommand(server.arg("plain"));
  sendStateResp();
}

void clearCommand() {
  HTTPClient http;
  http.begin(DB_URL);
  http.addHeader("Content-Type", "application/json");
  http.PUT("\"\"");
  http.end();
}

void startSoftAP() {
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  inSoftAP = true;
  Serial.println("SoftAP up: " + String(AP_SSID) + " · " + WiFi.softAPIP().toString());
}

bool tryStation() {
  WiFi.mode(WIFI_STA);
  Serial.print("Connecting to WiFi");
  unsigned long t0 = millis();
  while (wifiMulti.run() != WL_CONNECTED && millis() - t0 < WIFI_CONNECT_TIMEOUT_MS) {
    delay(300); Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected: " + WiFi.SSID() + " · " + WiFi.localIP().toString());
    return true;
  }
  return false;
}

void setup() {
  Serial.begin(115200);

  irsend.begin();

  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, HIGH);

  wifiMulti.addAP("CAYNO", "lokomoko");
  wifiMulti.addAP("Charlie's iPhone", "charlie24");

  // WiFi station mode first; SoftAP only if no known network shows up.
  if (!tryStation()) startSoftAP();

  server.on("/", handleRoot);
  server.on("/state", HTTP_GET,  handleState);
  server.on("/set",   HTTP_POST, handleSet);
  server.onNotFound(handleRoot);
  server.begin();

  String ip = inSoftAP ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
  Serial.println("Web UI: http://" + ip + "/");

  publishState();
}

void loop() {
  server.handleClient();

  static unsigned long lastPoll = 0;
  if (!inSoftAP && millis() - lastPoll >= POLL_MS) {
    lastPoll = millis();
    if (wifiMulti.run() != WL_CONNECTED) return;

    HTTPClient http;
    http.begin(DB_URL);
    int code = http.GET();
    if (code == 200) {
      String body = http.getString();
      body.trim();
      if (body.length() > 2 && body != "null" && body != "\"\"") {
        Serial.println(">>> received: " + body);
        applyCommand(body);
        clearCommand();
      }
    }
    http.end();
  }

  delay(2);
}
