# Project LOG — `servo`

Chronological notes for ongoing work in `servo/`. **Newest first.** Append-only — don't rewrite past entries; if something changed, add a new entry that supersedes the old one.

**When to add an entry:** something material happened that isn't obvious from the diff — a decision with a reason, a dead end, a vendor email, a missed expectation, anything you'd want to remember next month when you reopen this. Skip routine "added a button" stuff; the commit log already covers that.

**Shape:**

```
## YYYY-MM-DD — Short title

1–3 sentences of context. Lead with what happened or what changed; include the *why* if it's not obvious from the code or commit message.
```

---

## 2026-11-04 — Board stayed deaf with WiFi up: Firebase stream connect kept failing

Seen on one boot: WiFi fine (RSSI -31), LAN ping to the PC fine, but every Firebase stream connect failed about every 24 s, `/servo/state` stayed null and commands sat unread. The same firmware then connected in 2 s on 9 later boots, so the failure did not reproduce and the root cause is unconfirmed. A diagnostic sketch ruled out TX power (8.5, 15 and 19.5 dBm all equal), DNS and TLS from a fresh client. The one lead: internet TCP stalled for the first ~10 s after joining WiFi on one boot, so a failed first connect may have stuck the reused global client. Now the stream uses a fresh client per attempt, reboots after 6 failed connects in a row (~2 min, tested by pointing at a dead host), skips the 2 s auto poll while down, and logs the error and heap. If it recurs, read the `Stream connect failed` line on COM3 before anything else. Opening the port can reset the board, which wipes the evidence.

## 2026-11-03 — WiFi self-recovery on the WoL board

The board was seen powered but off WiFi while the network was fine. `wol-power.ino` now runs at 8.5 dBm TX power, because the C3 SuperMini antenna often fails to associate at full power. When WiFi is down it retries every 5 s, resets the radio after 1 min and reboots after 3 min. When WiFi is up but Firebase goes quiet, it reconnects the stream after 90 s, resets the radio after 3 min and reboots after 6 min. A 60 s task watchdog catches hangs. There is deliberately no daily reboot: a reboot near 5:55/3:55 would drop that click as a stale snapshot.

## 2026-11-02 — Wake-on-LAN replaces the servo press

The ESP32-C3 now runs `servo/firmware/wol-power/wol-power.ino` instead of `servo-sweep.ino`. It uses the same `/servo/command` path and commands, so Cloud Scheduler, `/servo-poweron`, the heartbeat and the phone page didn't change. A `click` broadcasts a UDP ping (port 40510). If `servo/pc-power/listener.ps1` answers, the PC is on and gets told to shut down. If nothing answers, the ESP32 sends a magic packet to `E0:D5:5E:6D:49:E3`. `press` only wakes the PC, `release` only shuts it down, and auto mode only wakes. The Intel I211 adapter had **Enable PME off**, which blocks waking from a full shutdown, so `install.ps1` turns it on. It was flashed with `arduino-cli compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc --upload -p COM3`. Charlie tested `click` both ways and it shut the PC down and woke it. Full notes: `servo/WAKE_ON_LAN_SESSION.md`.

The scheduled 5:55/3:55 run won't shut down a PC that's already on. `/servo-poweron` only writes `click` if `/servo/pc.lastSeen` is over 6 minutes old, and `servo/pc-heartbeat` writes it every minute from 5:50 to 5:55, from 3:50 to 3:55, and at boot. The leftover risk is a PC that's on but whose heartbeat failed (network down, task broken). That PC would get `click`, which now means a clean shutdown. Sending `press` from `/servo-poweron` instead would remove that risk, but it hasn't been changed.

<!-- Add new entries above this line -->
