# ClickFlow — summary

macOS click-macro recorder/editor/scheduler. SwiftUI app shell + AppKit panels, built with `swiftc` (CLT only).

## Files (`clickflow/Sources/`)
- `Models.swift` — Step / Macro / Schedule / Conditions / RunRecord, schedule maths (`nextOccurrence`), formatters.
- `Store.swift` — JSON persistence (Application Support/ClickFlow), import/export, AppState (sidebar selection).
- `Engine.swift` — `Geo` (Quartz top-left points ↔ AppKit bottom-left), `ClickEngine` (CGEvent posting), `KeyCombo` parser.
- `System.swift` — permissions monitor, SMAppService login item, screen-lock/idle checks, IOPM assertions, Carbon hotkey ⌃⌥⌘., WindowManager.
- `Runner.swift` — one run at a time; scheduled runs queue + 5 s countdown; preflight `blockReason`; logs history.
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
