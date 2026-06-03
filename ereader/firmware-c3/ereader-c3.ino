// ============================================================
//   Bible E-Reader · ESP32-C3 SuperMini + built-in 0.42" OLED (72×40)
//   No external wiring — single board, single BOOT button input.
// ============================================================
//
//   Pins (all on-board, no external connections):
//     SDA  =  GPIO 5     →  built-in OLED SDA
//     SCL  =  GPIO 6     →  built-in OLED SCL
//     BTN  =  GPIO 9     →  BOOT button (active LOW, INPUT_PULLUP)
//     LED  =  GPIO 8     →  built-in blue user LED — silenced
//
//   Same one-button UI as the S3 build:
//     tap        →  forward  (next book / chapter / page)
//     double-tap →  backward (prev)
//     hold ≥600ms →  advance / back one level (BOOK ↔ CHAPTER ↔ READING)
//
//   Bible source: streamed ONLINE at boot from
//     https://chaelri.github.io/devo/nasb2020.json   (~4.4 MB)
//   The streaming scanner walks the HTTPS body byte-by-byte and
//   builds a (book, chapter) → byte slice table on the fly. Per
//   chapter, an HTTP Range request pulls just that slice (~3-40 KB)
//   into a 48 KB heap buffer that ArduinoJson parses. NO PSRAM
//   required — fits in regular SRAM on the C3.
//
//   Required Arduino board options (Tools menu):
//     Board:            "ESP32C3 Dev Module"
//     USB CDC On Boot:  "Enabled"
//     Flash Size:       "4MB"
//     Partition Scheme: any with ≥ 1 MB APP region (default works)
//
//   Libraries (install via Arduino Library Manager):
//     - U8g2                (oliver kraus)
//     - ArduinoJson  ≥ 7.0  (bblanchon)
//     - Preferences         (bundled)
//     - WiFi / HTTPClient / WiFiClientSecure   (bundled with esp32 core)
//
// ============================================================

#include <Wire.h>
#include <U8g2lib.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// -------------------- PINS --------------------
static const int SDA_PIN = 5;
static const int SCL_PIN = 6;
static const int BTN_PIN = 9;      // BOOT button — INPUT_PULLUP, active LOW
static const int LED_PIN = 8;      // on-board blue LED (active-LOW on most variants)

// -------------------- GESTURE TIMING --------------------
static const uint32_t DEBOUNCE_MS = 25;
static const uint32_t DOUBLE_MS   = 280;
static const uint32_t HOLD_MS     = 600;

// -------------------- WIFI / SOURCE URL --------------------
WiFiMulti wifiMulti;
static const uint32_t WIFI_CONNECT_TIMEOUT_MS = 20000;
static const char* NASB_URL = "https://chaelri.github.io/devo/nasb2020.json";

// -------------------- DISPLAY --------------------
// 0.42" 72×40 SSD1306-class OLED soldered to the C3 SuperMini board.
U8G2_SSD1306_72X40_ER_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);

// -------------------- NVS --------------------
Preferences prefs;

// -------------------- STATE --------------------
// Hoisted up here so Arduino IDE's auto-prototype injector can
// resolve them in forward-declared function signatures below.
enum Mode    : uint8_t { MODE_BOOK = 0, MODE_CHAPTER = 1, MODE_READING = 2 };
enum Gesture : uint8_t { G_NONE = 0, G_TAP, G_DOUBLE, G_HOLD };
Mode     mode       = MODE_BOOK;
uint16_t bookIdx    = 0;
uint16_t chapterIdx = 0;
uint16_t pageIdx    = 0;

// -------------------- RAW CHAPTER BUFFER (heap) --------------------
// C3 has no PSRAM — this lives in regular SRAM. ESP32-C3 has ~200 KB
// free heap after WiFi + TLS; 48 KB is comfortable.
static const size_t RAW_CHAP_CAP = 48UL * 1024UL;
char* rawChapterBuf = nullptr;

