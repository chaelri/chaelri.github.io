# ereader/ — Summary

**Last updated:** 2026-06-03
**Status:** 🟢 Active (build reference + firmware shipped 2026-06-03)

Pocket-sized Bible reader running entirely on-device — no WiFi, no cloud. ESP32-S3 SuperMini drives a 0.91" SSD1306 OLED over I²C. One tactile button on GPIO 4 covers the whole UI via tap / double-tap / hold gestures. NASB 2020 text is pre-packed into a single binary blob (`nasb.bin`) and flashed to LittleFS.

Sister project to `autoclicker/`, `aircon/`, and `pocket-remote/` — same single-page build-reference shape, same hand-drawn SVG aesthetic.

## File structure

```
ereader/
├── index.html                    (~1,000 lines — single-page build reference; sections: overview, hardware, wiring, demo, code, checklist)
└── firmware/
    ├── ereader.ino               (~430 lines — canonical Arduino sketch; U8g2 + LittleFS + Preferences)
    └── data/
        └── nasb.bin              (binary blob produced by tools/pack-nasb.mjs — Arduino's LittleFS plugin expects data/ next to the .ino)

tools/
└── pack-nasb.mjs            (Node script: devo/nasb2020.json → ereader/data/nasb.bin)
```

## Tech

- **Front-end:** Plain HTML + Tailwind v4 (browser CDN, no build), Inter + Crimson Pro + JetBrains Mono + Material Symbols Outlined. Palette: amber + rose (ink-on-paper / reading-lamp feel — deliberately distinct from autoclicker's indigo and aircon's cyan).
- **Firmware:** Arduino + ESP32 core ≥ 3.0. Libraries: `U8g2` (oliver kraus), `LittleFS`, `Preferences`. No WiFi, no Firebase, no IR — strictly offline.
- **Data packer:** Node ≥ 18 (uses `node:fs`, `node:path` ESM imports).

## Deploy

GitHub Pages at `/ereader/` (auto-publishes on push to `main`). The page is purely documentation — there's no live remote. The "Demo" section is a state-machine animation (SVG + JS), not a real device call.

## Sections in `index.html`

| ID | Heading | What it shows |
|---|---|---|
| `overview`  | "How a page turns" | 4-node SVG flow: Button → ESP32-S3 → LittleFS → OLED, plus tap / double-tap / hold callouts |
| `hardware`  | "Top-down view" | Hand-drawn SVG of ESP32-S3 SuperMini (purple PCB, 11-pin edges, antenna meander), 0.91" OLED module with "GEN 1:1" rendered on the glass, and a 6×6 tactile button. All 5 wires routed with pulse rings on used pads. |
| `wiring`    | "All six connections" | Data-driven table (`wires[]`): 3V3 (red), GND (black), SDA·IO8 (blue), SCK·IO9 (yellow), BTN·IO4 (cyan), BTN GND (black), plus USB-C. |
| `demo`      | "State machine preview" | Live in-browser sim — scaled 128×32 OLED frame that walks BOOK → CHAPTER → READING in response to keyboard or click gestures. Animation only; nothing leaves the page. |
| `code`      | "Firmware sketch" | Sketch skeleton (full source lives in `firmware/ereader.ino`). |
| `checklist` | "Build steps" | Parts / Firmware / Wiring / Test, localStorage-backed progress bar. |

## Conventions / quirks

- **`nasb.bin` is gitignored unrecommended** — currently checked in for convenience (~1 MB for the NT build). If switching to the full Bible (~4 MB), consider `.gitignore`-ing it and regenerating per-machine.
- **NT only by default** — `node tools/pack-nasb.mjs --nt` produces 0.98 MB, which fits comfortably on a 4 MB ESP32-S3 alongside the app. Drop `--nt` for the full Bible (4.18 MB) — that needs an 8 MB board.
- **Smart-quote stripping is part of the pack step.** `tools/pack-nasb.mjs` normalizes curly quotes, em/en dashes, ellipses, NBSP, and pilcrows to ASCII so the firmware can use U8g2's smaller `_tr` (reduced) fonts and treat byte position = column position.
- **Pin choices** (`SDA = GPIO 8`, `SCL = GPIO 9`, `BTN = GPIO 4`) are the ESP32-S3 defaults but freely overrideable in the sketch header. The wiring SVG places `3V3` + `IO4` on the top edge of the ESP32 illustration and `IO 8 / IO 9` on the bottom edge purely for clean routing — actual silkscreen positions vary by clone.
- **OLED pad order** in the drawing is `GND · VCC · SCK · SDA` (most common). A minority of 0.91" modules swap GND/VCC — always verify silkscreen before powering up.
- **Section IDs `overview/hardware/wiring/demo/code/checklist` are load-bearing** for `syncNav()` scroll-spy.
- **No emojis in firmware comments or page copy** — Charlie's repo-wide convention.

## Binary format (`nasb.bin` · NSB1 v1)

