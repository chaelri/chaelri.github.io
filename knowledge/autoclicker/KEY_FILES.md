# autoclicker/ — Key Files

## `index.html` — single-page build reference (~1,347 lines)

Self-contained — no external JS bundle. Tailwind v4 via CDN.

### Section map (line ranges approximate)

| Lines | Section | Notes |
|---|---|---|
| 1–155 | `<head>` + inline `<style>` | All custom CSS lives here: card surfaces, glow utilities, plunger transitions, GPIO LED states, code block tokens, checklist tick animation |
| 159–191 | NAV | Sticky desktop nav + collapsible mobile nav. Section IDs are load-bearing |
| 193–224 | HERO | Stat cards (4 parts / 6 connections / 200 ms pulse / 1 s poll) |
| 226–344 | OVERVIEW | 5-node SVG flow diagram (Phone → Firebase → ESP32 → MOSFET → Solenoid) + per-step explainer cards |
| 345–626 | HARDWARE | Photo collage with overlaid wire paths + abstract pin-to-pin schematic; legend dots tie wire colors to functions |
| 628–672 | WIRING | Data-driven table — rendered from `wires[]` array (line ~1075) by JS at the bottom |
| 674–790 | DEMO | "Click animation" — SVG of solenoid + plunger + button-target; controls panel right side. **Animation only — no Firebase calls.** |
| 792–1038 | CODE | Live iframe preview of `phone/index.html` (framed as iPhone) + 3 collapsible `<details>`: Arduino firmware, phone HTML, Firebase config |
| 1040–1060 | CHECKLIST | Data-driven from `steps[]` (~line 1112); progress bar updates on click toggle |
| 1062–1067 | FOOTER | Minimal credits |
| 1070+ | `<script>` | All client logic — see below |

### Demo SVG IDs (line ~700–745)

- `#demoSvg` — outer SVG (clicking it also fires once)
- `#plunger` — solenoid plunger; `.push` class translates +28px
- `#btnCircle` — target button visual; `.pressed` class shrinks + inset shadow
- `#gpioLed` — round indicator dot; `.on` glows green
- `#gpioState` — text "LOW · 0V" / "HIGH · 3.3V"
- `#gpioFill` — gradient bar
- `#pulseBar` — SVG rect; width animated 0→180 px over 200 ms via rAF
- `#pulseLabel` — "idle" / "GPIO3 HIGH · 200 ms"
- `#rippleHost` — SVG `<g>` parent for ripple circles
- `#triggerBtn` — primary button (icon + "Trigger click" + subtitle)
- `#triggerDouble` — secondary button, same shape (icon + "Double click" + "two pulses, 150 ms apart")

### Bottom `<script>` (line ~1070–1345)

| Lines | Block | Purpose |
|---|---|---|
| ~1075 | `wires[]` const | Source of truth for the wiring table |
| 1085–1107 | `tbody.innerHTML = wires.map(...)` | Render wiring rows |
| ~1112 | `steps[]` const | Source of truth for the checklist |
| 1132–1167 | Checklist render + click-toggle + `updateProgress()` | Group by section, progress bar % |
| 1169–1266 | Click animation demo | `setGpio()`, `pushOnce()` (returns Promise resolved at 230 ms), `fireClicks(n, label)` (busy-locks both buttons during run); listeners on `triggerBtn`, `demoSvg`, `triggerDouble` |
| 1271–1288 | Mobile nav toggle + scroll-spy `syncNav()` | Active link state |
| 1295–1341 | `escapeHtml()`, `highlight(src, lang)`, applier | Placeholder-tokenized syntax highlighter — handles cpp + js |

### Quirks worth flagging

- `pushOnce()` resolves at 230 ms (200 ms HIGH + 30 ms tail) — the 150 ms inter-press gap in `fireClicks(2)` thus produces a total 610 ms cycle for "double".
- Highlighter uses `\u0001<i>\u0001` placeholders specifically to avoid the bug where re-running a regex against already-emitted `<span class="…">` would produce `class=class=…` artifacts.
- `clearCommand()` in the firmware uses `PUT "\"\""` (the JSON value `""`) — sending `null` instead would delete the field, which is fine but breaks the "command exists, currently empty" mental model.

## `phone/index.html` — live remote (~166 lines)

| Lines | Block | Notes |
|---|---|---|
| 1–52 | `<head>` + style | Tailwind v4 CDN, button transition + ripple keyframes, ambient pulse glow |
| 54–104 | `<body>` | Header (online/offline dot bound to `.info/connected`), big circular CLICK button, status footer |
| 111–164 | `<script type="module">` | Firebase v10 SDK init, anonymous sign-in, click handler that writes `"click"` to `/autoclicker/command` |

Status state machine: `idle` (slate dot) → `send` (amber, "sending click…") → `ok` (emerald, "sent — ESP32 will fire within ~1 s") | `err` (rose).

This file is **the live remote** — every change here ships to `/autoclicker/phone/` immediately and a tap will fire Charlie's real servo if it's powered.

> **Subtitle copy is stale:** still says "1000 ms press". Functionally fine — the live remote only writes `"click"` to RTDB; the firmware decides press timing (`PRESS_HOLD_MS = 300`). Update the copy when convenient.

## `assets/`

| File | Used in |
|---|---|
| `esp32-c3.jpeg` | Hardware section photo collage (~89 KB) |
| `mosfet.jpeg` | **Legacy** — still referenced by hardware SVG, will be removed when the section is redrawn for servo (~67 KB) |
| `solenoid.jpeg` | **Legacy** — same (~35 KB) |

Photos are positioned over a `.grid-bg` SVG; wire-overlay paths are hand-drawn to land on each photo's actual pin pads. When redrawing the hardware section for the MG90S servo build, swap in a servo photo, retune the wire `<path>` coordinates around lines 393–408, and rewrite the pin-dot label coordinates around lines 411–457. The data-driven `wires[]` array (now 4 entries) is the source of truth for the connection list.

## `firmware/autoclicker.ino` — canonical Arduino sketch (~330 lines)

| Lines | Block | Purpose |
|---|---|---|
| 1–48 | Header comment | Trigger paths, wiring diagram, power notes, library requirement (`ESP32Servo` by Kevin Harrington) |
| 50–55 | `#include`s | WiFi, WiFiMulti, HTTPClient, WebServer, ESP32Servo |
| 60–76 | Globals | WiFi, SoftAP creds, DB URL, pins, angles, timings |
| 78–84 | Servo + WebServer + state | `Servo finger;` + `WebServer server(80);` + `inSoftAP` flag |
| 88–277 | `INDEX_HTML[]` PROGMEM | Full inline web UI — dark-slate body, amber CLICK button with halo + pulse-ring, JetBrains-Mono status pill, `fetch('/click')` |
| 279–289 | `void click(int times)` | Press loop — sweep to PRESS_ANGLE, hold, return to REST_ANGLE, optional 150 ms inter-press gap |
| 291–297 | `void clearCommand()` | PUT `""` to RTDB after firing |
| 299–300 | `handleRoot` / `handleClick` | Web server handlers |
| 302–322 | `startSoftAP` / `tryStation` | WiFi state machine — try station mode for 15 s, fall back to SoftAP on timeout |
| 324–347 | `void setup()` | Servo attach, WiFi join attempt, SoftAP fallback, web server routes |
| 349–378 | `void loop()` | `server.handleClient()` + 1 Hz Firebase poll (station mode only) |

**Tuning knobs** (re-upload to change): `REST_ANGLE`, `PRESS_ANGLE`, `PRESS_HOLD_MS`. Everything else is wiring/protocol and shouldn't need touching.