// -------------------- STREAM READER --------------------
// Declared up here for the same auto-prototype reason as the enums.
struct StreamReader {
  WiFiClient* stream;
  HTTPClient* http;
  uint32_t    absPos;        // bytes consumed so far
  uint32_t    total;         // 0 if chunked/unknown
  uint32_t    lastDraw;
};

// -------------------- BOOK / CHAPTER OFFSET TABLE --------------------
struct ChapterSlice { uint32_t start; uint32_t len; };
struct Book {
  char         name[20];                 // longest is "SONG OF SOLOMON" (15)
  uint16_t     chapterCount;
  ChapterSlice chapters[150];            // Psalms = 150 chapters
};
Book     books[66];
uint16_t totalBooks = 0;

// -------------------- CURRENT CHAPTER BUFFER --------------------
static const size_t CHAPTER_CAP = 16384;
static const size_t MAX_PAGES   = 256;     // tiny screen → more pages per chapter
char     chapterBuf[CHAPTER_CAP];
size_t   chapterLen = 0;
uint16_t pageStarts[MAX_PAGES];
uint16_t totalPages = 1;

// -------------------- PAGE LAYOUT (reading) --------------------
// No header in reading mode — full 40 px goes to text.
// 5x7 font: 72/5 = 14 cols, 40/8 = 5 rows = 70 chars/page.
static const int READ_COLS = 14;
static const int READ_ROWS = 5;

// ============================================================
//   BOOT SCREEN HELPERS  (tiny 72×40)
// ============================================================
void bootScreen(const char* l1, const char* l2 = nullptr,
                const char* l3 = nullptr, const char* l4 = nullptr) {
  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tf);
  if (l1) oled.drawStr(0, 7,  l1);
  if (l2) oled.drawStr(0, 15, l2);
  if (l3) oled.drawStr(0, 23, l3);
  if (l4) oled.drawStr(0, 31, l4);
  oled.sendBuffer();
}

void bootProgress(const char* label, uint32_t cur, uint32_t total) {
  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tf);
  oled.drawStr(0, 7, label);
  char line[16];
  if (total > 0) {
    int pct = (int)((uint64_t)cur * 100 / total);
    snprintf(line, sizeof(line), "%d%%", pct);
    oled.drawStr(0, 15, line);
    snprintf(line, sizeof(line), "%uK/%uK",
             (unsigned)(cur / 1024), (unsigned)(total / 1024));
    oled.drawStr(0, 23, line);
    oled.drawFrame(0, 33, 72, 5);
    int w = (int)((uint64_t)cur * 70 / total);
    if (w > 70) w = 70;
    oled.drawBox(1, 34, w, 3);
  } else {
    snprintf(line, sizeof(line), "%uK", (unsigned)(cur / 1024));
    oled.drawStr(0, 15, line);
  }
  oled.sendBuffer();
}

// ============================================================
//   BLUE LED — OFF
// ============================================================
void killOnboardLED() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);     // active-LOW on most C3 OLED boards
}

// ============================================================
//   WIFI
// ============================================================
bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  wifiMulti.addAP("CAYNO",   "lokomoko");
  wifiMulti.addAP("Chaelri", "charlie24");

  bootScreen("WiFi", "connecting");
  uint32_t t0 = millis();
  while (wifiMulti.run() != WL_CONNECTED && millis() - t0 < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
  }
  if (WiFi.status() != WL_CONNECTED) {
    bootScreen("WiFi", "FAILED", "rebooting");
    delay(2500);
    ESP.restart();
    return false;
  }
  bootScreen("WiFi OK", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
  return true;
}

// ============================================================
//   STREAMING SCANNER  ─  pull JSON bytes off the HTTPS stream
//   and build a (book, chapter) → byte slice table without ever
//   buffering more than a few bytes.
// ============================================================

// Show + log a scanner bail so the catch-all in setup() doesn't
// hide which path failed. Used by every silent `return false`.
#define SCAN_FAIL(sr_, http_) do { \
  Serial.printf("scan bail L%d pos=%u\n", __LINE__, (unsigned)(sr_).absPos); \
  char _l[12], _p[16]; \
  snprintf(_l, sizeof(_l), "L%d", __LINE__); \
  snprintf(_p, sizeof(_p), "@%u", (unsigned)(sr_).absPos); \
  bootScreen("scan err", _l, _p); \
  (http_).end(); \
  return false; \
} while (0)

