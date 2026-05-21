# pocket-remote/ — Summary

**Last updated:** 2026-05-21
**Status:** 🟢 Active (initial build — battery-powered hand-held remote that targets both autoclicker and aircon over Firebase)

A keychain-sized WiFi remote built from three off-the-shelf modules. One BOOT button on the ESP32-C3 dev board drives both of Charlie's existing Firebase-controlled devices — tap to fire the current mode, hold to switch modes. The 0.42" OLED shows WiFi signal, the current mode, and a transient status line. **No fuel gauge / battery percent** — the OLED flickering around 3.5 V is the cue to charge; the TP4056's DW01 cuts the cell at 3.0 V before damage. USB-C charging via TP4056; works while plugged in.

Sibling project to `autoclicker/` and `aircon/`. Uses **identical Firebase payloads** to those projects' phone remotes — the receiving firmware on each target device can't tell whether a tap came from a phone or from the pocket remote.

## File structure

```
pocket-remote/
├── index.html                  (~640 lines — full build reference: hero, overview, hardware, wiring, demo, code, checklist)
└── firmware/
    └── pocket-remote.ino       (~330 lines — canonical Arduino sketch; WiFiMulti + U8g2 OLED + Preferences NVS + button state machine + HTTPClient PUT)
```

No `assets/` folder, no image files. All hardware visuals are inline SVG: ESP32-C3 + 0.42" OLED dev board (top), TP4056 + DW01 charger (middle), LiPo 102050 1000 mAh cell (bottom), plus a 4-wire harness, a 220 kΩ / 100 kΩ battery-sense divider, and labelled callouts for the BOOT button + battery sense GPIO.

## Tech

- **Front-end:** Plain HTML + Tailwind v4 (browser CDN, no build), Inter + JetBrains Mono + Material Symbols Outlined.
- **State / data:** No new Firebase paths. Writes to the **existing** `/autoclicker/command` and `/aircon/command` paths under project `test-database-55379` (asia-southeast1). The autoclicker firmware listens on a long-lived SSE stream; the aircon polls at 1 Hz.
- **Auth:** No authentication on the device — the Firebase RTDB rules currently allow public read/write on `/autoclicker/*` and `/aircon/*` for testing. Locked-down rules would require swapping the firmware to use a service-account ID-token flow.
- **Firmware:** Canonical source at `firmware/pocket-remote.ino`. Uses:
  - **U8g2** (oliverkraus, Library Manager) — drives the SSD1306 controller in its 72×40 visible window.
  - **WiFiMulti** — same hardcoded SSID pool as autoclicker/aircon (`CAYNO` + `Charlie's iPhone`) so the remote roams.
  - **HTTPClient** — single PUT per tap; `http.begin(httpsURL)` uses the built-in insecure client (no cert pinning).
  - **Preferences** — mode (CLICK / AC) persists in NVS so it survives reboots and the cell going flat.
  - No Firebase SDK, no JSON parser, no Servo / IR library. Tiny sketch.

## Deploy

GitHub Pages at `/pocket-remote/` (auto-publishes on push to `main`). No phone-remote subpath — the device itself **is** the remote, the docs site is build reference only.

## Sections in `index.html`

| ID | Heading | What it shows |
|---|---|---|
| `overview` | "How a tap travels" | 4-node SVG flow diagram: Pocket Remote → Firebase → Autoclicker (top) / Aircon (bottom). Animated dashed wires. |
| `hardware` | "Three boards + a battery" | Top-down ESP32-C3+OLED board (with USB-C, BOOT, RST, OLED preview window showing `>CLICK · 87%`), TP4056+DW01 module (USB-C, B+/B−, OUT+/OUT−, CHRG/FULL LEDs), and LiPo 102050 cell. Wires drawn as colored paths; callouts label the BOOT button and the battery-sense divider. |
| `wiring` | "Six connections in total" | Data-driven table (`wires[]` array) — 4 power-chain jumpers + 2 resistors for the battery divider + 1 USB-C charger note. Includes a load-bearing warning about NOT connecting OUT+ to the V3 pin. |
| `demo` | "OLED preview" | Animation only — clickable Tap / Hold / Drain buttons drive a scaled-up SVG mock of the 72×40 OLED so you can see what the device shows. No Firebase calls. |
| `code` | "Firmware" | Three collapsible `<details>`: button state machine, Firebase PUT helpers, battery ADC + percent map. Link to the full sketch. |
| `checklist` | "Build steps" | Data-driven from `steps[]`, grouped by Parts / Firmware / Wiring / Test / Enclose. Progress bar persists in localStorage. |

## Conventions / quirks

