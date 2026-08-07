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
                 Alert me on spikes    ✓
                 Spike is…             ▸
```

## Spike alerts

A long session eats the 5-hour window quietly — you stop watching, then look up
and it's at 75%. So the app keeps the last 15 minutes of session readings and
speaks up when the climb is steep:

```
   ▲ 75%         ← caret appears in the menu bar
   └ click →     ⚠︎  Usage jumped 12% in 15 min — now 75%
                 Consider /compact or starting a new session.
                                       (click above to dismiss)
```

Plus a system notification, so it reaches you even when you aren't looking at
the menu bar.

- **Default threshold: +10 points inside 15 minutes.** Change it under
  *Spike is…* (5 / 10 / 15 / 20), or turn the whole thing off with *Alert me on
  spikes*. Both persist in `UserDefaults`.
- **It won't nag.** One alert per 20 minutes, and the next one needs another
  full threshold's worth of ground gained — a plateau at 80% stays quiet.
- **The 5-hour rollover is not a spike.** When `resets_at` moves (or the
  percentage falls), the sample history is wiped, so the fresh window starts
  clean.
- The caret changes the *shape* of the menu bar item, not just its colour —
  that's what makes it register peripherally.

> The system notification goes out through `osascript display notification`,
> which is why it's attributed to **Script Editor**. A bare `swiftc` binary has
> no bundle identifier and `UNUserNotificationCenter` refuses to run without
> one — the alternative is an Xcode app project, which this deliberately isn't.
> If Script Editor's notifications are muted in System Settings the banner is
> silently dropped; the caret and the in-menu warning still work.

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

## In VS Code too

The same numbers in a VS Code sidebar panel, so they're on screen while you're
working rather than only when you look up at the menu bar:

```bash
cd claude-usage/vscode
./install.sh              # symlinks into ~/.vscode/extensions
./install.sh uninstall
```

Then **Cmd+Shift+P → "Developer: Restart Extension Host"** (not *Reload Window* —
a reload restarts the integrated terminal too, which kills any `claude` session
running in it).

An asterisk icon appears in the **activity bar**, below Explorer / Search / Source
Control / Run / Extensions, with the session percentage as its badge. Click it for
the panel:

```
   5%              SESSION · 5 HR
   ▬▬───────────────────────────
   resets 8:00 PM        in 3h 44m
   ──────────────────────────────
   Weekly · all models         16%
   ▬▬▬▬▬─────────────────────────
   resets Sun 8:00 PM     in 2d 6h

   Weekly · Fable               0%
   ──────────────────────────────
   resets Sun 8:00 PM     in 2d 6h

   Updated just now        Refresh
```

The 5-hour window leads at display size — it's the one that runs out mid-task —
with the weekly limits as rows under it. Every limit gets a filled meter, its
reset clock time, and how long that is from now. The title bar of the panel has
New Claude Session, Refresh, and a link out to claude.ai.

Meters fill in **Claude terracotta `#D97757`** — the same value the menu bar app
tints its asterisk with, hardcoded rather than read from a theme variable,
because it's the product's colour and shouldn't drift when the theme does. Past
75% they go amber and past 90% red, the hero percentage taking the colour with
them, so the panel changes character across the room before you read a digit.
Those two warning tiers *are* theme variables (`charts.yellow` / `charts.red`) —
caution and trouble are the editor's vocabulary, and they have to stay legible
against whatever background the theme paints.

The Refresh link is terracotta too, stepped darker (`#B4552F`) on light themes:
`#D97757` clears 5:1 against a dark editor but only 3.2:1 against white, which is
under the bar for 11px text. VS Code stamps `vscode-light` / `vscode-dark` /
`vscode-high-contrast` on the webview `<body>`, so one CSS rule per class covers
it — same hue, walked down in lightness, not a different colour.

### Matching the rest of VS Code

The panel is terracotta on its own, but the editor around it stays blue —
activity bar badges, focus rings, links. To bring those across, in user
`settings.json`:

```jsonc
"workbench.colorCustomizations": {
  "focusBorder": "#d97757",
  "activityBarBadge.background": "#d97757",
  "badge.background": "#d97757",
  "button.background": "#d97757",
  "progressBar.background": "#d97757",
  "activityBar.activeBorder": "#d97757",
  "textLink.foreground": "#e08a6b"     // a step lighter: text, on light widgets
}
```

