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

- **Steps:** left / double / right click, move, wait, type text, key shortcut (`cmd+s`, `⌘⇧4`, `return`).
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
