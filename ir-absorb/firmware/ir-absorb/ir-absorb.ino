// ===========================================================================
// ir-absorb.ino — ESP32-C3 firmware that ABSORBS any IR remote and replays it.
// ---------------------------------------------------------------------------
// Behaviour:
//   * On boot, RX listens to whatever IR signals come in.
//   * Every captured signal is POSTed to Firebase under /ir-absorb/captures/
//     as raw timings (mark/space microseconds), so the phone UI can list it.
//   * Phone UI lets the user name each capture and tap to transmit it.
//   * When phone writes {"txId":"<id>"} to /ir-absorb/command, the firmware
//     fetches that capture, parses its rawData array, and bit-bangs the
//     exact same mark/space pattern out the TX module at 38 kHz / 33% duty.
//
// Wiring (same as the aircon project — both modules on this one board):
//   IR receiver  OUT -> GPIO2
//   IR receiver  GND -> GND
//   IR receiver  VCC -> 3V3
//   IR transmitter DAT -> GPIO3
//   IR transmitter GND -> GND
//   IR transmitter VCC -> 3V3 (or 5V)
//
// Library: IRremoteESP8266 (just for IRrecv decoding; TX is manual LEDC).
// Board:   "ESP32C3 Dev Module"   USB CDC On Boot: Enabled
// Baud:    115200
// ===========================================================================

#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>
#include <IRremoteESP8266.h>
#include <IRrecv.h>
#include <IRutils.h>

// --- Pins -------------------------------------------------------------------
const uint16_t RX_PIN     = 2;
const uint16_t TX_PIN     = 3;
const int      STATUS_LED = 8;   // onboard blue LED, active LOW

// --- WiFi -------------------------------------------------------------------
WiFiMulti wifiMulti;

// --- Firebase ---------------------------------------------------------------
const String DB_BASE =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app";

// --- IR receiver ------------------------------------------------------------
const uint16_t kCaptureBufferSize = 1024;
const uint8_t  kTimeout           = 15;
const uint16_t kMinUnknownSize    = 12;

IRrecv irrecv(RX_PIN, kCaptureBufferSize, kTimeout, /*save_buffer=*/true);
decode_results results;

// --- IR transmitter (manual 38 kHz / 33% duty via LEDC) ---------------------
const uint32_t TX_CARRIER_FREQ_HZ = 38000;
const uint8_t  TX_CARRIER_RES     = 8;
const uint8_t  TX_CARRIER_DUTY    = 85;   // 85/255 ≈ 33.3%

// Buffer for the raw timings we replay. 700 entries covers basically every
// consumer IR remote (NEC ~67, AC remotes ~250-300).
static uint16_t replayBuf[700];

// --- Runtime ----------------------------------------------------------------
uint32_t captureCount = 0;
uint32_t replayCount  = 0;
String   lastReplayId = "";

// === IR TX manual bit-bang =================================================
void setupCarrier() {
  ledcAttach(TX_PIN, TX_CARRIER_FREQ_HZ, TX_CARRIER_RES);
  ledcWrite(TX_PIN, 0);
}

inline void mMark(uint32_t us) {
  ledcWrite(TX_PIN, TX_CARRIER_DUTY);
  delayMicroseconds(us);
}

inline void mSpace(uint32_t us) {
  ledcWrite(TX_PIN, 0);
  delayMicroseconds(us);
}

void replayRaw(uint16_t* timings, size_t count) {
  digitalWrite(STATUS_LED, LOW);
  for (size_t i = 0; i < count; i++) {
    if (i % 2 == 0) mMark(timings[i]);     // even index = mark
    else            mSpace(timings[i]);     // odd index = space
  }
  ledcWrite(TX_PIN, 0);
  digitalWrite(STATUS_LED, HIGH);
}

// === Push a capture to Firebase =============================================
String buildCaptureJson() {
  String json = "{";
  json += "\"name\":\"\",";
  json += "\"protocol\":\""
        + typeToString(results.decode_type, results.repeat) + "\",";
  json += "\"bits\":" + String(results.bits) + ",";
  if (!hasACState(results.decode_type)) {
    json += "\"value\":\"0x" + uint64ToString(results.value, 16) + "\",";
  }
  json += "\"rawLen\":" + String(results.rawlen > 0 ? results.rawlen - 1 : 0) + ",";
  json += "\"rawData\":[";
  for (uint16_t i = 1; i < results.rawlen; i++) {
    if (i > 1) json += ',';
    json += String((uint32_t)results.rawbuf[i] * kRawTick);
  }
  json += "],";
  // Server-side timestamp — Firebase fills in current Unix ms.
  json += "\"capturedAt\":{\".sv\":\"timestamp\"}";
  json += "}";
  return json;
}

