# claude-usage/ — Summary

**Last updated:** 2026-08-06
**Status:** 🟢 Active (built 2026-07-30; spike alerts added 2026-08-06)

Menu bar indicator showing Claude plan usage as a live percentage. Built because
the Claude desktop app's own menu item requires a right click before it reveals
anything — Charlie wanted the number itself visible at a glance, with real clock
times and a manual refresh.

## File structure

```
claude-usage/
├── claude-usage.swift   (~510 lines — NSStatusItem, no dependencies)
├── install.sh           (swiftc build + per-user LaunchAgent, no sudo)
└── README.md
```

## Tech

- **Swift + Cocoa**, single file, compiled with
  `swiftc -O -parse-as-library` (required: the source uses `@main`). Xcode
  Command Line Tools suffice — no Homebrew, SwiftBar, or Xcode project.
- **LaunchAgent** `com.chaelri.claudeusage` in `~/Library/LaunchAgents`,
  `RunAtLoad` + `KeepAlive`, logs to `~/Library/Logs/claude-usage.log`.
- `setActivationPolicy(.accessory)` — menu bar only, no Dock icon, no window.

## Data source

```
GET https://api.anthropic.com/api/oauth/usage
    Authorization: Bearer <claudeAiOauth.accessToken>
    anthropic-beta: oauth-2025-04-20
```

Token comes from `security find-generic-password -s "Claude Code-credentials" -w`
(login keychain), parsed as JSON. Response shape (verified 2026-07-30):

- `limits[]` — rows with `kind` (`session` / `weekly_all` / `weekly_scoped`),
  `percent`, `resets_at`, and for scoped rows a `scope.model.display_name`
- flat `five_hour` / `seven_day` objects with `utilization` + `resets_at`
  (parser falls back to these)
- plus `extra_usage`, `spend`, and several null-valued codename keys

**Endpoint discovery:** `strings <claude binary> | grep -oE '"/api/[a-z0-9_/-]*(usage|limit)[a-z0-9_/-]*"'`
on `~/.local/share/claude/versions/<v>`. The same sweep shows
`anthropic-ratelimit-unified-*` response headers, the other mechanism Claude Code
uses for limit state.

## Conventions / quirks

- **Undocumented internal endpoint.** Not a published API; can change or vanish.
  Every failure is surfaced (dash title + reason in the menu) rather than showing
  a stale number as if it were current.
- **Costs no tokens** — account metadata, not inference. Safe to poll (5 min,
  plus on menu open, plus manual Refresh).
- **Token is re-read every refresh, never cached** — Claude Code rotates it. 401
  renders "Login expired — run `claude` once to refresh it".
- **First run pops a keychain prompt** ("claude-usage wants to use your
  confidential information"). Must be **Always Allow** or the title stays a dash.
  This is inherent: an unsigned local binary reading another app's keychain item.
- **Never run `install.sh` with sudo** — it needs Charlie's keychain, not root's;
  the script refuses.
- **Title uses monospaced digits** so the menu bar doesn't jitter as the number
  changes. Orange at ≥75%, red at ≥90%.
- **Reset times are absolute**, not relative — "resets 3:20 AM · in 3h 44m",
  "resets tomorrow 8:00 PM", "resets Sun 8:00 PM". The whole point was to not
  have to do the arithmetic.
- **No local cache exists to read instead.** Checked: the Claude app's
  `Local Storage`/`Session Storage` leveldb hold no `utilization` / `resets_at`
  fields, and `~/.claude/` has no usage cache. A live call is the only route.

## Spike alerts (added 2026-08-06)

Built because a long session burns the 5-hour window quietly — Charlie stops
watching, then gets startled by a 75%. The app keeps a rolling 15-minute history
of session readings (`samples: [(date, percent)]`) and fires when the climb is
steep.

- **Threshold:** default +10 points inside 15 min. User-changeable via the
  *Spike is…* submenu (5/10/15/20), stored in `UserDefaults` under
  `spikeThreshold`; the *Alert me on spikes* toggle is `spikeAlerts` (defaults
  on when unset — note `object(forKey:) as? Bool ?? true`, not `bool(forKey:)`).
- **Three surfaces:** a `▲` caret prepended to the menu bar title (shape change,
  not just colour — that's what registers peripherally), an orange warning
  banner at the top of the menu (click to dismiss), and a system notification.
- **`osascript display notification`, not `UNUserNotificationCenter`.** A bare
  `swiftc` binary has no bundle identifier and UNUC refuses to run without one.
  Cost: the banner is attributed to Script Editor, and it's silently dropped if
  Script Editor's notifications are muted. The caret + in-menu banner are the
  always-works fallback. Fixing this properly means an Xcode app project, which
  this project deliberately isn't.
- **Anti-nag:** 20-min cooldown *and* a `spikeFloor` requiring another full
  threshold of ground gained. A plateau at 80% stays quiet.
- **Rollover is not a spike:** when `resets_at` shifts >60s or the percentage
  drops, `samples` / `spike` / `lastSpikeAt` / `spikeFloor` are all wiped so the
  fresh 5-hour window starts clean.
- **`menu.autoenablesItems = false`** was set in `rebuild()` so the explicit
  `isEnabled` on the *Spike is…* row actually sticks.

## install.sh quirk

`launchctl bootout` returns *before* the service is fully gone; bootstrapping
into that gap fails with `Bootstrap failed: 5: Input/output error` and leaves
nothing running (hit on the 2026-08-06 reinstall). `install.sh` now polls
`launchctl print` for up to 4s between bootout and bootstrap.

Reinstalling replaces the unsigned binary, so macOS re-prompts for keychain
access — **Always Allow** again or the title sits at a dash.

## Related

- `mac-toggle/menubar/` — sibling menu bar app (display-sleep toggle), same
  shape: one Swift file, per-user LaunchAgent, no root.