```
HEADER (32 B):
  [0..3]    magic "NSB1"
  [4..5]    book_count (uint16 LE)
  [6..7]    flags (uint16 LE; bit 0 = NT_ONLY)
  [8..11]   total_chapters (uint32 LE)
  [12..15]  total_verses (uint32 LE)
  [16..19]  book_table_offset (uint32 LE)
  [20..23]  chapter_table_offset (uint32 LE)
  [24..27]  verse_table_offset (uint32 LE)
  [28..31]  text_blob_offset (uint32 LE)

BOOK TABLE  (book_count × 32 B):
  [0..15]   name (UTF-8, null-padded, max 15 chars)
  [16..17]  chapter_count (uint16 LE)
  [20..23]  first_chapter_idx (uint32 LE)

CHAPTER TABLE  (total_chapters × 12 B):
  [0..3]    verse_count (uint32 LE)
  [4..7]    first_verse_idx (uint32 LE)

VERSE TABLE  (total_verses × 8 B):
  [0..3]    text_offset (uint32 LE, into text blob)
  [4..7]    text_length (uint32 LE)

TEXT BLOB:
  Raw concatenated ASCII verse text, no separators.
```

The firmware reads the header once, caches the book table in RAM (~1 KB for NT), and seeks into the chapter / verse / text regions on demand. No chapter is decompressed because nothing is compressed in v1.

## State machine (firmware)

```
                      tap → next book
                      dbl → prev book
                      hold → enter CHAPTER (chapter=0)
                    ┌─────────────────────────────────┐
       BOOK SELECT ─┤                                 │
                    └─────────────────────────────────┘
                      tap → next chapter
                      dbl → prev chapter
                      hold → enter READING (page=0, buildChapter)
                    ┌─────────────────────────────────┐
    CHAPTER SELECT ─┤                                 │
                    └─────────────────────────────────┘
                      tap → next page (auto-advance chapter at end)
                      dbl → prev page (wraps into prev chapter)
                      hold → back to CHAPTER SELECT
                    ┌─────────────────────────────────┐
       READING     ─┤                                 │
                    └─────────────────────────────────┘
```

`mode + book + chapter + page` saved to NVS (`Preferences` namespace "ereader") after every gesture, so power-cycling resumes exactly where you left off.

## Display layout (reading mode · "Option B" hybrid)

- **Header row** (top 8 px, inverted): `GEN 1  p3/12` — 3-letter book code + chapter + page-of-total.
- **Body** (bottom 24 px, 3 rows × 25 cols): word-wrapped verse text using `u8g2_font_5x7_tf`. Pre-computed page-break offsets in `pageStarts[MAX_PAGES]` (96-entry static array; longest NT chapter < ~20 pages).
- **Verse markers** are inline: `1 In the beginning… 2 And the earth was…` — single space before the number, single space after.

Navigation modes (BOOK / CHAPTER SELECT) use big chunky fonts (`u8g2_font_logisoso16_tr`, falling back to `helvB12` / `helvR10` / `6x10` if the name is too wide for 128 px).

## Wires (`wires[]` array)

| # | From | To | Color |
|---|---|---|---|
| 1 | ESP32-S3 · 3V3   | OLED · VCC      | red |
| 2 | ESP32-S3 · GND   | OLED · GND      | black |
| 3 | ESP32-S3 · GPIO 8 | OLED · SDA      | blue |
| 4 | ESP32-S3 · GPIO 9 | OLED · SCK/SCL  | yellow |
| 5 | ESP32-S3 · GPIO 4 | Tactile button · lead 1 | cyan |
| 6 | ESP32-S3 · GND   | Tactile button · lead 2 | black |

Plus USB-C for power.

## Related projects

- **`devo/`** — origin of `nasb2020.json`. Charlie's PWA reads the same file; the e-reader is a hardware companion.
- **`autoclicker/`** + **`aircon/`** + **`pocket-remote/`** — sibling DIY-hardware single-page references. Shared aesthetic, different palettes (indigo/purple, sky/cyan, amber/emerald, and now amber/rose for ereader).
- **`tools/pack-nasb.mjs`** — currently lives at the repo root under `tools/`. If a second binary-pack utility ever appears, it can stay in the same folder.

## What's NOT shipped yet (v1 scope)

- **Full Bible mode** — only NT for now (constrained by 4 MB flash). Compression (zlib per chapter) is the obvious next step if Charlie wants the full Bible on a 4 MB board.
- **PSALM book code edge case** — header shows the first 3 letters (`PSA`), which is fine for everything in NT. If OT is added, double-check books like `1 KINGS` → `1 K`.
- **Verse-by-verse seek** — current reading mode only navigates by page (within a chapter). Adding a "jump to verse" gesture is a future enhancement.
- **Backlight / sleep mode** — OLED stays on indefinitely as long as USB-C is plugged in. Battery operation + sleep is a v2 concern.
