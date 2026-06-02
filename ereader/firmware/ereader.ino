// ============================================================
//   Bible E-Reader · ESP32-S3 SuperMini + 0.91" SSD1306 OLED + tactile button
// ============================================================
//
//   Pins (default ESP32-S3 I²C):
//     SDA  =  GPIO 8     →  OLED SDA
//     SCL  =  GPIO 9     →  OLED SCK / SCL
//     BTN  =  GPIO 4     →  Tactile button to GND (INPUT_PULLUP)
//     3V3  →  OLED VCC
//     GND  →  OLED GND  +  button second lead
//
//   One button drives the whole UI:
//     tap        →  forward  (next book / chapter / page)
//     double-tap →  backward (prev)
//     hold ≥600ms →  advance / back one level (BOOK ↔ CHAPTER ↔ READING)
//
//   Data: /nasb.bin in LittleFS, produced by `node tools/pack-nasb.mjs --nt`
//   Format: see pack-nasb.mjs header comment.
//
//   Libraries (install via Arduino Library Manager):
//     - U8g2          (oliver kraus)
//     - LittleFS      (bundled with esp32 core ≥ 2.0)
//     - Preferences   (bundled)
//
//   Board: "ESP32S3 Dev Module"  (or your specific SuperMini variant)
//   Partition Scheme: choose one with a ≥ 1.5 MB SPIFFS/FFAT region
//                     ("No OTA (1MB APP / 3MB SPIFFS)" works for the NT build)
//
// ============================================================

#include <Wire.h>
#include <U8g2lib.h>
#include <LittleFS.h>
#include <Preferences.h>

// -------------------- PINS --------------------
static const int SDA_PIN = 8;
static const int SCL_PIN = 9;
static const int BTN_PIN = 4;

// -------------------- GESTURE TIMING --------------------
static const uint32_t DEBOUNCE_MS = 25;
static const uint32_t DOUBLE_MS   = 280;
static const uint32_t HOLD_MS     = 600;

// -------------------- DISPLAY --------------------
// 0.91" 128×32 SSD1306, hardware I²C, full-buffer mode
U8G2_SSD1306_128X32_UNIVISION_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);

// -------------------- NVS --------------------
Preferences prefs;

// -------------------- STATE --------------------
enum Mode : uint8_t { MODE_BOOK = 0, MODE_CHAPTER = 1, MODE_READING = 2 };
Mode     mode       = MODE_BOOK;
uint16_t bookIdx    = 0;
uint16_t chapterIdx = 0;
uint16_t pageIdx    = 0;

// -------------------- NASB.BIN INDEX --------------------
struct BookEntry {
  char     name[16];        // null-terminated ASCII
  uint16_t chapterCount;
  uint32_t firstChapter;    // index into chapter table
};

File     nasbFile;
uint16_t totalBooks         = 0;
uint32_t totalChapters      = 0;
uint32_t totalVerses        = 0;
uint32_t chapterTableOffset = 0;
uint32_t verseTableOffset   = 0;
uint32_t textBlobOffset     = 0;
BookEntry books[80];         // headroom for full Bible (66) + slack

// -------------------- CURRENT CHAPTER BUFFER --------------------
static const size_t CHAPTER_CAP = 8192;     // longest NASB chapter < 4 KB
static const size_t MAX_PAGES   = 96;       // longest chapter (Ps 119) ≈ 50 pages
char     chapterBuf[CHAPTER_CAP];
size_t   chapterLen = 0;
uint16_t pageStarts[MAX_PAGES];
uint16_t totalPages = 1;

// -------------------- PAGE LAYOUT (reading) --------------------
// Header row 8 px (inverted) + 3 body rows of 8 px = full 32 px screen.
// Font 5x7_tf is 5 wide × 7 tall → 128/5 ≈ 25 cols × 3 rows = 75 chars/page.
static const int READ_COLS = 25;
static const int READ_ROWS = 3;