// Pulls one byte. Returns -1 on timeout or EOF.
static int sgetc(StreamReader& sr) {
  uint32_t t0 = millis();
  while (true) {
    if (sr.stream->available() > 0) {
      int c = sr.stream->read();
      if (c < 0) continue;
      sr.absPos++;
      if (millis() - sr.lastDraw > 250) {
        bootProgress("Indexing", sr.absPos,
                     sr.total > 0 ? sr.total : 4500000);
        sr.lastDraw = millis();
      }
      return c;
    }
    if (!sr.http->connected() && sr.stream->available() == 0) return -1;
    if (millis() - t0 > 10000) return -1;
    delay(1);
  }
}

static int sgetcSkipWs(StreamReader& sr) {
  while (true) {
    int c = sgetc(sr);
    if (c < 0) return -1;
    if (c == ' ' || c == '\n' || c == '\r' || c == '\t') continue;
    return c;
  }
}

static bool sreadStringInto(StreamReader& sr, char* out, size_t outCap) {
  size_t w = 0;
  bool esc = false;
  while (true) {
    int c = sgetc(sr);
    if (c < 0) return false;
    if (esc) {
      if (w + 1 < outCap) out[w++] = (char)c;
      esc = false;
      continue;
    }
    if (c == '\\') { esc = true; continue; }
    if (c == '"')  { out[w] = 0; return true; }
    if (w + 1 < outCap) out[w++] = (char)c;
  }
}

static bool sskipString(StreamReader& sr) {
  bool esc = false;
  while (true) {
    int c = sgetc(sr);
    if (c < 0) return false;
    if (esc) { esc = false; continue; }
    if (c == '\\') { esc = true; continue; }
    if (c == '"')  return true;
  }
}

bool indexNasbStreaming() {
  if (!rawChapterBuf) {
    rawChapterBuf = (char*) malloc(RAW_CHAP_CAP);
    if (!rawChapterBuf) {
      bootScreen("ERR", "heap alloc", "fail");
      return false;
    }
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.setReuse(false);
  http.setTimeout(30000);
  if (!http.begin(client, NASB_URL)) {
    bootScreen("HTTP", "begin fail");
    return false;
  }
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);

  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    char msg[16];
    snprintf(msg, sizeof(msg), "HTTP %d", code);
    bootScreen("Download", "failed", msg);
    http.end();
    return false;
  }

  StreamReader sr;
  sr.stream   = http.getStreamPtr();
  sr.http     = &http;
  sr.absPos   = 0;
  sr.total    = (uint32_t)(http.getSize() > 0 ? http.getSize() : 0);
  sr.lastDraw = millis();
  bootProgress("Indexing", 0, sr.total > 0 ? sr.total : 4500000);

  totalBooks = 0;

  Serial.printf("idx: heap before scan = %u\n", (unsigned)ESP.getFreeHeap());

  int c = sgetcSkipWs(sr);
  if (c != '{') SCAN_FAIL(sr, http);

  while (true) {
    c = sgetcSkipWs(sr);
    if (c < 0)            SCAN_FAIL(sr, http);
    if (c == '}')         { http.end(); Serial.printf("idx: ok, books=%u\n", totalBooks); return true; }
    if (c == ',')         continue;
    if (c != '"')         SCAN_FAIL(sr, http);
    if (totalBooks >= 66) SCAN_FAIL(sr, http);

    Book& bk = books[totalBooks];
    if (!sreadStringInto(sr, bk.name, sizeof(bk.name))) SCAN_FAIL(sr, http);
    bk.chapterCount = 0;

    c = sgetcSkipWs(sr);
    if (c != ':') SCAN_FAIL(sr, http);
    c = sgetcSkipWs(sr);
    if (c != '{') SCAN_FAIL(sr, http);

    while (true) {
      c = sgetcSkipWs(sr);
      if (c < 0)    SCAN_FAIL(sr, http);
      if (c == '}') break;
      if (c == ',') continue;
      if (c != '"') SCAN_FAIL(sr, http);

      if (!sskipString(sr)) SCAN_FAIL(sr, http);
      c = sgetcSkipWs(sr);
      if (c != ':') SCAN_FAIL(sr, http);
      c = sgetcSkipWs(sr);
      if (c != '{') SCAN_FAIL(sr, http);

      if (bk.chapterCount >= 150) SCAN_FAIL(sr, http);
      uint32_t chapStart = sr.absPos - 1;

      int  depth = 1;
      bool inStr = false;
      bool inEsc = false;
      while (depth > 0) {
        int b = sgetc(sr);
        if (b < 0) SCAN_FAIL(sr, http);
        if (inStr) {
          if (inEsc)     { inEsc = false; continue; }
          if (b == '\\') { inEsc = true;  continue; }
          if (b == '"')  { inStr = false; continue; }
        } else {
          if      (b == '"') inStr = true;
          else if (b == '{') depth++;
          else if (b == '}') depth--;
        }
      }
      bk.chapters[bk.chapterCount].start = chapStart;
      bk.chapters[bk.chapterCount].len   = sr.absPos - chapStart;
      bk.chapterCount++;
    }
    totalBooks++;
  }
}

