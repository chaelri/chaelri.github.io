# SNS DQ — Discussion Questions Generator

Paste a discussion question, AI formats it (bold + italic emphasis only — never
rewords), render onto the SNS template, then copy / download / upload to Drive.

## Setup

The app is fully static — open `index.html` and it runs. The two external
integrations are:

1. **Gemini (formatting)** — uses the existing `gemini-proxy` Cloud Run service.
   No setup needed; the URL is hardcoded in `app.js`.

2. **Google Drive upload** — handled server-side by `gemini-proxy`. The proxy
   has a `POST /upload-drive` endpoint that authenticates as **you**
   (charliecayno@gmail.com) via a stored OAuth refresh token, then uploads to
   a hardcoded folder. Files are owned by your account, count against your
   personal Drive quota, and the browser never does OAuth.

   One-time setup:
   ```bash
   bash gemini-proxy/setup-drive-oauth.sh
   ```
   That opens a browser, asks you to sign in and click Allow once, extracts
   the refresh token from gcloud's ADC file, and pushes it to Cloud Run as
   env vars (`DRIVE_OAUTH_CLIENT_ID`, `DRIVE_OAUTH_CLIENT_SECRET`,
   `DRIVE_OAUTH_REFRESH_TOKEN`). After that, the **Drive** button in the app
   just works — no popups, ever.

   Why this and not a service account: service accounts have no storage quota
   in consumer (`@gmail.com`) Drives, so SA uploads fail with HTTP 403
   regardless of folder sharing. They only work in Workspace Shared Drives.

   Files are named per the convention **`DQ SNS <Full Month> <Day>.png`** —
   e.g. `DQ SNS April 27.png` — and uploaded with link-sharing on (anyone with
   the link can view) into:
   <https://drive.google.com/drive/folders/1O34ndqW8eTvcZvtfHKl-cqcbsCzTfWBo>.

## Files

- `index.html` — shell (Tailwind v4 browser build + Material Symbols Outlined)
- `app.js` — fonts, Gemini call, canvas render, copy/download, GIS + Drive upload
- `style.css` — `@font-face` (Open Sauce Sans) + button/dialog styles
- `manifest.json` — PWA install metadata (no service worker; nothing is cached)
- `assets/template.png` — 1920×1080 SNS DQ background
- `assets/fonts/` — Open Sauce Sans (Regular/Bold/BoldItalic/ExtraBold/ExtraBoldItalic)
- `assets/icon-{180,192,512}.png` + `assets/favicon.svg`

## How it renders

The template already has `Discussion Questions:` and the SNS logo baked in.
The renderer only draws the numbered items underneath, in white Open Sauce Sans
with three weight tiers:

- `normal` — Regular (400) — body / connecting words
- `bold`   — Bold (700) — noun phrases that anchor the question
- `italic` — Bold Italic (700 italic) — the central verb / adjective

Layout area: `x = 168..1700, y = 280..1020` — measured against the template's
pre-stamped header (which sits at x≈168..1099, y≈156..234). The "1." aligns
with the "D" of "Discussion Questions:". Auto-fits font size between 36–64 px.
Per-line greedy wrap with a hanging indent that aligns wrapped lines with the
start of the question text (after `1. `).

## Input parsing

Before the AI call, `splitQuestions()` strips header lines like
`Discussion Questions:` / `Questions:` / `Reflection:` and parses both numbered
(`1.`, `Q1:`, `(1)`) and unnumbered questions, joining wrapped lines into a
single question. Cleaned questions go to Gemini as a JSON array — so the AI
can't include a header or miscount.

## Reformat

If the AI's emphasis choice misses, hit **Reformat** — same input runs through
Gemini again at temperature 0.6 so you get a different take.

## Safety net: wording is preserved

After Gemini returns, `reconcileWithInput()` concatenates the runs of each
question and compares against the cleaned input (whitespace-normalized). If
they don't match, that question falls back to a single literal `normal` run —
so the AI can never silently change Charlie's wording, only its emphasis.
