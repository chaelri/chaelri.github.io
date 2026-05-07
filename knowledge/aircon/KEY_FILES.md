# aircon/ — Key Files

## `index.html` — single-page build reference (~1,000 lines)

Self-contained — no external JS bundle. Tailwind v4 via CDN.

### Section map (line ranges approximate)

| Lines | Section | Notes |
|---|---|---|
| 1–125 | `<head>` + inline `<style>` | All custom CSS lives here: card surfaces, glow utilities, IR LED firing pulse keyframe, IR ripple wave keyframe, code block tokens, checklist tick animation, aircon LCD wake animation |
| 130–162 | NAV | Sticky desktop nav + collapsible mobile nav. Section IDs are load-bearing |
| 164–195 | HERO | Stat cards (2 parts / 2 wires / 38 kHz / 1 s poll) |
| 197–290 | OVERVIEW | 5-node SVG flow diagram (Phone → Firebase → ESP32 → IR LED → TCL Aircon) + per-step explainer cards |
| 292–470 | HARDWARE | Top-down ESP32-C3 + IR LED illustration with a 100 Ω resistor body drawn in series on the cyan signal wire; abstract pin-to-pin schematic block below; legend dots tying colors to functions |
| 472–520 | WIRING | Data-driven table — rendered from `wires[]` array (line ~770) by JS at the bottom |
| 522–620 | DEMO | "IR pulse animation" — SVG of ESP32 + 100 Ω resistor + IR LED + TCL aircon unit with LCD + IR receiver eye; controls panel right side. **Animation only — no Firebase calls.** |
| 622–760 | CODE | Live iframe preview of `phone/index.html` (framed as iPhone) + 3 collapsible `<details>`: Arduino firmware (abridged), phone HTML (abridged), Firebase config |
| 762–786 | CHECKLIST | Data-driven from `steps[]` (~line 800); progress bar updates on click toggle |
| 788–795 | FOOTER | Minimal credits with link back to autoclicker |
| 770+ | `<script>` | All client logic — see below |

### Demo SVG IDs

- `#demoSvg` — outer SVG
- `#demoLed` — IR LED group
- `#demoLedGlow` — radial halo behind the LED dome; opacity flips 0→1 during firing, has `.firing` class for the rapid 38 kHz pulsing animation
- `#waveHost` — SVG `<g>` parent for IR ripple circles spawned in `spawnIRWave()`
- `#airconUnit` — TCL aircon body group (LCD + vents + IR receiver eye + mode dot)
- `#lcdTemp` — text element on the aircon's LCD, animated with the `.lcd-wake` class
- `#modeDot` — small status dot on the aircon, slate when off, cyan when on
- `#pulseBar` — SVG rect; width animated 0→180 px over 700 ms (visually stretched from real ~150 ms IR frame)
- `#pulseLabel` — "idle" / "POWER ON · 150 ms" / "TEMP +1 · 25°C" etc.
- `#triggerPower` — primary button (icon + "Power on/off" + sub-label)
- `#triggerTempUp` — secondary button (icon + "Temp +1")
- `#ledIndicator` / `#ledFill` / `#acState` / `#sendCount` / `#lastCmd` — status panel readouts

### Bottom `<script>` (line ~770–end)

| Lines | Block | Purpose |
|---|---|---|
| ~770 | `wires[]` const | Source of truth for the wiring table |
| 780–800 | `tbody.innerHTML = wires.map(...)` | Render wiring rows |
| ~800 | `steps[]` const | Source of truth for the checklist (Parts / Firmware / Wiring / Test / Mount) |
| ~820–860 | Checklist render + click-toggle + `updateProgress()` | Group by section, progress bar % |
| ~870–960 | IR pulse animation demo | `setLed()`, `spawnIRWave(delay)`, `animateBurst(label)`, `updateAirconLcd()`, `fireIR(label)` (busy-locks both buttons during run); listeners on `triggerPower`, `triggerTempUp` |
| ~970–985 | Mobile nav toggle + scroll-spy `syncNav()` | Active link state |
| ~990–end | `escapeHtml()`, `highlight(src, lang)`, applier | Placeholder-tokenized syntax highlighter — handles cpp + js |

### Quirks worth flagging

- **`fireIR()` busy-locks both buttons** for the full ~700 ms animation length — prevents overlapping ripple sets in the demo. Real firmware doesn't busy-lock since `ac.send()` is synchronous and only ~150 ms.
- **`spawnIRWave()` is called 4 times** at 0/150/300/450 ms offsets to simulate a frame-worth of IR pulses propagating outward; each ripple lives ~900 ms.
- **The LCD wake animation** (`.lcd-wake` class on `#lcdTemp`) only fires on `updateAirconLcd()` AFTER the IR animation completes, simulating the aircon receiving and obeying the command.
- **Highlighter uses `\u0001<i>\u0001` placeholders** specifically to avoid the bug where re-running a regex against already-emitted `<span class="…">` would produce `class=class=…` artifacts.
- **`triggerTempUp` blocks if `acPower` is false** — shows "aircon is off — tap power first" in the pulse label for 1.5 s, then resets. Mirrors the real-world behavior where temp commands without power are still encoded but don't visibly do anything on the aircon.

## `phone/index.html` — live remote (~250 lines)

