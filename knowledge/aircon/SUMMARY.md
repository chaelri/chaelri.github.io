# aircon/ — Summary

**Last updated:** 2026-05-08
**Status:** 🟢 Active (initial build, sister project to autoclicker; hardware on order)

DIY WiFi aircon controller + live phone remote. Single-page site documents how to build a 2-part IR transmitter (ESP32-C3 + 940 nm IR LED) that **becomes** Charlie's TCL aircon's remote — pulses the same TCL112AC IR codes the original remote does, replacing it entirely. Phone web remote writes desired state ({power, mode, temp, fan}) to Firebase RTDB; ESP32 polls, encodes via the IRremoteESP8266 library's `IRTcl112Ac` class, and fires the IR LED.

## File structure

```
aircon/
├── index.html               (~1,000 lines — full build reference; sections: overview, hardware, wiring, demo, code, checklist)
├── firmware/
│   └── aircon.ino           (~330 lines — canonical Arduino sketch; WiFiMulti + SoftAP fallback + built-in /set web UI + Firebase polling + IRsend / IRTcl112Ac)
└── phone/index.html         (~250 lines — live remote; Firebase v10 SDK, anon auth, writes full state JSON to RTDB)
```

Like autoclicker, every visual on the page is hand-drawn SVG (top-down ESP32-C3 + 5 mm IR LED in the hardware section, illustrated 100 Ω resistor body drawn between them, IR pulse-wave animation in the demo). No image files needed.

## Tech

- **Front-end:** Plain HTML + Tailwind v4 (browser CDN, no build), Inter + JetBrains Mono + Material Symbols Outlined.
- **State / data:** Firebase Realtime Database (`test-database-55379`, asia-southeast1) — paths `/aircon/command` (phone writes desired state) and `/aircon/state` (ESP32 mirrors authoritative state).
- **Auth:** Firebase anonymous sign-in.
- **Firmware:** Canonical source at `firmware/aircon.ino`. Uses **`IRremoteESP8266`** library (David Conran et al — install via Arduino Library Manager; runs on ESP32-C3 despite the name). The `IRTcl112Ac` class handles the full TCL split-AC state (power/mode/temp/fan/swing/turbo/eco). Polls RTDB at 1 Hz; on receiving a JSON state object, parses fields, applies state via the library, calls `ac.send()` which generates the 38 kHz / 112-bit blink pattern and pulses GPIO3 → 100 Ω → IR LED. Also writes back to `/aircon/state` so the phone (and any subscriber) sees authoritative state.
- **Hardware:** ESP32-C3 SuperMini + single 5 mm 940 nm IR LED (TSAL6200 or generic). 100 Ω resistor in series for current limiting. **No transistor** — at 38 kHz / ~33 % duty cycle the average current sits within the GPIO's 40 mA per-pin budget. Range ~2-3 m line-of-sight; fine for a wall-mount within a couple meters of the aircon.

## Deploy

GitHub Pages at `/aircon/` (auto-publishes on push to `main`). Phone remote is at `/aircon/phone/`.

## Sections in `index.html`

| ID | Heading | What it shows |
|---|---|---|
| `overview` | "How a command travels" | 5-node SVG flow diagram: Phone → Firebase → ESP32-C3 → IR LED → TCL Aircon |
| `hardware` | "Top-down view" + connection map | ESP32-C3 SuperMini drawn top-down (USB-C, ESP32 chip, antenna, 16 pins with GND/IO3 highlighted); 5 mm IR LED drawn as a translucent dome with two unequal-length leads (long = anode +, short = cathode −); 100 Ω resistor body (brown-black-brown-gold bands) drawn in series on the signal wire. Abstract pin-to-pin schematic below. |
| `wiring` | "All three connections" | Data-driven table (`wires[]` array) — 2 jumpers (signal-via-100Ω + GND) + 1 USB-C |
| `demo` | "IR pulse animation" | SVG-only simulation — ESP32 chip + 100 Ω resistor + IR LED on the left, TCL aircon unit on the right with LCD display + IR receiver eye. Tapping `Power on` / `Temp +1` flashes the LED, spawns 4 staggered IR ripples toward the aircon, wakes the LCD (showing the new temp). **No Firebase calls.** |
| `code` | "Firmware & remote" | Live iframe of `phone/index.html` framed as a phone, plus collapsible `<details>` with abridged Arduino sketch + phone HTML + Firebase config |
| `checklist` | "Build steps" | Data-driven checklist (`steps[]` array) grouped by Parts / Firmware / Wiring / Test / Mount with progress bar |

