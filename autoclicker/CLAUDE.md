# autoclicker/ — Project Context for Claude

Build-reference site for Charlie's DIY WiFi auto-clicker (ESP32-C3 + IRF520 + 5V solenoid). Documents hardware, wiring, firmware, and serves the live phone remote that tells the bot to fire.

## Quick map

```
autoclicker/
├── index.html          ← single-page build reference (hero, overview, hardware, wiring, demo, code, checklist)
├── phone/index.html    ← live remote — taps write "click" to Firebase RTDB; ESP32 polls and fires solenoid
└── assets/             ← top-down photos of esp32-c3, mosfet, solenoid (used in Hardware section)
```

## Auto-loaded knowledge

- @../knowledge/autoclicker/SUMMARY.md
- @../knowledge/autoclicker/ARCHITECTURE.md
- @../knowledge/autoclicker/KEY_FILES.md

## What to know before editing

- **No build step.** Tailwind v4 is loaded via `@tailwindcss/browser@4` CDN script; everything is plain HTML/CSS/JS.
- **Firebase project is `test-database-55379`** (asia-southeast1). RTDB path `/autoclicker/command` is the only contract between phone and ESP32. The ESP32 firmware lives outside this repo (Arduino sketch shown in Code section as a reference).
- **Phone remote is the live remote.** Edits to `phone/index.html` ship to GitHub Pages immediately; the ESP32 will obey real taps. Don't put debug spam there.
- **Demo section is animation-only** — `triggerBtn`/`triggerDouble` simulate a GPIO pulse in SVG; they do NOT touch Firebase. Only `phone/index.html` writes to the DB.
- **Hardcoded API key in `phone/index.html` is intentional** — same client config as other repo apps using the shared `test-database-55379` Firebase project. Don't "secure" it; it's a Firebase web API key, not a secret.
- **Section IDs drive the sticky nav** (`overview`, `hardware`, `wiring`, `demo`, `code`, `checklist`). Renaming any breaks scroll-active state in `syncNav()`.
- **Wires/checklist are data-driven.** The wiring table renders from the `wires[]` array (~line 1075) and the checklist from `steps[]` (~line 1112) — edit those arrays, not the rendered DOM.
- **Code blocks are syntax-highlighted client-side** by the `highlight()` function (~line 1299). Source for firmware/phone HTML is entity-encoded inside `<pre class="code">` elements; the highlighter replaces placeholder tokens to avoid the "class=class=" double-replacement bug.
