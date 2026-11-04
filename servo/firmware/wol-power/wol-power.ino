// ===========================================================================
// wol-power.ino — ESP32-C3 SuperMini: the servo's "click", without the servo
// ---------------------------------------------------------------------------
// Drop-in replacement for servo-sweep.ino. Same RTDB paths, same commands, so
// the Cloud Scheduler job, gemini-proxy /servo-poweron and the phone page are
// unchanged. A "click" now behaves like pressing the PC power button:
//
//   PC off / asleep  -> send a Wake-on-LAN magic packet (PC boots)
//   PC on            -> tell the PC listener (servo/pc-power) to shut down
//
// "Is the PC on?" = UDP broadcast "SERVO-PING <token>" on port 40510; the PC
// listener answers "SERVO-PONG". No answer within ~1.5 s = off. No PC IP needed.
//
// Commands on /servo/command (cleared back to "" after acting):
//   click / toggle -> power toggle (wake if off, shut down if on)
//   press          -> wake only (never shuts down)
//   release        -> shut down only (no-op if off)
// /servo/auto (true) -> wake-only every AUTO_INTERVAL_MS (never shuts down).
// /servo/state       -> true if the PC answered on the last check, else false.
//
// Needs the ESP32 on the same LAN as the PC (same router; WiFi -> wired is fine).
// Board: "ESP32C3 Dev Module", USB CDC On Boot: Enabled. No extra libraries.
// ===========================================================================

#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiClientSecure.h>
#include <WiFiUdp.h>
#include <HTTPClient.h>
#include <esp_task_wdt.h>

// --- PC ----------------------------------------------------------------------
// MAC of the PC's wired NIC (Intel I211, "Ethernet"). Get-NetAdapter shows it.
const uint8_t PC_MAC[6] = { 0xE0, 0xD5, 0x5E, 0x6D, 0x49, 0xE3 };
const uint16_t PC_PORT  = 40510;                 // must match listener.ps1
const char* PC_TOKEN    = "k7Qm2vXe9Rt4";        // must match listener.ps1

// --- WiFi --------------------------------------------------------------------
WiFiMulti wifiMulti;
WiFiUDP udp;

// --- Firebase RTDB -----------------------------------------------------------
const char* FB_HOST = "test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app";
const char* STREAM_PATH = "/servo/command.json";
const char* CMD_URL   = "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app/servo/command.json";
const char* STATE_URL = "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app/servo/state.json";
const char* AUTO_URL  = "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app/servo/auto.json";

// --- Auto mode ---------------------------------------------------------------
bool autoOn = false;
unsigned long lastAutoPoll = 0, lastAutoClick = 0;
const unsigned long AUTO_INTERVAL_MS = 240000; // every 4 minutes
const unsigned long AUTO_POLL_MS     = 2000;

bool pcOn = false;              // result of the last ping (published as /servo/state)
IPAddress pcAddr;               // who answered the last ping

// --- SSE command stream ------------------------------------------------------
// A fresh client per attempt: a failed TLS connect must not leave state behind.
WiFiClientSecure* stream = nullptr;
int streamFails = 0;                      // connects in a row with no data back
const int STREAM_FAIL_REBOOT = 6;         // ~2 min of failures, then start clean
unsigned long lastStreamAttempt = 0;
const unsigned long STREAM_RECONNECT_MS = 1500;
// The first stream event is a snapshot of whatever /servo/command already held
// (e.g. a click sent while the board was offline). It is cleared, never run.
bool skipSnapshot = true;