// ============================================================
//   PER-CHAPTER FETCH (HTTP Range request)
// ============================================================
bool fetchChapterRange(uint32_t start, uint32_t len, char* out, size_t outCap) {
  if (len + 1 > outCap) return false;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.setReuse(false);
  http.setTimeout(15000);
  if (!http.begin(client, NASB_URL)) return false;

  char rangeHdr[40];
  snprintf(rangeHdr, sizeof(rangeHdr), "bytes=%lu-%lu",
           (unsigned long)start, (unsigned long)(start + len - 1));
  http.addHeader("Range", rangeHdr);
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);

  int code = http.GET();
  if (code != 206) {
    Serial.printf("Range HTTP %d (want 206)\n", code);
    http.end();
    return false;
  }

  WiFiClient* stream = http.getStreamPtr();
  size_t   got = 0;
  uint32_t t0  = millis();
  while (got < len) {
    if (stream->available() > 0) {
      int r = stream->readBytes(out + got, len - got);
      if (r > 0) { got += r; t0 = millis(); }
    } else if (!http.connected() && stream->available() == 0) {
      break;
    } else {
      if (millis() - t0 > 10000) break;
      delay(1);
    }
  }
  out[got] = 0;
  http.end();
  return got == len;
}

// ============================================================
//   UTF-8 → ASCII transcoder (for the 5x7 font)
// ============================================================
static inline void appendCh(char c) {
  if (chapterLen + 1 < CHAPTER_CAP) chapterBuf[chapterLen++] = c;
}

static void appendAscii(const char* s, size_t len) {
  for (size_t i = 0; i < len; i++) {
    unsigned char c = (unsigned char)s[i];
    if (c < 0x80) { appendCh((char)c); continue; }

    if (c == 0xE2 && i + 2 < len && (unsigned char)s[i+1] == 0x80) {
      unsigned char t = (unsigned char)s[i+2];
      switch (t) {
        case 0x98: appendCh('\''); i += 2; continue;
        case 0x99: appendCh('\''); i += 2; continue;
        case 0x9C: appendCh('"');  i += 2; continue;
        case 0x9D: appendCh('"');  i += 2; continue;
        case 0x93: appendCh('-');  i += 2; continue;
        case 0x94: appendCh('-');  i += 2; continue;
        case 0xA6:
          appendCh('.'); appendCh('.'); appendCh('.');
          i += 2; continue;
        default:   appendCh('?');  i += 2; continue;
      }
    }

    if ((c & 0xE0) == 0xC0) {
      if (i + 1 < len && (unsigned char)s[i+1] == 0xA0) appendCh(' ');
      else appendCh('?');
      i += 1; continue;
    }
    if ((c & 0xF0) == 0xE0) { appendCh('?'); i += 2; continue; }
    if ((c & 0xF8) == 0xF0) { appendCh('?'); i += 3; continue; }
  }
}

