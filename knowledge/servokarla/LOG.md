# Project LOG — `servokarla`

Chronological notes for ongoing work in `servokarla/`. **Newest first.** Append-only — don't rewrite past entries; if something changed, add a new entry that supersedes the old one.

**When to add an entry:** something material happened that isn't obvious from the diff — a decision with a reason, a dead end, a vendor email, a missed expectation, anything you'd want to remember next month when you reopen this. Skip routine "added a button" stuff; the commit log already covers that.

**Shape:**

```
## YYYY-MM-DD — Short title

1–3 sentences of context. Lead with what happened or what changed; include the *why* if it's not obvious from the code or commit message.
```

---

## 2026-11-02 — Karla's Wake-on-LAN board, with an OLED

Karla's copy of `servo/` on her own ESP32-C3 (the 0.42" OLED board, flashed on COM3). Separate everything so the two boards can't touch each other's PC on the shared LAN: RTDB `/servokarla/*`, UDP 40511, its own token, `KARLA-*` messages, her Realtek NIC's MAC `00:E0:4C:AD:18:BA`. The OLED shows PC ON/OFF + WiFi + clock, and follows a wake or shutdown with a timer until the PC confirms it. The board re-pings every 20 s so the display stays true. The Realtek driver has no "Enable PME" setting, but "Shutdown Wake-On-Lan" was already on. The first flash's `publishState` skipped unchanged values, so a `press` after the state was wiped left it null; commands now always publish. The `press` test passed. Karla still needs to test `click` both ways. The first cable was charge-only, so Windows never saw the board.
