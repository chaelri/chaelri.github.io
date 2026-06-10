// ============================================================
//   Bible E-Reader
//   ESP32-S3 SuperMini + 2.13" SSD1680 e-ink + microSD + 2 tactile buttons
// ============================================================
//
//   PIN MAP  (this SuperMini variant only breaks out GPIO 1-13)
//
//     E-INK 2.13" (SSD1680)
//       VCC   →  3V3
//       GND   →  GND
//       SDI   →  GPIO 11   (SPI MOSI · shared with SD)
//       SCLK  →  GPIO 12   (SPI SCK  · shared with SD)
//       CS    →  GPIO 10
//       D/C   →  GPIO  9
//       RST   →  GPIO  8
//       BUSY  →  GPIO  7
//
//     microSD (SPI module)
//       VCC   →  3V3
//       GND   →  GND
//       MOSI  →  GPIO 11   (shared)
//       MISO  →  GPIO 13   (SD only)
//       SCK   →  GPIO 12   (shared)
//       CS    →  GPIO  6
//
//     BUTTONS                            (other lead → GND, INPUT_PULLUP)
//       NEXT  →  GPIO  4
//       PREV  →  GPIO  5
//
//   POWER
//     1000 mAh LiPo → TP4056 → ESP32-S3 5V pin (onboard 3V3 LDO feeds e-ink + SD)
//     Use-while-charging is fine on TP4056 variants with the DW01 protection IC.
//
//   ONE BOOK FILES ON SD  (drag /sd-card/Bible/ → SD root)
//       /Bible/INDEX.txt                — "NN DisplayName chapters UPPER KEY"
//       /Bible/Genesis.txt              — "=== CHAPTER N ===" delimited
//       /Bible/Revelation.txt
//       ...
//
//   SOURCE AUTO-DETECT (zero code changes when the SD card arrives)
//     1. boot → try SD.begin(SD_CS)
//     2.   ↳  if SD mounts AND /Bible/INDEX.txt exists → SOURCE_SD
//     3.   ↳  else → SOURCE_STREAM:
//              WiFi connect → HTTPS GET nasb2020.json → scan once → build
//              per-chapter byte-offset table in RAM → close stream.
//              Per-chapter loads issue HTTP Range requests for ~3-40 KB.
//
//   BUTTON BEHAVIOUR
//       tap NEXT      →  next page  (wraps to next chapter / next book)
//       tap PREV      →  prev page  (wraps to prev chapter / prev book)
//       hold ≥800 ms  →  jump chapter (NEXT = +1 chapter, PREV = -1 chapter)
//
//   PERSISTENCE          NVS namespace "bible" — bookIdx, chapterIdx, pageIdx
//   DEEP SLEEP           5 min idle → ext1 wake on either button
//
//   REQUIRED LIBRARIES (Arduino Library Manager)
//     - GxEPD2        (Jean-Marc Zingg)         — e-ink driver
//     - Adafruit GFX                            — bundled with GxEPD2
//     - ArduinoJson ≥ 7.0  (Benoît Blanchon)    — streaming JSON parse
//     - Preferences   (bundled)                 — NVS
//     - SD / SPI / WiFi / HTTPClient / WiFiClientSecure  (bundled)
//
//   BOARD OPTIONS (Tools menu)
//     Board:            "ESP32S3 Dev Module"
//     USB CDC On Boot:  "Enabled"
//     Flash Size:       8 MB or 16 MB (whatever your board has)
//     PSRAM:            "Disabled"  (this sketch does NOT require PSRAM)
//     Partition Scheme: any default
//
// ============================================================

#include <SPI.h>
#include <SD.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#include <GxEPD2_BW.h>
#include <Fonts/FreeSerif9pt7b.h>
#include <Fonts/FreeSerifBold9pt7b.h>
#include <Fonts/FreeSans9pt7b.h>

#include "esp_sleep.h"

// ============================================================
//   PINS
// ============================================================
static const int SPI_MOSI = 11;
static const int SPI_MISO = 13;
static const int SPI_SCK  = 12;

static const int EPD_CS   = 10;
static const int EPD_DC   = 9;
static const int EPD_RST  = 8;
static const int EPD_BUSY = 7;

static const int SD_CS    = 6;

static const int BTN_NEXT = 4;
static const int BTN_PREV = 5;

// ext1 wakeup mask: GPIO 4 OR GPIO 5 → wake
static const uint64_t WAKE_MASK = (1ULL << BTN_NEXT) | (1ULL << BTN_PREV);

