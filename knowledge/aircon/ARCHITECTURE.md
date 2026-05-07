# aircon/ — Architecture

## End-to-end flow

```
[Phone tap (power / temp± / mode / fan)]
   │ Firebase v10 SDK · set(ref(db, "aircon/command"), {power, mode, temp, fan, swing})
   ▼
[Firebase RTDB · /aircon/command = {state JSON}]
   │ ESP32 HTTP GET every 1 s (REST, not SDK — saves flash)
   ▼
[ESP32-C3 firmware · loop()]
   │ if body is non-empty JSON: applyCommand(body); clearCommand()
   │   - parse fields with naive substring extraction (no ArduinoJson dep)
   │   - mutate global AcState struct
   │   - call sendIR()
   ▼
[IRTcl112Ac · ac.send()]
   │ Library encodes the 112-bit TCL112AC frame
   │ ac.setPower / setMode / setTemp / setFan / setSwingVertical
   │ Then ac.send() pulses GPIO3 at 38 kHz / ~33% duty for the bit pattern
   ▼
[GPIO3 → 100Ω resistor → IR LED 940nm anode]
   │ LED flashes invisible 940 nm light at 38 kHz in the encoded pattern (~150 ms)
   ▼
[TCL aircon IR receiver · 38 kHz photodiode]
   │ Decodes the bit pattern → applies state → beeps
   ▼
[ESP32 firmware]
   │ publishState() → PUTs the new state JSON to /aircon/state
   ▼
[Subscribers (phone remote, dashboards) · onValue listener fires]
   │ UI reflects the new authoritative state
```

The contract is two things:
1. **`/aircon/command`** — the desired-state object the phone writes; ESP32 consumes and clears.
2. **`/aircon/state`** — the authoritative-state mirror the ESP32 writes after every successful IR send.

Command schema (JSON):
```json
{
  "power": "on" | "off",
  "mode":  "cool" | "dry" | "fan" | "heat" | "auto",
  "temp":  16,                  // integer Celsius, 16..30
  "fan":   "auto" | "low" | "med" | "high",
  "swing": true | false         // optional; only overridden if present
}
```

`/aircon/state` has the same shape; it's effectively `/aircon/command` after it was last applied.

## Trigger paths

The firmware exposes three independent ways to fire an IR send. All three end up calling the same `applyCommand(body)` → `sendIR()`:

1. **Firebase remote (online, internet-reachable).** Phone client at `/aircon/phone/` writes a JSON state object to RTDB. ESP32 polls every 1 s. Works from anywhere.
2. **Local web UI (online, same WiFi).** ESP32 runs a `WebServer` on port 80 with an inline HTML/CSS UI. Any device on the same network can `POST /set` with a JSON body, or `GET /state` to read current state. Sub-second latency, no internet needed.
3. **SoftAP fallback (offline).** If no known WiFi joins within 15 s, ESP32 spins up its own AP `Aircon-AP` (password `aircon24`). Phone connects → opens `http://192.168.4.1/` → same UI as path 2. Internet not required.

## Data layer

- **Firebase project:** `test-database-55379` (asia-southeast1) — shared with autoclicker, echoes, weddingbar, etc.
- **DB:** Realtime Database, `https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app`
- **Paths:**
  - `/aircon/command` — transient JSON state object; ESP32 reads and clears it back to `""`.
  - `/aircon/state` — authoritative current state JSON; ESP32 writes after every successful IR send.
- **Auth:** anonymous (Firebase Auth must have anonymous sign-in enabled on the project).
- **RTDB rules:** `.read` / `.write` = `true` for `/aircon/*` while testing; should be tightened post-test.

## Front-end layer

### `index.html` — build-reference page

Single self-contained page. No external JS bundle. All inline:

- **Tailwind v4** (`<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4">`) — browser-side compile, no build step.
- **Inline `<style>`** for: card surfaces, glow utilities, animated dash flow, IR LED firing pulse, IR ripple wave keyframes, code block colors, checklist tick animations, aircon LCD wake animation.
- **Inline `<script>`** at bottom drives:
  1. Wiring table render from `wires[]` array
  2. Checklist render + toggle from `steps[]` array
  3. IR pulse animation demo (SVG-only — LED dome opacity + 4 staggered ripple circles spawning toward the aircon + LCD-temp text wake)
  4. Mobile nav toggle + active link sync via scroll listener
  5. Code-block syntax highlighter (`highlight()` — placeholder-tokenized to avoid double-replacement)

### `phone/index.html` — live remote

Standalone full-screen mobile UI. Loaded both directly (`/aircon/phone/`) and as an iframe inside `index.html` Code section (framed as an iPhone for the preview).

Components (top → bottom):
- Header (logo, project name, online/offline dot bound to `.info/connected`)
- Big tabular-numeric temp display with ±1 step buttons on either side; mode label below the temp
- Big circular POWER button (slate when off, sky/cyan when on, ambient halo behind it)
- Mode chips row (cool / dry / fan / auto)
- Fan chips row (auto / low / med / high)
- Status footer (state dot: idle / send / ok / err, plus last-fired timestamp)

