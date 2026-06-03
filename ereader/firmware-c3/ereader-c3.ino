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
//   One-button UI:
//     tap                  →  forward  (next book / chapter / page)
//     double-tap           →  backward (prev — wraps within current level)
//     hold ≥600ms          →  forward one level (BOOK→CHAPTER→READING,
//                             READING→CHAPTER as a back convenience)
//     tap-then-press-hold  →  escape up one level (CHAPTER→BOOK, READING→
//                             CHAPTER) — works from any position, no need
//                             to navigate to the first chapter first
//
//   Bible source: pre-split into per-chapter JSON files hosted on
//   GitHub Pages so the firmware never has to stream the 4.4 MB
//   master file or do Range requests.
//
//     Index:   https://chaelri.github.io/devo/nasb-split/index.json
//                                 → {"GENESIS":50,"EXODUS":40,...}
//     Chapter: https://chaelri.github.io/devo/nasb-split/<slug>/<n>.json
//                                 → {"1":"...","2":"...",...}
//
//   `<slug>` is the book name lowercased with spaces → '-'
//   (GENESIS → genesis, 1 KINGS → 1-kings, SONG OF SOLOMON → song-of-solomon).
//
//   Boot: one ~5 KB GET for the index. Page-turn that crosses a
//   chapter: one ~3-15 KB GET for that chapter. No PSRAM needed.
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
static const int SDA_PIN     = 5;
static const int SCL_PIN     = 6;
static const int BTN_PIN     = 9;  // BOOT button — INPUT_PULLUP, active LOW
static const int BTN_PIN_ALT = 0;  // optional external tactile button to GND.
                                   // GPIO 0 is a strapping pin: do NOT hold
                                   // this button during power-on / reset, or
                                   // the C3 enters download mode.
static const int LED_PIN     = 8;  // on-board blue LED (active-LOW on most variants)

// -------------------- GESTURE TIMING --------------------
static const uint32_t DEBOUNCE_MS = 25;
static const uint32_t DOUBLE_MS   = 280;
static const uint32_t HOLD_MS     = 600;

// -------------------- WIFI / SOURCE URLS --------------------
WiFiMulti wifiMulti;
static const uint32_t WIFI_CONNECT_TIMEOUT_MS = 20000;
static const char* NASB_BASE  = "https://chaelri.github.io/devo/nasb-split";
static const char* INDEX_URL  = "https://chaelri.github.io/devo/nasb-split/index.json";

// -------------------- DISPLAY --------------------
U8G2_SSD1306_72X40_ER_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);

// -------------------- NVS --------------------
Preferences prefs;

// -------------------- STATE --------------------
enum Mode    : uint8_t { MODE_BOOK = 0, MODE_CHAPTER = 1, MODE_READING = 2 };
enum Gesture : uint8_t { G_NONE = 0, G_TAP, G_DOUBLE, G_HOLD, G_DOUBLE_HOLD };
Mode     mode       = MODE_BOOK;
uint16_t bookIdx    = 0;
uint16_t chapterIdx = 0;
uint16_t pageIdx    = 0;

// -------------------- RAW JSON BUFFER (BSS) --------------------
// Reused for both the index fetch and per-chapter fetches. Largest
// NASB chapter (Ps 119) is ~15 KB; 24 KB is plenty of headroom.
static const size_t RAW_CHAP_CAP = 24UL * 1024UL;
char rawChapterBuf[RAW_CHAP_CAP];

// -------------------- BOOK TABLE --------------------
// No byte offsets needed anymore — each chapter is its own URL.
struct Book {
  char     name[20];          // longest "SONG OF SOLOMON" (15 chars)
  uint16_t chapterCount;
};
Book     books[66];
uint16_t totalBooks = 0;

// -------------------- CURRENT CHAPTER BUFFER --------------------
static const size_t CHAPTER_CAP = 16384;
static const size_t MAX_PAGES   = 256;
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
//   BOOK NAME → URL SLUG
//   Matches devo/split-nasb.py's slugify(): lowercase + spaces → '-'.
// ============================================================
static void bookSlug(const char* name, char* out, size_t outCap) {
  size_t w = 0;
  for (size_t i = 0; name[i] && w + 1 < outCap; i++) {
    char c = name[i];
    if (c == ' ')      c = '-';
    else if (c >= 'A' && c <= 'Z') c = c + ('a' - 'A');
    out[w++] = c;
  }
  out[w] = 0;
}