// --- Staying online (escalating recovery) --------------------------------------
// The board sometimes had power but sat off WiFi even with WiFi up. Fixes:
//  - low TX power: the C3 SuperMini's antenna is poor, and full power often
//    can't associate or keeps dropping off
//  - offline:  retry every 5 s, reset the radio after 1 min, reboot after 3 min
//  - "connected" but no internet (stream dead, Firebase unreachable): reconnect
//    the stream, reset the radio after 3 min, reboot after 6 min
//  - hardware watchdog: reboots if anything hangs for 60 s
unsigned long lastWifiAttempt = 0;
const unsigned long WIFI_RETRY_MS = 5000;
unsigned long wifiLostSince = 0;          // 0 = connected
bool radioResetDone = false;
const unsigned long WIFI_RADIO_RESET_MS = 60000;
const unsigned long WIFI_REBOOT_MS      = 180000;

unsigned long lastStreamActivity = 0;     // last byte from Firebase (keep-alive every ~30 s)
unsigned long streamConnectedAt = 0;
const unsigned long STREAM_STALE_MS      = 90000;
const unsigned long CLOUD_RADIO_RESET_MS = 180000;
const unsigned long CLOUD_REBOOT_MS      = 360000;
bool cloudRadioResetDone = false;

const uint32_t WDT_TIMEOUT_MS = 60000;

void publishState() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(STATE_URL);
  http.addHeader("Content-Type", "application/json");
  http.PUT(pcOn ? "true" : "false");
  http.end();
}

void clearCommand() {
  HTTPClient http;
  http.begin(CMD_URL);
  http.addHeader("Content-Type", "application/json");
  http.PUT("\"\"");
  http.end();
}

IPAddress lanBroadcast() {
  IPAddress ip = WiFi.localIP(), mask = WiFi.subnetMask(), b;
  for (int i = 0; i < 4; i++) b[i] = ip[i] | ~mask[i];
  return b;
}

void sendUdp(IPAddress to, uint16_t port, const uint8_t* buf, size_t len) {
  udp.beginPacket(to, port);
  udp.write(buf, len);
  udp.endPacket();
}

void sendUdp(IPAddress to, uint16_t port, const String& s) {
  sendUdp(to, port, (const uint8_t*)s.c_str(), s.length());
}

// --- PC presence -------------------------------------------------------------
// Broadcast a ping up to 3 times; true if the listener answers.
bool pingPc() {
  String ping = String("SERVO-PING ") + PC_TOKEN;
  while (udp.parsePacket() > 0) udp.flush();      // drop stale replies
  for (int attempt = 0; attempt < 3; attempt++) {
    sendUdp(lanBroadcast(), PC_PORT, ping);
    unsigned long t0 = millis();
    while (millis() - t0 < 500) {
      if (udp.parsePacket() > 0) {
        char buf[32] = {0};
        udp.read(buf, sizeof(buf) - 1);
        if (String(buf).startsWith("SERVO-PONG")) {
          pcAddr = udp.remoteIP();
          return true;
        }
      }
      delay(5);
    }
  }
  return false;
}

// --- Actions -----------------------------------------------------------------
void wake() {
  uint8_t pkt[102];
  memset(pkt, 0xFF, 6);
  for (int i = 0; i < 16; i++) memcpy(pkt + 6 + i * 6, PC_MAC, 6);
  IPAddress bc = lanBroadcast();
  for (int i = 0; i < 3; i++) {                   // UDP is lossy; repeat
    sendUdp(bc, 9, pkt, sizeof(pkt));
    sendUdp(IPAddress(255, 255, 255, 255), 9, pkt, sizeof(pkt));
    sendUdp(bc, 7, pkt, sizeof(pkt));
    delay(50);
  }
  Serial.println("wake -> magic packet sent");
}

void shutdownPc() {
  String off = String("SERVO-OFF ") + PC_TOKEN;
  for (int i = 0; i < 2; i++) { sendUdp(pcAddr, PC_PORT, off); delay(50); }
  Serial.println("shutdown -> sent to " + pcAddr.toString());
}

void doClick() {           // like the power button: toggle
  pcOn = pingPc();
  if (pcOn) { shutdownPc(); pcOn = false; }
  else      { wake(); }
  publishState();
}

