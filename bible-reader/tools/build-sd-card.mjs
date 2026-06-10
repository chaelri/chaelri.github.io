#!/usr/bin/env node
// build-sd-card.mjs — regenerate bible-reader/sd-card/Bible/ from devo/nasb2020.json
//
// One Genesis.txt-style file per book, all 66, plus an INDEX.txt that the
// firmware reads at boot to build its book table. Run from repo root or this
// script's directory — both work.
//
// Usage:  node tools/build-sd-card.mjs
//
// Output layout (drag-copy the whole Bible/ folder onto the SD card root):
//   sd-card/Bible/INDEX.txt          — one row per book: "NN KEY chapters DisplayName"
//   sd-card/Bible/<DisplayName>.txt  — chapters delimited by "=== CHAPTER N ==="

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = resolve(__dirname, "..", "..");
const JSON_PATH  = join(REPO_ROOT, "devo", "nasb2020.json");
const OUT_DIR    = resolve(__dirname, "..", "sd-card", "Bible");

// JSON book keys (UPPER) → display names (Title Case, matches common print Bibles)
const DISPLAY = {
  "GENESIS": "Genesis", "EXODUS": "Exodus", "LEVITICUS": "Leviticus",
  "NUMBERS": "Numbers", "DEUTERONOMY": "Deuteronomy", "JOSHUA": "Joshua",
  "JUDGES": "Judges", "RUTH": "Ruth", "1 SAMUEL": "1Samuel", "2 SAMUEL": "2Samuel",
  "1 KINGS": "1Kings", "2 KINGS": "2Kings", "1 CHRONICLES": "1Chronicles",
  "2 CHRONICLES": "2Chronicles", "EZRA": "Ezra", "NEHEMIAH": "Nehemiah",
  "ESTHER": "Esther", "JOB": "Job", "PSALMS": "Psalms", "PROVERBS": "Proverbs",
  "ECCLESIASTES": "Ecclesiastes", "SONG OF SOLOMON": "SongOfSolomon",
  "ISAIAH": "Isaiah", "JEREMIAH": "Jeremiah", "LAMENTATIONS": "Lamentations",
  "EZEKIEL": "Ezekiel", "DANIEL": "Daniel", "HOSEA": "Hosea", "JOEL": "Joel",
  "AMOS": "Amos", "OBADIAH": "Obadiah", "JONAH": "Jonah", "MICAH": "Micah",
  "NAHUM": "Nahum", "HABAKKUK": "Habakkuk", "ZEPHANIAH": "Zephaniah",
  "HAGGAI": "Haggai", "ZECHARIAH": "Zechariah", "MALACHI": "Malachi",
  "MATTHEW": "Matthew", "MARK": "Mark", "LUKE": "Luke", "JOHN": "John",
  "ACTS": "Acts", "ROMANS": "Romans", "1 CORINTHIANS": "1Corinthians",
  "2 CORINTHIANS": "2Corinthians", "GALATIANS": "Galatians", "EPHESIANS": "Ephesians",
  "PHILIPPIANS": "Philippians", "COLOSSIANS": "Colossians",
  "1 THESSALONIANS": "1Thessalonians", "2 THESSALONIANS": "2Thessalonians",
  "1 TIMOTHY": "1Timothy", "2 TIMOTHY": "2Timothy", "TITUS": "Titus",
  "PHILEMON": "Philemon", "HEBREWS": "Hebrews", "JAMES": "James",
  "1 PETER": "1Peter", "2 PETER": "2Peter", "1 JOHN": "1John", "2 JOHN": "2John",
  "3 JOHN": "3John", "JUDE": "Jude", "REVELATION": "Revelation",
};

// Pretty header (8.3-friendly short name, longer display, etc.) — only display
// matters for our firmware; filename is just the Display value.

function flattenWhitespace(s) {
  // NASB JSON contains curly quotes + non-breaking spaces. Keep curly quotes
  // (e-ink renders them in the FreeSerif font) but collapse stray runs of WS.
  return s.replace(/\s+/g, " ").trim();
}

function main() {
  if (!existsSync(JSON_PATH)) {
    console.error(`✗ Source JSON not found at ${JSON_PATH}`);
    process.exit(1);
  }
  console.log(`→ Reading ${JSON_PATH}`);
  const raw = readFileSync(JSON_PATH, "utf8");
  const bible = JSON.parse(raw);
  const keys = Object.keys(bible);
  console.log(`  parsed ${keys.length} books`);

  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const indexRows = [];
  let totalBytes = 0;

  keys.forEach((bookKey, i) => {
    const displayName = DISPLAY[bookKey];
    if (!displayName) {
      console.warn(`  ⚠ no display mapping for "${bookKey}" — skipping`);
      return;
    }
    const chapters = bible[bookKey];
    const chapterNums = Object.keys(chapters).map(Number).sort((a, b) => a - b);
    const lines = [];
    lines.push(`=== BOOK ${displayName} ===`);
    for (const ch of chapterNums) {
      lines.push(`=== CHAPTER ${ch} ===`);
      const verses = chapters[ch];
      const verseNums = Object.keys(verses).map(Number).sort((a, b) => a - b);
      for (const v of verseNums) {
        lines.push(`${v} ${flattenWhitespace(verses[v])}`);
      }
    }
    const body = lines.join("\n") + "\n";
    const filePath = join(OUT_DIR, `${displayName}.txt`);
    writeFileSync(filePath, body, "utf8");
    totalBytes += Buffer.byteLength(body, "utf8");

    // pad book number to 2 digits — easier for firmware to parse uniformly
    const nn = String(i + 1).padStart(2, "0");
    indexRows.push(`${nn} ${displayName} ${chapterNums.length} ${bookKey}`);
  });

  // INDEX.txt format: "NN DisplayName chapterCount FULL KEY"
  // Firmware reads this once at boot to build its 66-book lookup table.
  const indexBody = indexRows.join("\n") + "\n";
  writeFileSync(join(OUT_DIR, "INDEX.txt"), indexBody, "utf8");

  console.log(`✓ Wrote ${indexRows.length} book files + INDEX.txt to ${OUT_DIR}`);
  console.log(`  total: ${(totalBytes / 1024 / 1024).toFixed(2)} MB plaintext`);
  console.log(`  drag the Bible/ folder onto the SD card root when it arrives`);
}

main();
