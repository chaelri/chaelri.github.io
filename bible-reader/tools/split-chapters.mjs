// Splits each book .txt file into per-chapter files.
// Output: bible-reader/sd-card/Bible/ch/<Book>/<N>.txt
// Each per-chapter file contains just the verse text — no headers.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIBLE = path.join(__dirname, "..", "sd-card", "Bible");
const OUT = path.join(BIBLE, "ch");

fs.mkdirSync(OUT, { recursive: true });

const files = fs.readdirSync(BIBLE).filter((f) => f.endsWith(".txt") && f !== "INDEX.txt");

let totalChapters = 0;
for (const file of files) {
  const book = file.replace(/\.txt$/, "");
  const text = fs.readFileSync(path.join(BIBLE, file), "utf-8");
  const lines = text.split(/\r?\n/);

  const bookDir = path.join(OUT, book);
  fs.mkdirSync(bookDir, { recursive: true });

  let curCh = null;
  let curBuf = [];
  const flush = () => {
    if (curCh != null) {
      fs.writeFileSync(path.join(bookDir, `${curCh}.txt`), curBuf.join("\n"));
      totalChapters++;
    }
  };

  for (const line of lines) {
    const m = line.match(/^=== CHAPTER (\d+) ===\s*$/);
    if (m) {
      flush();
      curCh = parseInt(m[1], 10);
      curBuf = [];
    } else if (line.startsWith("=== ")) {
      // skip BOOK header
    } else if (curCh != null) {
      curBuf.push(line);
    }
  }
  flush();
  console.log(`${book}: ${fs.readdirSync(bookDir).length} chapters`);
}

console.log(`\nTotal: ${totalChapters} per-chapter files written to ${OUT}`);
