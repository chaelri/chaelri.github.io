// ===========================================================================
// wol-power-karla.ino — ESP32-C3 + 0.42" OLED: power button for Karla's PC
// ---------------------------------------------------------------------------
// Karla's copy of servo/firmware/wol-power (Charlie's). Separate namespace so
// the two boards can never touch each other's PC on the shared LAN:
//   RTDB /servokarla/*, UDP 40511, own token, KARLA-* messages, Karla's MAC.
//
//   PC off / asleep  -> send a Wake-on-LAN magic packet (PC boots)
//   PC on            -> tell the PC listener (servokarla/pc-power) to shut down
//
// "Is the PC on?" = UDP broadcast "KARLA-PING <token>" on port 40511; the PC
// listener answers "KARLA-PONG". No answer within ~1.5 s = off.
//
// Commands on /servokarla/command (cleared back to "" after acting):
//   click / toggle -> power toggle (wake if off, shut down if on)
//   press          -> wake only (never shuts down)
//   release        -> shut down only (no-op if off)
// /servokarla/auto (true) -> wake-only every AUTO_INTERVAL_MS.
// /servokarla/state       -> true if the PC answered on the last check.
//
// OLED (72x40, SSD1306 on SDA 5 / SCL 6):
//   idle   : PC ON/OFF pill + WiFi bars, big clock, rotating date / PC uptime
//   waking : "WAKING PC" + boot timer, polls until the PC answers
//   off    : "SHUTTING DOWN" + timer, polls until the PC stops answering
// The PC is re-checked every 20 s so the display stays true without commands.
// Night (11 PM-6 AM) dims the panel; the layout drifts 1 px a minute (burn-in).
//
// Board: "ESP32C3 Dev Module", USB CDC On Boot: Enabled. Library: U8g2.
// ===========================================================================

#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiClientSecure.h>
#include <WiFiUdp.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <time.h>

// --- PC ----------------------------------------------------------------------
// MAC of Karla's wired NIC (Realtek PCIe GbE, "Ethernet"). Get-NetAdapter shows it.
const uint8_t PC_MAC[6] = { 0x00, 0xE0, 0x4C, 0xAD, 0x18, 0xBA };
const uint16_t PC_PORT  = 40511;                 // must match listener.ps1
const char* PC_TOKEN    = "lcjLudnI6gkT";        // must match listener.ps1

// --- OLED --------------------------------------------------------------------
const int OLED_SDA = 5;
const int OLED_SCL = 6;
U8G2_SSD1306_72X40_ER_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);

// --- WiFi --------------------------------------------------------------------
WiFiMulti wifiMulti;
WiFiUDP udp;

// --- Firebase RTDB -----------------------------------------------------------
const char* FB_HOST = "test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app";
const char* STREAM_PATH = "/servokarla/command.json";
const char* CMD_URL   = "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app/servokarla/command.json";
const char* STATE_URL = "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app/servokarla/state.json";
const char* AUTO_URL  = "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app/servokarla/auto.json";

// --- Auto mode ---------------------------------------------------------------
bool autoOn = false;
unsigned long lastAutoPoll = 0, lastAutoClick = 0;
const unsigned long AUTO_INTERVAL_MS = 240000; // every 4 minutes
const unsigned long AUTO_POLL_MS     = 2000;

bool pcOn = false;              // result of the last ping (published as /servokarla/state)
bool publishedOn = false, published = false;
IPAddress pcAddr;               // who answered the last ping
unsigned long pcOnSince = 0;    // millis() when the PC was first seen on (0 = unknown)

// --- Background check --------------------------------------------------------
unsigned long lastCheck = 0;
const unsigned long CHECK_MS = 20000;