// ============================================================
//   PROGRESS UI for in-flight fetches
// ============================================================
static void drawFetchProgress(const char* l1, const char* l2,
                              uint32_t cur, uint32_t total) {
  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tf);
  if (l1) oled.drawStr(0, 7,  l1);
  if (l2) oled.drawStr(0, 15, l2);
  if (total > 0) {
    char pct[8];
    int  p = (int)((uint64_t)cur * 100 / total);
    snprintf(pct, sizeof(pct), "%d%%", p);
    int pw = oled.getStrWidth(pct);
    oled.drawStr((72 - pw) / 2, 25, pct);
    oled.drawFrame(0, 30, 72, 8);
    int w = (int)((uint64_t)cur * 70 / total);
    if (w > 70) w = 70;
    oled.drawBox(1, 31, w, 6);
  } else {
    // unknown content-length — just spin a dot count
    char dots[8];
    int n = ((millis() / 250) % 4);
    snprintf(dots, sizeof(dots), "%.*s", n, "...");
    oled.drawStr(0, 30, dots);
  }
  oled.sendBuffer();
}

// ============================================================
//   HTTP HELPER  ─ GET a URL into rawChapterBuf, return bytes read.
//   If labels are non-null, draws a progress bar while bytes arrive.
// ============================================================
static size_t httpGetIntoBuf(const char* url,
                             const char* progL1 = nullptr,
                             const char* progL2 = nullptr) {
  WiFiClientSecure client;
  client.setInsecure();
  client.setHandshakeTimeout(15);

  HTTPClient http;
  http.setReuse(false);
  http.setTimeout(15000);
  if (!http.begin(client, url)) {
    Serial.printf("http begin fail: %s\n", url);
    return 0;
  }
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);

  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    Serial.printf("HTTP %d for %s\n", code, url);
    http.end();
    return 0;
  }

  int total = http.getSize();
  WiFiClient* stream = http.getStreamPtr();
  size_t   got      = 0;
  uint32_t t0       = millis();
  uint32_t lastDraw = 0;
  if (progL1) drawFetchProgress(progL1, progL2, 0, (uint32_t)(total > 0 ? total : 0));
  while ((total < 0 || (int)got < total) && got + 1 < RAW_CHAP_CAP) {
    if (stream->available() > 0) {
      int r = stream->readBytes(rawChapterBuf + got,
                                RAW_CHAP_CAP - 1 - got);
      if (r > 0) { got += r; t0 = millis(); }
    } else if (!http.connected() && stream->available() == 0) {
      break;
    } else {
      if (millis() - t0 > 10000) break;
      delay(1);
    }
    if (progL1 && millis() - lastDraw > 80) {
      drawFetchProgress(progL1, progL2, (uint32_t)got,
                        (uint32_t)(total > 0 ? total : 0));
      lastDraw = millis();
    }
  }
  rawChapterBuf[got] = 0;
  http.end();
  return got;
}

// ============================================================
//   INDEX FETCH  ─ one ~5 KB GET, populates books[]
// ============================================================
bool fetchIndex() {
  bootScreen("Fetching", "index");
  size_t n = httpGetIntoBuf(INDEX_URL);
  if (n == 0) {
    bootScreen("idx HTTP", "fail");
    return false;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, rawChapterBuf, n);
  if (err) {
    Serial.printf("idx parse err: %s\n", err.c_str());
    bootScreen("idx parse", "fail", err.c_str());
    return false;
  }

  JsonObject obj = doc.as<JsonObject>();
  totalBooks = 0;
  for (JsonPair kv : obj) {
    if (totalBooks >= 66) break;
    const char* n2 = kv.key().c_str();
    Book& bk = books[totalBooks];
    strncpy(bk.name, n2, sizeof(bk.name) - 1);
    bk.name[sizeof(bk.name) - 1] = 0;
    bk.chapterCount = kv.value().as<uint16_t>();
    totalBooks++;
  }
  Serial.printf("idx: %u books\n", totalBooks);
  return totalBooks > 0;
}

