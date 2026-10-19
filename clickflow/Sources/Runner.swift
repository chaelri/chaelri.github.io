import AppKit

struct RunStatus {
    enum Phase: Equatable {
        case starting      // window getting out of the way
        case waiting       // a Wait step, or a step's "Delay before"
        case acting        // the click / typing / request itself
        case pausingLoop   // pause between repeats
    }

    var macroName: String
    var steps: [Step]
    var stepIndex = 0
    var iteration = 0
    var iterations: Int
    /// Set when only one step is being tested.
    var testOnly: Int?
    /// Dry run: nothing is clicked, typed or sent; each step shows where it would act.
    var preview = false
    /// Real mouse / keyboard blocked for this run (esc, ⌃⌥⌘. or ⌘Q stops).
    var inputLocked = false
    var skipped: Set<Int> = []
    var repeatDelay: Double = 0
    var started = Date()
    var phase: Phase = .starting
    var phaseStart = Date()
    var phaseEnd: Date?
    /// 0…1 for steps that report it (typing).
    var progress: Double?
    var completed: Set<Int> = []

    /// Text from the latest Read-text step in this run.
    var lastOutput: String?
    /// What each Screenshot area step captured and read, by step index.
    var captures: [Int: StepCapture] = [:]
    var lastImage: CGImage?

    var stepCount: Int { steps.count }
    var step: Step? { steps.indices.contains(stepIndex) ? steps[stepIndex] : nil }
}

struct StepCapture {
    var text: String
    var image: CGImage?
}

struct RunSummary: Equatable {
    var id = UUID()
    var macroName: String
    var result: RunResult
    var duration: TimeInterval
    var stepCount: Int
    var reason: String?
    var output: String?
    var outputImage: CGImage?
}

struct PendingRun: Identifiable {
    let id = UUID()
    var macroID: UUID
    var macroName: String
    var schedule: Schedule?
    var note: String?
    var fireAt: Date?
}

/// The fast-changing state of a run (phase, progress, which step). Only the HUD observes
/// this; everything else watches `Runner.busy`, so a progress tick never redraws the
/// main window.
@MainActor
final class RunLive: ObservableObject {
    static let shared = RunLive()
    @Published var status: RunStatus?
    @Published var countdown: PendingRun?
    @Published var summary: RunSummary?
}

/// Plays macros one at a time. Scheduled runs queue behind a running one and start the
/// moment they're due; manual runs are refused while anything is busy.
@MainActor
final class Runner: ObservableObject {
    static let shared = Runner()

    /// Coarse state for the rest of the UI: changes only when a run starts or ends.
    @Published private(set) var busy = false
    @Published private(set) var runningName: String?

    private(set) var status: RunStatus? {
        get { RunLive.shared.status }
        set { RunLive.shared.status = newValue; syncBusy() }
    }
    private(set) var countdown: PendingRun? {
        get { RunLive.shared.countdown }
        set { RunLive.shared.countdown = newValue; syncBusy() }
    }
    /// The just-finished run, shown briefly on the HUD.
    private(set) var summary: RunSummary? {
        get { RunLive.shared.summary }
        set { RunLive.shared.summary = newValue }
    }

    private func syncBusy() {
        let b = RunLive.shared.status != nil || RunLive.shared.countdown != nil
        if busy != b { busy = b }
        let n = RunLive.shared.status?.macroName
        if runningName != n { runningName = n }
    }
    private var queue: [PendingRun] = []
    private var task: Task<Void, Never>?
    private var countdownTask: Task<Void, Never>?
    private var escMonitors: [Any] = []
    private var skipRequested = false
    private let displayAwake = PowerAssertion(type: "PreventUserIdleDisplaySleep", reason: "ClickFlow is running a macro")

    var isBusy: Bool { busy || Recorder.shared.isRecording }

    // MARK: Entry points