Keep it to **accents**. Semantic colours — git decorations, error and warning
squiggles, chart series, terminal ANSI blue — mean something specific, and
recolouring them to match a brand makes the meaning a lie.

**The badge is a number, not text** — that's an activity bar limitation, not a
choice. So it reads `3`, never `3%`, and **a 0 hides the badge entirely** (VS Code
suppresses zero badges), which is why a freshly-rolled-over session shows a bare
icon. The panel always has the exact figure.

Prefer text? `claudeUsage.showStatusBar: true` brings back a status bar item
reading `⏻ 3%`, and the two surfaces can run together.

### New Claude Session button

The terminal icon in that panel's title bar (also **Claude Usage: New Claude
Session** in the command palette) opens a fresh terminal at the workspace root
and starts:

```
claude --dangerously-skip-permissions
```

Always a new terminal, never the active one — that one may be mid-command, and
typing into a running process is worse than an extra tab. Multi-root workspaces
use the first folder, since that's where `CLAUDE.md` is read from.

The command is `claudeUsage.launchCommand`, spelled out in settings rather than
hidden behind a boolean: the flag makes tool calls run without prompting, leaning
on the `PreToolUse` guard hook in `~/.claude/settings.json` to block destructive
ones. Clear the flag there for a normally-prompting session.

No default keybinding ships with it — bind one yourself in **Preferences →
Keyboard Shortcuts** against `claudeUsage.launch` if you want it on a chord.

**It scrubs inherited session markers.** Launch VS Code from inside a Claude Code
session — a `code .` in its terminal — and the window inherits that session's
`CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_CHILD_SESSION` and friends,
handing them to every terminal it spawns. A session started there reads as a
*child* of the original and turns transcript saving off, so it won't appear in
`claude --resume` later. The button removes anything matching
`/^CLAUDE(CODE)?(_|$)/` from the terminal's environment (a `null` value in
`TerminalOptions.env` unsets a variable), matched by pattern so new markers are
covered without editing a list. Variables your shell profile sets are re-applied
afterwards, so only the inherited ones are dropped.

That only fixes terminals this button opens. Terminals you open by hand in an
inheriting window still carry the markers — reopen VS Code from the Dock or
Spotlight to clear it at the source.

No packaging step: VS Code loads any folder under `~/.vscode/extensions` that has
a `package.json`, so a symlink to the repo copy is the whole install — no `.vsix`,
no `vsce`, no npm, no build. Edit `extension.js` and reload the window.

### The panel is a webview, not a tree

It started as a `TreeView`, which is the cheap way to put rows in the sidebar —
and the reason the first version looked like this:

```
   ▮▯▯▯▯▯▯▯▯▯ Session · 5 hr — 5%       resets …
   ▮▮▯▯▯▯▯▯▯▯ Weekly · all models — 16%…
```

A `TreeItem` renders one line of label text plus an icon, and nothing else. So
the bar had to be block characters, which sit at their own widths in the
proportional UI font and can't be coloured by fill level; the reset time had to
go in `description`, which is what VS Code drops first when the row overflows —
at any normal sidebar width both it and the trailing `%` fell into an ellipsis.
Three limits took three cramped lines and still didn't fit.

A webview costs an HTML document and a `postMessage` per refresh, and gets real
geometry back: a meter that's a `<div>` with a width, text that can wrap or
truncate where you choose, and a hierarchy — session large, weekly small.

The document is static and rendered once; every update is a `postMessage`, with
the display strings (labels, reset times, countdowns) computed extension-side so
the page stays a pure renderer. It runs under a locked-down CSP — `default-src
'none'`, a per-load nonce on the one `<style>` and the one `<script>`, no
network, no local resources.

**That CSP is why the fill is set from script, not markup.** The obvious way to
draw a meter is `<i style="width:7%">`, and under this policy every one of those
is silently dropped — each bar renders empty at any percentage. A nonce on
`style-src` makes the browser *ignore* `'unsafe-inline'`, and `'unsafe-inline'`
is the only thing that ever permits inline style **attributes**, since there's
nowhere to write a nonce on one. So the percentage rides along as `data-pct` and
a `requestAnimationFrame` sets `el.style.width` — CSP doesn't police CSSOM.
Deferring it a frame also gives the CSS transition a width of 0 to animate from,
so the bars sweep in on the first reading instead of snapping.

