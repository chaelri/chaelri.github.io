# collaterals/ — Project Context for Claude

Auto-loaded by Claude Code in every session opened inside `collaterals/`. Pulls
in the deep knowledge MDs so future sessions don't have to re-investigate.

## Knowledge

@../knowledge/collaterals/SUMMARY.md

## Scope-specific reminders

- **Pure SVG rendering** — don't introduce html2canvas, html-to-image, or canvas-text. The whole templating pipeline depends on SVG strings → blob via `shared/export.js`. Mixing rasterizers would defeat the print-quality goal.
- **Drive uploads go through gemini-proxy** with `app: "collaterals"`. The proxy must be redeployed after adding entries to its `DRIVE_FOLDERS` map. Don't sneak Drive logic into the browser.
- **Per-template state lives in localStorage under `collaterals:v1`**. Touching the shape (renaming keys, restructuring `data.<id>`) breaks restored state. If a breaking change is needed, write a one-shot migration in `shared/state.js`.
- **Font availability matters for export** — the rasterizer reads SVG `<text>` glyphs from whichever fonts Chrome has loaded. `shared/export.js` injects a Google Fonts `@import` into the cloned SVG so Playfair/Dancing Script/Great Vibes always resolve. Don't strip that injection.
- **Couple names + date** come from `shared/design.js` (`COUPLE`). Change them once there if anything in the wedding details shifts — all templates pick up the default.