    func runNow(_ id: UUID) {
        guard let m = Store.shared.macro(id) else { return }
        guard !isBusy else { NSSound.beep(); return }
        if let reason = blockReason(m, schedule: nil) {
            if reason.offScreen {
                guard Alerts.confirm("A step points off-screen", "\(reason.text). The display layout may have changed since it was recorded.",
                                     ok: "Run Anyway") else { return }
            } else if reason.permission {
                if Alerts.confirm("ClickFlow can't click yet", "Turn on ClickFlow in System Settings › Privacy & Security › Accessibility.",
                                  ok: "Open Settings") { PermissionMonitor.requestAccessibility() }
                return
            } else {
                Alerts.show("Can't run \(m.name)", reason.text)
                return
            }
        }
        start(m, trigger: .manual, onlyStep: nil, note: nil)
    }

    /// Plays the whole macro without executing anything: markers show where each click
    /// would land, and Skip jumps past the current step.
    func previewRun(_ id: UUID) {
        guard let m = Store.shared.macro(id) else { return }
        guard !isBusy else { NSSound.beep(); return }
        if m.steps.isEmpty { Alerts.show("Can't preview \(m.name)", "The macro has no steps."); return }
        start(m, trigger: .preview, onlyStep: nil, note: nil, preview: true)
    }

    /// Skip the rest of the current step (preview only).
    func skipStep() {
        guard status?.preview == true else { return }
        skipRequested = true
    }

    func test(stepAt index: Int, of id: UUID) {
        guard let m = Store.shared.macro(id), m.steps.indices.contains(index) else { return }
        guard !isBusy else { NSSound.beep(); return }
        guard m.steps[index].showOnly || !m.steps[index].type.needsAccessibility || AXIsProcessTrusted() else {
            if Alerts.confirm("ClickFlow can't click yet", "Turn on ClickFlow in System Settings › Privacy & Security › Accessibility.",
                              ok: "Open Settings") { PermissionMonitor.requestAccessibility() }
            return
        }
        start(m, trigger: .test, onlyStep: index, note: nil)
    }

    /// `--preview-hud`: plays a harmless macro (waits + in-place moves, nothing clicked or
    /// typed, nothing saved) so the run HUD can be looked at.
    func previewHUD() {
        guard !isBusy else { return }
        let here = Geo.mouse
        func move(_ name: String, delay: Double) -> Step {
            var s = Step(type: .move, x: here.x.rounded(), y: here.y.rounded(), delayBefore: delay)
            s.name = name
            return s
        }
        func wait(_ name: String, _ secs: Double) -> Step {
            var s = Step(type: .wait, seconds: secs)
            s.name = name
            return s
        }
        var shot = Step(type: .readText, x: here.x.rounded(), y: here.y.rounded(), delayBefore: 0.4)
        shot.name = "Send Current Clock-in Status to Discord"
        shot.sendDiscord = true
        let m = Macro(name: "HUD preview", steps: [
            shot,
            move("Open the timesheet", delay: 0.6),
            wait("Wait for the page to load", 3),
            move("Hover the Clock Out button", delay: 1.2),
            wait("", 2),
            move("Point at the confirm dialog with a deliberately long step name that has to truncate", delay: 0.8),
            wait("Let it settle", 1.5),
        ])
        start(m, trigger: .preview, onlyStep: nil, note: "HUD preview", preview: true)
        // A drawn stand-in for a capture, so the result strip can be seen without reading the screen.
        status?.captures[0] = StepCapture(text: "Clocked-in for 7h 42m", image: SelfTest.sampleImage())
    }

    func enqueueScheduled(_ m: Macro, schedule: Schedule, note: String?) {
        guard !queue.contains(where: { $0.macroID == m.id }), countdown?.macroID != m.id else {
            log(m, .scheduled, .skipped, "Already queued", start: Date())
            return
        }
        queue.append(PendingRun(macroID: m.id, macroName: m.name, schedule: schedule, note: note))
        pump()
    }

    func stop() {
        if countdown != nil { cancelCountdown() }
        task?.cancel()
    }

    /// Hotkey / esc: stop what's running and drop everything waiting behind it.
    func emergencyStop() {
        for p in queue {
            log(p.macroID, p.macroName, .scheduled, .skipped, "Dropped by emergency stop", start: Date())
        }
        queue.removeAll()
        stop()
    }

    // MARK: Countdown

    func resumeQueue() { pump() }