// ============================================================
//   DISPLAY  (2.13" SSD1680 · 250 × 122)
// ============================================================
// GxEPD2_213_BN covers the most common 2.13" SSD1680 panels
// (WaveShare V2/V3, GooDisplay GDEH0213B73/B74, Adafruit eInk Mini).
GxEPD2_BW<GxEPD2_213_BN, GxEPD2_213_BN::HEIGHT> display(
  GxEPD2_213_BN(/*CS=*/EPD_CS, /*DC=*/EPD_DC, /*RST=*/EPD_RST, /*BUSY=*/EPD_BUSY)
);

static const int16_t SCREEN_W = 250;
static const int16_t SCREEN_H = 122;

// Body region (under the header bar, above the footer bar)
static const int16_t HEADER_H  = 16;
static const int16_t FOOTER_H  = 14;
static const int16_t BODY_TOP  = HEADER_H + 2;
static const int16_t BODY_LEFT = 4;
static const int16_t BODY_RIGHT= SCREEN_W - 4;
static const int16_t BODY_BOT  = SCREEN_H - FOOTER_H;
static const int16_t BODY_W    = BODY_RIGHT - BODY_LEFT;

// Pixel line height for FreeSerif9pt7b: ascent 12 + descent 3 + 2 px gap ≈ 17.
// Body is ~92 px tall → 5 lines reliably, sometimes 6.
static const int16_t LINE_H    = 16;

// ============================================================
//   NVS
// ============================================================
Preferences prefs;
static const char* NVS_NS = "bible";

// ============================================================
//   WIFI / SOURCE URL
// ============================================================
WiFiMulti wifiMulti;
static const uint32_t WIFI_CONNECT_TIMEOUT_MS = 20000;
static const char* NASB_URL = "https://chaelri.github.io/devo/nasb2020.json";

// ============================================================
//   GESTURE / SLEEP
// ============================================================
static const uint32_t DEBOUNCE_MS    = 25;
static const uint32_t HOLD_MS        = 800;
static const uint32_t IDLE_SLEEP_MS  = 5UL * 60UL * 1000UL;  // 5 minutes

enum Gesture : uint8_t { G_NONE = 0, G_TAP_NEXT, G_TAP_PREV, G_HOLD_NEXT, G_HOLD_PREV };

// ============================================================
//   BOOK / CHAPTER TABLE  (built either from SD INDEX.txt or by JSON scan)
// ============================================================
struct ChapterSlice {
  uint32_t start;        // byte offset (stream mode only; ignored on SD)
  uint32_t len;          // raw JSON byte length (stream mode only)
};

struct Book {
  char         display[24];     // e.g. "1Samuel"  (no spaces — FAT32 file name)
  char         pretty[24];      // e.g. "1 Samuel" (for header bar)
  uint16_t     chapterCount;
  ChapterSlice chapters[152];   // Psalms = 150, +slack
};

Book     books[66];
uint16_t totalBooks = 0;

// ============================================================
//   SOURCE MODE
// ============================================================
enum Source : uint8_t { SOURCE_SD = 0, SOURCE_STREAM = 1 };
Source source = SOURCE_STREAM;

// ============================================================
//   CHAPTER + PAGE BUFFERS
// ============================================================
// Plain-text chapter cache. Longest NASB chapter (Ps 119) ≈ 11-12 KB.
// 16 KB gives a comfortable margin.
static const size_t CHAPTER_CAP = 16384;
char     chapterBuf[CHAPTER_CAP];
size_t   chapterLen = 0;

// Pagination is two-stage:
//   1. Word-wrap chapterBuf into `lines[]` (offset+len pairs into chapterBuf).
//   2. Group lines into pages of LINES_PER_PAGE; record page → first-line index.
// This guarantees pagination and rendering use the exact same wrap, since both
// just walk `lines[]`.
struct WrappedLine { uint16_t off; uint16_t len; };
static const size_t MAX_LINES = 240;     // Ps 119 ≈ 175 lines at this layout
static const size_t MAX_PAGES = 64;
WrappedLine lines[MAX_LINES];
uint16_t    totalLines = 0;
uint16_t    pageFirstLine[MAX_PAGES];
uint16_t    totalPages  = 1;
uint16_t    LINES_PER_PAGE = 5;          // computed from BODY height in setup

// Raw JSON chapter buffer (stream mode only). Largest raw chapter ~36 KB.
static const size_t RAW_CHAP_CAP = 48UL * 1024UL;
char* rawChapterBuf = nullptr;

