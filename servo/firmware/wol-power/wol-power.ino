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
WiFiClientSecure streamClient;
unsigned long lastStreamAttempt = 0;
const unsigned long STREAM_RECONNECT_MS = 1500;
// The first stream event is a snapshot of whatever /servo/command already held
// (e.g. a click sent while the board was offline). It is cleared, never run.
bool skipSnapshot = true;

unsigned long lastWifiAttempt = 0;
const unsigned long WIFI_RETRY_MS = 5000;

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
void connectStream() {
  streamClient.stop();
  streamClient.setInsecure();
  streamClient.setTimeout(15000);
  if (!streamClient.connect(FB_HOST, 443)) { Serial.println("Stream connect failed"); return; }
  String req =
    String("GET ") + STREAM_PATH + " HTTP/1.1\r\n" +
    "Host: " + FB_HOST + "\r\n" +
    "Accept: text/event-stream\r\n" +
    "Cache-Control: no-cache\r\n" +
    "Connection: keep-alive\r\n\r\n";
  streamClient.print(req);
  skipSnapshot = true;
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
    return;
  }
  if (val.length() == 0 || val == "null") return;
  Serial.println(">>> " + val);
  if      (val == "click" || val == "toggle") { doClick();   clearCommand(); }
  else if (val == "press")                    { doPress();   clearCommand(); }
  else if (val == "release")                  { doRelease(); clearCommand(); }
}

void processStream() {
  while (streamClient.connected() && streamClient.available()) {
    String line = streamClient.readStringUntil('\n');
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

// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  wifiMulti.addAP("CharLa", "Kahitano1!");
  wifiMulti.addAP("CAYNO", "lokomoko");
  wifiMulti.addAP("Chaelri", "charlie24");
  wifiMulti.addAP("GFiber_3DAAA", "F09C2D58");

  Serial.print("Connecting to WiFi");
  while (wifiMulti.run() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.println();
  Serial.println("WiFi: " + WiFi.SSID() + " · " + WiFi.localIP().toString());
  WiFi.setSleep(false);
  udp.begin(PC_PORT);     // replies from the PC come back to this port

  pcOn = pingPc();
  Serial.println(pcOn ? "PC is on (" + pcAddr.toString() + ")" : "PC not answering");
  publishState();
  connectStream();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiAttempt >= WIFI_RETRY_MS) {
      lastWifiAttempt = millis();
      Serial.println("WiFi lost — rescanning saved networks");
      if (wifiMulti.run() == WL_CONNECTED)
        Serial.println("WiFi: " + WiFi.SSID() + " · " + WiFi.localIP().toString());
    }
    delay(1);
    return;
  }

  if (streamClient.connected()) {
    processStream();
  } else if (millis() - lastStreamAttempt >= STREAM_RECONNECT_MS) {
    lastStreamAttempt = millis();
    connectStream();
  }

  if (millis() - lastAutoPoll >= AUTO_POLL_MS) { lastAutoPoll = millis(); pollAuto(); }
  if (autoOn && millis() - lastAutoClick >= AUTO_INTERVAL_MS) {
    lastAutoClick = millis();
    doPress();            // auto never shuts the PC down
  }

  delay(1);
}
