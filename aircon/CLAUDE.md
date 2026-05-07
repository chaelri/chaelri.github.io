# aircon/ — Project Context for Claude

Build-reference site for Charlie's DIY WiFi aircon controller (ESP32-C3 + 940 nm IR LED). Single-page documentation site that documents hardware, wiring, firmware, and serves the live phone remote that tells the bot to fire IR commands at the aircon.

## Quick map

```
aircon/
├── index.html          ← single-page build reference (hero, overview, hardware, wiring, demo, code, checklist)
├── firmware/
│   └── aircon.ino      ← canonical Arduino sketch (in-repo) — uses IRremoteESP8266 / IRTcl112Ac
└── phone/index.html    ← live remote — taps write {power, mode, temp, fan} state to Firebase RTDB; ESP32 polls and fires IR
```

**Hardware visuals are 100% hand-drawn SVG** — no `<image>` tags, no asset files. ESP32-C3 and IR LED are illustrated top-down inside `index.html`'s hardware section, with a 100 Ω resistor body drawn between them in series. To change the look, edit the SVG directly; there's nothing to upload.

## Sister project

This is the **second device** in the same Firebase-controlled family as `autoclicker/`. Both share the same shape: ESP32-C3 + minimal hardware + Firebase RTDB poll + phone web remote. The autoclicker physically presses a button via a servo arm; the aircon transmits the same IR codes the original remote does, replacing it entirely. Code structure, color/glow conventions, and section layout mirror autoclicker by design — pattern-match against `../autoclicker/` when in doubt.

## Auto-loaded knowledge

- @../knowledge/aircon/SUMMARY.md
- @../knowledge/aircon/ARCHITECTURE.md
- @../knowledge/aircon/KEY_FILES.md

## What to know before editing

- **No build step.** Tailwind v4 is loaded via `@tailwindcss/browser@4` CDN script; everything is plain HTML/CSS/JS.
- **Firebase project is `test-database-55379`** (asia-southeast1). RTDB paths `/aircon/command` (phone → ESP32) and `/aircon/state` (ESP32 → subscribers) are the only contracts. Same project as autoclicker, weddingbar, echoes, etc.
- **Phone remote is the live remote.** Edits to `phone/index.html` ship to GitHub Pages immediately; the ESP32 will obey real taps. Don't put debug spam there.
- **Demo section is animation-only** — `triggerPower`/`triggerTempUp` simulate the IR pulse + waves in SVG; they do NOT touch Firebase. Only `phone/index.html` writes for real.
- **Hardcoded API key in `phone/index.html` is intentional** — same client config as other repo apps using the shared `test-database-55379` Firebase project. Don't "secure" it; it's a Firebase web API key, not a secret.
- **Section IDs drive the sticky nav** (`overview`, `hardware`, `wiring`, `demo`, `code`, `checklist`). Renaming any breaks scroll-active state in `syncNav()`.
- **Wires/checklist are data-driven.** The wiring table renders from the `wires[]` array (~line 770) and the checklist from `steps[]` (~line 800) — edit those arrays, not the rendered DOM.
- **Code blocks are syntax-highlighted client-side** by the `highlight()` function. Source for firmware/phone HTML is entity-encoded inside `<pre class="code">` elements; the highlighter replaces placeholder tokens to avoid the "class=class=" double-replacement bug.
- **Color palette is sky/cyan/teal** (vs autoclicker's indigo/purple/pink) to keep the two projects visually distinct.
- **TCL aircon model is `TAC-09CSA/KEI`** — supported via `IRTcl112Ac` (TCL112AC protocol). If targeting a different TCL model, check if it's listed in IRremoteESP8266; some older models use `TCL96Ac` instead.