Worth knowing because the failure is silent and looks like a data bug: correct
percentages in the text, every bar at zero. It survived a headless render of the
page during development for the dumbest possible reason — the preview harness
stripped the CSP meta tag.

`retainContextWhenHidden` is set, which is normally a memory-cost thing to avoid.
Here it's load-bearing: **the activity bar badge hangs off the `WebviewView`
object**, and without retention VS Code disposes that the moment you collapse the
sidebar — taking the number off the icon exactly when the panel isn't on screen
to show it. If the view hasn't resolved at all (an extension-host-only restart
after the view contribution changed, since VS Code builds its view registry at
window load), the status bar item appears whatever `showStatusBar` says, rather
than leaving nothing on screen.

Upgrading from the tree version needs one full **Developer: Reload Window** —
restarting just the extension host leaves the old tree view registered.

Settings: `claudeUsage.pollSeconds` (300), `claudeUsage.showStatusBar` (false),
`claudeUsage.showWeekly` (false), `claudeUsage.position` (`left` — bottom-left
next to the branch name, or `right`), `claudeUsage.priority` (100 — higher sits
further **left**, on either end). Changes apply on save: status bar alignment is
fixed at creation time, so the item is disposed and rebuilt rather than needing a
window reload. The status bar item turns amber past 75% and red past 90% — the
same thresholds as the panel meters and the menu bar, so a colour means one thing
across all three surfaces.

`claudeUsage.showBars` and `claudeUsage.barWidth` are gone as of 1.3.0; they
described the block-character bar the webview replaced. Leftovers in your
`settings.json` are ignored — delete them.

The activity bar icon is `media/claude.svg` — the Claude asterisk redrawn as
eleven slim leaf-shaped spokes at uneven angles and lengths, in `currentColor` so
VS Code can theme it for active and inactive states.

Redrawn rather than copied from `Claude.app` for two reasons, not just one:

- **This repo is public**, so Anthropic's asset shouldn't be committed into it.
- **The shipped file is a black template PNG.** macOS inverts template images for
  the menu bar; VS Code does not, so the real asset would render as a black icon
  on a dark activity bar — effectively invisible. A themeable SVG is the only
  form that works in both places.

The Swift app sidesteps both by reading the PNG out of `/Applications/Claude.app`
at runtime and tinting it itself — which an extension folder can't do, since the
icon is resolved from a static path in `package.json`.

## When it goes missing from the menu bar

Under the notch there isn't room for every status item, and macOS hides them from
the left — the slot nearest the app menus is culled first, so a leftmost item
comes and goes depending on which app is frontmost and how wide its menus are.

Two defences:

1. **Drag it right.** Hold **⌘** and drag the item toward Control Center. The
   status item sets an `autosaveName`, so the position is written to
   `~/Library/Preferences/claude-usage.plist` and survives relaunch and reboot.
   Without that name there's no saved slot and every launch lands back at the far
   left, in the first position to be dropped.
2. **Compact (number only)** in the menu drops the asterisk and keeps the
   percentage — about 20 pt narrower, which is often the difference between
   fitting and being hidden.

The VS Code status bar has no such contention, which is the other reason to run
both.

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
├── claude-usage.swift   ← NSStatusItem, ~530 lines, no dependencies
├── install.sh           ← swiftc build + per-user LaunchAgent
├── vscode/              ← VS Code twin (same endpoint, same labels)
│   ├── extension.js         ← plain CommonJS, no build, no npm deps
│   ├── package.json
│   ├── media/claude.svg     ← activity bar icon
│   └── install.sh           ← symlink into ~/.vscode/extensions
└── README.md
```

Built with `swiftc -O -parse-as-library` (the source uses `@main`). Xcode Command
Line Tools are enough — no Homebrew, no SwiftBar, no Xcode project.

## Related

`mac-toggle/menubar/` is the sibling menu bar app (display-sleep toggle). Same
shape: a single Swift file, a per-user LaunchAgent, no root.