// ============================================================
//   CURRENT STATE
// ============================================================
uint16_t bookIdx    = 0;
uint16_t chapterIdx = 0;
uint16_t pageIdx    = 0;

uint32_t lastInteractionMs = 0;

// ============================================================
//   FORWARD DECLS
// ============================================================
bool     initSourceSD();
bool     initSourceStream();
bool     loadChapter(uint16_t b, uint16_t c);
bool     loadChapterSD(uint16_t b, uint16_t c);
bool     loadChapterStream(uint16_t b, uint16_t c);
uint16_t appendStreamBook(const String& upperKey);
void     paginateChapter();
void     renderPage();
void     showSplash(const char* l1, const char* l2 = nullptr, const char* l3 = nullptr);
void     saveState();
void     restoreState();
Gesture  readButtons();
void     advancePage();
void     reversePage();
void     advanceChapter();
void     reverseChapter();
void     maybeSleep();

// ============================================================
//   ENTRY POINTS
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(150);
  Serial.println("\n[bible-reader] boot");

  // Buttons
  pinMode(BTN_NEXT, INPUT_PULLUP);
  pinMode(BTN_PREV, INPUT_PULLUP);

  // SPI — shared bus for e-ink + SD
  SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI);

  // Display init
  display.init(115200, true, 50, false);
  display.setRotation(1);            // landscape 250 × 122
  display.setTextWrap(false);        // we wrap manually
  showSplash("Bible E-Reader", "ESP32-S3 + 2.13\" e-ink", "booting…");

  // Try SD first
  if (initSourceSD()) {
    source = SOURCE_SD;
    Serial.printf("[source] SD card · %u books indexed\n", totalBooks);
  } else {
    // Stream fallback
    rawChapterBuf = (char*) malloc(RAW_CHAP_CAP);
    if (!rawChapterBuf) {
      showSplash("FATAL", "OOM rawChapterBuf", "rebooting…");
      delay(3000); ESP.restart();
    }
    showSplash("No SD card", "Streaming from", "chaelri.github.io");
    if (!initSourceStream()) {
      showSplash("Source FAILED", "no SD, no WiFi", "insert card or fix net");
      delay(8000);
      esp_deep_sleep_start();
    }
    source = SOURCE_STREAM;
    Serial.printf("[source] STREAM · %u books indexed\n", totalBooks);
  }

  // Restore last-read position (or default Genesis 1 page 1)
  restoreState();
  if (bookIdx >= totalBooks)                       bookIdx = 0;
  if (chapterIdx >= books[bookIdx].chapterCount)   chapterIdx = 0;

  if (!loadChapter(bookIdx, chapterIdx)) {
    showSplash("Chapter load", "failed", "rebooting…");
    delay(3000); ESP.restart();
  }
  paginateChapter();
  if (pageIdx >= totalPages) pageIdx = 0;
  renderPage();

  // free PSRAM not used at runtime — only the offset table stays
  if (source == SOURCE_STREAM && rawChapterBuf) {
    // keep buf — we reuse it per chapter load
  }

  lastInteractionMs = millis();
  Serial.println("[bible-reader] ready");
}

void loop() {
  Gesture g = readButtons();
  if (g != G_NONE) {
    lastInteractionMs = millis();
    switch (g) {
      case G_TAP_NEXT:  advancePage();    break;
      case G_TAP_PREV:  reversePage();    break;
      case G_HOLD_NEXT: advanceChapter(); break;
      case G_HOLD_PREV: reverseChapter(); break;
      default: break;
    }
  }
  maybeSleep();
  delay(8);
}