// ============================================================
//   BUILD CHAPTER TEXT  +  PAGINATE
// ============================================================
void computePageBreaks() {
  totalPages = 0;
  pageStarts[totalPages++] = 0;

  int linesUsed = 0;
  int lineLen   = 0;
  size_t i      = 0;

  while (i < chapterLen) {
    if (lineLen == 0) {
      while (i < chapterLen && chapterBuf[i] == ' ') i++;
      if (i >= chapterLen) break;
    }
    size_t wordEnd = i;
    while (wordEnd < chapterLen && chapterBuf[wordEnd] != ' ') wordEnd++;
    int wordLen = wordEnd - i;

    int needed = (lineLen == 0) ? wordLen : (1 + wordLen);
    if (lineLen + needed <= READ_COLS) {
      lineLen += needed;
      i = wordEnd;
      while (i < chapterLen && chapterBuf[i] == ' ') i++;
      continue;
    }

    linesUsed++;
    lineLen = 0;
    if (linesUsed >= READ_ROWS) {
      size_t pageStart = i;
      while (pageStart < chapterLen && chapterBuf[pageStart] == ' ') pageStart++;
      if (totalPages < MAX_PAGES && pageStart < chapterLen) {
        pageStarts[totalPages++] = (uint16_t)pageStart;
      }
      linesUsed = 0;
    }
    if (wordLen > READ_COLS) {
      lineLen = READ_COLS;
      i += READ_COLS;
    }
  }
  if (totalPages == 0) totalPages = 1;
}

void buildChapter() {
  chapterLen = 0;
  if (bookIdx >= totalBooks) return;
  Book& bk = books[bookIdx];
  if (chapterIdx >= bk.chapterCount) return;
  ChapterSlice& slice = bk.chapters[chapterIdx];

  if (slice.len + 1 > RAW_CHAP_CAP) {
    const char* m = "chap too big";
    appendAscii(m, strlen(m));
    chapterBuf[chapterLen] = 0;
    computePageBreaks();
    pageIdx = 0;
    return;
  }

  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tf);
  oled.drawStr(0, 23, "loading...");
  oled.sendBuffer();

  if (!fetchChapterRange(slice.start, slice.len, rawChapterBuf, RAW_CHAP_CAP)) {
    const char* m = "fetch error";
    appendAscii(m, strlen(m));
    chapterBuf[chapterLen] = 0;
    computePageBreaks();
    pageIdx = 0;
    return;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, rawChapterBuf, slice.len);
  if (err) {
    Serial.printf("JSON err: %s\n", err.c_str());
    const char* m = "parse error";
    appendAscii(m, strlen(m));
    chapterBuf[chapterLen] = 0;
    computePageBreaks();
    pageIdx = 0;
    return;
  }

  JsonObject obj = doc.as<JsonObject>();
  bool first = true;
  for (JsonPair kv : obj) {
    const char* numStr = kv.key().c_str();
    const char* text   = kv.value().as<const char*>();
    if (!text) continue;

    char prefix[8];
    int plen = snprintf(prefix, sizeof(prefix), "%s%s ",
                        first ? "" : "  ", numStr);
    first = false;
    for (int p = 0; p < plen; p++) appendCh(prefix[p]);
    appendAscii(text, strlen(text));
  }
  chapterBuf[chapterLen] = 0;

  computePageBreaks();
  if (pageIdx >= totalPages) pageIdx = 0;
}

