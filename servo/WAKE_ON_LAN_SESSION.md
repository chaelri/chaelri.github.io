# Session notes: ESP32 Wake-on-LAN power on/off (2026-11-02)

Commit: `7732485d` "servo: Wake-on-LAN firmware + PC shutdown listener (no servo, same RTDB commands)"

---

## FOR CLAUDE ON KARLA'S PC: start here

You were asked to read this file. Your job is to set up the same thing for **this** PC
(Karla's) and her own ESP32-C3. Call it **servokarla**. Everything below this section
describes Charlie's original setup (`servo/`). Use it as the reference implementation.

### Hard rules

- **Never touch Charlie's setup.** Don't edit anything under `servo/`, and don't read from
  or write to RTDB `/servo/*`. Karla's ESP32 must not be able to wake or shut down Charlie's PC,
  and Charlie's must not affect hers.
- Use a separate namespace everywhere:

| Thing | Charlie (`servo`) | Karla (`servokarla`) |
|---|---|---|
| Repo folder | `servo/` | `servokarla/` (new) |
| Firmware | `servo/firmware/wol-power/wol-power.ino` | `servokarla/firmware/wol-power-karla/wol-power-karla.ino` (the sketch folder name must match the `.ino` name) |
| RTDB root | `/servo/command`, `/servo/state`, `/servo/auto` | `/servokarla/command`, `/servokarla/state`, `/servokarla/auto` (same Firebase project `test-database-55379`) |
| UDP port | 40510 | **40511** |
| Token | `k7Qm2vXe9Rt4` | **generate a new random 12-char token**, put it in both firmware and listener |
| Ping/off messages | `SERVO-PING` / `SERVO-OFF` | `KARLA-PING` / `KARLA-OFF` (replies `KARLA-PONG` / `KARLA-BYE`) |
| PC MAC | `E0:D5:5E:6D:49:E3` | **this PC's wired NIC MAC** (from `Get-NetAdapter`) |
| Scheduled task | "Servo PC power listener" | "Servokarla PC power listener" |
| Install dir | `%ProgramData%\servo-power` | `%ProgramData%\servokarla-power` |
| Firewall rule | "Servo PC power listener (UDP 40510)" | "Servokarla PC power listener (UDP 40511)" |
| Phone page | `servo/index.html` (writes `servo/command`) | `servokarla/index.html`: copy it and change the ref to `servokarla/command` (and any other `servo/` refs) |

- Copy `servo/pc-power/listener.ps1`, `install.ps1` and `README.md` into `servokarla/pc-power/` and change
  every value in the table. Copy `wol-power.ino` and change `PC_MAC`, `PC_PORT`, `PC_TOKEN`, the
  three RTDB URLs, `STREAM_PATH`, the ping/off strings and the startup log lines.
- **WiFi:** ask which WiFi network(s) the ESP32 should join (SSID + password) and replace the
  `wifiMulti.addAP(...)` lines. The ESP32 must be on the **same router/LAN as this PC**.
- **No Cloud Scheduler, heartbeat or `/servo-poweron` copy.** Karla only needs the phone page and
  the ESP32. Don't build those unless asked.

### Step 1: check this PC first and show the results before building anything

Run these checks, then show the user a short checklist (OK / NOT OK / UNKNOWN for each):

```powershell
# 1. Wired NIC present and connected (WoL needs Ethernet, not WiFi)
Get-NetAdapter -Physical | Select-Object Name, InterfaceDescription, MediaType, Status, MacAddress
# 2. NIC wake settings (names vary by driver; look for Wake on Magic Packet, Enable PME, Wake on pattern)
Get-NetAdapterAdvancedProperty -Name "<wired NIC name>" | Where-Object DisplayName -match "Wake|PME|Shutdown" | Select-Object DisplayName, DisplayValue
Get-NetAdapterPowerManagement -Name "<wired NIC name>" | Select-Object WakeOnMagicPacket, DeviceSleepOnDisconnect
# 3. Is the NIC allowed to wake the PC?
powercfg /devicequery wake_armed
# 4. Fast Startup (0 = off). On some boards, Fast Startup on blocks WoL from shutdown.
(Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power").HiberbootEnabled
```

**BIOS settings can't be read from Windows.** Ask Karla whether both of these are set:
- **Wake on LAN on**: often named "Wake on LAN", "Power On By PCI-E", "Resume by PCI-E/PCI Device" or "PME Event Wake Up".
- **ErP / EuP disabled**: "ErP Ready" = Disabled. If ErP is on, the NIC and USB lose power when the PC is off, so neither WoL nor the ESP32 works.

**If either one is not set, or she isn't sure,** suggest restarting straight into the BIOS to change them
(tell her first, because it restarts the PC right away):

```powershell
shutdown /r /fw /t 0
```

Windows-side items (NIC wake settings, PME) get fixed by `install.ps1`. If Fast Startup is on,
suggest turning it off (`powercfg /h off`, or Control Panel > Power Options > "Turn on fast startup").

### Step 2: build and flash

1. Create the `servokarla/` files (see the table above).
2. Flash the ESP32-C3: find its COM port (`Get-CimInstance Win32_SerialPort` or Device Manager). If
   `arduino-cli` is missing: `winget install ArduinoSA.CLI`, then
   `arduino-cli core update-index` and `arduino-cli core install esp32:esp32`. Then:
   ```powershell
   arduino-cli compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc --upload -p COM<N> servokarla\firmware\wol-power-karla
   ```
3. Run `servokarla\pc-power\install.ps1` as Administrator (UAC prompt: tell the user to click Yes).
4. Test safely: write `"press"` to `/servokarla/command`. The ESP32 should ping the PC, get `KARLA-PONG`,
   set `/servokarla/state = true` and clear the command. `press` never shuts down.
5. Leave `click` testing to Karla: `click` with the PC on should shut it down, and `click` with it off should wake it.
   If waking fails, check whether the ESP32's LED stays lit while the PC is off. If it goes dark, the USB ports
   lose power at shutdown (ErP still on, or the board doesn't support it), so power the ESP32 from a separate USB charger.
6. Commit and push (repo convention). Add a short entry to `knowledge/servokarla/LOG.md`, created from
   `knowledge/_templates/LOG.md`, plus `servokarla/CLAUDE.md` containing `@../knowledge/servokarla/LOG.md`.

---

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
