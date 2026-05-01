# autoclicker/ — Architecture

## End-to-end flow

```
[Phone tap]
   │ Firebase v10 SDK · set(ref(db, "autoclicker/command"), "click")
   ▼
[Firebase RTDB · /autoclicker/command = "click"]
   │ ESP32 HTTP GET every 1 s (REST, not SDK — saves flash)
   ▼
[ESP32-C3 firmware · loop()]
   │ if body == "click": digitalWrite(GPIO3, HIGH); delay(200); digitalWrite(GPIO3, LOW); clearCommand()
   ▼
[GPIO3 — 3.3 V logic, 200 ms HIGH]
   │ drives MOSFET gate
   ▼
[IRF520 MOSFET module · switches 5 V load]
   │ V+ / V− to solenoid coil
   ▼
[5 V solenoid · ~400 mA · plunger fires]
   │ presses real button
   ▼
[Done · firmware PUTs "" back to /autoclicker/command]
```

The contract between any phone client and any ESP32 client is **the single string at `/autoclicker/command`**. Three values are recognized by the firmware:

| Value | Action |
|---|---|
| `"click"` | one 200 ms pulse |
| `"double"` | two 200 ms pulses, 150 ms apart |
| `"auto_<N>"` | N pulses (clamped 1..50) |

After firing, the firmware PUTs an empty string back so the next poll doesn't refire.

## Data layer

- **Firebase project:** `test-database-55379` (asia-southeast1)
- **DB:** Realtime Database, `https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app`
- **Path:** `/autoclicker/command` — single string field, owner: most recent writer
- **Auth:** anonymous (Firebase Auth must have anonymous sign-in enabled)
- **RTDB rules:** `.read` / `.write` = `true` for `/autoclicker/command` while testing (per Code section note); should be tightened post-test

## Front-end layer

### `index.html` — build-reference page

Single self-contained page. No external JS bundle. All inline:

- **Tailwind v4** (`<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4">`) — browser-side compile, no build step.
- **Inline `<style>`** for: card surfaces, glow utilities, animated dash flow, plunger transitions, GPIO LED on/off, code block colors, checklist tick animations, ripple keyframes.
- **Inline `<script>`** at bottom (after `</section>` for checklist) drives:
  1. Wiring table render from `wires[]` array
  2. Checklist render + toggle from `steps[]` array
  3. Click animation demo (SVG-only — `pushOnce()` orchestrates GPIO LED + plunger transform + button-press pseudo-class + ripple + counter)
  4. Mobile nav toggle + active link sync via scroll listener
  5. Code-block syntax highlighter (`highlight()` — placeholder-tokenized to avoid double-replacement)

### `phone/index.html` — live remote

Standalone full-screen mobile UI. Loaded both directly (`/autoclicker/phone/`) and as an iframe inside `index.html` Code section (framed as an iPhone for the preview).

Components:
- Header (logo, project name, online/offline dot bound to `.info/connected`)
- Big circular CLICK button (200 ms press label)
- Status footer (state dot: idle / send / ok / err)

Click handler:
1. `navigator.vibrate(15)` for haptic feedback
2. spawn ripple
3. `set(ref(db, "autoclicker/command"), "click")`
4. update status dot + last-fired timestamp

No double-click, no auto-N — only `"click"`. The expanded vocabulary (`double`, `auto_N`) is firmware-only; the live remote sticks to the simplest single command.

## Firmware layer (referenced, not deployed from this repo)

ESP32-C3 SuperMini, Arduino IDE 2.x.

```cpp
const int SOLENOID_PIN = 3;     // GPIO3 → MOSFET SIG
const int CLICK_MS     = 200;
const int POLL_MS      = 1000;
```

Loop:
1. Reconnect WiFi if dropped
2. HTTP GET on `<RTDB>/autoclicker/command.json`
3. Trim quotes; match against `"click"` / `"double"` / `"auto_N"`
4. `click(n)` runs the pulse train
5. PUT `""` to clear
6. `delay(POLL_MS)` and repeat

REST polling (not the Firebase Arduino SDK) keeps the sketch under flash budget and avoids cert-store complexity. ~1 s latency budget is acceptable for a manual remote.

## Hardware layer

| Part | Role |
|---|---|
| ESP32-C3 SuperMini | WiFi MCU; runs firmware; provides 3.3 V GPIO + 5 V passthrough from USB-C |
| IRF520 MOSFET module | Logic-level switch; isolates 5 V solenoid current from MCU GPIO. Onboard flyback diode protects the MCU from coil kickback. |
| 5 V solenoid | Linear actuator — plunger extends ~10 mm at 5 V, ~400 mA |
| USB-C cable + 5 V/2 A charger | Power for both ESP32 logic and (via the module) solenoid coil |

Six connections total (3 jumpers + 2 screw terminals + 1 USB) — see `wires[]` in `index.html`.

## Why this shape

- **Why RTDB instead of MQTT/HTTP server:** Charlie already has a Firebase project for tayo/echoes etc. Cost-free, real-time, anon-auth-friendly.
- **Why REST polling instead of WebSocket on ESP32:** Arduino-on-ESP32 RTDB SDK churns flash; REST + 1 s poll is dead simple and the use case is sub-second-tolerant.
- **Why MOSFET module not bare transistor:** module ships with gate resistor + flyback diode + screw terminals — zero soldering build, matches the "0 soldering" hero claim.
- **Why GPIO3:** ESP32-C3 SuperMini exposes GPIO3 on a corner pad with no boot-strapping conflict.