// ============================================================
//   SD SOURCE
// ============================================================
bool initSourceSD() {
  // Slow the SPI bus down for SD init to be tolerant of cheap modules
  if (!SD.begin(SD_CS, SPI, 4000000)) {
    Serial.println("[sd] mount failed");
    return false;
  }
  File idx = SD.open("/Bible/INDEX.txt", FILE_READ);
  if (!idx) {
    Serial.println("[sd] /Bible/INDEX.txt missing");
    SD.end();
    return false;
  }

  totalBooks = 0;
  while (idx.available() && totalBooks < 66) {
    String line = idx.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;

    // Format: "NN DisplayName chapterCount UPPER KEY..."
    int p1 = line.indexOf(' ');
    int p2 = line.indexOf(' ', p1 + 1);
    int p3 = line.indexOf(' ', p2 + 1);
    if (p1 < 0 || p2 < 0 || p3 < 0) continue;

    String display = line.substring(p1 + 1, p2);
    String chCnt   = line.substring(p2 + 1, p3);
    String pretty  = line.substring(p3 + 1);    // UPPER KEY ("1 SAMUEL")

    Book& b = books[totalBooks];
    strlcpy(b.display, display.c_str(), sizeof(b.display));
    // Build pretty title-case from UPPER key:
    //   "1 SAMUEL"          → "1 Samuel"
    //   "SONG OF SOLOMON"   → "Song of Solomon"
    String t = pretty;
    t.toLowerCase();
    bool capNext = true;
    for (size_t i = 0; i < t.length(); ++i) {
      char c = t[i];
      if (c == ' ') { capNext = true; continue; }
      // keep "of" lowercase in "Song of Solomon"
      if (capNext) { t.setCharAt(i, toupper(c)); }
      capNext = false;
    }
    // hand-fix the "Of" case
    t.replace(" Of ", " of ");
    strlcpy(b.pretty, t.c_str(), sizeof(b.pretty));

    b.chapterCount = (uint16_t) chCnt.toInt();
    if (b.chapterCount > 152) b.chapterCount = 152;
    // SD mode doesn't need byte offsets — chapters located by line scan.
    totalBooks++;
  }
  idx.close();
  Serial.printf("[sd] indexed %u books\n", totalBooks);
  return totalBooks > 0;
}

bool loadChapterSD(uint16_t b, uint16_t c) {
  if (b >= totalBooks) return false;
  if (c >= books[b].chapterCount) return false;

  char path[48];
  snprintf(path, sizeof(path), "/Bible/%s.txt", books[b].display);
  File f = SD.open(path, FILE_READ);
  if (!f) {
    Serial.printf("[sd] open %s failed\n", path);
    return false;
  }

  // Scan line-by-line until "=== CHAPTER {c+1} ===", then capture verses
  // until the next "=== CHAPTER" or EOF.
  char wantMarker[24];
  snprintf(wantMarker, sizeof(wantMarker), "=== CHAPTER %u ===", (unsigned)(c + 1));

  chapterLen = 0;
  bool inChapter = false;
  while (f.available()) {
    String line = f.readStringUntil('\n');
    // do NOT trim — we want to preserve leading verse-number formatting
    if (!inChapter) {
      if (line.indexOf(wantMarker) >= 0) inChapter = true;
      continue;
    }
    if (line.startsWith("=== CHAPTER") || line.startsWith("=== BOOK")) break;

    // append into chapterBuf (with newline as separator)
    size_t need = line.length() + 1;
    if (chapterLen + need >= CHAPTER_CAP) break;
    memcpy(chapterBuf + chapterLen, line.c_str(), line.length());
    chapterBuf[chapterLen + line.length()] = '\n';
    chapterLen += need;
  }
  f.close();
  if (chapterLen > 0) chapterBuf[chapterLen] = '\0';
  Serial.printf("[sd] loaded %s chapter %u (%u bytes)\n", books[b].display, c + 1, (unsigned) chapterLen);
  return chapterLen > 0;
}

// ============================================================
//   STREAM SOURCE  (HTTPS · chaelri.github.io/devo/nasb2020.json)
// ============================================================
bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  wifiMulti.addAP("CAYNO",   "lokomoko");
  wifiMulti.addAP("Chaelri", "charlie24");

  uint32_t t0 = millis();
  while (wifiMulti.run() != WL_CONNECTED && millis() - t0 < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
  }
  return WiFi.status() == WL_CONNECTED;
}

