# autoclicker/ — Summary

**Last updated:** 2026-05-06
**Status:** 🟢 Active (build migrated from relay+solenoid to MG90S servo on 2026-05-06; firmware, data-driven sections, and all SVG visuals updated)

DIY WiFi auto-clicker build reference + live phone remote. Single-page site documents how to build a 3-part SwitchBot (ESP32-C3 + MG90S micro-servo + USB-C powerbank) that physically presses buttons on command via Firebase RTDB. Earlier versions used a 5V relay + 5V solenoid; that path was abandoned because cheap 5V solenoids don't generate enough force to register a press.

## File structure

```
autoclicker/
├── index.html               (~1,330 lines — full build reference; sections: overview, hardware, wiring, demo, code, checklist)
├── firmware/
│   └── autoclicker.ino      (~330 lines — canonical Arduino sketch; WiFiMulti + SoftAP fallback + built-in /click web UI + Firebase polling + ESP32Servo)
└── phone/index.html         (~166 lines — live remote button; Firebase v10 SDK, anon auth, writes "click" to RTDB)
```

The `assets/` folder was removed 2026-05-06 — every visual on the page is now hand-drawn SVG (top-down ESP32-C3 + MG90S in the hardware section, illustrated MG90S in the demo section). No image files are needed.

## Tech

- **Front-end:** Plain HTML + Tailwind v4 (browser CDN, no build), Inter + JetBrains Mono + Material Symbols Outlined.
- **State / data:** Firebase Realtime Database (`test-database-55379`, asia-southeast1) at path `/autoclicker/command`.
- **Auth:** Firebase anonymous sign-in.
- **Firmware:** Canonical source at `firmware/autoclicker.ino`. Uses `ESP32Servo` library (Kevin Harrington — install via Arduino Library Manager; AVR `Servo.h` does not run on ESP32-C3). Mirror copy is shown verbatim in the Code section (`<pre id="codeArduino">`) for reference. Polls RTDB at 1 Hz; on `click`, sweeps GPIO3 from `REST_ANGLE` (0°) to `PRESS_ANGLE` (35°), holds 300 ms, returns to rest.

## Deploy

GitHub Pages at `/autoclicker/` (auto-publishes on push to `main`). Phone remote is at `/autoclicker/phone/`.

## Sections in `index.html`

| ID | Heading | What it shows |
|---|---|---|
| `overview` | "How a click travels" | 4-node SVG flow diagram: Phone → Firebase → ESP32 → MG90S Servo (PWM 50 Hz) |
| `hardware` | "Top-down view" + connection map | Both components drawn top-down as inline SVG (no images). ESP32-C3 with USB-C protrusion, ESP32 chip, antenna meander, and 16 pin pads (5V/GND/IO3 highlighted on the bottom edge); MG90S with mounting flanges, output shaft + horn, top label, and 3-wire pigtail. Wires drop from ESP32 bottom-edge pins down to the servo's pigtail. Abstract pin-to-pin schematic below shows the same connections in box form. |
| `wiring` | "All four connections" | Data-driven table (`wires[]` array) — 3 jumpers (signal/5V/GND) + 1 USB-C |
| `demo` | "Click animation" | SVG-only simulation — illustrated MG90S body on the left with a swing arm rotating around its horn; arm sweeps 0° → 15° (visual stand-in for 35°) onto the target button. Powered by `.servo-arm.swing` CSS rotation. **No Firebase calls.** |
| `code` | "Firmware & remote" | Live iframe of `phone/index.html` framed as a phone, plus collapsible `<details>` with Arduino sketch + phone HTML + Firebase config |
| `checklist` | "Build steps" | Data-driven checklist (`steps[]` array) grouped by Parts / Firmware / Wiring / Test / Mount with progress bar |

## Conventions / quirks

- **Demo is fake-only.** `Trigger click` and `Double click` simulate the GPIO pulse in SVG — they don't write to Firebase. Only `phone/index.html` writes for real.
- **Servo tuning knobs** live in `firmware/autoclicker.ino`: `REST_ANGLE` (default 0°), `PRESS_ANGLE` (default 35°), `PRESS_HOLD_MS` (default 300). Re-upload to change.
- **Power:** servo's red wire ties into the ESP32's 5V pin — single USB-C powerbank powers both. MG90S draws ~250–400 mA moving, well under powerbank budget. Small `PRESS_ANGLE` and short `PRESS_HOLD_MS` keep stall current brief if the arm is blocked.
- **Pin labels in SVGs are colored** to match the wires: green/orange = signal, red = 5V, dark = GND.
- **No secrets:** Firebase web API key is a public client config. Don't try to hide it — that's not how Firebase web auth works.
- **Mobile nav** (`#navOpen` / `#navMobile`) duplicates the desktop links and auto-closes on link click.
- **Active nav state** is computed in `syncNav()` from `window.scrollY` against section `offsetTop` — section IDs `overview/hardware/wiring/demo/code/checklist` are load-bearing.

## Why we ditched the relay+solenoid

- 5V "mini push solenoids" off AliExpress are functionally weak — most need 12V to generate enough plunger force; at 5V they twitch but don't reliably press a button.
- Adding a relay or MOSFET introduced a load-side circuit (flyback diode, COM/NO contacts, bridge wires) — 6+ connections total, multiple failure points.
- Servo solution: 3 wires, single 5V rail, no inductive load, software-tunable press depth/duration. MG90S has metal gears so it survives stalls if PRESS_ANGLE is set too aggressively.

## Related projects

- Shares Firebase project `test-database-55379` with other repo apps (echoes, etc.). RTDB paths are namespaced — autoclicker uses `/autoclicker/command`.
- Canonical firmware lives in repo at `autoclicker/firmware/autoclicker.ino`. The Code section in `index.html` shows a slimmed mirror (omits the inline web UI HTML literal for brevity).