| Lines | Block | Notes |
|---|---|---|
| 1–80 | `<head>` + style | Tailwind v4 CDN, power-button transitions, ambient glow keyframe, ripple keyframe, sending-pulse keyframe, mode/fan chip styles |
| 82–155 | `<body>` | Header (online/offline dot), big tabular temp display + ± stepper buttons, big POWER button with halo + ripple host, mode chips row, fan chips row, status footer with timestamp |
| 160–245 | `<script type="module">` | Firebase v10 SDK init, anonymous sign-in, live state subscription via `onValue()`, click handlers for power/temp±/mode/fan that mutate local `s`, render, then write the FULL state to `/aircon/command` |

Status state machine: `idle` (slate dot) → `send` (amber, "sending IR…") → `ok` (emerald, "on · cool · 24°C · fan auto") | `err` (rose).

This file is **the live remote** — every change here ships to `/aircon/phone/` immediately and a tap will fire Charlie's real IR LED if the ESP32 is powered.

### Key patterns

- **Local state object `s`** — single source of truth for the UI between writes. Mutated optimistically on every tap, then `render()` reflects it, then `sendCmd()` writes the full state to RTDB.
- **`onValue` subscription** to `/aircon/state` corrects local state if it drifts (e.g., another device changed the aircon, or the optimistic write failed silently).
- **Full state on every press** — even single-field changes like temp ±1 transmit the whole state object. This matches how TCL aircons actually work and how the firmware expects to receive it.
- **Vibration haptics:** 15 ms on power button, 8 ms on incremental controls (matches the autoclicker remote's tactile language).

## `firmware/aircon.ino` — canonical Arduino sketch (~330 lines)

| Lines | Block | Purpose |
|---|---|---|
| 1–60 | Header comment | Trigger paths, JSON command schema, wiring diagram, library requirement (`IRremoteESP8266`) |
| 62–69 | `#include`s | WiFi, WiFiMulti, HTTPClient, WebServer, IRremoteESP8266, IRsend, ir_Tcl |
| 75–85 | Globals | WiFi, SoftAP creds, DB URLs, pins, poll interval |
| 88–96 | `IRTcl112Ac ac(IR_LED_PIN);` + `AcState` struct | The library instance bound to GPIO3, plus the authoritative state we transmit |
| 102–135 | String ↔ TCL constant helpers | `modeFromString` / `modeToString` / `fanFromString` / `fanToString` — bidirectional conversions for the JSON layer |
| 137–157 | `sendIR()` + `stateJson()` + `publishState()` | Encode state into the library, transmit, mirror to Firebase |
| 160–195 | Naive JSON extractors + `applyCommand()` | `extractStr` / `extractInt` / `extractBool` — keyword search inside the body string. No ArduinoJson dep. `applyCommand` reads each field, mutates `state`, calls `sendIR()` + `publishState()` |
| 198–290 | `INDEX_HTML[] PROGMEM` | Full inline web UI — sky-cyan body with big temp display, power button, mode/fan chip rows; `fetch('/set')` posts the local state |
| 293–305 | `handleRoot` / `handleState` / `handleSet` | Web server route handlers |
| 307–320 | `clearCommand` / `startSoftAP` / `tryStation` | Utility — clear `/aircon/command`, WiFi state machine |
| 322–345 | `void setup()` | `ac.begin()`, WiFi join attempt, SoftAP fallback, web server routes, initial `publishState()` |
| 347–376 | `void loop()` | `server.handleClient()` + 1 Hz Firebase poll (station mode only) |

### Tuning knobs (re-upload to change)

- `IR_LED_PIN` — currently GPIO3. Any free GPIO works; just match the wiring.
- `POLL_MS` — currently 1000. Lower → snappier remote, more requests per minute.
- `WIFI_CONNECT_TIMEOUT_MS` — currently 15000. Time before falling to SoftAP.

### Quirks worth flagging

- **The naive JSON parser** only handles flat objects with simple values (`"key":"value"`, `"key":num`, `"key":true|false`). It DOES NOT handle nested objects, arrays, escaped quotes, or whitespace inside object literals. We control the schema (phone always writes the same shape), so this is fine.
- **Partial commands are supported:** `{"power":"off"}` only changes power; mode/temp/fan retain their last value. The phone always sends the full state, but a `curl -X PUT` of just `{"temp":26}` would work too.
- **`clearCommand()` PUTs `""`** rather than deleting the field — keeps the "command exists, currently empty" mental model. Matches autoclicker's pattern.
- **The library handles the 38 kHz carrier internally** via the ESP32's RMT or LEDC peripheral — we don't manually toggle the pin at 38 kHz. `ac.send()` is synchronous and blocks for the duration of the IR frame (~150 ms).
- **`AP_SSID = "Aircon-AP"` / `AP_PASS = "aircon24"`** — different from autoclicker's "AutoClicker-AP" / "click1234" so they can coexist on the same shelf if both fall to SoftAP simultaneously.
- **Onboard blue LED (GPIO8) blinks on every IR send** as a visual confirmation that the firmware tried to transmit. Useful when the IR LED is hard to see (since it's invisible to the eye).

## Adding a new control

If extending the BOM later (e.g., add an OLED or a temperature sensor), follow the autoclicker pattern:
1. New SVG component in `index.html` HARDWARE section
2. New row in `wires[]` for any new connection
3. New checklist entries in `steps[]`
4. New JSON field in the command schema (update `applyCommand()` parser AND the phone remote)
5. Update `/aircon/state` mirror to include the new field

For a temp sensor specifically: write a new top-level RTDB path (`/aircon/sensor/temp`) instead of overloading `/aircon/state` — different data, different lifecycle.