void doPress() {           // wake only
  pcOn = pingPc();
  if (!pcOn) wake();
  else Serial.println("press -> PC already on");
  publishState();
}

void doRelease() {         // shut down only
  pcOn = pingPc();
  if (pcOn) { shutdownPc(); pcOn = false; }
  else Serial.println("release -> PC already off");
  publishState();
}

// --- Firebase command stream -------------------------------------------------
void dropStream() {
  if (!stream) return;
  stream->stop();
  delete stream;
  stream = nullptr;
}

bool streamUp() { return stream && stream->connected(); }

void connectStream() {
  dropStream();
  stream = new WiFiClientSecure();
  stream->setInsecure();
  stream->setTimeout(15000);
  stream->setHandshakeTimeout(20);
  unsigned long t0 = millis();
  if (!stream->connect(FB_HOST, 443)) {
    char err[100] = "";
    int code = stream->lastError(err, sizeof(err) - 1);
    Serial.printf("Stream connect failed (%d in a row) after %lu ms: %d %s, heap %u\n",
                  streamFails + 1, millis() - t0, code, err, ESP.getFreeHeap());
    dropStream();
    if (++streamFails >= STREAM_FAIL_REBOOT) reboot("Firebase unreachable");
    return;
  }
  String req =
    String("GET ") + STREAM_PATH + " HTTP/1.1\r\n" +
    "Host: " + FB_HOST + "\r\n" +
    "Accept: text/event-stream\r\n" +
    "Cache-Control: no-cache\r\n" +
    "Connection: keep-alive\r\n\r\n";
  stream->print(req);
  skipSnapshot = true;
  streamConnectedAt = millis();
  Serial.println("Stream connected — listening on /servo/command");
}

void handleStreamData(const String& line) {
  int p = line.indexOf("\"data\":");
  if (p < 0) return;
  String val = line.substring(p + 7);
  val.trim();
  if (val.endsWith("}")) val = val.substring(0, val.length() - 1);
  val.trim();
  val.replace("\"", "");
  val.trim();
  if (skipSnapshot) {
    skipSnapshot = false;
    if (val.length() > 0 && val != "null") {
      Serial.println("ignored stale command: " + val);
      clearCommand();
    }
    publishState();       // the one at boot may have failed before the cloud was up
    return;
  }
  if (val.length() == 0 || val == "null") return;
  Serial.println(">>> " + val);
  if      (val == "click" || val == "toggle") { doClick();   clearCommand(); }
  else if (val == "press")                    { doPress();   clearCommand(); }
  else if (val == "release")                  { doRelease(); clearCommand(); }
}

void processStream() {
  while (streamUp() && stream->available()) {
    String line = stream->readStringUntil('\n');
    lastStreamActivity = millis();
    streamFails = 0;
    line.trim();
    if (line.startsWith("data:")) handleStreamData(line.substring(5));
  }
}

void pollAuto() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(AUTO_URL);
  if (http.GET() == 200) {
    String b = http.getString();
    b.trim();
    bool now = (b == "true");
    if (now && !autoOn) lastAutoClick = millis() - AUTO_INTERVAL_MS;
    if (now != autoOn) { autoOn = now; Serial.println(now ? "AUTO on" : "AUTO off"); }
  }
  http.end();
}

// --- WiFi recovery -----------------------------------------------------------
void radioUp() {
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_8_5dBm);   // SuperMini antenna: full power often fails
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
}

void resetRadio() {
  Serial.println("WiFi: resetting radio");
  dropStream();
  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_OFF);
  delay(500);
  radioUp();
}

void reboot(const char* why) {
  Serial.printf("REBOOT: %s\n", why);
  delay(200);
  ESP.restart();
}

void onConnected() {
  Serial.println("WiFi: " + WiFi.SSID() + " · " + WiFi.localIP().toString() +
                 " · RSSI " + String(WiFi.RSSI()));
  WiFi.setSleep(false);
  udp.stop();
  udp.begin(PC_PORT);     // replies from the PC come back to this port
  wifiLostSince = 0;
  radioResetDone = false;
  lastStreamActivity = millis();   // give the cloud a fresh grace period
  cloudRadioResetDone = false;
}

