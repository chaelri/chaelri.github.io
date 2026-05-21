# pocket-remote/ — Architecture

## End-to-end flow

```
[BOOT button tap or hold]
   │
   ▼
[ESP32-C3 firmware · loop()]
   │ readButton(): debounced state machine on GPIO9
   │
   ├─ TAP   (<500 ms)
   │   │ currentMode == LIGHTS?
   │   │   ▼
   │   │   HTTP PUT  /autoclicker/command.json   body: "toggle"
   │   │
   │   │ currentMode == AIRCON?
   │   │   ▼
   │   │   HTTP PUT  /aircon/command.json        body: {"cmd":"click"}
   │   │
   │   └─ Flash row 4 of the OLED: "sent" / "fail" / "no wifi"
   │
   └─ HOLD  (>=800 ms while still pressed)
       │
       ▼
       Flip currentMode  (LIGHTS <-> AIRCON)
       Write new mode to NVS (Preferences key "mode")
       Update OLED row 1 (mode label) + flash row 4: "-> LIGHTS" / "-> AIRCON"
```

Once the PUT lands, each target device reacts exactly as it would to its own phone remote:

- **Autoclicker:** SSE stream on `/autoclicker/command` fires `doToggle()` → servo flips between latched-press and released. Then `clearCommand()` resets the path to `""` so the next stream event has clean state.
- **Aircon:** 1 Hz poller on `/aircon/command` sees the JSON object, calls `applyCommand()` → `doClick()` → push-hold-return on the physical power button. Then writes `""` back.

Both targets also write authoritative state to `/autoclicker/state` and `/aircon/state` respectively. The pocket remote does NOT subscribe to those — it's a write-only client. If you want optimistic UI on the pocket OLED you'd add an SSE listener, but for v1 the tap feedback is purely local ("sent OK" comes from HTTP 200, not from confirming the target acted).

## Trigger paths

The pocket remote has exactly one trigger: the BOOT button on GPIO9. The state machine in `readButton()` decomposes one physical press into two logical actions:

| Action | Condition | Result |
|---|---|---|
| **Tap** | Press, then release inside `TAP_MAX_MS` (500 ms), and no hold has fired | Calls `doTap()` → HTTPS PUT to the current mode's Firebase path |
| **Hold** | Still pressed at `HOLD_MS` (800 ms) past press time | Fires `doHold()` immediately on the threshold crossing (not on release), latches `holdFired = true` so the eventual release becomes a no-op |
| **Long-hold release** | Press > 500 ms but no hold action ran yet | Treated as a tap — the upper bound on tap duration is forgiving |

Why fire hold on the threshold crossing rather than on release: instant feedback. The user knows the moment the mode flipped, rather than waiting for them to lift their finger.

Why not press-and-hold-repeat for taps: nobody asked for it, and the autoclicker / aircon targets already debounce on their end (autoclicker latches; aircon ignores no-op states). Adding repeat would complicate the state machine for zero gain.

## Data layer

- **Firebase project:** `test-database-55379` (asia-southeast1). No new paths — the pocket remote writes to existing ones.
- **Paths it writes to:**
  - `/autoclicker/command` ← bare JSON string `"toggle"` (LIGHTS mode taps)
  - `/aircon/command` ← JSON object `{"cmd":"click"}` (AC mode taps)
- **Paths it does NOT read:** `/autoclicker/state` and `/aircon/state` exist as mirrors but the pocket remote ignores them. If a future v2 wants the OLED to show "armed / disarmed" for the autoclicker (so you know whether your tap was a press or release), it would subscribe to `/autoclicker/state` via SSE the way the autoclicker firmware does on `/autoclicker/command`.
- **Auth:** Currently open RTDB rules. If those tighten, the firmware would need to obtain an ID token (anonymous sign-in via the REST endpoint `https://identitytoolkit.googleapis.com/v1/accounts:signUp`) and append `?auth=<id_token>` to each PUT.
- **HTTP transport:** Just `HTTPClient` over the default insecure HTTPS client. `http.begin(httpsURL)` works without explicitly building a `WiFiClientSecure`; the implementation defers to a built-in insecure client. We do NOT pin certs — the payloads are non-sensitive and the radius of damage if MITM'd is "someone toggled my servo."

## Hardware layer

```
                      ┌──────────────────────────┐
                      │ ESP32-C3 + 0.42" OLED    │
                      │  (01space-style)         │
                      │                          │
        BOOT btn ─────┤ GPIO9  (INPUT_PULLUP)    │
        OLED      ────┤ GPIO5  (SDA, internal)   │
        OLED      ────┤ GPIO6  (SCL, internal)   │
                      │                          │
                ┌─────┤ 5V                       │
                │     │ GD                       │
                │     │ V3 (regulated 3.3 V) ── DO NOT CONNECT TO BATTERY
                │     └──────────────────────────┘
                │
   ┌────────────┴──────────┐
   │ TP4056 + DW01         │       USB-C in ←── any phone charger
   │                       │
   │  USB-C ── charging in │
   │  B+, B- ── battery    │
   │  OUT+ ── load +       │
   │  OUT- ── load -       │
   └─┬───────┬─────────────┘
     │       │
     │       │ (back to ESP32 5V / GD shown above)
     │       │
     │       │
   ┌─┴───────┴─┐
   │ LiPo 3.7V │
   │ 1000 mAh  │
   │ 102050    │
   └───────────┘
```

