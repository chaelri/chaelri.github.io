# devo/ — Bible Devotional PWA

This file auto-loads when Claude opens any session inside or below `chaelri.github.io/devo/`. It pulls the deep knowledge MDs so Claude can answer architecture/pattern questions without re-investigating.

## Knowledge

@../knowledge/devo/SUMMARY.md

@../knowledge/devo/ARCHITECTURE.md

@../knowledge/devo/KEY_FILES.md

@../knowledge/devo/PATTERNS.md

@../knowledge/devo/TTS.md

@../knowledge/devo/AI_FEATURES.md

@../knowledge/devo/COMMON_TASKS.md

@../knowledge/devo/DECISIONS.md

## Quick reminders

- **`script.js` was split (2026-04-27):** Code now lives in 11 ordered chunks under `devo/js/` (`01-core.js` … `11-boot.js`). They load as classic `<script>` tags via `firebase-sync.js` (`async=false`) and share one script-global scope, so cross-file globals work unchanged. See `KEY_FILES.md` for the line-range → file map. **Knowledge MD line numbers reference the pre-split monolithic file** — translate via the map.
- **`11-boot.js` runs the kickoff** (`fetchBibleData`, `loadBooks`, `showDashboard`, `updateControlStates`, recent-passage restore, `_onAppLoad` trigger). Never put synchronous cross-file calls in earlier chunks — hoisting only works within a chunk, not across them.
- **TTS is Google Cloud** (`en-US-Journey-D`), NOT Kokoro. Older memory may be stale.
- **Firebase sync gates on `userName === "charlie"`** — only Charlie's data mirrors to RTDB.
- **Bible JSON files are large** (~10 MB total): `nasb2020.json`, `easy2024.json`. Lazy-loaded.
- **No build step:** Vanilla JS, edit and reload.
- **Verse rendering:** `#output > .verse > .verse-header > .verse-content` with `.verse-num`.
- **AI payload contract:** `window.__aiPayload = { book, chapter, isSingle?, versesText }` set before AI calls.
- **PostToolUse hook is active** — edits here will be flagged in `.claude/knowledge-stale.md` if they touch files referenced in any knowledge MD.