// ============================================================
//   CHAPTER FETCH  ─ one GET per chapter, with progress + retry
// ============================================================
size_t fetchChapter(const char* bookName, uint16_t chapNum1) {
  char slug[24];
  bookSlug(bookName, slug, sizeof(slug));
  char url[128];
  snprintf(url, sizeof(url), "%s/%s/%u.json", NASB_BASE, slug, chapNum1);

  // "GEN 3" style label for the progress screen
  char label2[16];
  char code[4] = {0};
  for (int i = 0; i < 3 && bookName[i]; i++) code[i] = bookName[i];
  snprintf(label2, sizeof(label2), "%s %u", code, chapNum1);

  for (int attempt = 1; attempt <= 3; attempt++) {
    size_t n = httpGetIntoBuf(url, "loading", label2);
    if (n > 0) return n;
    Serial.printf("chap fetch attempt %d failed\n", attempt);
    if (attempt < 3) {
      bootScreen("retry", label2);
      delay(400);
    }
  }
  return 0;
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

  size_t rawLen = fetchChapter(bk.name, chapterIdx + 1);
  if (rawLen == 0) {
    const char* m = "fetch error";
    appendAscii(m, strlen(m));
    chapterBuf[chapterLen] = 0;
    computePageBreaks();
    pageIdx = 0;
    return;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, rawChapterBuf, rawLen);
  if (err) {
    Serial.printf("chap JSON err: %s\n", err.c_str());
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
bool     isSecondPress = false;   // current press is the "second tap" of a double

Gesture readButton() {
  uint32_t now = millis();
  bool pressed = (digitalRead(BTN_PIN) == LOW) ||
                 (digitalRead(BTN_PIN_ALT) == LOW);

  if (pressed && !btnWasPressed) {
    // If a press starts inside the double-tap window, this is the
    // second tap — held long enough it becomes G_DOUBLE_HOLD, released
    // quickly it becomes G_DOUBLE.
    isSecondPress = (pendingTap && (now - lastReleaseMs) <= DOUBLE_MS);
    if (isSecondPress) pendingTap = false;
    btnPressStart = now;
    btnWasPressed = true;
    holdFired = false;
    return G_NONE;
  }

  if (btnWasPressed && !holdFired && (now - btnPressStart) >= HOLD_MS) {
    holdFired = true;
    return isSecondPress ? G_DOUBLE_HOLD : G_HOLD;
  }

  if (!pressed && btnWasPressed) {
    uint32_t dur = now - btnPressStart;
    btnWasPressed = false;
    if (dur < DEBOUNCE_MS) { isSecondPress = false; return G_NONE; }
    if (holdFired)         { isSecondPress = false; return G_NONE; }

    if (isSecondPress) {
      isSecondPress = false;
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

void onDoubleHold() {
  // Tap-then-press-and-hold escapes up one level — works from any
  // chapter, no need to navigate to chapter 1 first.
  switch (mode) {
    case MODE_CHAPTER: mode = MODE_BOOK;    break;
    case MODE_READING: mode = MODE_CHAPTER; break;
    case MODE_BOOK:                         break;  // already top
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

  pinMode(BTN_PIN,     INPUT_PULLUP);
  pinMode(BTN_PIN_ALT, INPUT_PULLUP);

  Wire.setPins(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);

  oled.begin();
  oled.setContrast(180);
  bootScreen("Bible", "E-Reader", "booting");

  if (!connectWiFi()) return;

  if (!fetchIndex()) return;     // leave whichever error screen is showing

  char line[16];
  snprintf(line, sizeof(line), "%u books", totalBooks);
  bootScreen("NASB OK", line);
  delay(500);

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
    if      (g == G_TAP)         onTap();
    else if (g == G_DOUBLE)      onDouble();
    else if (g == G_HOLD)        onHold();
    else if (g == G_DOUBLE_HOLD) onDoubleHold();
    render();
    savePos();
  }
  delay(2);
}
