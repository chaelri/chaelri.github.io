# claude-usage

Claude plan usage as a **menu bar percentage**. The number is the title itself,
so it's readable without clicking — that's the whole reason this exists, since
the stock Claude menu item needs a right click before it shows anything.

```
   ▓ 9%          ← always visible in the menu bar
   └ click →     Session · 5 hr        9%
                 ████────────────────  resets 3:20 AM · in 3h 44m
                 Weekly · all models   7%
                 ██──────────────────  resets Sun 8:00 PM · in 2d
                 Weekly · Fable        0%
                 Refresh  (Updated just now)
                 Usage settings…
```

## Install

```bash
cd claude-usage
./install.sh              # no sudo
./install.sh uninstall
```

**Approve the keychain prompt on first refresh** — "claude-usage wants to use
your confidential information" → **Always Allow**. It's reading the OAuth token
Claude Code already stores in your login keychain. Decline it and the title
stays a dash with the reason in the menu.

## How it gets the number

```
GET https://api.anthropic.com/api/oauth/usage
    Authorization: Bearer <accessToken from keychain "Claude Code-credentials">
    anthropic-beta: oauth-2025-04-20
```

Response carries a `limits[]` array (`session`, `weekly_all`, `weekly_scoped`
with a model scope) each holding `percent` and `resets_at`, plus flat
`five_hour` / `seven_day` objects the parser falls back to.

- **Costs no tokens.** Account metadata, not inference — polling it doesn't
  consume the budget it reports.
- **The token is re-read from the keychain on every refresh**, never cached in
  the process, because Claude Code rotates it. A 401 shows "Login expired — run
  `claude` once to refresh it" rather than a stale number.
- Auto-refresh every 5 minutes, plus on every menu open, plus a manual Refresh
  item showing how old the data is.

> **This is an undocumented internal endpoint**, found by inspecting the Claude
> Code binary (`strings | grep '/api/.*usage'`). It is not a published API and
> can change or vanish without notice. Every failure mode is visible — dash in
> the menu bar, explanation in the menu — so it can never quietly show a number
> that isn't true.

## Reset times are absolute

The API returns ISO timestamps; the menu shows the actual local clock time plus
the countdown — "resets 3:20 AM · in 3h 44m", "resets tomorrow 8:00 PM", "resets
Sun 8:00 PM". A bare "resets in 3 hr" makes you do the arithmetic yourself.

## Files

```
claude-usage/
├── claude-usage.swift   ← NSStatusItem, ~260 lines, no dependencies
├── install.sh           ← swiftc build + per-user LaunchAgent
└── README.md
```

Built with `swiftc -O -parse-as-library` (the source uses `@main`). Xcode Command
Line Tools are enough — no Homebrew, no SwiftBar, no Xcode project.

## Related

`mac-toggle/menubar/` is the sibling menu bar app (display-sleep toggle). Same
shape: a single Swift file, a per-user LaunchAgent, no root.
