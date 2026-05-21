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

### Demo SVG IDs

- `#demoSvg` — outer SVG (clicking it also fires once)
- `#servoArm` — swing arm group; `.swing` class rotates +15° around `transform-origin: 250px 120px`
- `#btnCircle` — target button visual; `.pressed` class shrinks + inset shadow
- `#gpioLed` — round indicator dot, retained ID for JS compatibility but styled via `.servo-led` class; `.on` glows green
- `#gpioState` — text "REST · 0°" / "PRESS · 35°"
- `#gpioFill` — angle bar fill
- `#pulseBar` — SVG rect; width animated 0→180 px over 300 ms (matches firmware `PRESS_HOLD_MS`)
- `#pulseLabel` — "idle" / "SERVO PRESS · 300 ms"
- `#rippleHost` — SVG `<g>` parent for ripple circles on button
- `#triggerBtn` — primary button (icon + "Trigger click" + "simulates finger.write(35)")
- `#triggerDouble` — secondary button (icon + "Double click" + "two presses, 150 ms apart")

> Element IDs `#gpioLed`, `#gpioState`, `#gpioFill` were kept verbatim from the old relay-era markup to minimize JS churn — they're now bound to servo state in JS (renamed to `servoLed`, `servoState`, `angleFill` locally). The CSS class moved from `.gpio-led` to `.servo-led`.

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

- `pushOnce()` resolves at 530 ms (300 ms PRESS hold + 200 ms settle + 30 ms swing-in tail) — the 150 ms inter-press gap in `fireClicks(2)` thus produces ~1.2 s total cycle for "double", matching the firmware's actual press-train timing.
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

## `assets/` — **removed 2026-05-06**

The folder previously held `esp32-c3.jpeg`, `relay.png`, and `solenoid.jpeg`. All three were deleted when the hardware section migrated to fully hand-drawn SVG. Don't reintroduce — the page intentionally avoids binary asset dependencies so the whole build reference is one HTML file.

To change a component's appearance, edit the inline SVG directly:
- **ESP32-C3 group** in `index.html` hardware section: `<g transform="translate(140 80)">` — PCB body, USB-C protrusion, ESP32-C3 chip, crystal, BOOT/RST buttons, status LED, PCB antenna meander, and 16 pin pads (top + bottom edges, 5V/GND/IO3 highlighted in their wire colors, **IO4 highlighted cyan for the button signal**).
- **MG90S group** in same section: `<g transform="translate(620 360)">` — mounting flanges with screw holes, body rectangle with `url(#servoBody)` gradient, MG90S label panel, output shaft with splined center + horn, 3-wire pigtail emerging from the top edge.
- **Tactile pushbutton group** in same section: `<g transform="translate(170 320)">` — metal retainer frame, black plastic body, inner ring + cap, two leads (left = GND, right = IO4). Labels show "to GND" / "to IO4". Two wires route from ESP32 bottom-edge pads (GND at 199,263 → left lead at 158,336; IO4 at 269,263 → right lead at 242,336).
- **Demo MG90S** in the demo section is a smaller illustrated body using the same `url(#demoServoBody)` gradient with a `.servo-arm.swing` class for animated rotation.

## `firmware/autoclicker.ino` — canonical Arduino sketch

Header comment documents all four trigger paths (Firebase / local web UI / SoftAP / physical button on GPIO4), the 5-wire harness, power notes, and the `ESP32Servo` library requirement.

Key globals (pins / timing):
- `SERVO_PIN = 3` — GPIO3, servo signal (orange/yellow)
- `LED_PIN   = 8` — onboard blue LED (active LOW)
- `BTN_PIN   = 4` — GPIO4, tactile pushbutton (other lead → GND); `INPUT_PULLUP`
- `BTN_DEBOUNCE_MS = 30` — bounce-settle window for `readButton()`
- Servo timing: `STOP_US` (1500 µs neutral), `PUSH_US`/`RETURN_US`, `PUSH_MS`/`RETURN_MS`, `CLICK_HOLD_MS` (150 ms for momentary click)

State machine: `doPress()` / `doRelease()` / `doToggle()` / `doClick()`. All four trigger paths eventually call one of these. `publishState()` PUTs the latched state to `/autoclicker/state` so any phone/dashboard mirrors the truth in real time.

Loop body (in order, per iteration):
1. `server.handleClient()` — service local web UI + SoftAP requests
2. `readButton()` — debounced GPIO4 read; HIGH→LOW edge → `doToggle()`
3. `wifiMulti.run()` background retry (only when in SoftAP fallback)
4. Firebase SSE stream — process incoming events on `/autoclicker/command`, reconnect with backoff on drops (`STREAM_RECONNECT_MS = 1500`)

**Tuning knobs** (re-upload to change): `STOP_US`, `PUSH_US`, `RETURN_US`, `PUSH_MS`, `RETURN_MS`, `CLICK_HOLD_MS`, `BTN_DEBOUNCE_MS`. Everything else is wiring/protocol and shouldn't need touching.