    private func pump() {
        guard !isBusy, !queue.isEmpty else { return }
        let p = queue.removeFirst()
        guard let m = Store.shared.macro(p.macroID) else { pump(); return }
        if let reason = blockReason(m, schedule: p.schedule) {
            log(m, .scheduled, .skipped, reason.text, start: Date())
            pump()
            return
        }
        // Enabled means go: no "About to run" countdown, it starts straight away.
        summary = nil
        start(m, trigger: .scheduled, onlyStep: nil, note: p.note)
    }

    func skipCountdown() {
        guard let p = countdown else { return }
        countdownTask?.cancel()
        countdownTask = nil
        countdown = nil
        guard let m = Store.shared.macro(p.macroID) else { endIfIdle(); pump(); return }
        // Re-check: five seconds is enough to lock the screen or revoke the permission.
        if let reason = blockReason(m, schedule: p.schedule, checkIdle: false) {
            log(m, .scheduled, .skipped, reason.text, start: Date())
            endIfIdle()
            pump()
            return
        }
        start(m, trigger: .scheduled, onlyStep: nil, note: p.note)
    }

    func cancelCountdown() {
        guard let p = countdown else { return }
        countdownTask?.cancel()
        countdownTask = nil
        countdown = nil
        log(p.macroID, p.macroName, .scheduled, .skipped, "Cancelled during the countdown", start: Date())
        endIfIdle()
        pump()
    }

    // MARK: Playback

    private func start(_ m: Macro, trigger: RunTrigger, onlyStep: Int?, note: String?, preview: Bool = false) {
        let started = Date()
        let iterations = onlyStep == nil ? m.repeatCount : 1
        summary = nil
        status = RunStatus(macroName: m.name, steps: m.steps, iterations: iterations, testOnly: onlyStep, repeatDelay: m.repeatDelay)
        status?.preview = preview
        if let i = onlyStep { status?.stepIndex = i }
        HUD.shared.show()
        installEsc()
        displayAwake.set(true)
        let hid = Prefs.hideWindow ? WindowManager.hideMain() : false
        // Lock real input for real runs only: Preview and step tests need the mouse for Skip / Stop.
        if Prefs.lockInput, !preview, onlyStep == nil {
            status?.inputLocked = InputLock.engage()
        }

        task = Task { @MainActor in
            var result = RunResult.completed
            var reason = note
            do {
                if hid { try await Task.sleep(nanoseconds: 350_000_000) }
                var it = 0
                while iterations == 0 || it < iterations {
                    if it > 0, m.repeatDelay > 0 {
                        status?.stepIndex = 0
                        skipRequested = false
                        setPhase(.pausingLoop, m.repeatDelay)
                        try await sleep(m.repeatDelay)
                    }
                    status?.skipped = []
                    status?.completed = []
                    status?.iteration = it
                    for (i, step) in m.steps.enumerated() {
                        if let only = onlyStep, i != only { continue }
                        try Task.checkCancellation()
                        status?.stepIndex = i
                        status?.progress = nil
                        skipRequested = false
                        if status?.captures.isEmpty == false { HUD.shared.show() }
                        let ghost = preview || step.showOnly
                        // Show the target from the moment the step is up, so the countdown has a place.
                        if ghost, step.type.hasPoint { Ghost.show(step, number: i + 1) }
                        if ghost, step.type.hasArea { Ghost.showArea(step, number: i + 1) }
                        defer { if ghost { Ghost.hide() } }
                        let delay = step.type == .wait ? step.seconds : (onlyStep == nil ? step.delayBefore : 0)
                        if delay > 0 {
                            setPhase(.waiting, delay)
                            try await sleep(delay)
                        }
                        if skipRequested {
                            status?.skipped.insert(i)
                        } else if step.type != .wait, ghost {
                            // Hold long enough to read where it would have acted.
                            let hold = step.type.hasPoint ? 0.9 : 0.7
                            setPhase(.acting, hold)
                            try await sleep(hold)
                            if skipRequested { status?.skipped.insert(i) }
                        } else if step.type != .wait {
                            setPhase(.acting, nil)
                            if step.type.needsAccessibility, !AXIsProcessTrusted() { throw EngineError.noPermission }
                            let dodged = step.type.hasPoint && HUD.shared.dodge(step.point)
                            ClickEngine.lastCapture = nil
                            let out = try await ClickEngine.perform(step) { p in
                                let r = Runner.shared
                                let q = (p * 100).rounded(.down) / 100
                                if r.status?.progress != q { r.status?.progress = q }
                            }
                            if let out {
                                StepOutputs.shared.text[step.id] = out
                                status?.lastOutput = out
                            }
                            if step.type == .readText {
                                let img = ClickEngine.lastCapture
                                status?.captures[i] = StepCapture(text: out ?? "", image: img)
                                if let img { StepOutputs.shared.images[step.id] = img }
                                if out == nil { StepOutputs.shared.text[step.id] = "" }
                                status?.lastImage = img
                                HUD.shared.show()   // grow to fit the result
                            }
                            if step.type.isClick, Prefs.clickRing { ClickRing.show(at: step.point) }
                            if dodged {
                                try? await Task.sleep(nanoseconds: 150_000_000)
                                HUD.shared.undodge()
                            }
                        }
                        status?.completed.insert(i)
                    }
                    it += 1
                }
            } catch is CancellationError {
                result = .stopped
                let s = status
                Ghost.hide()
                reason = s.map { st in
                    let title = st.step?.title(st.stepIndex + 1) ?? "Step \(st.stepIndex + 1)"
                    return "Stopped at \(title) (of \(st.stepCount))"
                }
            } catch {
                result = .failed
                let st = status
                reason = (st?.step.map { "\($0.title(st!.stepIndex + 1)): " } ?? "") + error.localizedDescription
            }
            HUD.shared.undodge()
            finish(m, trigger: trigger, started: started, result: result, reason: reason, restoreWindow: hid)
        }
    }

