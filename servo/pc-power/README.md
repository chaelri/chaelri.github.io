# PC power over the LAN (servo without the servo)

`firmware/wol-power/wol-power.ino` replaces `servo-sweep.ino` on the same ESP32.
Same RTDB paths and commands, so Cloud Scheduler, `/servo-poweron`, the
heartbeat and the phone page are unchanged. A `click` acts like the power button:

```
/servo/command = "click"
        │
   ESP32 broadcasts SERVO-PING (UDP 40510)
        ├─ PC answers SERVO-PONG → ESP32 sends SERVO-OFF → listener.ps1 runs shutdown /s /t 0
        └─ no answer (off/asleep) → Wake-on-LAN magic packet to E0:D5:5E:6D:49:E3
```

`press` = wake only, `release` = shut down only, `auto` = wake only.

## Install (on the PC, once, as Administrator)

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

Registers the SYSTEM startup task, a LocalSubnet-only firewall rule for UDP
40510, and turns on the NIC's Wake on Magic Packet + Enable PME (the Intel I211
shipped with PME disabled, which blocks WoL from a full shutdown).

## Notes

- The ESP32 must be on the same router/LAN as the PC (192.168.254.x).
- The token in `listener.ps1` and `wol-power.ino` must match.
- If the NIC or MAC changes, update `PC_MAC` in the firmware.
