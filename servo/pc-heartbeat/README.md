# PC heartbeat

Stops the 5:55 AM / 3:55 PM weekday power-button click from turning the PC
**off** when it is already on.

```
PC (Task Scheduler, SYSTEM)                 Cloud Scheduler
  Mon-Fri 5:50..5:55, 3:50..3:55  ─┐          autoclicker-weekday-click
  at startup                      ─┤          55 5,15 * * 1-5 Asia/Manila
                                   ▼                     │ POST
                      RTDB /servo/pc                     ▼
                      { lastSeen, via }  ◀── read ── gemini-proxy /servo-poweron
                                                         │
                         seen < 6 min ago → skip         │
                         otherwise → PUT "click" ────────┴──▶ /servo/command → ESP32
                         either way → /servo/lastRun + Discord
```

## Install (on the PC, once)

Copy this folder over, open PowerShell **as Administrator** in it:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

It copies `heartbeat.ps1` to `C:\ProgramData\servo-heartbeat\` and registers:

| Task | Trigger |
|---|---|
| Servo PC heartbeat | Mon-Fri 5:50 AM and 3:50 PM, every 1 min for 6 min |
| Servo PC heartbeat (boot) | At startup (retries ~2 min for the network) |

Both run as SYSTEM, so no window flashes and they work before login. Windows'
time zone must be Manila. Uninstall: `install.ps1 -Uninstall`.

## Data

```json
"servo": {
  "pc":      { "lastSeen": 1792633980000, "via": "repeat" },
  "lastRun": { "at": 1792634100000, "action": "skipped",
               "reason": "PC seen 1 min ago (repeat)", "pcLastSeen": 1792633980000 }
}
```

`lastSeen` is Firebase server time, so the PC clock doesn't matter. `via` is
`repeat`, `boot` or `install`.

## Gaps

- With Windows **Fast Startup** on, "Shut down" is really hibernate, and the
  startup task doesn't fire on the next power-on. The every-minute writes still
  cover anything already on by 5:54; only a power-on in the last minute or so
  before 5:55 is missed.
- If the schedule times change, change both the Cloud Scheduler job and the
  `Window "5:50AM"` / `"3:50PM"` lines in `install.ps1`.
- If `/servo/pc` can't be read, the endpoint does **not** click (a skipped
  morning beats turning off a running PC).
