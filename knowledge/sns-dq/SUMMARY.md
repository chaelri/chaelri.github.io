# sns-dq — Quick Reference

**Purpose:** Paste 1–3 SNS discussion questions → AI adds bold/italic emphasis (no rewording) → renders onto the SNS DQ template (1920×1080) → copy / download / upload to Drive.

**Deploy:** GitHub Pages at `/sns-dq/`. Browser-only client, no build step.

## File map

```
sns-dq/
├── index.html            shell — Tailwind v4 (browser build) + Material Symbols
├── app.js                everything: parser, Gemini, canvas render, persistence,
│                         button feedback, Drive POST, share-target, zoom
├── style.css             @font-face for Open Sauce Sans + button/dialog styles
├── manifest.json         PWA: install + share_target (text intake)
├── README.md             setup notes + Drive OAuth one-shot script reference
└── assets/
    ├── template.png            1920×1080 pre-stamped template (header + logo)
    ├── favicon.svg
    ├── icon-{180,192,512}.png  PWA icons
    └── fonts/
        ├── OpenSauceSans-Regular.ttf       (400) — body text
        ├── OpenSauceSans-SemiBold.ttf      (600) — DOM-only, not used on canvas
        ├── OpenSauceSans-Bold.ttf          (700) — bold emphasis
        ├── OpenSauceSans-BoldItalic.ttf    (700 italic) — italic emphasis
        ├── OpenSauceSans-ExtraBold.ttf     (800) — DOM-only
        └── OpenSauceSans-ExtraBoldItalic.ttf (800 italic) — DOM-only
```

## Key constants (`app.js`)

| Constant | Value | Purpose |
|---|---|---|
| `GEMINI_PROXY` | `https://gemini-proxy-668755364170.asia-southeast1.run.app` | shared with devo, etc. |
| `DRIVE_UPLOAD_URL` | `${GEMINI_PROXY}/upload-drive` | server-side Drive endpoint, no browser OAuth |
| `LAYOUT.contentX/Y/W/H` | `168 / 280 / 1532 / 660` | text rect — measured against the pre-stamped header |
| `LAYOUT.fontSizeMin/Max` | `36 / 104` | auto-fit range; 104 lets short inputs scale up like the SNS reference |
| `LAYOUT.itemGap` | `28` | px between numbered items |
| `STORAGE.input` / `STORAGE.formatted` | `snsdq_input` / `snsdq_last_formatted` | localStorage keys |

## Render contract (Gemini → canvas)

AI returns `{questions:[{runs:[{t, s}]}]}` where `s ∈ {"normal", "bold", "italic"}`.
On canvas:
- `normal` → Regular (400)
- `bold` → Bold (700)
- `italic` → Bold Italic (700 italic)

Per-question safety: `reconcileWithInput()` requires the concatenation of a question's `t`s to equal the source verbatim (whitespace-normalized). Mismatch → that question falls back to a single literal `normal` run, so the AI can never silently change Charlie's wording.

## Entry points / flows

- **Generate / Reformat** → `splitQuestions(text)` → `formatWithGemini(arr)` → `reconcileWithInput` → `renderToCanvas` → `persistFormatted`.
- **Copy / Download** → `canvasToBlob` → clipboard or `<a download>`.
- **Drive** → `canvasToBlob` → base64 → `POST /upload-drive` (proxy auths as Charlie via OAuth refresh token, uploads to hardcoded folder, returns share link). See `gemini-proxy/index.js` for the server side.
- **Share-target** → `consumeShareTargetParams()` reads `?text=&title=&url=` on load (only set when the OS opens the installed PWA from a share sheet) and prefills the textarea.
- **Tap canvas** → `<dialog id="zoom-modal">` lightbox at up to 96 vw / 96 vh.

## External dependencies (CDN, no build)

- Tailwind v4 browser build (`@tailwindcss/browser@4`)
- Material Symbols Outlined webfont
- No Firebase, no service worker, no third-party JS otherwise.

## Hub root entry

Listed under Active Projects in `index.html` (root) with the `forum` icon.
Card description: *Discussion Questions generator*.