void pushCapture() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(DB_BASE + "/ir-absorb/captures.json");
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(buildCaptureJson());
  http.end();

  if (code == 200) {
    captureCount++;
    Serial.printf("captured #%u  proto=%s  bits=%u  rawLen=%u  -> firebase\n",
                  (unsigned)captureCount,
                  typeToString(results.decode_type, results.repeat).c_str(),
                  results.bits,
                  results.rawlen - 1);
  } else {
    Serial.printf("capture push failed (HTTP %d)\n", code);
  }
}

// === Poll Firebase for replay commands =====================================
String extractStr(const String& body, const char* key) {
  String pat = String("\"") + key + "\":\"";
  int i = body.indexOf(pat);
  if (i < 0) return "";
  i += pat.length();
  int j = body.indexOf('"', i);
  if (j < 0) return "";
  return body.substring(i, j);
}

size_t parseRawData(const String& body, uint16_t* out, size_t maxLen) {
  int start = body.indexOf("\"rawData\":[");
  if (start < 0) return 0;
  start += 11;   // skip past "rawData":[
  int end = body.indexOf(']', start);
  if (end < 0) return 0;

  size_t count = 0;
  int pos = start;
  while (pos < end && count < maxLen) {
    int comma = body.indexOf(',', pos);
    if (comma < 0 || comma > end) comma = end;
    out[count++] = (uint16_t)body.substring(pos, comma).toInt();
    pos = comma + 1;
  }
  return count;
}

void executeReplay(const String& id) {
  HTTPClient http;
  http.begin(DB_BASE + "/ir-absorb/captures/" + id + ".json");
  int code = http.GET();
  if (code != 200) {
    Serial.printf("fetch capture %s failed (HTTP %d)\n", id.c_str(), code);
    http.end();
    return;
  }
  String body = http.getString();
  http.end();

  size_t n = parseRawData(body, replayBuf, 700);
  if (n == 0) {
    Serial.printf("capture %s had no rawData\n", id.c_str());
    return;
  }

  Serial.printf("replaying capture %s : %u timings\n", id.c_str(), (unsigned)n);
  replayRaw(replayBuf, n);
  replayCount++;
  lastReplayId = id;
}

void clearCommand() {
  HTTPClient http;
  http.begin(DB_BASE + "/ir-absorb/command.json");
  http.addHeader("Content-Type", "application/json");
  http.PUT("\"\"");
  http.end();
}

void publishState() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(DB_BASE + "/ir-absorb/state.json");
  http.addHeader("Content-Type", "application/json");
  String s = "{";
  s += "\"captureCount\":" + String(captureCount) + ",";
  s += "\"replayCount\":"  + String(replayCount)  + ",";
  s += "\"lastReplayId\":\"" + lastReplayId + "\",";
  s += "\"uptimeMs\":"     + String(millis());
  s += "}";
  http.PUT(s);
  http.end();
}

void pollCommand() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(DB_BASE + "/ir-absorb/command.json");
  int code = http.GET();
  String body;
  if (code == 200) body = http.getString();
  http.end();

  body.trim();
  if (body.length() <= 4 || body == "null" || body == "\"\"") return;

  String txId = extractStr(body, "txId");
  if (txId.length() == 0) return;

  executeReplay(txId);
  clearCommand();
  publishState();
}

// === setup / loop ===========================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, HIGH);

  setupCarrier();

  pinMode(RX_PIN, INPUT_PULLUP);
  irrecv.setUnknownThreshold(kMinUnknownSize);
  irrecv.enableIRIn(/*pullup=*/true);

  wifiMulti.addAP("CAYNO", "lokomoko");
  wifiMulti.addAP("Charlie's iPhone", "charlie24");

  Serial.println();
  Serial.println("====================================================");
  Serial.println(" ir-absorb — capture any IR remote, replay any time");
  Serial.println("====================================================");
  Serial.printf (" RX pin: GPIO%u    TX pin: GPIO%u (38 kHz, 33%% duty)\n",
                 (unsigned)RX_PIN, (unsigned)TX_PIN);
  Serial.print  (" Connecting to WiFi");
  unsigned long t0 = millis();
  while (wifiMulti.run() != WL_CONNECTED && millis() - t0 < 15000) {
    delay(300); Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" WiFi: " + WiFi.SSID() + " @ " + WiFi.localIP().toString());
  } else {
    Serial.println(" WiFi: not connected yet — will keep retrying in loop.");
  }

  publishState();
  Serial.println(" Listening for IR... point a remote and press a button.");
}

void loop() {
  if (irrecv.decode(&results)) {
    pushCapture();
    irrecv.resume();
  }

  static uint32_t lastPoll = 0;
  if (millis() - lastPoll >= 1000) {
    lastPoll = millis();
    pollCommand();
  }

  delay(2);
}