// Build the (book, chapter) → byte slice table by stream-scanning the full
// JSON body once. We never buffer more than a few hundred bytes.
//
// JSON shape:
//   { "GENESIS": { "1": { "1": "…", … }, "2": { … }, … },
//     "EXODUS":  { … },
//     … }
//
// Strategy: walk byte-by-byte tracking nesting depth + the current key at
// each depth. When depth == 1 a new book key starts; when depth == 2 a new
// chapter key starts; capture absolute byte offsets of the opening "{" and
// closing "}" of each chapter object.
bool initSourceStream() {
  if (!connectWiFi()) {
    Serial.println("[stream] WiFi failed");
    return false;
  }
  Serial.printf("[stream] WiFi ok · %s\n", WiFi.localIP().toString().c_str());

  WiFiClientSecure secure;
  secure.setInsecure();           // GitHub Pages cert — skip CA chain to save flash
  HTTPClient https;
  if (!https.begin(secure, NASB_URL)) {
    Serial.println("[stream] https.begin failed");
    return false;
  }
  int code = https.GET();
  if (code != HTTP_CODE_OK) {
    Serial.printf("[stream] GET %d\n", code);
    https.end();
    return false;
  }
  WiFiClient* s = https.getStreamPtr();
  if (!s) { https.end(); return false; }

  // Streaming JSON scanner
  uint32_t absPos = 0;
  int depth = 0;
  bool inString = false;
  bool escape = false;
  String curChKey;
  uint16_t curBookSlot = 0xFFFF;
  bool gotBookKey = false, gotChKey = false;
  String keyBuf;
  bool readingKey = false;
  uint32_t chapStart = 0;

  uint32_t lastProgress = 0;

  // small read buffer to avoid 1-byte reads
  uint8_t  ioBuf[512];

  while (https.connected() || s->available()) {
    int n = s->readBytes(ioBuf, sizeof(ioBuf));
    if (n <= 0) {
      if (!s->connected()) break;
      delay(2);
      continue;
    }
    for (int i = 0; i < n; ++i, ++absPos) {
      uint8_t c = ioBuf[i];

      if (inString) {
        if (escape) { escape = false; }
        else if (c == '\\') { escape = true; }
        else if (c == '"')  { inString = false; if (readingKey) readingKey = false; }
        else if (readingKey) keyBuf += (char) c;
        continue;
      }

      if (c == '"') {
        inString = true;
        // A string at depth 1 or 2 immediately followed by ":" is a key.
        if (depth == 1 || depth == 2) { readingKey = true; keyBuf = ""; }
        continue;
      }

      if (c == '{') {
        depth++;
        if (depth == 2) {
          // entered a book object — keyBuf holds the book key (e.g. "GENESIS")
          curBookSlot = appendStreamBook(keyBuf);
          gotBookKey  = (curBookSlot != 0xFFFF);
        } else if (depth == 3) {
          // entered a chapter object — keyBuf holds the chapter key
          curChKey = keyBuf;
          gotChKey = true;
          chapStart = absPos;     // byte offset of '{'
        }
      } else if (c == '}') {
        if (depth == 3 && gotBookKey && gotChKey) {
          uint32_t chapEnd = absPos;
          uint16_t cNum = (uint16_t) curChKey.toInt();
          if (cNum >= 1 && cNum <= 152) {
            Book& bk = books[curBookSlot];
            bk.chapters[cNum - 1].start = chapStart;
            bk.chapters[cNum - 1].len   = chapEnd - chapStart + 1;
            if (cNum > bk.chapterCount) bk.chapterCount = cNum;
          }
          gotChKey = false;
        }
        if (depth == 2) {
          gotBookKey = false;
          curBookSlot = 0xFFFF;
        }
        depth--;
      }
    }
    if (absPos - lastProgress > 1024UL * 1024UL) {
      lastProgress = absPos;
      char l3[32];
      snprintf(l3, sizeof(l3), "%lu KB", (unsigned long)(absPos / 1024));
      showSplash("Streaming Bible", "scanning offsets", l3);
    }
  }
  https.end();

  Serial.printf("[stream] scanned %lu KB · %u books\n",
    (unsigned long)(absPos / 1024), (unsigned) totalBooks);

  return totalBooks > 0;
}

// Append a fresh book slot in stream mode. Each JSON book key appears exactly
// once at depth=2, so we never need to look up an existing slot here.
uint16_t appendStreamBook(const String& upperKey) {
  if (totalBooks >= 66) return 0xFFFF;
  Book& b = books[totalBooks];

  // Title-case: "GENESIS" → "Genesis", "SONG OF SOLOMON" → "Song of Solomon"
  String t = upperKey; t.toLowerCase();
  bool capNext = true;
  for (size_t i = 0; i < t.length(); ++i) {
    char c = t[i];
    if (c == ' ') { capNext = true; continue; }
    if (capNext) { t.setCharAt(i, toupper(c)); }
    capNext = false;
  }
  t.replace(" Of ", " of ");
  String safe = t; safe.replace(" ", "");     // no spaces → matches SD filenames

  strlcpy(b.display, safe.c_str(), sizeof(b.display));
  strlcpy(b.pretty,  t.c_str(),    sizeof(b.pretty));
  b.chapterCount = 0;
  for (uint16_t c = 0; c < 152; ++c) { b.chapters[c].start = 0; b.chapters[c].len = 0; }
  return totalBooks++;
}