- **Color palette is amber + emerald** — deliberately distinct from autoclicker's indigo/purple/pink and aircon's sky/cyan/teal. The header logo gradient and the checklist progress bar both use the amber→emerald sweep.
- **Demo is fake-only.** Tap / Hold / Drain animate the OLED mock and nothing else. Only the physical device writes to Firebase.
- **No MT3608 in the BOM.** The boost converter is deliberately skipped — see the wiring section's warning card. Battery → TP4056 → ESP32 5V pin directly; the onboard LDO handles 3.0–4.2 V with margin until ~3.5 V, at which point the OLED starts to flicker and serves as the "charge me" cue.
- **No transistor, no flyback diode, no MOSFET** — there's nothing inductive to drive. The only active components are the three boards.
- **No battery fuel gauge.** The divider was deliberately removed — the OLED itself indicates low battery by flickering around ~3.5 V when the LDO starts to drop out. Two fewer solder joints, smaller stack, and the TP4056's DW01 still cuts at 3.0 V to protect the cell.
- **Mode is persisted in NVS** under the namespace `remote`, key `mode` (uint8: 0 = CLICK, 1 = AC). Reads on boot, writes on every hold. Survives flat-battery shutdowns because NVS is in onboard flash.
- **Modem sleep is intentionally left at the Arduino-ESP32 default** (light sleep between beacons → ~20–30 mA average) so battery life sits around 12–24 hours. Don't call `WiFi.setSleep(false)` here like the autoclicker firmware does — it's wall-powered, this remote isn't.
- **No SoftAP fallback.** Unlike autoclicker/aircon, the pocket remote has no local web UI and no captive-portal recovery path. If WiFi is unreachable the OLED shows "no wifi" and that's it.
- **Section IDs drive the sticky nav** (`overview`, `hardware`, `wiring`, `demo`, `code`, `checklist`). Renaming any breaks scroll-active state in `syncNav()`.

## Why this shape

- **Why ESP32-C3 + 0.42" OLED dev board:** All-in-one — MCU, 2.4 GHz WiFi, USB-C, OLED, BOOT + RST buttons, status LED. Single board to populate. The 72×40 visible window is enough for a WiFi/battery status row, a big mode label, and a one-line status footer.
- **Why TP4056 with DW01 protection (not raw TP4056):** The DW01 + dual-MOSFET pair on the protection variant gives 3.0 V undervoltage cutoff + 4.2 V overvoltage cutoff + ~3 A overcurrent. Critical for a pocket device you might forget on a charger or run flat.
- **Why skip the MT3608:** Adds a 5th board, an ~85–90% efficient boost stage, and a calibration step (must trim to 5 V before connecting or the ESP32 fries). The ESP32-C3's onboard LDO already handles the LiPo voltage range; the tradeoff is that the bottom ~⅓ of the cell becomes flaky. For a remote that's charged nightly, that's acceptable.
- **Why one button (BOOT) does both jobs:** Tap vs hold gives two actions per button. Adding a second tactile would mean wires, a hole in the enclosure, and one more failure point. BOOT is already there with a debounced ESP32-C3 implementation.
- **Why persist mode in NVS instead of always defaulting to CLICK:** The remote should "remember" the last device you used. If you set it to AC last night and grab it again to turn the aircon off in the morning, it should still be in AC mode without you having to hold-toggle.
- **Why write the same payloads as the phone remotes:** No firmware changes needed on the target devices. Autoclicker still flips its latched state on `"toggle"`; aircon still does one push-hold-return on `{"cmd":"click"}`. Pocket remote = drop-in replacement for the phone tab.
- **Why no battery percent in Firebase:** Battery state belongs on the device, not in the cloud. Writing it every 5 s would burn the radio (more uplink than the actual remote function uses). The OLED is the only consumer.

## Related projects

- **`../autoclicker/`** — direct sister. Pocket remote's CLICK mode writes the same `"toggle"` value to `/autoclicker/command` that the autoclicker phone remote's big PRESS button does.
- **`../aircon/`** — direct sister. Pocket remote's AC mode writes the same `{"cmd":"click"}` JSON to `/aircon/command` that the aircon phone remote's POWER button does.
- Shares Firebase project `test-database-55379` (asia-southeast1) with all of Charlie's repo apps. RTDB paths are namespaced.

## What it does NOT do (deliberately)

- No phone-remote sub-page (the device replaces the phone, not augments it).
- No local web UI on the device — the OLED + button is the whole interface.
- No SoftAP fallback when WiFi is unavailable — surfaces "no wifi" on the OLED and waits.
- No battery telemetry, no on-device fuel gauge — the divider was tried then removed for simplicity.
- No deep sleep / RTC GPIO wakeup. Always-on with modem sleep is the v1 power profile. Deep sleep would push battery life from ~12 h to several days but adds a ~3–5 s connect-on-press latency.
- No haptics (board has no vibration motor).
- No voice / clap / keyword bridge (the autoclicker phone remote handles those; this is the bare-bones path).
