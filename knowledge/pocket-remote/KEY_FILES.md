# pocket-remote/ — Key Files

## `index.html` — single-page build reference (~640 lines)

Self-contained — no external JS bundle. Tailwind v4 via CDN.

### Section map (line ranges approximate)

| Lines | Section | Notes |
|---|---|---|
| 1–115 | `<head>` + inline `<style>` | All custom CSS lives here: card surfaces, glow utilities (`glow-amber`, `glow-emerald`), animated dash flow, OLED-blink keyframe, BOOT button press keyframe, code block tokens, checklist tick animation |
| 117–155 | NAV | Sticky desktop nav + collapsible mobile nav. Section IDs are load-bearing |
| 157–195 | HERO | Stat cards (3 modules / 1 button / 2 targets / USB-C charge) |
| 197–280 | OVERVIEW | 4-node SVG flow diagram (Pocket Remote → Firebase → Autoclicker / Aircon) with animated dashed wires + per-step explainer cards |
| 282–460 | HARDWARE | Stacked top-down illustration: ESP32-C3 + 0.42" OLED (top), TP4056 + DW01 (middle), LiPo 102050 (bottom). Wires drawn as colored paths; BOOT button + battery sense callouts to the right |
| 462–500 | WIRING | Data-driven table — rendered from `wires[]` array (line ~580) by JS at the bottom. Includes the `V3 pin = don't connect` warning card |
| 502–570 | DEMO | OLED preview — clickable Tap / Hold / Drain mock that animates the 72×40 OLED. **No Firebase calls.** |
| 572–620 | CODE | 3 collapsible `<details>`: button state machine, Firebase PUT helpers, battery ADC + percent map |
| 622–650 | CHECKLIST | Data-driven from `steps[]` (~line 620); progress bar updates on click toggle; progress persists in localStorage |
| 652–660 | FOOTER | Minimal credits with links back to autoclicker + aircon |
| 670+ | `<script>` | All client logic — see below |

### Demo SVG IDs

- `#oledSvg` — outer SVG; gets the `.oled-press` class for ~700 ms after Tap / Hold / Drain
- `#oledMode` — large text in the middle (`>CLICK` or `>AC`)
- `#oledStatus` — status line in the bottom row (auto-reverts to `ready` after 2.2 s)
- `#batFill` — battery fill rectangle width animates between 0–40 px proportional to `demoBat`
- `#batText` — battery percent text (right of the icon)

### Bottom `<script>` (line ~670–end)

| Lines | Block | Purpose |
|---|---|---|
| ~672 | `wires[]` const | Source of truth for the wiring table |
| ~685 | `tbody.innerHTML = wires.map(...)` | Render wiring rows |
| ~705 | `steps[]` const | Source of truth for the checklist (Parts / Firmware / Wiring / Test / Enclose) |
| ~735–770 | Checklist render + click-toggle + `updateProgress()` | Group by section, progress bar %, localStorage persistence under key `pocket_remote_checklist_v1` |
| ~775–790 | Mobile nav toggle + scroll-spy `syncNav()` | Active link state |
| ~795–end | OLED preview demo | `renderOled()`, `flashStatus()`, listeners on `demoTap` / `demoHold` / `demoDrain` |

### Quirks worth flagging

- **Color palette is amber + emerald** — header logo gradient, checklist progress bar, accent text. Distinct from autoclicker's indigo/purple and aircon's sky/cyan so the three sister projects are immediately recognizable.
- **Demo is fake-only.** Tap / Hold / Drain only animate the OLED mock — they don't write to Firebase. Real taps only happen on the physical device.
- **localStorage key is versioned** (`pocket_remote_checklist_v1`) so future schema changes don't break existing progress.
- **No iframe / phone-frame preview** in the Code section — unlike autoclicker/aircon which embed their `phone/index.html`, the pocket remote IS the remote, so there's nothing to embed. The Code section is pure firmware snippets.
- **Section IDs `overview`/`hardware`/`wiring`/`demo`/`code`/`checklist`** are load-bearing for `syncNav()` scroll-spy. Renaming any breaks the active-link highlight.
- **No `assets/` folder.** Hardware visuals are 100% hand-drawn SVG — see the `<g transform="translate(...)">` blocks in the HARDWARE section. To change a component, edit the SVG.

## `firmware/pocket-remote.ino` — canonical Arduino sketch (~330 lines)

Header comment documents the trigger model (one button, tap vs hold), the Firebase payloads it sends (`"toggle"` to `/autoclicker/command`, `{"cmd":"click"}` to `/aircon/command`), the full wiring diagram, the use-while-charging note, and why the MT3608 was deliberately omitted.

### Key globals

