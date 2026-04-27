# sns-dq — Project Context for Claude

Auto-loaded by Claude Code in every session opened inside `sns-dq/`. Pulls in
the deep knowledge MDs so future sessions don't have to re-investigate.

## Knowledge

@../knowledge/sns-dq/SUMMARY.md

@../knowledge/sns-dq/DECISIONS.md

## Scope-specific reminders

- **Drive uploads run through `gemini-proxy/upload-drive`** — modifying that endpoint is a redeploy (`gcloud run deploy gemini-proxy --source ../gemini-proxy ...`). Don't add Drive logic to the browser; the OAuth refresh token lives on Cloud Run as env vars.
- **Don't bump font weights without checking the rendered preview** — three-tier 400/700/700-italic was settled after several iterations; small changes look surprisingly different on the dark texture.
- **Layout numbers are pinned to measured pixels** — if `assets/template.png` ever changes, re-measure the pre-stamped header bounds (PIL one-liner in DECISIONS.md) and update `LAYOUT.contentX/Y/W/H`.
- **No service worker.** If a future change needs offline mode, design it deliberately — don't sneak `sw.js` back in.
