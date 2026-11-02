# Karla's PC power over the LAN (servokarla)

Karla's copy of `servo/pc-power`. `firmware/wol-power-karla/wol-power-karla.ino` runs on her
ESP32-C3 with the 0.42" OLED. A `click` on `/servokarla/command` acts like the power button:

```
/servokarla/command = "click"
        │
   ESP32 broadcasts KARLA-PING (UDP 40511)
        ├─ PC answers KARLA-PONG → ESP32 sends KARLA-OFF → listener.ps1 runs shutdown /s /t 0
        └─ no answer (off/asleep) → Wake-on-LAN magic packet to 00:E0:4C:AD:18:BA
```

`press` = wake only, `release` = shut down only, `auto` = wake only.
Phone page: `servokarla/index.html`.

## Install (on Karla's PC, once, as Administrator)

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

Registers the SYSTEM startup task "Servokarla PC power listener", a LocalSubnet-only
firewall rule for UDP 40511, and turns on the NIC's Wake on Magic Packet (+ Enable PME
where the driver has it).

## Notes

- Shares the LAN with Charlie's `servo`. The separate port, token and `KARLA-*` messages
  keep his listener from answering this board, and the magic packet only wakes this MAC.
- The token in `listener.ps1` and `wol-power-karla.ino` must match.
- If the NIC or MAC changes, update `PC_MAC` in the firmware.