// ============================================================
//   RENDERING  (72×40)
// ============================================================
void renderBookSelect() {
  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tf);

  char hdr[16];
  snprintf(hdr, sizeof(hdr), "%u/%u", bookIdx + 1, totalBooks);
  int hdrW = oled.getStrWidth(hdr);
  oled.drawStr(72 - hdrW, 7, hdr);

  // Try a couple of fonts; pick the largest that fits the 72 px width.
  const char* name = books[bookIdx].name;
  const uint8_t* fonts[] = {
    u8g2_font_helvB10_tr,
    u8g2_font_6x10_tf,
    u8g2_font_5x7_tf,
    u8g2_font_4x6_tf,
  };
  for (auto f : fonts) {
    oled.setFont(f);
    int w = oled.getStrWidth(name);
    if (w <= 72) {
      int x = (72 - w) / 2;
      int y = 9 + ((30 + oled.getAscent()) / 2);
      if (y > 39) y = 39;
      oled.drawStr(x, y, name);
      break;
    }
  }
  oled.sendBuffer();
}

void renderChapterSelect() {
  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tf);

  // Book name top, may need to truncate to fit 72 px.
  const char* name = books[bookIdx].name;
  oled.drawStr(0, 7, name);

  char num[8];
  snprintf(num, sizeof(num), "%u/%u", chapterIdx + 1, books[bookIdx].chapterCount);

  oled.setFont(u8g2_font_logisoso16_tr);
  int w = oled.getStrWidth(num);
  if (w > 72) { oled.setFont(u8g2_font_helvB10_tr); w = oled.getStrWidth(num); }
  if (w > 72) { oled.setFont(u8g2_font_6x10_tf);     w = oled.getStrWidth(num); }
  int x = (72 - w) / 2;
  oled.drawStr(x, 37, num);

  oled.sendBuffer();
}

void renderReadingPage() {
  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tf);

  size_t start = pageStarts[pageIdx];
  size_t end   = (pageIdx + 1 < totalPages) ? pageStarts[pageIdx + 1] : chapterLen;

  size_t i = start;
  for (int row = 0; row < READ_ROWS && i < end; row++) {
    while (i < end && chapterBuf[i] == ' ') i++;
    if (i >= end) break;

    char line[READ_COLS + 1];
    int  ll = 0;
    while (i < end && ll < READ_COLS) {
      size_t wordEnd = i;
      while (wordEnd < end && chapterBuf[wordEnd] != ' ') wordEnd++;
      int wordLen = wordEnd - i;
      int needed  = (ll == 0) ? wordLen : (1 + wordLen);
      if (ll + needed > READ_COLS) break;
      if (ll > 0) line[ll++] = ' ';
      int copy = wordLen;
      if (copy > READ_COLS - ll) copy = READ_COLS - ll;
      memcpy(line + ll, chapterBuf + i, copy);
      ll += copy;
      i = wordEnd;
      while (i < end && chapterBuf[i] == ' ') i++;
    }
    line[ll] = 0;

    int y = 7 + row * 8;       // baselines 7, 15, 23, 31, 39
    oled.drawStr(0, y, line);
  }

  oled.sendBuffer();
}

void render() {
  switch (mode) {
    case MODE_BOOK:    renderBookSelect();    break;
    case MODE_CHAPTER: renderChapterSelect(); break;
    case MODE_READING: renderReadingPage();   break;
  }
}

// ============================================================
//   GESTURE DETECTOR
// ============================================================
bool     btnWasPressed = false;
uint32_t btnPressStart = 0;
uint32_t lastReleaseMs = 0;
bool     pendingTap    = false;
bool     holdFired     = false;

Gesture readButton() {
  uint32_t now = millis();
  bool pressed = (digitalRead(BTN_PIN) == LOW);

  if (pressed && !btnWasPressed) {
    btnPressStart = now;
    btnWasPressed = true;
    holdFired = false;
    return G_NONE;
  }

  if (btnWasPressed && !holdFired && (now - btnPressStart) >= HOLD_MS) {
    holdFired = true;
    return G_HOLD;
  }

  if (!pressed && btnWasPressed) {
    uint32_t dur = now - btnPressStart;
    btnWasPressed = false;
    if (dur < DEBOUNCE_MS) return G_NONE;
    if (holdFired)         return G_NONE;

    if (pendingTap && (now - lastReleaseMs) <= DOUBLE_MS) {
      pendingTap = false;
      return G_DOUBLE;
    }
    pendingTap    = true;
    lastReleaseMs = now;
    return G_NONE;
  }

  if (pendingTap && (now - lastReleaseMs) > DOUBLE_MS) {
    pendingTap = false;
    return G_TAP;
  }

  return G_NONE;
}