// Returns true when WiFi is up. Otherwise retries, escalating the longer it's down.
bool keepWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    if (wifiLostSince) onConnected();
    return true;
  }
  if (!wifiLostSince) { wifiLostSince = millis(); Serial.println("WiFi lost"); }
  unsigned long down = millis() - wifiLostSince;
  if (down >= WIFI_REBOOT_MS) reboot("WiFi down 3 min");
  if (!radioResetDone && down >= WIFI_RADIO_RESET_MS) { radioResetDone = true; resetRadio(); }
  if (millis() - lastWifiAttempt >= WIFI_RETRY_MS) {
    lastWifiAttempt = millis();
    Serial.println("WiFi: rescanning saved networks");
    if (wifiMulti.run(8000) == WL_CONNECTED) { onConnected(); return true; }
  }
  return false;
}

// WiFi says connected but Firebase has gone quiet: the link is up but useless.
void keepCloud() {
  unsigned long quiet = millis() - lastStreamActivity;
  if (quiet >= CLOUD_REBOOT_MS) reboot("no Firebase for 6 min");
  if (!cloudRadioResetDone && quiet >= CLOUD_RADIO_RESET_MS) {
    cloudRadioResetDone = true;
    resetRadio();
    return;
  }
  if (quiet < 10000) cloudRadioResetDone = false;
  unsigned long since = millis() - max(lastStreamActivity, streamConnectedAt);
  if (streamUp() && since >= STREAM_STALE_MS) {
    Serial.println("Stream silent 90 s — reconnecting");
    dropStream();
  }
}

// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  esp_task_wdt_config_t wdt = { .timeout_ms = WDT_TIMEOUT_MS, .idle_core_mask = 0, .trigger_panic = true };
  if (esp_task_wdt_reconfigure(&wdt) != ESP_OK) esp_task_wdt_init(&wdt);
  esp_task_wdt_add(NULL);

  wifiMulti.addAP("CharLa", "Kahitano1!");
  wifiMulti.addAP("CAYNO", "lokomoko");
  wifiMulti.addAP("Chaelri", "charlie24");
  wifiMulti.addAP("GFiber_3DAAA", "F09C2D58");

  radioUp();
  Serial.print("Connecting to WiFi");
  unsigned long t0 = millis();
  bool radioReset = false;
  while (wifiMulti.run(8000) != WL_CONNECTED) {
    esp_task_wdt_reset();
    Serial.print(".");
    if (!radioReset && millis() - t0 >= WIFI_RADIO_RESET_MS) { radioReset = true; resetRadio(); }
    if (millis() - t0 >= WIFI_REBOOT_MS) reboot("no WiFi at boot");
    delay(300);
  }
  Serial.println();
  onConnected();

  pcOn = pingPc();
  Serial.println(pcOn ? "PC is on (" + pcAddr.toString() + ")" : "PC not answering");
  publishState();
  connectStream();
}

void loop() {
  esp_task_wdt_reset();

  if (!keepWifi()) { delay(10); return; }
  keepCloud();

  if (streamUp()) {
    processStream();
  } else if (millis() - lastStreamAttempt >= STREAM_RECONNECT_MS) {
    lastStreamAttempt = millis();
    connectStream();
  }

  // Each poll is a blocking HTTPS call; while the stream is down it would only
  // eat into the time left for reconnecting.
  if (streamUp() && millis() - lastAutoPoll >= AUTO_POLL_MS) { lastAutoPoll = millis(); pollAuto(); }
  if (autoOn && millis() - lastAutoClick >= AUTO_INTERVAL_MS) {
    lastAutoClick = millis();
    doPress();            // auto never shuts the PC down
  }

  delay(1);
}
