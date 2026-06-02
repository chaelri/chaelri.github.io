#!/usr/bin/env node
// Pack devo/nasb2020.json into a single binary at ereader/data/nasb.bin
// Format ("NSB1" v1):
//   Header (32 B) → Book table (book_count × 32 B) → Chapter table (chapter_count × 12 B)
//     → Verse table (verse_count × 8 B) → Text blob (raw UTF-8)
//
// Usage:
//   node tools/pack-nasb.mjs           # full Bible (66 books, ~4 MB — needs 8 MB flash)
//   node tools/pack-nasb.mjs --nt      # NT only (27 books, ~1 MB — fits 4 MB flash)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');

const FULL_BOOK_ORDER = [
  'GENESIS','EXODUS','LEVITICUS','NUMBERS','DEUTERONOMY','JOSHUA','JUDGES','RUTH',
  '1 SAMUEL','2 SAMUEL','1 KINGS','2 KINGS','1 CHRONICLES','2 CHRONICLES','EZRA',
  'NEHEMIAH','ESTHER','JOB','PSALMS','PROVERBS','ECCLESIASTES','SONG OF SOLOMON',
  'ISAIAH','JEREMIAH','LAMENTATIONS','EZEKIEL','DANIEL','HOSEA','JOEL','AMOS',
  'OBADIAH','JONAH','MICAH','NAHUM','HABAKKUK','ZEPHANIAH','HAGGAI','ZECHARIAH','MALACHI',
  'MATTHEW','MARK','LUKE','JOHN','ACTS','ROMANS','1 CORINTHIANS','2 CORINTHIANS',
  'GALATIANS','EPHESIANS','PHILIPPIANS','COLOSSIANS','1 THESSALONIANS','2 THESSALONIANS',
  '1 TIMOTHY','2 TIMOTHY','TITUS','PHILEMON','HEBREWS','JAMES','1 PETER','2 PETER',
  '1 JOHN','2 JOHN','3 JOHN','JUDE','REVELATION',
];

const args = process.argv.slice(2);
const ntOnly = args.includes('--nt');
const books = ntOnly ? FULL_BOOK_ORDER.slice(39) : FULL_BOOK_ORDER;

const HEADER_SIZE   = 32;
const BOOK_ENTRY    = 32;
const CHAPTER_ENTRY = 12;
const VERSE_ENTRY   = 8;
const NAME_MAX      = 15;   // 15 chars + null terminator = 16 bytes

const nasb = JSON.parse(readFileSync(resolve(REPO, 'devo/nasb2020.json'), 'utf8'));

for (const b of books) {
  if (!nasb[b]) { console.error(`Missing book in JSON: ${b}`); process.exit(1); }
  if (b.length > NAME_MAX) { console.error(`Book name too long (>${NAME_MAX}): ${b}`); process.exit(1); }
}

// Normalize Unicode punctuation → ASCII so firmware pagination is byte-accurate
// and we can use U8g2's smaller `_tr` (reduced) fonts.
function normalize(s) {
  return s
    .replace(/[\u201C\u201D]/g, '"')   // curly double quotes
    .replace(/[\u2018\u2019]/g, "'")   // curly single quotes
    .replace(/[\u2013\u2014]/g, '-')   // en/em dash
    .replace(/\u2026/g, '...')          // horizontal ellipsis
    .replace(/\u00A0/g, ' ')            // non-breaking space
    .replace(/\u00B6/g, '');            // pilcrow (paragraph marker)
}

// ---- Build tables + text blob in one pass ----
const verseEntries   = []; // { textOffset, textLength }
const chapterEntries = []; // { verseCount, firstVerse }
const bookEntries    = []; // { name, chapterCount, firstChapter }
const textChunks     = [];
let textCursor = 0;

