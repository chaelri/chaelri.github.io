# claude-usage/ — Summary

**Last updated:** 2026-07-30
**Status:** 🟢 Active (built 2026-07-30)

Menu bar indicator showing Claude plan usage as a live percentage. Built because
the Claude desktop app's own menu item requires a right click before it reveals
anything — Charlie wanted the number itself visible at a glance, with real clock
times and a manual refresh.

## File structure

```
claude-usage/
├── claude-usage.swift   (~260 lines — NSStatusItem, no dependencies)
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

## Related

- `mac-toggle/menubar/` — sibling menu bar app (display-sleep toggle), same
  shape: one Swift file, per-user LaunchAgent, no root.
