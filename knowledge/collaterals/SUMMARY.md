# collaterals/ — Quick Reference

**Purpose:** Studio for designing print-ready wedding collaterals for Charlie & Karla, July 2, 2026. Seven SVG-rendered templates, each with editable fields, live preview, PNG export, and Drive upload to a shared folder ready for the printer.

**Deploy:** GitHub Pages at `/collaterals/`. Browser-only client, no build step.

**Drive folder:** `1IJWFdaSe8xSuqK-FJEJjMzhyqnOBQNhW` — "Wedding Collaterals — Charlie & Karla (July 2, 2026)" under charliecayno@gmail.com.

## File map

```
collaterals/
├── index.html                  dashboard — 7 cards + progress bar
├── app.js                      dashboard logic (renders cards from state.js)
├── style.css                   shared styles (cream-on-sage palette)
├── shared/
│   ├── design.js               PALETTE, FONTS, COUPLE, FLORAL SVG helpers
│   ├── state.js                localStorage state (status + per-template data)
│   ├── editor.js               shared bindStatusSelect/showToast helpers
│   ├── export.js               svgToPngBlob, downloadPng, blobToBase64
│   ├── drive.js                uploadPngBlob (calls gemini-proxy w/ app="collaterals")
│   ├── qrcode.js               ESM wrapper around qrcode.min.js
│   └── qrcode.min.js           vendored qrcode-generator@1.4.4 (~20 KB)
└── templates/
    ├── name-cards/             3.5"×2" place cards, batch input, A4/Letter sheet
    ├── menu/                   5"×7" menu card, 3 courses, wildflower side
    ├── table-numbers/          triangle prism, 3 faces, QR for photo upload
    ├── money-envelopes/        flat envelope with cut/fold/glue marks
    ├── mirror-chart/           24"×60" arched mirror seating chart (vinyl-cut)
    ├── monogram/               C&K monogram still PNG, 4 styles, multi-color
    └── invitation/             5"×7" portrait invitation card
```

## Architecture

- **Pure SVG rendering.** Each template builds an SVG string from `state`, then renders as `innerHTML` for preview and serializes for PNG export. No canvas-text rendering, no html2canvas — keeps fonts and shapes crisp.
- **State:** localStorage under key `collaterals:v1`. Shape: `{ status: { id: pending|in_progress|ready|printed }, data: { id: { …fields } } }`. See `shared/state.js`.
- **Export pipeline:** `svgToPngBlob(svgEl, { scale })` — clones the SVG, injects Google Fonts `@import` so the rasterizer sees Playfair/Dancing Script/Great Vibes, serializes to a data URL, draws into a canvas at the requested scale, returns a PNG blob.
- **Drive upload:** every template ends in `uploadPngBlob(blob, filename)` → POSTs base64 to `gemini-proxy/upload-drive` with `app: "collaterals"`. Server looks up the folder ID in its safelist (`DRIVE_FOLDERS` map) and writes there.
- **Status workflow:** each editor has a status select (pending/in_progress/ready/printed); changes persist immediately and the dashboard progress bar recomputes on `visibilitychange` when you return to it.

## Shared design tokens (`shared/design.js`)

| Token | Use |
|---|---|
| `COUPLE.first / .second / .monogram / .dateLong / …` | Pre-filled defaults for every template |
| `PALETTE.paper / .ink / .inkSoft / .sage / .sageDeep / .blush / .amber / .lilac / .poppy / .leaf / .border` | Wedding palette — matches `weddingtest/` |
| `FONTS.serif / .script / .sans` | Playfair Display / Dancing Script / Inter; templates often layer Great Vibes for headline cursive |
| `FLORAL.bouquetBL() / .sprigCorner() / .stemDelicate()` | Inline SVG `<g>` strings for floral accents |

## Proxy contract (`gemini-proxy/index.js`)

The `/upload-drive` endpoint now takes an optional `app` field. Allowed values are keys in `DRIVE_FOLDERS = { sns_dq: "…", collaterals: "…" }`. Backwards-compatible — omitting `app` still routes to the SNS DQ folder.

**Filename regex updated** to allow `.pdf` as well as `.png` (`SAFE_FILENAME_RE`), in case a future template wants PDF.

**Redeploy required** after editing the safelist: `gcloud run deploy gemini-proxy --source ../gemini-proxy --region asia-southeast1 …`.

## Drive-helper (`gemini-proxy/drive-helper.mjs`)

Added a `mkdir <name> [parentId]` command for creating folders. Used once to provision the collaterals folder; safe to use again for ad-hoc folders.

## Why SVG and not html2canvas

SVG renders fonts vectorially, avoiding the resolution loss of rasterizing HTML/CSS at print scale. Export scale of 3-5× the SVG viewBox dimensions gives sharp output at 300 DPI on the sizes Charlie's printer will use. The cost: every template has to be built as a string, with manual line-wrapping (`wrapTspans`).

## Known limitations / future ideas

- **No Firebase sync yet.** Status & data are local-only. Easy to add a Firebase RTDB layer over `state.js` if Karla needs to see progress.
- **Money envelope geometry** is a flat layout with cut/fold marks — not a 3D-aware envelope template. Good enough for hand-folding; could be replaced with a precise dieline if a vendor needs one.
- **PDF export** isn't wired up yet; the filename regex allows it server-side, but no template generates PDF blobs. Most printers accept PNG fine.
- **QR codes** currently use a vendored `qrcode-generator@1.4.4` (~20 KB). Stable, MIT, no runtime CDN dependency.