bool loadChapterStream(uint16_t b, uint16_t c) {
  if (b >= totalBooks) return false;
  if (c >= books[b].chapterCount) return false;
  ChapterSlice& s = books[b].chapters[c];
  if (s.len == 0 || s.len >= RAW_CHAP_CAP) {
    Serial.printf("[stream] bad slice b=%u c=%u len=%u\n", b, c, (unsigned) s.len);
    return false;
  }

  // HTTP Range request for just this chapter's bytes
  WiFiClientSecure secure;
  secure.setInsecure();
  HTTPClient https;
  if (!https.begin(secure, NASB_URL)) return false;
  char range[48];
  snprintf(range, sizeof(range), "bytes=%lu-%lu",
    (unsigned long) s.start, (unsigned long)(s.start + s.len - 1));
  https.addHeader("Range", range);
  int code = https.GET();
  if (code != HTTP_CODE_OK && code != HTTP_CODE_PARTIAL_CONTENT) {
    Serial.printf("[stream] range GET %d\n", code);
    https.end();
    return false;
  }
  int got = https.getStream().readBytes((uint8_t*) rawChapterBuf, RAW_CHAP_CAP - 1);
  rawChapterBuf[got] = '\0';
  https.end();
  if (got <= 0) return false;

  // Parse the chapter JSON ({ "1": "…", "2": "…" }) and rewrite into chapterBuf
  // in the same "n verseText\n" plaintext format used by SD mode.
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, rawChapterBuf);
  if (err) {
    Serial.printf("[stream] json err: %s\n", err.c_str());
    return false;
  }
  chapterLen = 0;
  // ArduinoJson iteration order matches insertion order — NASB JSON has verses
  // in numeric order so this is fine.
  for (JsonPair kv : doc.as<JsonObject>()) {
    const char* k = kv.key().c_str();
    const char* v = kv.value().as<const char*>();
    if (!v) continue;
    size_t need = strlen(k) + 1 + strlen(v) + 1;
    if (chapterLen + need >= CHAPTER_CAP) break;
    chapterLen += snprintf(chapterBuf + chapterLen, CHAPTER_CAP - chapterLen,
                           "%s %s\n", k, v);
  }
  if (chapterLen > 0) chapterBuf[chapterLen] = '\0';
  Serial.printf("[stream] loaded %s ch %u (%u bytes)\n",
    books[b].display, c + 1, (unsigned) chapterLen);
  return chapterLen > 0;
}

// Polymorphic loader
bool loadChapter(uint16_t b, uint16_t c) {
  return (source == SOURCE_SD) ? loadChapterSD(b, c) : loadChapterStream(b, c);
}

// ============================================================
//   PAGINATION  (chapterBuf → lines[] → pageFirstLine[])
// ============================================================
// Pass 1 — word-wrap chapterBuf into `lines[]` (offset+len into chapterBuf).
// Pass 2 — chunk those lines into pages of LINES_PER_PAGE.
//
// Width measurement uses the active body font's getTextBounds. We measure
// the full prospective line at each space-candidate, not per-char, so we
// don't drift on kerning.
static void pushLine(uint16_t off, uint16_t len) {
  if (totalLines >= MAX_LINES) return;
  // strip a single trailing space (left over from the wrap point)
  while (len > 0 && chapterBuf[off + len - 1] == ' ') len--;
  lines[totalLines].off = off;
  lines[totalLines].len = len;
  totalLines++;
}

static int16_t measure(uint16_t off, uint16_t len) {
  if (len == 0) return 0;
  // copy to scratch with NUL terminator for getTextBounds
  static char scratch[200];
  if (len >= sizeof(scratch)) len = sizeof(scratch) - 1;
  memcpy(scratch, chapterBuf + off, len);
  scratch[len] = '\0';
  int16_t x1, y1; uint16_t w, h;
  display.getTextBounds(scratch, 0, 0, &x1, &y1, &w, &h);
  return (int16_t) w;
}