    private func setPhase(_ p: RunStatus.Phase, _ duration: Double?) {
        let now = Date()
        status?.phase = p
        status?.phaseStart = now
        status?.phaseEnd = duration.map { now.addingTimeInterval($0) }
    }

    /// Sliced Task.sleep: throws the moment the task is cancelled (Stop is instant even
    /// mid-wait) and returns early when Skip is pressed.
    private func sleep(_ seconds: Double) async throws {
        let end = Date().addingTimeInterval(max(0, seconds))
        while !skipRequested {
            let left = end.timeIntervalSinceNow
            if left <= 0 { return }
            try await Task.sleep(nanoseconds: UInt64(min(left, 0.05) * 1_000_000_000))
        }
    }

    private func finish(_ m: Macro, trigger: RunTrigger, started: Date, result: RunResult, reason: String?, restoreWindow: Bool) {
        let read = status?.lastOutput.map { "Read: “" + String($0.replacingOccurrences(of: "\n", with: " ⏎ ").prefix(300)) + "”" }
        log(m, trigger, result, [reason, read].compactMap { $0 }.joined(separator: " · ").nilIfEmpty, start: started, end: Date())
        let count = status.map { $0.testOnly == nil ? $0.stepCount : 1 } ?? m.steps.count
        let output = status?.lastOutput
        summary = RunSummary(macroName: m.name, result: result, duration: Date().timeIntervalSince(started),
                             stepCount: count, reason: result == .completed ? nil : reason, output: output,
                             outputImage: status?.lastImage)
        InputLock.release()
        status = nil
        task = nil
        displayAwake.set(false)
        if restoreWindow { WindowManager.restoreMain(activate: trigger != .scheduled) }
        endIfIdle()
        pump()
    }