// --- Display events ----------------------------------------------------------
enum Ev { EV_NONE, EV_WAKING, EV_STOPPING, EV_MSG };
Ev ev = EV_NONE;
unsigned long evStart = 0, evLastPoll = 0, evUntil = 0;
const unsigned long WAKE_TIMEOUT_MS = 150000;  // boot can be slow
const unsigned long STOP_TIMEOUT_MS = 90000;
const unsigned long EV_POLL_MS      = 3000;
char msg1[16] = "", msg2[16] = "";

// --- SSE command stream ------------------------------------------------------
WiFiClientSecure streamClient;
unsigned long lastStreamAttempt = 0;
const unsigned long STREAM_RECONNECT_MS = 1500;
// The first stream event is a snapshot of whatever /servokarla/command already
// held (e.g. a click sent while the board was offline). It is cleared, never run.
bool skipSnapshot = true;

unsigned long lastWifiAttempt = 0;
const unsigned long WIFI_RETRY_MS = 5000;
unsigned long lastDraw = 0;

const char* DOW[] = { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" };
const char* MON[] = { "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" };

void draw();

void showMsg(const char* a, const char* b, unsigned long ms) {
  strncpy(msg1, a, sizeof(msg1) - 1);
  strncpy(msg2, b, sizeof(msg2) - 1);
  ev = EV_MSG;
  evUntil = millis() + ms;
  draw();
}

void setPc(bool on) {
  if (on && !pcOn) pcOnSince = millis();
  if (!on) pcOnSince = 0;
  pcOn = on;
}

// Commands always publish; the 20 s background check only publishes changes.
void publishState(bool force) {
  if (WiFi.status() != WL_CONNECTED) return;
  if (!force && published && publishedOn == pcOn) return;
  HTTPClient http;
  http.begin(STATE_URL);
  http.addHeader("Content-Type", "application/json");
  if (http.PUT(pcOn ? "true" : "false") > 0) { published = true; publishedOn = pcOn; }
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
  String ping = String("KARLA-PING ") + PC_TOKEN;
  while (udp.parsePacket() > 0) udp.flush();      // drop stale replies
  for (int attempt = 0; attempt < 3; attempt++) {
    sendUdp(lanBroadcast(), PC_PORT, ping);
    unsigned long t0 = millis();
    while (millis() - t0 < 500) {
      if (udp.parsePacket() > 0) {
        char buf[32] = {0};
        udp.read(buf, sizeof(buf) - 1);
        if (String(buf).startsWith("KARLA-PONG")) {
          pcAddr = udp.remoteIP();
          return true;
        }
      }
      delay(5);
    }
  }
  return false;
}

void checkPc(bool force) {
  setPc(pingPc());
  publishState(force);
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
  ev = EV_WAKING; evStart = evLastPoll = millis();
}

void shutdownPc() {
  String off = String("KARLA-OFF ") + PC_TOKEN;
  for (int i = 0; i < 2; i++) { sendUdp(pcAddr, PC_PORT, off); delay(50); }
  Serial.println("shutdown -> sent to " + pcAddr.toString());
  ev = EV_STOPPING; evStart = evLastPoll = millis();
}

void doClick() {           // like the power button: toggle
  showMsg("CHECKING", "the PC...", 3000);
  checkPc(true);
  if (pcOn) shutdownPc(); else wake();
}

void doPress() {           // wake only
  showMsg("CHECKING", "the PC...", 3000);
  checkPc(true);
  if (!pcOn) wake();
  else { Serial.println("press -> PC already on"); showMsg("ALREADY ON", "nothing to do", 3000); }
}

void doRelease() {         // shut down only
  showMsg("CHECKING", "the PC...", 3000);
  checkPc(true);
  if (pcOn) shutdownPc();
  else { Serial.println("release -> PC already off"); showMsg("ALREADY OFF", "nothing to do", 3000); }
}

// Follow a wake / shutdown until the PC confirms it (or we give up).
void followEvent() {
  unsigned long now = millis();
  if (ev == EV_MSG && (long)(now - evUntil) >= 0) { ev = EV_NONE; return; }
  if (ev != EV_WAKING && ev != EV_STOPPING) return;
  if (now - evLastPoll < EV_POLL_MS) return;
  evLastPoll = now;
  bool on = pingPc();
  lastCheck = millis();
  char t[16];
  snprintf(t, sizeof(t), "in %lus", (millis() - evStart) / 1000);
  if (ev == EV_WAKING) {
    if (on) { setPc(true); publishState(true); showMsg("PC IS ON", t, 4000); }
    else if (now - evStart > WAKE_TIMEOUT_MS) { setPc(false); publishState(true); showMsg("NO ANSWER", "check BIOS/WoL", 6000); }
  } else {
    if (!on) { setPc(false); publishState(true); showMsg("PC IS OFF", t, 4000); }
    else if (now - evStart > STOP_TIMEOUT_MS) { setPc(true); publishState(true); showMsg("STILL ON", "app blocking?", 6000); }
  }
}

// --- Display -----------------------------------------------------------------
void drawCentered(const char* s, int y, int dx) {
  int x = (72 - oled.getStrWidth(s)) / 2 + dx;
  oled.drawStr(x < 0 ? 0 : x, y, s);
}

void drawWifi(int x, int y) {      // 4 bars, bottom-aligned at y
  int bars = 0;
  if (WiFi.status() == WL_CONNECTED) {
    long r = WiFi.RSSI();
    bars = r > -55 ? 4 : r > -65 ? 3 : r > -75 ? 2 : 1;
  }
  for (int i = 0; i < 4; i++) {
    int h = 2 + i * 2;
    if (i < bars) oled.drawBox(x + i * 3, y - h, 2, h);
    else          oled.drawPixel(x + i * 3, y - 1);
  }
}

void drawProgress(int y, unsigned long elapsed, unsigned long total) {
  oled.drawFrame(2, y, 68, 5);
  int w = (int)(64UL * min(elapsed, total) / total);
  oled.drawBox(4, y + 2, w, 1);
  int dot = 4 + (millis() / 60) % 64;               // running dot = still working
  oled.drawPixel(dot, y + 1);
}

void draw() {
  struct tm lt;
  bool haveTime = getLocalTime(&lt, 0);
  int dx = haveTime ? (lt.tm_min % 3) - 1 : 0;      // slow drift against burn-in
  oled.setContrast(haveTime && (lt.tm_hour >= 23 || lt.tm_hour < 6) ? 1 : 200);
  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tf);

  if (ev == EV_WAKING || ev == EV_STOPPING) {
    bool w = (ev == EV_WAKING);
    unsigned long el = millis() - evStart;
    drawCentered(w ? "WAKING PC" : "SHUTTING", 8, dx);
    if (!w) drawCentered("DOWN", 16, dx);
    char t[12];
    snprintf(t, sizeof(t), "%lu:%02lu", el / 60000, (el / 1000) % 60);
    oled.setFont(u8g2_font_logisoso16_tn);
    if (w) drawCentered(t, 28, dx);
    oled.setFont(u8g2_font_5x7_tf);
    if (!w) drawCentered(t, 26, dx);
    drawProgress(33, el, w ? 60000 : 20000);
    oled.sendBuffer();
    return;
  }

  if (ev == EV_MSG) {
    oled.drawRBox(1, 4, 70, 15, 3);
    oled.setDrawColor(0);
    drawCentered(msg1, 15, 0);
    oled.setDrawColor(1);
    drawCentered(msg2, 32, 0);
    oled.sendBuffer();
    return;
  }

  // Idle: status pill + wifi, big clock, rotating footer.
  const char* st = pcOn ? "PC ON" : "PC OFF";
  int pw = oled.getStrWidth(st) + 6;
  if (pcOn) {
    oled.drawRBox(1 + dx, 0, pw, 9, 2);
    oled.setDrawColor(0); oled.drawStr(4 + dx, 7, st); oled.setDrawColor(1);
  } else {
    oled.drawRFrame(1 + dx, 0, pw, 9, 2);
    oled.drawStr(4 + dx, 7, st);
  }
  if (autoOn) oled.drawStr(pw + 4 + dx, 7, "A");
  drawWifi(60 + dx, 8);

  char hhmm[8] = "--:--";
  const char* ampm = "";
  if (haveTime) {
    int h12 = lt.tm_hour % 12; if (h12 == 0) h12 = 12;
    snprintf(hhmm, sizeof(hhmm), "%d:%02d", h12, lt.tm_min);
    ampm = lt.tm_hour < 12 ? "AM" : "PM";
  }
  oled.setFont(u8g2_font_logisoso16_tn);
  int wt = oled.getStrWidth(hhmm);
  oled.setFont(u8g2_font_5x7_tf);
  int x = (72 - (wt + 2 + oled.getStrWidth(ampm))) / 2 + dx;
  oled.setFont(u8g2_font_logisoso16_tn);
  oled.drawStr(x, 28, hhmm);
  oled.setFont(u8g2_font_5x7_tf);
  oled.drawStr(x + wt + 2, 28, ampm);

  char foot[20];
  int page = (millis() / 4000) % 2;
  if (WiFi.status() != WL_CONNECTED) strcpy(foot, "no wifi");
  else if (page == 1 && pcOn && pcOnSince) {
    unsigned long m = (millis() - pcOnSince) / 60000;
    snprintf(foot, sizeof(foot), "on %luh%02lum", m / 60, m % 60);
  } else if (haveTime) {
    snprintf(foot, sizeof(foot), "%s %s %d", DOW[lt.tm_wday], MON[lt.tm_mon], lt.tm_mday);
  } else strcpy(foot, "syncing...");
  drawCentered(foot, 39, dx);
  oled.sendBuffer();
}