```cpp
const int BTN_PIN  = 9;       // BOOT button on the dev board
const int OLED_SDA = 5;
const int OLED_SCL = 6;
const unsigned long DEBOUNCE_MS  = 30;
const unsigned long TAP_MAX_MS   = 500;
const unsigned long HOLD_MS      = 800;
const unsigned long STATUS_HOLD_MS = 2500;
enum Mode { MODE_CLICK = 0, MODE_AC = 1 };
```

### Functions (file order)

| Function | Purpose |
|---|---|
| `loadMode()` / `saveMode()` | NVS-backed persistence under namespace `remote`, key `mode` (uint8) |
| `drawWiFiBars(x, y)` | 4-bar WiFi glyph based on current RSSI thresholds (−55 / −65 / −75 dBm) |
| `drawScreen()` | Full OLED redraw: WiFi bars top-left + big centered mode label + bottom status line. One I²C transaction. |
| `setStatus(s)` | Update the bottom-row text and mark `needsRedraw = true` |
| `putJson(url, body)` | Single HTTPS PUT via `HTTPClient`. Returns true on 2xx. |
| `fireClick()` / `fireAC()` | Thin wrappers over `putJson()` with the canonical payloads |
| `doTap()` | Sends the current mode's payload, surfaces the result on the OLED |
| `doHold()` | Flips `currentMode`, saves it, surfaces the new mode on the OLED |
| `readButton()` | Debounced state machine — see ARCHITECTURE.md for the decision table |
| `setup()` | OLED splash → button pin setup → `loadMode()` → WiFiMulti setup → WiFi join attempt (15 s timeout) → initial `drawScreen()` |
| `loop()` | `readButton()` + auto-clear status + WiFi recovery + conditional redraw |

### Tuning knobs (re-upload to change)

- `TAP_MAX_MS` / `HOLD_MS` — adjust if the button feels too sensitive or too laggy
- `STATUS_HOLD_MS` — how long transient OLED messages stick
- WiFi SSIDs in `setup()` — match Charlie's environment (currently `CAYNO` + `Charlie's iPhone`, same as autoclicker/aircon)

### Quirks worth flagging

- **No battery sense.** The `VBAT_PIN` / `analogRead` path was removed in favor of zero parts. Low-battery cue is OLED flicker around ~3.5 V; the TP4056 DW01 still cuts the cell at 3.0 V to protect the chemistry. If you ever want it back, GPIO0 is still free.
- **Modem sleep is implicit.** Don't add `WiFi.setSleep(false)` here — the autoclicker firmware does that because it's wall-powered. This remote needs the default light-sleep behavior for ~12–24 h battery.
- **No SoftAP fallback / no /scan endpoint.** Unlike autoclicker (which has a built-in WiFi setup web UI), pocket-remote is closed — credentials must be hardcoded and the device reflashed to change them. Trade-off: smaller sketch, no second hardcoded SSID for "Pocket-Remote-AP", no OLED-driven captive portal UX.
- **`http.begin(url)` with an HTTPS URL** uses the built-in insecure client. We don't construct a `WiFiClientSecure` because cert pinning is overkill for non-sensitive payloads and burns flash.
- **`Wire.setPins(OLED_SDA, OLED_SCL)` must be called BEFORE `oled.begin()`** — otherwise U8g2 starts I²C on the default ESP32-C3 pins (8 + 9) and the OLED stays blank. Order is enforced in `setup()`.
- **The status string is truncated to 14 chars** in `drawScreen()` to fit the 72 px / 5 px font width with margin. If you change `u8g2_font_5x7_tf` to a wider font, recompute the truncation.
- **OLED redraw is gated by `needsRedraw`** — most loop iterations are pure no-ops. `setStatus()`, `sampleBattery()` (when pct changes), and the WiFi recovery path all set the flag.

## Adding a new control (future v2)

If extending this build (e.g. add a second button for a third target):

1. Add a row in the `wires[]` array in `index.html` (line ~672) with the new connection.
2. Add a new SVG component / pin highlight in the HARDWARE section.
3. Add a new pinmode + state-machine block in `setup()` and `readButton()` (the existing function is single-button — would need to fork or take a pin parameter).
4. Add a new `enum Mode` value and `fire***()` function for the new target.
5. Update the OLED label rendering in `drawScreen()` to handle the new mode.
6. Increment the localStorage key version in `index.html` so the checklist re-renders.

For deep-sleep mode (significant battery improvement, ~3 s cold-start latency per press):

1. Add `esp_sleep_enable_ext1_wakeup_io(1ULL << BTN_PIN, ESP_EXT1_WAKEUP_ANY_LOW)` or similar before `esp_deep_sleep_start()`.
2. After cold boot, detect wake reason via `esp_sleep_get_wakeup_cause()`. If button-wake, fire the tap immediately (mode was loaded from NVS on boot).
3. Trade-off: OLED can't update mid-sleep, so the "battery / mode" header is stale until the next wake. Either accept that, or wake on a 30 s timer too — at which point you've burned half the savings.
