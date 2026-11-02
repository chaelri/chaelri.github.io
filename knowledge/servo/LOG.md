# Project LOG — `servo`

Chronological notes for ongoing work in `servo/`. **Newest first.** Append-only — don't rewrite past entries; if something changed, add a new entry that supersedes the old one.

**When to add an entry:** something material happened that isn't obvious from the diff — a decision with a reason, a dead end, a vendor email, a missed expectation, anything you'd want to remember next month when you reopen this. Skip routine "added a button" stuff; the commit log already covers that.

**Shape:**

```
## YYYY-MM-DD — Short title

1–3 sentences of context. Lead with what happened or what changed; include the *why* if it's not obvious from the code or commit message.
```

---

## 2026-11-02 — Wake-on-LAN replaces the servo press

The ESP32-C3 now runs `servo/firmware/wol-power/wol-power.ino` instead of `servo-sweep.ino`. It uses the same `/servo/command` path and commands, so Cloud Scheduler, `/servo-poweron`, the heartbeat and the phone page didn't change. A `click` broadcasts a UDP ping (port 40510). If `servo/pc-power/listener.ps1` answers, the PC is on and gets told to shut down. If nothing answers, the ESP32 sends a magic packet to `E0:D5:5E:6D:49:E3`. `press` only wakes the PC, `release` only shuts it down, and auto mode only wakes. The Intel I211 adapter had **Enable PME off**, which blocks waking from a full shutdown, so `install.ps1` turns it on. It was flashed with `arduino-cli compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc --upload -p COM3`. Charlie tested `click` both ways and it shut the PC down and woke it. Full notes: `servo/WAKE_ON_LAN_SESSION.md`.

The scheduled 5:55/3:55 run won't shut down a PC that's already on. `/servo-poweron` only writes `click` if `/servo/pc.lastSeen` is over 6 minutes old, and `servo/pc-heartbeat` writes it every minute from 5:50 to 5:55, from 3:50 to 3:55, and at boot. The leftover risk is a PC that's on but whose heartbeat failed (network down, task broken). That PC would get `click`, which now means a clean shutdown. Sending `press` from `/servo-poweron` instead would remove that risk, but it hasn't been changed.

<!-- Add new entries above this line -->
