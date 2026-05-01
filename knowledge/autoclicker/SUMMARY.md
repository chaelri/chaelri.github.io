# autoclicker/ — Summary

**Last updated:** 2026-05-02
**Status:** 🟢 Active (hardware on the way, page polished, phone remote live)

DIY WiFi auto-clicker build reference + live phone remote. Single-page site documents how to build a 4-part SwitchBot (ESP32-C3 + IRF520 MOSFET + 5V solenoid + USB-C) that physically presses buttons on command via Firebase RTDB.

## File structure

```
autoclicker/
├── index.html         (~1,347 lines — full build reference; sections: overview, hardware, wiring, demo, code, checklist)
├── phone/index.html   (~166 lines — live remote button; Firebase v10 SDK, anon auth, writes "click" to RTDB)
└── assets/
    ├── esp32-c3.jpeg
    ├── mosfet.jpeg
    └── solenoid.jpeg
```

## Tech

- **Front-end:** Plain HTML + Tailwind v4 (browser CDN, no build), Inter + JetBrains Mono + Material Symbols Outlined.
- **State / data:** Firebase Realtime Database (`test-database-55379`, asia-southeast1) at path `/autoclicker/command`.
- **Auth:** Firebase anonymous sign-in.
- **Firmware (out of repo):** Arduino sketch on ESP32-C3 SuperMini polls RTDB at 1 Hz, drives GPIO3 HIGH for 200 ms, clears the command. Source is shown verbatim in the Code section (`<pre id="codeArduino">`) for copy-paste into Arduino IDE.

## Deploy

GitHub Pages at `/autoclicker/` (auto-publishes on push to `main`). Phone remote is at `/autoclicker/phone/`.

## Sections in `index.html`

| ID | Heading | What it shows |
|---|---|---|
| `overview` | "How a click travels" | 5-node SVG flow diagram: Phone → Firebase → ESP32 → MOSFET → Solenoid |
| `hardware` | "Top-down view" + connection map | Photo collage of parts with overlaid wire paths + abstract pin-to-pin schematic |
| `wiring` | "All six connections" | Data-driven table (`wires[]` array) of every jumper/screw/USB connection |
| `demo` | "Click animation" | SVG-only simulation — Trigger click / Double click buttons animate plunger + GPIO pulse + counter (no Firebase) |
| `code` | "Firmware & remote" | Live iframe of `phone/index.html` framed as a phone, plus collapsible `<details>` with Arduino sketch + phone HTML + Firebase config |
| `checklist` | "Build steps" | Data-driven checklist (`steps[]` array) grouped by Parts / Firmware / Wiring / Test / Mount with progress bar |

## Conventions / quirks

- **Demo is fake-only.** `Trigger click` and `Double click` simulate the GPIO pulse in SVG — they don't write to Firebase. Only `phone/index.html` writes for real.
- **`Double click` button styled like Trigger click** (icon + label + subtitle) so it's visually clear it's a single-tap action that fires two pulses 150 ms apart.
- **Pin labels in SVGs are colored** to match the wires: green = GPIO3/SIG, red = 5V/VCC, dark = GND.
- **No secrets:** Firebase web API key is a public client config. Don't try to hide it — that's not how Firebase web auth works.
- **Mobile nav** (`#navOpen` / `#navMobile`) duplicates the desktop links and auto-closes on link click.
- **Active nav state** is computed in `syncNav()` from `window.scrollY` against section `offsetTop` — section IDs `overview/hardware/wiring/demo/code/checklist` are load-bearing.

## Related projects

- Shares Firebase project `test-database-55379` with other repo apps (echoes, etc.). RTDB paths are namespaced — autoclicker uses `/autoclicker/command`.
- Out-of-repo: Arduino firmware for the ESP32-C3. The canonical version is duplicated in `index.html` Code section.