// ============================================================
//   STATE TRANSITIONS
// ============================================================
void onTap() {
  switch (mode) {
    case MODE_BOOK:
      bookIdx = (bookIdx + 1) % totalBooks;
      break;
    case MODE_CHAPTER:
      chapterIdx = (chapterIdx + 1) % books[bookIdx].chapterCount;
      break;
    case MODE_READING:
      if (pageIdx + 1 < totalPages) {
        pageIdx++;
      } else {
        chapterIdx = (chapterIdx + 1) % books[bookIdx].chapterCount;
        pageIdx = 0;
        buildChapter();
      }
      break;
  }
}

void onDouble() {
  switch (mode) {
    case MODE_BOOK:
      bookIdx = (bookIdx + totalBooks - 1) % totalBooks;
      break;
    case MODE_CHAPTER:
      chapterIdx = (chapterIdx + books[bookIdx].chapterCount - 1) % books[bookIdx].chapterCount;
      break;
    case MODE_READING:
      if (pageIdx > 0) {
        pageIdx--;
      } else {
        chapterIdx = (chapterIdx + books[bookIdx].chapterCount - 1) % books[bookIdx].chapterCount;
        buildChapter();
        pageIdx = totalPages > 0 ? totalPages - 1 : 0;
      }
      break;
  }
}

void onHold() {
  switch (mode) {
    case MODE_BOOK:
      mode = MODE_CHAPTER;
      chapterIdx = 0;
      break;
    case MODE_CHAPTER:
      mode = MODE_READING;
      pageIdx = 0;
      buildChapter();
      break;
    case MODE_READING:
      mode = MODE_CHAPTER;
      break;
  }
}

void savePos() {
  prefs.putUChar("mode", (uint8_t)mode);
  prefs.putUShort("book", bookIdx);
  prefs.putUShort("chap", chapterIdx);
  prefs.putUShort("page", pageIdx);
}

// ============================================================
//   SETUP / LOOP
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(100);

  killOnboardLED();

  pinMode(BTN_PIN, INPUT_PULLUP);

  Wire.setPins(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);

  oled.begin();
  oled.setContrast(180);
  bootScreen("Bible", "E-Reader", "booting");

  if (!connectWiFi()) return;

  bootScreen("Indexing", "streaming");
  Serial.printf("idx: heap pre-idx = %u\n", (unsigned)ESP.getFreeHeap());
  if (!indexNasbStreaming()) {
    // Specific failure screen already showing — leave it visible
    // (heap alloc / HTTP begin / Download HTTP code / scan err L# @pos).
    return;
  }
  char line[16];
  snprintf(line, sizeof(line), "%u books", totalBooks);
  bootScreen("NASB OK", line);
  delay(600);

  prefs.begin("ereader", false);
  mode       = (Mode)prefs.getUChar("mode", MODE_BOOK);
  bookIdx    = prefs.getUShort("book", 0);
  chapterIdx = prefs.getUShort("chap", 0);
  pageIdx    = prefs.getUShort("page", 0);

  if (bookIdx >= totalBooks) bookIdx = 0;
  if (chapterIdx >= books[bookIdx].chapterCount) chapterIdx = 0;
  if (mode > MODE_READING) mode = MODE_BOOK;

  if (mode == MODE_READING) {
    buildChapter();
    if (pageIdx >= totalPages) pageIdx = 0;
  }

  render();
}

void loop() {
  Gesture g = readButton();
  if (g != G_NONE) {
    if      (g == G_TAP)    onTap();
    else if (g == G_DOUBLE) onDouble();
    else if (g == G_HOLD)   onHold();
    render();
    savePos();
  }
  delay(2);
}
