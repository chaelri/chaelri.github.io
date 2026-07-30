# mac-toggle/ — Project Context for Claude

Firebase-driven remote for Charlie's MacBook Pro lock/sleep settings. Same
architecture as `autoclicker/` and `aircon/`, with macOS in place of the ESP32:
the phone writes to `/mac-toggle/desired`, a root LaunchDaemon reconciles the
machine and mirrors observed truth to `/mac-toggle/state`.

## Quick map

```
mac-toggle/
├── index.html    ← the live remote (GitHub Pages /mac-toggle/) — macOS System Settings look
├── README.md     ← install steps, per-row command table, RTDB security notes
└── agent/
    ├── mac-toggle.py               ← "firmware": RTDB SSE stream → reconcile → publish
    ├── com.chaelri.mactoggle.plist ← root LaunchDaemon (KeepAlive, logs to /var/log/mac-toggle.log)
    └── install.sh                  ← install | uninstall | set-admin-password
```

There is no `phone/` subdir — unlike the hardware projects there's no build doc to
host, so the remote itself lives at `index.html`.

## What to know before editing

- **The remote is ONE toggle on purpose** (rewritten 2026-07-30 at Charlie's
  request — the original settings-grid mirrored the whole macOS pane and he
  didn't want it). Never ↔ 5 minutes, both power sources moved together in a
  single `update()`. The agent still supports every key in `WRITABLE`; they're
  just not on the page. Don't re-add rows unless asked.
- **No Tailwind, no icon font on this page.** The grid version used Tailwind's
  `.hidden` on JS-created `<span class="material-symbols-outlined">` spinners, and
  the Google Material Symbols stylesheet's own `display:inline-block` beat it —
  every row's spinner stuck on. Plain CSS now; keep it that way.
- **Any value the UI sends must be in the agent's choice lists** (`SLEEP_CHOICES` /
  `LOCK_CHOICES`). Anything outside them is dropped — that's the security model,
  not a bug to work around.
- **The Mac is authoritative.** The UI paints from `/mac-toggle/state`, optimistically
  flips the control, and holds a 12 s pending window; if state doesn't echo the
  value it reverts and says "no response". Never make the UI its own source of truth.
- **Never write `/mac-toggle/state` from the phone**, and never let the agent react
  to its own `/state` echo — the SSE handler skips paths starting with `/state`
  specifically to avoid an infinite apply loop.
- **First run seeds, never applies.** Empty `/desired` → agent copies current
  machine state into it. Preserve that on any refactor; it's what makes installing safe.
- **Untrusted input.** Everything from Firebase is hostile: list-args only, no
  `shell=True`, ints clamped to choice lists, `lockMessage` stripped of control
  chars and capped at 200. The DB is world-writable today (see README).
- **`keepAwake` is deliberately not a saved setting** — it's a held `caffeinate -dimsu`
  child process, so a crashed agent can't leave the Mac awake forever. Don't
  "simplify" it into `pmset displaysleep 0`.
- **Root daemon, user GUI.** `pmset` and `/Library/Preferences` writes need root;
  anything touching the window server (screen saver) goes through `sh_as_user()`
  → `launchctl asuser <uid> sudo -u <user>`. `CGSession` no longer exists on
  macOS 26 — `open -a ScreenSaverEngine` is the lock path.
- **`sysadminctl -screenLock` is per-user, both directions.** Reading it as root
  returns root's value (`off`), not Charlie's — that shipped as a bug on day one
  and made the remote report "Never" against a real "After 5 minutes". Keep both
  the status read and the write inside `sh_as_user()`. Unreadable → publish `null`,
  never a guessed default.
- **Not linked from the root hub page** on purpose: the RTDB path is unauthenticated,
  so don't advertise it publicly.
- Reinstall after editing the agent: `sudo ./install.sh` (it re-copies and kickstarts).

## Auto-loaded knowledge

- @../knowledge/mac-toggle/SUMMARY.md