void paginateChapter() {
  display.setFont(&FreeSerif9pt7b);
  totalLines = 0;

  // Walk chapterBuf line-by-line (verse-by-verse, \n delimited), word-wrap each.
  uint16_t i = 0;
  while (i < chapterLen) {
    // find verse end (next \n or buffer end)
    uint16_t verseStart = i;
    while (i < chapterLen && chapterBuf[i] != '\n') i++;
    uint16_t verseEnd = i;          // exclusive
    if (i < chapterLen) i++;        // skip the \n itself

    // wrap [verseStart, verseEnd) into lines
    uint16_t lineStart = verseStart;
    uint16_t lastSpace = 0xFFFF;
    while (lineStart < verseEnd) {
      // find the longest prefix that fits BODY_W
      uint16_t cursor = lineStart;
      lastSpace = 0xFFFF;
      while (cursor < verseEnd) {
        // measure [lineStart, cursor+1)
        if (chapterBuf[cursor] == ' ') lastSpace = cursor;
        int16_t w = measure(lineStart, cursor - lineStart + 1);
        if (w > BODY_W) break;
        cursor++;
      }
      if (cursor >= verseEnd) {
        // whole rest fits
        pushLine(lineStart, verseEnd - lineStart);
        break;
      }
      // wrap at lastSpace if we have one inside this candidate window
      uint16_t breakAt;
      if (lastSpace != 0xFFFF && lastSpace > lineStart) {
        breakAt = lastSpace;        // exclusive end
        pushLine(lineStart, breakAt - lineStart);
        lineStart = breakAt + 1;    // skip the space
      } else {
        // hard wrap — no space, force a break at cursor
        breakAt = (cursor == lineStart) ? lineStart + 1 : cursor;
        pushLine(lineStart, breakAt - lineStart);
        lineStart = breakAt;
      }
    }
  }

  // Now group lines into pages
  totalPages = 0;
  for (uint16_t li = 0; li < totalLines; li += LINES_PER_PAGE) {
    if (totalPages >= MAX_PAGES) break;
    pageFirstLine[totalPages++] = li;
  }
  if (totalPages == 0) {
    pageFirstLine[0] = 0;
    totalPages = 1;
  }
  Serial.printf("[paginate] %u lines · %u pages\n", totalLines, totalPages);
}

// ============================================================
//   RENDER  (the page that pageIdx points at)
// ============================================================
void drawHeader() {
  // black bar across the top with white text
  display.fillRect(0, 0, SCREEN_W, HEADER_H, GxEPD_BLACK);
  display.setTextColor(GxEPD_WHITE);
  display.setFont(&FreeSerifBold9pt7b);
  char hdr[40];
  snprintf(hdr, sizeof(hdr), "%s %u", books[bookIdx].pretty, (unsigned)(chapterIdx + 1));
  display.setCursor(4, HEADER_H - 4);
  display.print(hdr);
}

void drawFooter() {
  display.setTextColor(GxEPD_BLACK);
  display.setFont(&FreeSans9pt7b);
  // thin separator line
  display.drawLine(0, BODY_BOT + 1, SCREEN_W, BODY_BOT + 1, GxEPD_BLACK);
  char f[24];
  snprintf(f, sizeof(f), "page %u / %u", (unsigned)(pageIdx + 1), (unsigned) totalPages);
  display.setCursor(4, SCREEN_H - 3);
  display.print(f);
  // book progress hint on the right
  char r[24];
  snprintf(r, sizeof(r), "ch %u/%u", (unsigned)(chapterIdx + 1), (unsigned) books[bookIdx].chapterCount);
  int16_t x1, y1; uint16_t w, h;
  display.getTextBounds(r, 0, 0, &x1, &y1, &w, &h);
  display.setCursor(SCREEN_W - w - 4, SCREEN_H - 3);
  display.print(r);
}

void drawBody() {
  display.setTextColor(GxEPD_BLACK);
  display.setFont(&FreeSerif9pt7b);

  uint16_t first = pageFirstLine[pageIdx];
  uint16_t last  = (pageIdx + 1 < totalPages)
                    ? pageFirstLine[pageIdx + 1]
                    : totalLines;
  int16_t y = BODY_TOP + 12;
  for (uint16_t li = first; li < last && y <= BODY_BOT; ++li) {
    WrappedLine& wl = lines[li];
    // We have to NUL-terminate to use print() safely on a substring.
    static char scratch[200];
    uint16_t len = wl.len;
    if (len >= sizeof(scratch)) len = sizeof(scratch) - 1;
    memcpy(scratch, chapterBuf + wl.off, len);
    scratch[len] = '\0';
    display.setCursor(BODY_LEFT, y);
    display.print(scratch);
    y += LINE_H;
  }
}

void renderPage() {
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    drawHeader();
    drawBody();
    drawFooter();
  } while (display.nextPage());
}

void showSplash(const char* l1, const char* l2, const char* l3) {
  display.setRotation(1);
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.setTextColor(GxEPD_BLACK);
    display.setFont(&FreeSerifBold9pt7b);
    if (l1) { display.setCursor(8, 32);  display.print(l1); }
    display.setFont(&FreeSans9pt7b);
    if (l2) { display.setCursor(8, 60);  display.print(l2); }
    if (l3) { display.setCursor(8, 88);  display.print(l3); }
    // banana stripe at the bottom (the only color hint on a B/W panel — a thick black bar)
    display.fillRect(0, SCREEN_H - 4, SCREEN_W, 4, GxEPD_BLACK);
  } while (display.nextPage());
}