    private func endIfIdle() {
        guard status == nil, countdown == nil else { return }
        removeEsc()
        guard !Recorder.shared.isRecording else { return }
        guard let shown = summary else { HUD.shared.hide(); return }
        // Hold the "Done" card for a moment so the end of the run is legible.
        HUD.shared.show()
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) {
            MainActor.assumeIsolated {
                let r = Runner.shared
                guard r.summary?.id == shown.id else { return }
                r.summary = nil
                if r.status == nil, r.countdown == nil, !Recorder.shared.isRecording { HUD.shared.hide() }
            }
        }
    }

    // MARK: Esc to stop

    private func installEsc() {
        guard escMonitors.isEmpty else { return }
        let handler: (NSEvent) -> Void = { e in
            guard e.keyCode == 53, !ClickEngine.isSynthetic(e) else { return }
            MainActor.assumeIsolated { Runner.shared.stop() }
        }
        if let g = NSEvent.addGlobalMonitorForEvents(matching: .keyDown, handler: handler) { escMonitors.append(g) }
        if let l = NSEvent.addLocalMonitorForEvents(matching: .keyDown, handler: { e in
            handler(e)
            return e.keyCode == 53 ? nil : e
        }) { escMonitors.append(l) }
    }

    private func removeEsc() {
        escMonitors.forEach(NSEvent.removeMonitor)
        escMonitors.removeAll()
    }

    // MARK: Checks

    struct BlockReason {
        var text: String
        var offScreen = false
        var permission = false
    }

    func blockReason(_ m: Macro, schedule: Schedule?, checkIdle: Bool = true) -> BlockReason? {
        if m.steps.isEmpty { return BlockReason(text: "The macro has no steps") }
        let needsAX = m.steps.contains { $0.type.needsAccessibility && !$0.showOnly }
        if needsAX, !AXIsProcessTrusted() { return BlockReason(text: "Accessibility permission is off", permission: true) }
        if SystemState.screenLocked { return BlockReason(text: "The screen was locked") }
        if m.steps.contains(where: { $0.type.hasArea && !$0.showOnly }), !CGPreflightScreenCaptureAccess() {
            return BlockReason(text: "Screen Recording permission is off (needed to capture the screen)")
        }
        if m.steps.contains(where: { ($0.type == .discordMessage || ($0.type == .readText && $0.sendDiscord)) && !$0.showOnly }),
           Discord.webhookURL == nil {
            return BlockReason(text: "No Discord webhook set (Settings › Discord)")
        }
        if let c = schedule?.conditions {
            let app = (c.requireApp ?? "").trimmingCharacters(in: .whitespaces)
            if !app.isEmpty {
                let matches: (NSRunningApplication) -> Bool = {
                    $0.localizedName?.caseInsensitiveCompare(app) == .orderedSame
                        || $0.bundleIdentifier?.caseInsensitiveCompare(app) == .orderedSame
                }
                if c.requireFrontmost {
                    if !(NSWorkspace.shared.frontmostApplication.map(matches) ?? false) {
                        return BlockReason(text: "\(app) wasn't the frontmost app")
                    }
                } else if !NSWorkspace.shared.runningApplications.contains(where: matches) {
                    return BlockReason(text: "\(app) wasn't running")
                }
            }
            if checkIdle, let need = c.minIdleSeconds, need > 0 {
                let idle = SystemState.idleSeconds
                if idle < Double(need) {
                    return BlockReason(text: "You were using the Mac (idle \(Int(idle))s, needs \(need)s)")
                }
            }
        }
        if let i = m.steps.firstIndex(where: { $0.type.hasPoint && !Geo.isOnScreen($0.point) }) {
            let s = m.steps[i]
            return BlockReason(text: "\(s.title(i + 1)) points at \(Fmt.coord(s.x)), \(Fmt.coord(s.y)), which is off every display",
                               offScreen: true)
        }
        return nil
    }

    // MARK: History

    private func log(_ m: Macro, _ trigger: RunTrigger, _ result: RunResult, _ reason: String?, start: Date, end: Date? = nil) {
        log(m.id, m.name, trigger, result, reason, start: start, end: end)
    }

    private func log(_ id: UUID, _ name: String, _ trigger: RunTrigger, _ result: RunResult, _ reason: String?,
                     start: Date, end: Date? = nil) {
        Store.shared.log(RunRecord(macroID: id, macroName: name, trigger: trigger, start: start, end: end,
                                   result: result, reason: reason))
    }

    /// Scheduler entry for runs it decides not to start (missed, paused…).
    func logSkip(_ m: Macro, reason: String, at date: Date = Date()) {
        log(m, .scheduled, .skipped, reason, start: date)
    }
}


extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