void drawBoot(const char* line) {
  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tf);
  drawCentered("servokarla", 10, 0);
  oled.drawHLine(8, 14, 56);
  drawCentered(line, 28, 0);
  oled.sendBuffer();
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
  Serial.println("Stream connected — listening on /servokarla/command");
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

  Wire.setPins(OLED_SDA, OLED_SCL);   // before begin(), or U8g2 uses the default pins
  oled.begin();
  oled.setBusClock(400000);
  drawBoot("wifi...");

  wifiMulti.addAP("CharLa", "Kahitano1!");
  wifiMulti.addAP("CAYNO", "lokomoko");
  wifiMulti.addAP("Chaelri", "charlie24");
  wifiMulti.addAP("GFiber_3DAAA", "F09C2D58");

  Serial.print("Connecting to WiFi");
  while (wifiMulti.run() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.println();
  Serial.println("WiFi: " + WiFi.SSID() + " · " + WiFi.localIP().toString());
  drawBoot(WiFi.SSID().c_str());
  WiFi.setSleep(false);
  udp.begin(PC_PORT);     // replies from the PC come back to this port
  configTzTime("PST-8", "pool.ntp.org", "time.google.com");   // Manila, UTC+8

  checkPc(true);
  lastCheck = millis();
  Serial.println(pcOn ? "PC is on (" + pcAddr.toString() + ")" : "PC not answering");
  connectStream();
}

void loop() {
  if (millis() - lastDraw >= 150) { lastDraw = millis(); draw(); }

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

  followEvent();

  if (ev == EV_NONE && millis() - lastCheck >= CHECK_MS) {
    lastCheck = millis();
    checkPc(false);
  }

  if (millis() - lastAutoPoll >= AUTO_POLL_MS) { lastAutoPoll = millis(); pollAuto(); }
  if (autoOn && ev == EV_NONE && millis() - lastAutoClick >= AUTO_INTERVAL_MS) {
    lastAutoClick = millis();
    doPress();            // auto never shuts the PC down
  }

  delay(1);
}