### Pinout reference (01space ESP32-C3 + 0.42" OLED board)

| Pin label | GPIO | Function in this build |
|---|---|---|
| `BOOT` (top-left button) | GPIO9 | Tap / hold input (active LOW, INPUT_PULLUP) |
| `5V` | — | Battery rail in (from TP4056 OUT+) |
| `GD` | — | Common ground (from TP4056 OUT−) |
| `V3` | — | **Do not connect** — 4.2 V battery exceeds 3.3 V LDO output spec |
| Internal | GPIO5 | OLED SDA |
| Internal | GPIO6 | OLED SCL |
| Internal | GPIO8 | Onboard PWR LED (red, lit whenever device is powered) |

GPIO0, 1, 2, 3, 4, 7, 10 are unused — available for future expansion (e.g. a second tactile button, a haptic motor driver, a status RGB LED, or re-adding the battery sense divider on GPIO0).

## Firmware layer

Canonical source: `pocket-remote/firmware/pocket-remote.ino`. ESP32-C3, Arduino IDE 2.x.

Key globals:

```cpp
const int BTN_PIN  = 9;       // BOOT button
const int OLED_SDA = 5;
const int OLED_SCL = 6;

const unsigned long DEBOUNCE_MS  = 30;
const unsigned long TAP_MAX_MS   = 500;
const unsigned long HOLD_MS      = 800;
const unsigned long STATUS_HOLD_MS = 2500;

enum Mode { MODE_LIGHTS = 0, MODE_AIRCON = 1 };  // NVS uint8 values preserved
```

Loop body (in order, per iteration):

1. `readButton()` — debounced GPIO9 read. Tap fires on release; hold fires on threshold crossing.
2. Auto-clear of the bottom status line after `STATUS_HOLD_MS` (2.5 s) — transient messages don't sit forever.
3. WiFi recovery — if `WiFi.status() != WL_CONNECTED`, throttled `wifiMulti.run()` every 10 s.
4. `drawScreen()` — only when `needsRedraw` is set. The 72×40 buffer is flushed in one I²C transaction.

## Why this shape

- **Why one firmware sketch for two targets, instead of two devices:** Charlie already has the autoclicker phone remote and the aircon phone remote. A second pocket device per target would mean two builds, two batteries, two USB-C cables. One pocket remote with mode-switching is the right ergonomic choice for "I'm holding it anyway, let me also hit the aircon."
- **Why a state machine with hold-on-threshold instead of hold-on-release:** Hold-on-release means the user has to wait for their finger lift before knowing the mode flipped. Hold-on-threshold gives a snappy "yes, the OLED just changed" the moment they cross 800 ms, even if their thumb stays on the button.
- **Why transient-status auto-clear (2.5 s) instead of permanent:** The bottom row is for short-lived feedback ("sent", "fail", "-> AIRCON"). Leaving it forever would mean the OLED reads stale info between taps. After 2.5 s the row falls back to a WiFi-derived default — empty when online, `no wifi` when offline.
- **Why sample battery at 5 s instead of every loop:** ADC reads aren't free (~16 µs each × 8 samples = ~128 µs) and the LiPo voltage doesn't change meaningfully in 5 s. Cheap, smooth indicator.
- **Why no haptics on the pocket remote:** The board has no vibration motor and adding one means a transistor + flyback diode + new GPIO. The OLED status flash + the tactile click of the BOOT button itself are the feedback.
- **Why the OLED bottom row is 5×7 font but the mode label is helvB12:** Mode label needs to be readable across the room ("which mode am I in?"). Status row is glanceable detail — fits more characters per pixel.
- **Why GPIO0 for battery sense (not GPIO1/2/3/4):** GPIO0 is the ADC1_CH0 input and is brought out as a clean pad on the 01space board's top edge. GPIO3 is left free in case a future v2 wants to drive a haptic motor (mirrors the autoclicker/aircon convention of GPIO3 as the "output to actuator" pin). GPIO4 is the autoclicker's local-trigger pin so we leave it unused here for visual consistency with the sibling boards.
- **Why no inflight Firebase ID token / RTDB rules tightening:** Same security trade-off the autoclicker and aircon already accept — testing-mode open rules on namespaced paths. Locking down would require all three firmwares to switch to authenticated REST. Defer until a real attack vector materializes.
