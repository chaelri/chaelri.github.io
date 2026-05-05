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
   │ if body == "click": click(1); clearCommand()
   ▼
[ESP32Servo · GPIO3 PWM]
   │ finger.write(PRESS_ANGLE);  // 35° default
   │ delay(PRESS_HOLD_MS);       // 300 ms
   │ finger.write(REST_ANGLE);   // 0°
   │ delay(RELEASE_MS);          // 200 ms settle
   ▼
[MG90S servo arm · attached "finger" sweeps down]
   │ presses real button
   ▼
[Done · firmware PUTs "" back to /autoclicker/command]
```

The contract between any phone client and any ESP32 client is **the single string at `/autoclicker/command`**. Three values are recognized by the firmware:

| Value | Action |
|---|---|
| `"click"` | one press cycle (sweep + hold + return) |
| `"double"` | two press cycles, 150 ms apart |
| `"auto_<N>"` | N press cycles (clamped 1..50) |

After firing, the firmware PUTs an empty string back so the next poll doesn't refire.

## Trigger paths

The firmware exposes three independent ways to fire a click. All three end up calling the same `click(n)` function:

1. **Firebase remote (online, internet-reachable).** Phone client at `/autoclicker/phone/` writes `"click"` to RTDB. ESP32 polls every 1 s. Works from anywhere.
2. **Local web UI (online, same WiFi).** ESP32 runs a `WebServer` on port 80 with an inline HTML/CSS click button at `/`. Any device on the same network can `fetch('/click')`. Sub-second latency, no internet needed.
3. **SoftAP fallback (offline).** If no known WiFi joins within 15 s, ESP32 spins up its own AP `AutoClicker-AP` (password `click1234`). Phone connects → opens `http://192.168.4.1/` → same UI as path 2. Internet not required.

## Data layer

- **Firebase project:** `test-database-55379` (asia-southeast1)
- **DB:** Realtime Database, `https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app`
- **Path:** `/autoclicker/command` — single string field, owner: most recent writer
- **Auth:** anonymous (Firebase Auth must have anonymous sign-in enabled)
- **RTDB rules:** `.read` / `.write` = `true` for `/autoclicker/command` while testing; should be tightened post-test

## Front-end layer

### `index.html` — build-reference page

Single self-contained page. No external JS bundle. All inline:

- **Tailwind v4** (`<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4">`) — browser-side compile, no build step.
- **Inline `<style>`** for: card surfaces, glow utilities, animated dash flow, plunger transitions (legacy from solenoid era — still in CSS), GPIO LED on/off, code block colors, checklist tick animations, ripple keyframes.
- **Inline `<script>`** at bottom drives:
  1. Wiring table render from `wires[]` array
  2. Checklist render + toggle from `steps[]` array
  3. Click animation demo (SVG-only — still depicts plunger; pending redesign for servo arm)
  4. Mobile nav toggle + active link sync via scroll listener
  5. Code-block syntax highlighter (`highlight()` — placeholder-tokenized to avoid double-replacement)

### `phone/index.html` — live remote

Standalone full-screen mobile UI. Loaded both directly (`/autoclicker/phone/`) and as an iframe inside `index.html` Code section (framed as an iPhone for the preview).

Components:
- Header (logo, project name, online/offline dot bound to `.info/connected`)
- Big circular CLICK button ("1000 ms press" subtitle — copy is dated, refers to GPIO HIGH pulse era; functional behavior unchanged because the live remote only writes `"click"` to RTDB and the firmware decides timing)
- Status footer (state dot: idle / send / ok / err)

Click handler:
1. `navigator.vibrate(15)` for haptic feedback
2. spawn ripple
3. `set(ref(db, "autoclicker/command"), "click")`
4. update status dot + last-fired timestamp

No double-click, no auto-N — only `"click"`. The expanded vocabulary (`double`, `auto_N`) is firmware-only; the live remote sticks to the simplest single command.

## Firmware layer

Canonical source: `autoclicker/firmware/autoclicker.ino`. ESP32-C3 SuperMini, Arduino IDE 2.x.

```cpp
const int SERVO_PIN     = 3;     // GPIO3 → servo signal (orange)
const int LED_PIN       = 8;     // onboard blue LED, active LOW
const int REST_ANGLE    = 0;     // arm raised
const int PRESS_ANGLE   = 35;    // arm pressed (tune)
const int PRESS_HOLD_MS = 300;
const int RELEASE_MS    = 200;
const int POLL_MS       = 1000;
```

Loop:
1. `server.handleClient()` — service local web UI / SoftAP requests
2. (station mode only) HTTP GET on `<RTDB>/autoclicker/command.json` every 1 s
3. Trim quotes; match against `"click"` / `"double"` / `"auto_N"`
4. `click(n)` runs the press train (servo sweep + hold + return + release settle)
5. PUT `""` to clear

REST polling (not the Firebase Arduino SDK) keeps the sketch under flash budget and avoids cert-store complexity. ~1 s latency budget is acceptable for a manual remote.

`ESP32Servo` library (Kevin Harrington) is required — the AVR-era `Servo.h` does not run on ESP32-C3. The library uses one of the four LEDC PWM channels under the hood at 50 Hz with 500–2400 µs pulse range.

## Hardware layer

| Part | Role |
|---|---|
| ESP32-C3 SuperMini | WiFi MCU; runs firmware; provides 3.3 V GPIO + 5 V passthrough from USB-C |
| MG90S micro-servo (metal-gear) | Actuator — sweeps an attached "finger" (chopstick / popsicle stick / 3D-printed arm) onto the target button. Metal gears tolerate brief stalls. |
| USB-C powerbank or 5 V/2 A charger | Single power source for both ESP32 and servo on the same rail |

Four connections total (3 jumpers + 1 USB-C) — see `wires[]` in `index.html`.

For capacitive touchscreens (phone/tablet), wrap aluminum foil around the finger tip and connect a thin wire from the foil to ESP32 GND so the screen registers the tap.

## Why this shape

- **Why RTDB instead of MQTT/HTTP server:** Charlie already has a Firebase project for tayo/echoes etc. Cost-free, real-time, anon-auth-friendly.
- **Why REST polling instead of WebSocket on ESP32:** Arduino-on-ESP32 RTDB SDK churns flash; REST + 1 s poll is dead simple and the use case is sub-second-tolerant.
- **Why MG90S not SG90:** metal gears survive accidental stalls when PRESS_ANGLE is set too aggressively. SG90 (plastic gears) strips its teeth in that scenario. Cost difference is ~₱70.
- **Why servo not solenoid+relay:** 5V solenoids are mechanically weak and unreliable; adding a relay/MOSFET multiplies failure points and connections. Servo gives software-tunable press depth, software-tunable hold time, three wires, single 5V rail, no inductive load.
- **Why GPIO3:** ESP32-C3 SuperMini exposes GPIO3 on a corner pad with no boot-strapping conflict; works fine as a servo PWM output via ESP32Servo + LEDC.
- **Why a built-in web UI in addition to Firebase:** lets the device function fully offline (SoftAP) and sub-second on the same LAN, without depending on the cloud round-trip for the common case.