// ============================================================
//   LE byte helpers
// ============================================================
static inline uint16_t LE16(const uint8_t* p) { return p[0] | (p[1] << 8); }
static inline uint32_t LE32(const uint8_t* p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

// ============================================================
//   LOAD INDEX
// ============================================================
bool loadNasb() {
  if (!LittleFS.begin(false)) {
    Serial.println("LittleFS mount failed");
    return false;
  }
  nasbFile = LittleFS.open("/nasb.bin", "r");
  if (!nasbFile) {
    Serial.println("/nasb.bin missing");
    return false;
  }

  uint8_t header[32];
  if (nasbFile.read(header, 32) != 32) return false;
  if (header[0] != 'N' || header[1] != 'S' || header[2] != 'B' || header[3] != '1') {
    Serial.println("Bad magic");
    return false;
  }
  totalBooks         = LE16(header + 4);
  totalChapters      = LE32(header + 8);
  totalVerses        = LE32(header + 12);
  uint32_t bookTblOff = LE32(header + 16);
  chapterTableOffset  = LE32(header + 20);
  verseTableOffset    = LE32(header + 24);
  textBlobOffset      = LE32(header + 28);

  if (totalBooks > sizeof(books) / sizeof(books[0])) {
    Serial.println("Too many books for static table");
    return false;
  }

  // Read book table into RAM
  nasbFile.seek(bookTblOff);
  uint8_t entry[32];
  for (uint16_t i = 0; i < totalBooks; i++) {
    if (nasbFile.read(entry, 32) != 32) return false;
    memcpy(books[i].name, entry, 16);
    books[i].name[15]      = 0;                  // ensure null
    books[i].chapterCount  = LE16(entry + 16);
    books[i].firstChapter  = LE32(entry + 20);
  }

  Serial.printf("Loaded NASB: %u books, %u chapters, %u verses\n",
                totalBooks, totalChapters, totalVerses);
  return true;
}

// Look up one chapter's verse_count + first_verse index
struct ChapterInfo { uint32_t verseCount; uint32_t firstVerse; };

ChapterInfo readChapterInfo(uint16_t b, uint16_t c) {
  uint32_t globalCh = books[b].firstChapter + c;
  uint32_t off = chapterTableOffset + globalCh * 12;
  nasbFile.seek(off);
  uint8_t buf[12];
  nasbFile.read(buf, 12);
  ChapterInfo info;
  info.verseCount = LE32(buf + 0);
  info.firstVerse = LE32(buf + 4);
  return info;
}

// ============================================================
//   BUILD CHAPTER TEXT  +  PAGINATE
// ============================================================
void computePageBreaks() {
  // Greedy word-wrap: each line ≤ READ_COLS, READ_ROWS lines per page.
  // pageStarts[0..totalPages-1] holds the byte offset into chapterBuf
  // where each page begins.
  totalPages = 0;
  pageStarts[totalPages++] = 0;

  int linesUsed = 0;
  int lineLen   = 0;
  size_t i      = 0;

  while (i < chapterLen) {
    // skip leading spaces at start of a line
    if (lineLen == 0) {
      while (i < chapterLen && chapterBuf[i] == ' ') i++;
      if (i >= chapterLen) break;
    }
    // find next word boundary
    size_t wordEnd = i;
    while (wordEnd < chapterLen && chapterBuf[wordEnd] != ' ') wordEnd++;
    int wordLen = wordEnd - i;

    // word fits on current line?
    int needed = (lineLen == 0) ? wordLen : (1 + wordLen);
    if (lineLen + needed <= READ_COLS) {
      lineLen += needed;
      i = wordEnd;
      continue;
    }

    // doesn't fit → line break
    linesUsed++;
    lineLen = 0;
    if (linesUsed >= READ_ROWS) {
      // page break — next page starts at current position (after any leading spaces)
      size_t pageStart = i;
      while (pageStart < chapterLen && chapterBuf[pageStart] == ' ') pageStart++;
      if (totalPages < MAX_PAGES && pageStart < chapterLen) {
        pageStarts[totalPages++] = (uint16_t)pageStart;
      }
      linesUsed = 0;
    }
    // word is too wide for a line → hard-break (rare with READ_COLS=25)
    if (wordLen > READ_COLS) {
      lineLen = READ_COLS;
      i += READ_COLS;
    }
    // else: leave i alone, loop re-attempts on new line
  }
  if (totalPages == 0) totalPages = 1;
}

void buildChapter() {
  chapterLen = 0;
  ChapterInfo info = readChapterInfo(bookIdx, chapterIdx);

  for (uint32_t v = 0; v < info.verseCount; v++) {
    // read verse table entry
    uint8_t ve[8];
    nasbFile.seek(verseTableOffset + (info.firstVerse + v) * 8);
    nasbFile.read(ve, 8);
    uint32_t textOff = LE32(ve + 0);
    uint32_t textLen = LE32(ve + 4);

    // prefix: " N " (single leading space for separation, then number, then space)
    char prefix[8];
    int plen = snprintf(prefix, sizeof(prefix), "%s%u ",
                        (v == 0 ? "" : "  "), (unsigned)(v + 1));
    if (chapterLen + plen + textLen >= CHAPTER_CAP) break;   // safety stop

    memcpy(chapterBuf + chapterLen, prefix, plen);
    chapterLen += plen;

    // read verse text
    nasbFile.seek(textBlobOffset + textOff);
    nasbFile.read((uint8_t*)(chapterBuf + chapterLen), textLen);
    chapterLen += textLen;
  }
  chapterBuf[chapterLen] = 0;

  computePageBreaks();
  if (pageIdx >= totalPages) pageIdx = 0;
}

// ============================================================
//   RENDERING
// ============================================================
// header bar (top 8 px, inverted)
void drawHeader(const char* text) {
  oled.setDrawColor(1);
  oled.drawBox(0, 0, 128, 9);
  oled.setDrawColor(0);
  oled.setFont(u8g2_font_5x7_tf);
  oled.drawStr(2, 7, text);
  oled.setDrawColor(1);
}

void renderBookSelect() {
  oled.clearBuffer();

  char hdr[24];
  snprintf(hdr, sizeof(hdr), "BOOK  %u / %u", bookIdx + 1, totalBooks);
  drawHeader(hdr);

  // body: book name, big & centered. Auto-fit font width.
  const char* name = books[bookIdx].name;
  const uint8_t* fonts[] = {
    u8g2_font_logisoso16_tr,
    u8g2_font_helvB12_tr,
    u8g2_font_helvR10_tr,
    u8g2_font_6x10_tf,
  };
  for (auto f : fonts) {
    oled.setFont(f);
    int w = oled.getStrWidth(name);
    if (w <= 124) {
      int x = (128 - w) / 2;
      // baseline near bottom of body region (9..31): pick y by font ascent
      int y = 9 + ((23 + oled.getAscent()) / 2);
      if (y > 31) y = 31;
      oled.drawStr(x, y, name);
      break;
    }
  }

  oled.sendBuffer();
}

void renderChapterSelect() {
  oled.clearBuffer();

  char hdr[24];
  snprintf(hdr, sizeof(hdr), "%s  /%u", books[bookIdx].name, books[bookIdx].chapterCount);
  drawHeader(hdr);

  char num[8];
  snprintf(num, sizeof(num), "%u", chapterIdx + 1);
  oled.setFont(u8g2_font_logisoso16_tr);
  int w = oled.getStrWidth(num);
  int x = (128 - w) / 2;
  oled.drawStr(x, 29, num);

  oled.sendBuffer();
}

void renderReadingPage() {
  oled.clearBuffer();

  // header: short book code + chapter + verse-of-page marker
  // produce a 3-letter book code (first 3 of name)
  char code[4] = { 0 };
  for (int i = 0; i < 3 && books[bookIdx].name[i]; i++) code[i] = books[bookIdx].name[i];
  char hdr[24];
  snprintf(hdr, sizeof(hdr), "%s %u  p%u/%u", code, chapterIdx + 1,
           pageIdx + 1, totalPages);
  drawHeader(hdr);

  // body: 3 rows × 25 cols, word-wrap from pageStarts[pageIdx]
  oled.setFont(u8g2_font_5x7_tf);

  size_t start = pageStarts[pageIdx];
  size_t end   = (pageIdx + 1 < totalPages) ? pageStarts[pageIdx + 1] : chapterLen;

  size_t i = start;
  for (int row = 0; row < READ_ROWS && i < end; row++) {
    // skip leading spaces
    while (i < end && chapterBuf[i] == ' ') i++;
    if (i >= end) break;

    // greedily collect words until line is full
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

    int y = 9 + 7 + row * 8;     // baseline at 16, 24, 31
    if (y > 31) y = 31;
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
enum Gesture : uint8_t { G_NONE = 0, G_TAP, G_DOUBLE, G_HOLD };

bool     btnWasPressed = false;
uint32_t btnPressStart = 0;
uint32_t lastReleaseMs = 0;
bool     pendingTap    = false;
bool     holdFired     = false;

Gesture readButton() {
  uint32_t now = millis();
  bool pressed = (digitalRead(BTN_PIN) == LOW);

  // rising edge
  if (pressed && !btnWasPressed) {
    btnPressStart = now;
    btnWasPressed = true;
    holdFired = false;
    return G_NONE;
  }

  // long-press fires immediately at the threshold (don't wait for release)
  if (btnWasPressed && !holdFired && (now - btnPressStart) >= HOLD_MS) {
    holdFired = true;
    return G_HOLD;
  }

  // falling edge
  if (!pressed && btnWasPressed) {
    uint32_t dur = now - btnPressStart;
    btnWasPressed = false;
    if (dur < DEBOUNCE_MS) return G_NONE;
    if (holdFired)         return G_NONE;        // already fired on threshold

    if (pendingTap && (now - lastReleaseMs) <= DOUBLE_MS) {
      pendingTap = false;
      return G_DOUBLE;
    }
    pendingTap    = true;
    lastReleaseMs = now;
    return G_NONE;                                // wait to see if a double follows
  }

  // pending tap timed out → commit as single tap
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
        // auto-advance to next chapter (same book; wraps)
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

  pinMode(BTN_PIN, INPUT_PULLUP);

  Wire.setPins(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);

  oled.begin();
  oled.setContrast(180);
  oled.setFont(u8g2_font_6x10_tf);
  oled.clearBuffer();
  oled.drawStr(0, 12, "Bible E-Reader");
  oled.drawStr(0, 26, "Loading NASB...");
  oled.sendBuffer();

  if (!loadNasb()) {
    oled.clearBuffer();
    oled.drawStr(0, 12, "NASB not found.");
    oled.drawStr(0, 26, "Upload /nasb.bin");
    oled.sendBuffer();
    return;
  }

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