for (const bookName of books) {
  const chaptersObj = nasb[bookName];
  const chapterNumbers = Object.keys(chaptersObj).sort((a, b) => +a - +b);
  const firstChapter = chapterEntries.length;

  for (const chNum of chapterNumbers) {
    const versesObj = chaptersObj[chNum];
    const verseNumbers = Object.keys(versesObj).sort((a, b) => +a - +b);
    const firstVerse = verseEntries.length;

    for (const vNum of verseNumbers) {
      const text = normalize(versesObj[vNum]);
      const bytes = Buffer.from(text, 'utf8');
      verseEntries.push({ textOffset: textCursor, textLength: bytes.length });
      textChunks.push(bytes);
      textCursor += bytes.length;
    }
    chapterEntries.push({ verseCount: verseNumbers.length, firstVerse });
  }
  bookEntries.push({ name: bookName, chapterCount: chapterNumbers.length, firstChapter });
}

// ---- Compute offsets ----
const bookTableOffset    = HEADER_SIZE;
const chapterTableOffset = bookTableOffset    + bookEntries.length    * BOOK_ENTRY;
const verseTableOffset   = chapterTableOffset + chapterEntries.length * CHAPTER_ENTRY;
const textBlobOffset     = verseTableOffset   + verseEntries.length   * VERSE_ENTRY;
const totalSize          = textBlobOffset     + textCursor;

const buf = Buffer.alloc(totalSize);

// ---- Header ----
buf.write('NSB1', 0, 'ascii');
buf.writeUInt16LE(bookEntries.length, 4);
buf.writeUInt16LE(ntOnly ? 1 : 0, 6);
buf.writeUInt32LE(chapterEntries.length, 8);
buf.writeUInt32LE(verseEntries.length, 12);
buf.writeUInt32LE(bookTableOffset, 16);
buf.writeUInt32LE(chapterTableOffset, 20);
buf.writeUInt32LE(verseTableOffset, 24);
buf.writeUInt32LE(textBlobOffset, 28);

// ---- Book table ----
for (let i = 0; i < bookEntries.length; i++) {
  const off = bookTableOffset + i * BOOK_ENTRY;
  const b = bookEntries[i];
  buf.write(b.name, off, NAME_MAX, 'ascii');
  // byte 15 stays 0 = null terminator
  buf.writeUInt16LE(b.chapterCount, off + 16);
  // 18..19 reserved
  buf.writeUInt32LE(b.firstChapter, off + 20);
  // 24..31 reserved
}

// ---- Chapter table ----
for (let i = 0; i < chapterEntries.length; i++) {
  const off = chapterTableOffset + i * CHAPTER_ENTRY;
  buf.writeUInt32LE(chapterEntries[i].verseCount, off);
  buf.writeUInt32LE(chapterEntries[i].firstVerse, off + 4);
}

// ---- Verse table ----
for (let i = 0; i < verseEntries.length; i++) {
  const off = verseTableOffset + i * VERSE_ENTRY;
  buf.writeUInt32LE(verseEntries[i].textOffset, off);
  buf.writeUInt32LE(verseEntries[i].textLength, off + 4);
}

// ---- Text blob ----
let p = textBlobOffset;
for (const chunk of textChunks) {
  chunk.copy(buf, p);
  p += chunk.length;
}

// Arduino IDE / LittleFS-plugin convention: `data/` must sit next to the .ino
const outDir = resolve(REPO, 'ereader/firmware/data');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, 'nasb.bin');
writeFileSync(outPath, buf);

const mb = (n) => (n / 1024 / 1024).toFixed(2);
console.log(`Wrote ${outPath}`);
console.log(`  variant       : ${ntOnly ? 'New Testament only' : 'Full Bible (66 books)'}`);
console.log(`  total size    : ${mb(totalSize)} MB  (${totalSize.toLocaleString()} bytes)`);
console.log(`  books         : ${bookEntries.length}`);
console.log(`  chapters      : ${chapterEntries.length.toLocaleString()}`);
console.log(`  verses        : ${verseEntries.length.toLocaleString()}`);
console.log(`  text blob     : ${mb(textCursor)} MB`);
console.log(`  index overhead: ${mb(textBlobOffset)} MB  (${textBlobOffset.toLocaleString()} bytes)`);
console.log();
console.log('Next: flash ereader/firmware/data/nasb.bin to LittleFS:');
console.log('  Arduino IDE 2.x → open ereader/firmware/ereader.ino → Tools → Upload Little FS Data');
console.log('  (install the "arduino-littlefs-upload" plugin first if needed)');
