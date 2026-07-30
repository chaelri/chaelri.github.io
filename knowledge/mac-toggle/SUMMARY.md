# mac-toggle/ — Summary

**Last updated:** 2026-07-30
**Status:** 🟢 Active (built 2026-07-30)

Firebase-driven remote for the Lock Screen / sleep settings on Charlie's MacBook
Pro (macOS 26.5.2, "Charlie's MacBook Pro"). Mirrors the System Settings → Lock
Screen pane on the phone. Architecturally it is the `autoclicker/` servo pattern
with macOS as the actuator instead of an ESP32.

## File structure

```
mac-toggle/
├── index.html                          (~286 lines — the live remote: ONE toggle, plain CSS)
├── README.md                           (install, per-row command table, RTDB security)
├── CLAUDE.md
└── agent/
    ├── mac-toggle.py                   (~560 lines — stdlib-only agent: SSE → reconcile → publish)
    ├── com.chaelri.mactoggle.plist     (root LaunchDaemon, KeepAlive, /var/log/mac-toggle.log)
    └── install.sh                      (install | uninstall | set-admin-password | clear-admin-password)
```

## Tech

- **Front-end:** plain HTML + hand-written CSS, Inter only. **No Tailwind and no
  icon font** — the first build (a full settings grid mirroring the macOS pane)
  used Tailwind's `.hidden` on Material Symbols spinner spans, and the Google
  stylesheet's own `display:inline-block` beat it, so every row spinner stuck on.
  Rewritten 2026-07-30 as a single toggle at Charlie's request: **Never ↔ 5
  minutes**, applied to battery + power adapter together in one `update()`.
  Amber = Never (display lit), the switch is the whole interface.
- **Agent:** `/usr/bin/python3` (3.9.6, ships with macOS) — **stdlib only**, no pip,
  no venv. `urllib` for the RTDB SSE stream and REST writes, `subprocess` for
  `pmset` / `defaults` / `sysadminctl` / `caffeinate` / `launchctl`.
- **Data:** Firebase RTDB `test-database-55379` (asia-southeast1), namespace `/mac-toggle`.
- **Auth:** phone uses anonymous sign-in; the agent uses unauthenticated REST
  (the DB currently allows it).

## Firebase contract

| Path | Writer | Meaning |
|---|---|---|
| `/mac-toggle/desired` | phone | wanted settings; partial writes are normal (one key per tap) |
| `/mac-toggle/state` | Mac | observed truth + `host`, `user`, `screenLockAvailable`, `updatedAt` heartbeat (~45 s) |
| `/mac-toggle/command` | phone | transient action: `lock` / `displayoff` / `sleep` / `refresh`; agent clears it |

Same two-path split as `/autoclicker/{command,state}`. The SSE handler ignores
events whose path starts with `/state` — otherwise the agent would react to its
own publish forever.

## Managed settings

| Key | Mechanism | Needs root |
|---|---|---|
| `keepAwake` | held `caffeinate -dimsu` child process | no |
| `displaySleepAC` / `displaySleepBatt` | `pmset -c\|-b displaysleep <min>` | yes |
| `systemSleepAC` / `systemSleepBatt` | `pmset -c\|-b sleep <min>` | yes |
| `screenLock` | `sysadminctl -screenLock <secs\|off> -password` | yes + keychain opt-in |
| `showPasswordHints` | `RetriesUntilHint` 3/0 | yes |
| `showFullName` | `SHOWFULLNAME` | yes |
| `powerButtons` | `{Sleep,Restart,ShutDown,PowerOff}Disabled` | yes |
| `lockMessage` | `LoginwindowText` (delete = off) | yes |

Choice lists (`SLEEP_CHOICES`, `LOCK_CHOICES`) are enforced server-side in the
agent and duplicated as `<option>` values in `index.html` — keep them in sync.

## Conventions / quirks

- **First run seeds, never applies.** Empty `/desired` → agent copies the current
  machine state into it, so installing changes nothing. Verified on 2026-07-30:
  seeded values matched the System Settings pane exactly (display Never/Never,
  screenLock 300 s, user list, hints off).
- **`keepAwake` is intentionally not a persisted setting** — an assertion dies with
  the agent, so a crash can't leave the Mac awake indefinitely. It's the preferred
  row over setting displaysleep to Never.
- **Root daemon + `launchctl asuser`.** `pmset` and `/Library/Preferences` need
  root; window-server work runs as the console user. `CGSession` was removed in
  macOS 26 — `open -a ScreenSaverEngine` is the lock path now.
- **`sysadminctl -screenLock` needs a password even as root**, so that row is
  read-only until `sudo ./install.sh set-admin-password` stores it in the System
  keychain. `state.screenLockAvailable` drives the disabled state in the UI.
- **`-screenLock` is PER-USER — always run it through `sh_as_user()`.** Caught on
  install day 2026-07-30: the first root LaunchDaemon build called
  `sysadminctl -screenLock status` directly, got root's value (`off` → -1), and
  published "Never" while the pane actually said "After 5 minutes". Both the read
  (`screenlock_delay()`) and the write now go through `launchctl asuser`. If it
  can't be read (nobody at the console), state publishes `null` rather than
  guessing — the remote then leaves that control untouched instead of lying.
  Contrast with the `com.apple.loginwindow` keys, which are `/Library`-level and
  are correctly read/written as root.
- **The UI holds a 12 s pending window**: optimistic paint + a sweeping hairline,
  then either the state echo confirms it or it reverts with "no response from the
  Mac — it may be asleep". If the two power sources ever disagree (changed in
  System Settings directly), the page shows "Mixed" with both values instead of
  picking one to display.
- **`pmset` does NOT clamp `sleep` to `displaysleep`** — verified 2026-07-30:
  displaysleep 5 alongside sleep 1 was accepted unchanged. This Mac has
  `sleep 1` on both sources, harmless while displaysleep is Never but potentially
  surprising in 5-minute mode. `systemSleepAC` / `systemSleepBatt` exist in the
  agent if that needs folding into the toggle later.
- **Not linked from the root hub `index.html`** — the RTDB path is unauthenticated,
  so it isn't advertised publicly. See README → "Lock the RTDB path down".
- **Hostile-input posture:** whitelisted keys only, list-args (never `shell=True`),
  ints clamped to the choice lists, `lockMessage` stripped of control characters
  and capped at 200 chars.

## Related projects

- `autoclicker/`, `aircon/`, `pocket-remote/` — same Firebase remote-control
  pattern; this one swaps the ESP32 for macOS.
- Shares `test-database-55379` with those and the other repo apps.
