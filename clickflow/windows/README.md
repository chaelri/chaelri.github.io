# ClickFlow for Windows

Windows port of the Mac app in `../Sources`: records, edits and schedules mouse-click macros, with the
same steps, the same run HUD, and the same `macros.json` format (an export from one imports into the other).
C# / .NET 8 WinForms, no Visual Studio needed.

## Build

```
winget install Microsoft.DotNet.SDK.8    # once
.\build.ps1            # bin\Release\net8.0-windows10.0.19041.0\ClickFlow.exe
.\build.ps1 test       # build, then the headless self-test (schedule maths, shortcuts, JSON, the repo's macros)
.\build.ps1 install    # publish to %LOCALAPPDATA%\Programs\ClickFlow + Start Menu shortcut
```

`install` never starts the app. On a PC with no macros yet it seeds them from `../macros/macros.windows.json`.

## The Mac macros (`../macros/macros.windows.json`)

Auto Clock-In / Auto Clock-Out, converted from `macros.json` and made inert on purpose:

- both macros' schedules are **off** (06:00 and 16:00 weekdays, as on the Mac),
- every step is **Show only**, so Run and Test only show markers,
- `cmd+w` became `ctrl+w`.

To go live on this PC: re-pick every click and the screenshot area (the numbers are Mac points from the
MacBook's display, not this PC's pixels), set the Discord webhook in Settings, switch each step back to
**Live** (leave step 6 "Clock-in!" Show only, as it is on the Mac), Preview it, then turn the schedule on.

## Differences from the Mac app

- **No permissions to grant.** Windows lets any app post input. It can't click into windows of apps running
  as administrator unless ClickFlow is too.
- **Coordinates are physical pixels** on the virtual desktop (per-monitor DPI aware), origin at the top-left
  of the primary display. Mac points don't carry over; re-pick after importing.
- **Shortcuts:** `cmd`/`⌘` mean Ctrl, `opt` means Alt, `win` is the Windows key. "Record keys" captures a combo.
- **Stop:** Esc during a run, or **Ctrl+Alt+.** from any app. With the input lock on, Alt+F4 also stops
  (and is swallowed so it doesn't close the app being driven). Ctrl+Alt+Del can't be blocked by anything.
- **Input lock** = low-level mouse/keyboard hooks that drop everything not stamped with ClickFlow's own
  `dwExtraInfo` signature. Windows removes a hook that stalls, and the hooks die with the process.
- **Screenshot area** reads text with Windows' own OCR (`Windows.Media.Ocr`, on-device). The HUD and markers
  use `WDA_EXCLUDEFROMCAPTURE`, so they never appear in a capture (or in your own screenshots of a run).
- **Tray, not menu bar.** Closing the window keeps it running in the tray, where schedules keep firing.
  "Start when I sign in" adds an HKCU Run entry (`--minimized`).
- **Open link in Chrome** finds `chrome.exe` via App Paths; falls back to the default browser.

## Files

`Src/` — `Models.cs` (steps, schedules, maths), `Json.cs` (Mac-compatible format), `Store.cs`,
`Engine.cs` (SendInput, key combos, Post clipboard, Chrome), `Runner.cs`, `Scheduler.cs`, `Recorder.cs`,
`InputLock.cs`, `ScreenText.cs`, `Discord.cs`, `Hud.cs`, `Overlays.cs` (markers, click ring), `Placer.cs`
(Pick target / box), `UI/` (main window, step cards, schedule dialog, history, settings), `SelfTest.cs`.

Data: `%APPDATA%\ClickFlow\` (`macros.json`, `history.json`, `scheduler-state.json`, `settings.json`,
`discord-webhook`). `CLICKFLOW_DATA_DIR=<folder>` points a test build somewhere else.

Flags: `--minimized`, `--preview-hud` (dry run that only shows markers), `--selftest [file]`,
`--set-discord-webhook <url> [--send-test]`.