## Conventions / quirks

- **Demo is fake-only.** `Power on` / `Temp +1` simulate the IR transmission in SVG (LED glow + ripple waves + LCD wake) — they don't write to Firebase. Only `phone/index.html` writes for real.
- **Color palette is sky/cyan/teal** (rather than autoclicker's indigo/purple/pink) so the two sister projects are immediately visually distinct.
- **Power:** ESP32 + IR LED both run off the same USB-C wall charger. Always-on draw is ~70 mA at 5 V (~0.35 W) — basically free to leave plugged in 24/7.
- **No transistor.** GPIO3 drives the IR LED directly through the 100 Ω current-limit resistor. Peak instantaneous current is around 30 mA at 38 kHz; well within the GPIO budget for short pulses. Tradeoff: range tops out at ~2-3 m line-of-sight. Works fine when the device is wall-mounted near the aircon. If you ever need cross-room range, add an NPN transistor (2N2222) and bump LED current to ~100 mA.
- **No TSOP4838 receiver in the BOM.** TCL112AC protocol is pre-supported in the library — no learning step needed for Charlie's TAC-09CSA/KEI. Only buy a TSOP4838 if targeting an unsupported TCL model.
- **Pin labels in SVGs are colored** to match the wires: cyan = signal, slate = GND.
- **No secrets:** Firebase web API key is a public client config. Don't try to hide it — that's not how Firebase web auth works.
- **Mobile nav** (`#navOpen` / `#navMobile`) duplicates the desktop links and auto-closes on link click.
- **Active nav state** is computed in `syncNav()` from `window.scrollY` against section `offsetTop` — section IDs `overview/hardware/wiring/demo/code/checklist` are load-bearing.
- **`navigator.vibrate`** is used in the phone remote for tactile feedback on every tap (15 ms for power, 8 ms for incremental controls).

## Why this shape

- **Why IR not Bluetooth/WiFi-on-the-aircon:** TCL TAC-09CSA has no smart-home connectivity at all — only IR. We have to speak the language the aircon was built to listen to.
- **Why TCL112AC class instead of raw IR capture:** the library already encodes the protocol correctly. Manual capture (with TSOP4838 + IRrecvDumpV3) is a fallback for unsupported models, but adds a one-time receiver to the BOM. For Charlie's specific aircon, that's wasted parts.
- **Why send full state every press:** that's literally how TCL aircon remotes work — every button press transmits the entire current state (mode + temp + fan + swing + flags), not "increment temp by 1." We mirror that.
- **Why two RTDB paths instead of one:** `/aircon/command` is transient (phone writes, ESP32 reads, ESP32 clears). `/aircon/state` is authoritative — ESP32 writes after every send so any subscriber (phone, future dashboards) sees the truth in real time, regardless of which platform triggered the change. Same two-path pattern as autoclicker (after the 2026-05-07 state-sync refactor).

## Related projects

- **`../autoclicker/`** — direct sister. Same skeleton, same Firebase project, mirrored UI patterns. Use it as the canonical reference for code conventions in this family.
- Shares Firebase project `test-database-55379` with autoclicker, echoes, weddingbar, etc. RTDB paths are namespaced — aircon uses `/aircon/*`.
- Canonical firmware lives in repo at `aircon/firmware/aircon.ino`. The Code section in `index.html` shows an abridged mirror (omits the inline web UI HTML literal and helper functions for brevity).