// ============================================================
//   NAVIGATION
// ============================================================
void advancePage() {
  pageIdx++;
  if (pageIdx >= totalPages) {
    pageIdx = 0;
    chapterIdx++;
    if (chapterIdx >= books[bookIdx].chapterCount) {
      chapterIdx = 0;
      bookIdx = (bookIdx + 1) % totalBooks;
    }
    if (!loadChapter(bookIdx, chapterIdx)) return;
    paginateChapter();
  }
  saveState();
  renderPage();
}

void reversePage() {
  if (pageIdx > 0) {
    pageIdx--;
  } else {
    if (chapterIdx > 0) {
      chapterIdx--;
    } else {
      bookIdx = (bookIdx == 0) ? (totalBooks - 1) : (bookIdx - 1);
      chapterIdx = books[bookIdx].chapterCount - 1;
    }
    if (!loadChapter(bookIdx, chapterIdx)) return;
    paginateChapter();
    pageIdx = totalPages - 1;
  }
  saveState();
  renderPage();
}

void advanceChapter() {
  pageIdx = 0;
  chapterIdx++;
  if (chapterIdx >= books[bookIdx].chapterCount) {
    chapterIdx = 0;
    bookIdx = (bookIdx + 1) % totalBooks;
  }
  if (!loadChapter(bookIdx, chapterIdx)) return;
  paginateChapter();
  saveState();
  renderPage();
}

void reverseChapter() {
  pageIdx = 0;
  if (chapterIdx > 0) {
    chapterIdx--;
  } else {
    bookIdx = (bookIdx == 0) ? (totalBooks - 1) : (bookIdx - 1);
    chapterIdx = books[bookIdx].chapterCount - 1;
  }
  if (!loadChapter(bookIdx, chapterIdx)) return;
  paginateChapter();
  saveState();
  renderPage();
}

// ============================================================
//   PERSISTENCE
// ============================================================
void saveState() {
  prefs.begin(NVS_NS, false);
  prefs.putUShort("b", bookIdx);
  prefs.putUShort("c", chapterIdx);
  prefs.putUShort("p", pageIdx);
  prefs.end();
}

void restoreState() {
  prefs.begin(NVS_NS, true);
  bookIdx    = prefs.getUShort("b", 0);
  chapterIdx = prefs.getUShort("c", 0);
  pageIdx    = prefs.getUShort("p", 0);
  prefs.end();
}

// ============================================================
//   BUTTONS  (debounce + hold detection)
// ============================================================
Gesture readButtons() {
  static uint32_t pressStart[2] = {0, 0};
  static bool     pressed[2]    = {false, false};
  static bool     holdFired[2]  = {false, false};
  static uint32_t lastEdge[2]   = {0, 0};

  const int pins[2] = { BTN_NEXT, BTN_PREV };
  uint32_t now = millis();

  for (int i = 0; i < 2; ++i) {
    bool down = (digitalRead(pins[i]) == LOW);
    if (down != pressed[i] && (now - lastEdge[i]) > DEBOUNCE_MS) {
      lastEdge[i] = now;
      if (down) {
        pressed[i] = true;
        pressStart[i] = now;
        holdFired[i] = false;
      } else {
        pressed[i] = false;
        if (!holdFired[i]) {
          // tap event on release
          return (i == 0) ? G_TAP_NEXT : G_TAP_PREV;
        }
      }
    }
    if (pressed[i] && !holdFired[i] && (now - pressStart[i] >= HOLD_MS)) {
      holdFired[i] = true;
      return (i == 0) ? G_HOLD_NEXT : G_HOLD_PREV;
    }
  }
  return G_NONE;
}

// ============================================================
//   DEEP SLEEP after IDLE_SLEEP_MS
// ============================================================
void maybeSleep() {
  if (millis() - lastInteractionMs < IDLE_SLEEP_MS) return;
  Serial.println("[sleep] idle timeout — entering deep sleep");
  display.hibernate();              // park the panel
  // Wake when either button is pulled LOW (released → pressed)
  esp_sleep_enable_ext1_wakeup(WAKE_MASK, ESP_EXT1_WAKEUP_ANY_LOW);
  esp_deep_sleep_start();
}