Click handlers (one per control):
1. `navigator.vibrate(...)` for haptic feedback
2. spawn ripple (power button only)
3. mutate local `s` state → `render()` for optimistic UI
4. `set(ref(db, "aircon/command"), s)` writes the **full state** to RTDB
5. update status dot + last-fired timestamp

The UI also subscribes to `/aircon/state` via `onValue()` so any state change (from another device, local web UI, etc.) updates the phone display in real time.

## Firmware layer

Canonical source: `aircon/firmware/aircon.ino`. ESP32-C3 SuperMini, Arduino IDE 2.x.

```cpp
const int IR_LED_PIN = 3;     // GPIO3 → 100Ω resistor → IR LED anode
const int LED_PIN    = 8;     // onboard blue LED, active LOW (blinks on send)
const int POLL_MS    = 1000;

IRTcl112Ac ac(IR_LED_PIN);

struct AcState {
  bool   power = false;
  uint8_t mode = kTcl112AcCool;
  float   temp = 24.0f;
  uint8_t fan  = kTcl112AcFanAuto;
  bool   swing = false;
} state;
```

Loop:
1. `server.handleClient()` — service local web UI / SoftAP requests
2. (station mode only) HTTP GET on `<RTDB>/aircon/command.json` every 1 s
3. If non-empty/non-null body: `applyCommand(body)` parses fields, mutates `state`, calls `sendIR()`, then `publishState()` mirrors to `/aircon/state`
4. PUT `""` to `/aircon/command` to clear

`sendIR()`:
1. Onboard LED on (visual confirmation)
2. `ac.setPower / setMode / setTemp / setFan / setSwingVertical` write fields into the library's internal state buffer
3. `ac.send()` generates the 38 kHz / 112-bit TCL112AC frame and pulses GPIO3
4. Onboard LED off

REST polling (not the Firebase Arduino SDK) keeps the sketch under flash budget and avoids cert-store complexity. ~1 s latency budget is acceptable for a manual remote. Total flash usage with the IRremoteESP8266 lib is ~700 KB — fits comfortably on ESP32-C3's 4 MB.

## Hardware layer

| Part | Role |
|---|---|
| ESP32-C3 SuperMini | WiFi MCU; runs firmware; provides 3.3 V GPIO + 5 V passthrough from USB-C |
| IR LED 940 nm (TSAL6200 or generic 5 mm) | The transmitter — pulses 38 kHz IR light in the TCL112AC pattern. Aimed at the aircon's IR receiver eye on the indoor unit. |
| 100 Ω resistor (1/4 W, 4-band brown-black-brown-gold) | Current limit on the LED's anode side; protects both the GPIO and the LED |
| USB-C cable + wall charger (any phone charger) | Single power source on the same 5 V rail as ESP32 |

Three connections total (2 jumpers + 1 USB-C) — see `wires[]` in `index.html`.

For Charlie's TCL TAC-09CSA/KEI: a wall-mount within ~2 m of the aircon, IR LED bent to point slightly upward toward the IR window on the indoor unit, has plenty of margin.

## Why this shape

- **Why RTDB instead of MQTT/HTTP server:** Charlie already has a Firebase project for tayo/echoes/autoclicker. Cost-free, real-time, anon-auth-friendly.
- **Why REST polling instead of WebSocket on ESP32:** Arduino-on-ESP32 RTDB SDK churns flash; REST + 1 s poll is dead simple and the use case is sub-second-tolerant.
- **Why no transistor:** at 38 kHz / ~33% duty cycle the average IR LED current sits within the GPIO's safe zone. A bare 100 Ω resistor + GPIO is enough for ~2-3 m line-of-sight, which is plenty when the device is wall-mounted near the aircon. Adding a transistor would buy ~3-5× range but adds a part and a connection. Defer until proven necessary.
- **Why no TSOP4838 receiver in the BOM:** the TCL112AC protocol is already in `IRremoteESP8266` and works for Charlie's TAC-09CSA/KEI. The receiver is only needed for "learning" unsupported remotes; for this build it's wasted parts.
- **Why GPIO3:** ESP32-C3 SuperMini exposes GPIO3 on a corner pad with no boot-strapping conflict; works fine as an IR LED PWM output via `IRsend`. Same pin used by the autoclicker firmware, intentionally — keeps the wiring story consistent across the sister projects.
- **Why a built-in web UI in addition to Firebase:** lets the device function fully offline (SoftAP) and sub-second on the same LAN, without depending on the cloud round-trip for the common case.
- **Why send full state every press, not deltas:** matches how TCL remotes actually work. The aircon's IR receiver expects a complete state frame on every press; if you sent only "temp +1" the unit would briefly forget mode and fan settings. The library's `IRTcl112Ac` class handles this correctly by transmitting all fields on every `send()`.
