# ClickFlow

Personal macOS app that records, edits and schedules mouse-click macros. Built from
`~/Downloads/clickflow-app-spec.md`.

## Build

```
./build.sh            # build/ClickFlow.app
./build.sh install    # build, copy to /Applications, relaunch
./build.sh test       # build, then the headless self-test (schedule maths, shortcuts, JSON)
```

Xcode Command Line Tools only: `swiftc`, no Xcode project. The first build creates a
self-signed `ClickFlow Local Signing` identity in `~/Library/Keychains/clickflow-signing.keychain-db`
and adds that keychain to the user search list. Every build is signed with it, so the
Accessibility grant survives rebuilds.

## Use

- **Steps:** left / double / right click, move, wait, type text, key shortcut (`cmd+s`, `⌘⇧4`, `return`),
  open link in Chrome (new tab; default browser if Chrome is missing; `https://` added when left out),
  post clipboard (POSTs the clipboard text to a URL; defaults to `clickflow-hook`, which relays it to #clickflow),
  screenshot area (one step: captures a rectangle, always reads its text on-device, then optionally copies the text and/or
  posts to a Discord webhook directly, no Firebase: screenshot + message, or message only. The message is a template:
  `{text}` `{date}` `{time}` `{macro}`. The webhook URL is set in Settings › Discord and kept in
  `~/Library/Application Support/ClickFlow/discord-webhook` (mode 600), never in macros.json or exports).
- **Placing points and areas:** a floating target / dashed box that stays on top while you use other apps (⌘-Tab freely);
  drag it into place and press ✓ (✗ cancels). Adding a click or screenshot step opens it straight away.
- **Preview** (toolbar, ⌥⌘R): plays the macro without executing anything; purple markers show where each click
  lands or which area would be read. Skip jumps past the current step.
- **Live / Show only** (per step): a show-only step is never executed, even in a real run; it only shows its marker.
  Each card shows X / Y in points plus "Delay before". Pick, Test, drag to reorder, right-click to duplicate.
- **Pick:** crosshair overlay on every display. Click or ↩ captures, arrows nudge 1 pt (⇧ = 10), esc cancels.
  The loupe needs Screen Recording; without it picking still works.
- **Record:** global click monitor. Real gaps become Wait steps, and a second press upgrades the click to a double click.
- **Stop:** ⌃⌥⌘. from any app, or esc during a run. Waits are cancellable sleeps, so stopping is instant.
- **Schedules:** every day / weekday / weekend / custom days / once / interval, with optional date range,
  required app (running or frontmost) and minimum idle time. Missed runs either skip (logged) or run once.
  A 5-second "About to run" countdown with Cancel runs first.
- **Settings › Click accuracy test:** clicks a target on each display and reports where the click landed.

Data: `~/Library/Application Support/ClickFlow/` (`macros.json`, `history.json`, `scheduler-state.json`).
