# Session notes: ESP32 Wake-on-LAN power on/off (2026-11-02)

Commit: `7732485d` "servo: Wake-on-LAN firmware + PC shutdown listener (no servo, same RTDB commands)"

## Goal

The ESP32-C3 used to drive a servo that physically pressed the PC power button.
Cloud Scheduler sends `click` to `/servo/command` at 5:55 AM and 3:55 PM.

Charlie wanted the same ESP32, plugged into the PC, to keep listening to the same
Firebase path and command format, but turn the PC on with Wake-on-LAN instead of
the servo. Because WoL can't turn a PC off, the ESP32 also had to be able to tell the
PC to shut down. The scheduler, `/servo-poweron`, the heartbeat and the phone page
were to stay as they are. Only the firmware and the PC side would change.

Before starting: WoL was already enabled in the BIOS, and ErP was disabled.

## What was built

| File | Role |
|---|---|
| `servo/firmware/wol-power/wol-power.ino` | Drop-in replacement for `servo-sweep.ino`. Same RTDB paths, no servo. |
| `servo/pc-power/listener.ps1` | UDP listener on the PC: answers pings, shuts down on command. |
| `servo/pc-power/install.ps1` | One-time admin setup: startup task, firewall rule, NIC wake settings. `-Uninstall` removes them. |
| `servo/pc-power/README.md` | Short reference. |

`servo-sweep.ino` is still in the repo for going back to the servo.

## How it works

```
/servo/command = "click"
        |
   ESP32 broadcasts "SERVO-PING <token>" (UDP 40510, LAN broadcast, up to 3 tries x 500 ms)
        |-- PC answers "SERVO-PONG"  -> ESP32 sends "SERVO-OFF <token>" -> listener runs shutdown /s /t 0
        '-- no answer (off/asleep)   -> Wake-on-LAN magic packet to E0:D5:5E:6D:49:E3
```

- The ESP32 doesn't need the PC's IP. It finds the PC through the ping broadcast and
  sends the shutdown to whichever address answered.
- The magic packet goes out 3 times to the subnet broadcast and to 255.255.255.255,
  on ports 9 and 7, because UDP can drop packets.
- The token (`PC_TOKEN` in the firmware, `$Token` in `listener.ps1`) must match.
  Messages with the wrong token are ignored.

### Commands on `/servo/command` (cleared back to `""` after running)

| Command | Behavior |
|---|---|
| `click` / `toggle` | Power toggle: wake if off, shut down if on |
| `press` | Wake only, never shuts down |
| `release` | Shut down only, does nothing if the PC is off |
| `/servo/auto = true` | `press` every 4 minutes (never shuts down) |

`/servo/state` is set to `true` or `false` from the last ping.

On (re)connect, the first stream event is whatever `/servo/command` already held.
It's cleared, not run, so a stale `click` sent while the board was offline can't fire later.

## PC setup (`install.ps1`, run once as Administrator)

```powershell
powershell -ExecutionPolicy Bypass -File servo\pc-power\install.ps1
```

1. Copies `listener.ps1` to `%ProgramData%\servo-power\` and registers the scheduled task
   **"Servo PC power listener"**. It runs as SYSTEM at startup, restarts on failure, and has no time limit.
2. Adds a firewall rule allowing inbound UDP 40510 from **LocalSubnet only**.
3. Turns on **Wake on Magic Packet** and **Enable PME** on the wired NIC.

### Key finding: Intel I211 "Enable PME"

The PC's Intel I211 adapter had Wake on Magic Packet on but **Enable PME off**.
Without PME, Intel NICs usually can't wake from a full shutdown, even with WoL on in
the BIOS. The installer turns it on.

## Flashing

The ESP32-C3 SuperMini was on **COM3**. It was flashed with arduino-cli:

```powershell
arduino-cli compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc --upload -p COM3 servo\firmware\wol-power
```

Board: "ESP32C3 Dev Module", USB CDC On Boot: Enabled. No extra libraries needed.
At boot, the serial monitor (115200) shows the WiFi SSID and IP, then "PC is on (ip)" or "PC not answering".

## Testing done

- Tested `listener.ps1` locally: it answers a ping with the right token and ignores a wrong one.
  The shutdown command was not sent.
- After flashing and installing, sent `press` through Firebase. The ESP32 picked it up, pinged the PC,
  got `SERVO-PONG`, set `/servo/state = true` and cleared the command. The PC stayed on, as expected.

## Click test (done by Charlie, 2026-11-02)

`click` with the PC on shut it down. `click` with the PC off woke it through WoL. Both work.

## Scheduler safety

The 5:55/3:55 Cloud Scheduler job calls `gemini-proxy /servo-poweron`. That endpoint only writes `click`
if `/servo/pc.lastSeen` is over 6 minutes old. `servo/pc-heartbeat` writes it every minute from 5:50 to 5:55,
from 3:50 to 3:55, and at boot, so a PC that's already on gets skipped. If the heartbeat fails while the PC is on,
the `click` shuts the PC down. Making `/servo-poweron` send `press` (wake only) would remove that risk.

## Caveats

- The ESP32 and PC must be on the same router/LAN (`192.168.254.x`). ESP32 on WiFi and PC on Ethernet is fine.
- WoL needs the wired NIC. If the NIC or MAC changes, update `PC_MAC` in the firmware.
- The shutdown isn't forced (`/s /t 0`, no `/f`), so an app with unsaved work can block it,
  the same as a real power-button press.
- The ESP32 is powered from the PC's USB, so it depends on the USB ports staying powered
  when the PC is off (ErP disabled should keep them on).
