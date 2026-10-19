# ClickFlow — summary

macOS click-macro recorder/editor/scheduler. SwiftUI app shell + AppKit panels, built with `swiftc` (CLT only).

## Files (`clickflow/Sources/`)
- `Models.swift` — Step / Macro / Schedule / Conditions / RunRecord, schedule maths (`nextOccurrence`), formatters.
- `Store.swift` — JSON persistence (Application Support/ClickFlow), import/export, AppState (sidebar selection).
- `Engine.swift` — `Geo` (Quartz top-left points ↔ AppKit bottom-left), `ClickEngine` (CGEvent posting), `KeyCombo` parser.
- `System.swift` — permissions monitor, SMAppService login item, screen-lock/idle checks, IOPM assertions, Carbon hotkey ⌃⌥⌘., WindowManager.
- `Runner.swift` — one run at a time; scheduled runs queue and start immediately (no countdown); preflight `blockReason`; logs history.
- `Scheduler.swift` — 1 s tick; per-schedule persisted `lastCheck`; pure `decide()` → fire / missed (90 s grace).
- `Recorder.swift`, `Picker.swift`, `Panels.swift` (HUD, click ring, accuracy test), `SelfTest.swift`, `Views/`.

## Quirks
- **`@State` is a macro in the macOS 26 SDK and its plugin ships only with Xcode.** `Views/Compat.swift` aliases `ViewState = SwiftUI.State`; use `@ViewState`, never `@State`.
- **Stable signing:** `build.sh` self-signs with a cert in its own keychain (must be on the user search list or codesign reports "no identity found"). DR = `certificate leaf = H"aae474…"`, so the TCC grant sticks.
- Coordinates are stored in global Quartz points (y down, origin top-left of the main display; negative on left/upper displays). Picks and recordings are rounded to whole points.
- The HUD is a non-activating panel that never becomes key (typing steps keep their target). It hides itself if a click lands on it.
- Editing a schedule resets its `lastCheck`, so an edit never fires a past time. Date-range conditions are folded into `nextOccurrence`, so "Next run" is accurate.
- Step ids aren't exported; macro and schedule ids are.
- **Steps are a ScrollView + VStack, not a List.** List's `onMove` holds every mouse-down to detect a drag, which made the step text fields slow to focus. Reorder is drag-from-☰ only (`StepDropDelegate`).
- Run HUD (`HUD.swift`): previous / current / next rows keyed by step index so they slide; phase (`waiting` / `acting` / `pausingLoop`) + `progress` come from `RunStatus`; a summary card holds 2.2 s after a run. The panel is never key, so system prominent buttons render grey: Stop uses its own style.
- `ClickFlow --preview-hud` plays a harmless waits-and-moves macro to look at the HUD.
- `RunLive` holds the fast run state (status/countdown/summary) and only the HUD observes it; the rest of the UI watches `Runner.busy`. Observing the runner directly made every progress tick re-render the hidden main window (the HUD stutter).
- Read text (`ScreenText.swift`): SCScreenshotManager with `sourceRect` on the display under the area's centre, ClickFlow's own windows excluded, then `VNRecognizeTextRequest` (.accurate). Empty result throws, so a following Post clipboard never sends stale clipboard text.
- Step cards keep their actions on the name row (ViewThatFits drops labels when narrow); beside the fields they overflowed the detail column and slid under the sidebar.
- Step cards are `Equatable` value views in a `LazyVStack`, writing through `Store.updateStep`. With `@Binding` into the macro, one keystroke re-rendered every card (the "whole UI is laggy" report).
- Screenshot to Discord (`Discord.swift`): multipart `payload_json` + `files[0]` to the webhook, mentions disabled. Webhook URL in `Application Support/ClickFlow/discord-webhook` (mode 600). It was in the Keychain first, but a self-signed rebuild changes the cdhash, so "Always Allow" was lost on every build; `--set-discord-webhook <url> [--send-test]` stores it from the CLI. The test image is rendered, never a screen capture.
- `Placer.swift` replaced the full-screen picker for Pick buttons: non-activating floating target / box + ✓ ✗ bar, usable while other apps are focused. The area box is four strip windows, so nothing covers its interior. Never set `ignoresMouseEvents` on a window that should pass clicks through its transparent parts (setting it at all, even false, makes the whole window catch clicks). `--placer-test` checks click-through and drag.
- Drags read `event.cgEvent.location`, not `NSEvent.mouseLocation`, which lagged and dropped the end of fast drags.
- Input lock (`InputLock.swift`): active CGEventTap at `.cghidEventTap`, all event types; passes events whose `eventSourceUnixProcessID` is ours, handles esc / ⌃⌥⌘. / ⌘Q itself (the tap sits before the Carbon hotkey, so the hotkey alone would never fire), passes ⌘⌥esc. Released in `finish`, plus a 1 s watchdog. `--lock-test` locks for <1 s and checks our own events pass.

## Windows port (`clickflow/windows/`, 2026-10-19)
- C# .NET 8 WinForms, `build.ps1 [build|test|install]`, needs only the .NET 8 SDK. `nuget.config` in the folder because this PC's NuGet had no sources.
- Reads/writes the Mac `macros.json` shape exactly (`Json.cs`: sorted keys, per-type fields, ISO dates), so exports cross over. Coordinates are physical pixels, not Mac points, so imported points need re-picking. `cmd`/`⌘` parse as Ctrl.
- `macros/macros.windows.json`: Auto Clock-In/Out with macros + schedules disabled and every step Show only. Inert on purpose (Charlie: never execute them while building). `build.ps1 install` seeds `%APPDATA%\ClickFlow\macros.json` from it only when no macros exist.
- Click = `SetCursorPos` + `SendInput` down/up (exact pixel; absolute SendInput rounds). Every posted event carries `dwExtraInfo = 0x0C11CF10`; the input-lock and recorder low-level hooks use it to pass ClickFlow's own events.
- Static init order bit once: `Store.Directory` must be declared above `Store.Shared`.
- HUD / markers set `WDA_EXCLUDEFROMCAPTURE` so OCR never reads them; `CLICKFLOW_ALLOW_CAPTURE=1` turns that off for dev screenshots. `CLICKFLOW_DATA_DIR` isolates a test build's data.
- Screenshot area OCR: `Windows.Media.Ocr`, image upscaled 2–3× first.
