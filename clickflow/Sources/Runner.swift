import AppKit

struct RunStatus {
    var macroName: String
    var stepIndex = 0
    var stepCount: Int
    var step: Step?
    var iteration = 0
    var iterations: Int
    var nextAt: Date?
}

struct PendingRun: Identifiable {
    let id = UUID()
    var macroID: UUID
    var macroName: String
    var schedule: Schedule?
    var note: String?
    var fireAt: Date?
}

/// Plays macros one at a time. Scheduled runs queue behind a running one and get a
/// 5-second "About to run" countdown; manual runs are refused while anything is busy.
@MainActor
final class Runner: ObservableObject {
    static let shared = Runner()

    @Published private(set) var status: RunStatus?
    @Published private(set) var countdown: PendingRun?
    private var queue: [PendingRun] = []
    private var task: Task<Void, Never>?
    private var countdownTask: Task<Void, Never>?
    private var escMonitors: [Any] = []
    private let displayAwake = PowerAssertion(type: "PreventUserIdleDisplaySleep", reason: "ClickFlow is running a macro")

    var isBusy: Bool { status != nil || countdown != nil || Recorder.shared.isRecording }

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

    func test(stepAt index: Int, of id: UUID) {
        guard let m = Store.shared.macro(id), m.steps.indices.contains(index) else { return }
        guard !isBusy else { NSSound.beep(); return }
        guard AXIsProcessTrusted() else {
            if Alerts.confirm("ClickFlow can't click yet", "Turn on ClickFlow in System Settings › Privacy & Security › Accessibility.",
                              ok: "Open Settings") { PermissionMonitor.requestAccessibility() }
            return
        }
        start(m, trigger: .test, onlyStep: index, note: nil)
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
        var p = queue.removeFirst()
        guard let m = Store.shared.macro(p.macroID) else { pump(); return }
        if let reason = blockReason(m, schedule: p.schedule) {
            log(m, .scheduled, .skipped, reason.text, start: Date())
            pump()
            return
        }
        p.fireAt = Date().addingTimeInterval(5)
        countdown = p
        HUD.shared.show()
        installEsc()
        countdownTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            guard !Task.isCancelled else { return }
            self.skipCountdown()
        }
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

    private func start(_ m: Macro, trigger: RunTrigger, onlyStep: Int?, note: String?) {
        let started = Date()
        let iterations = onlyStep == nil ? m.repeatCount : 1
        status = RunStatus(macroName: m.name, stepCount: m.steps.count, iterations: iterations)
        if let i = onlyStep { status?.stepIndex = i }
        HUD.shared.show()
        installEsc()
        displayAwake.set(true)
        let hid = Prefs.hideWindow ? WindowManager.hideMain() : false

        task = Task { @MainActor in
            var result = RunResult.completed
            var reason = note
            do {
                if hid { try await Task.sleep(nanoseconds: 350_000_000) }
                var it = 0
                while iterations == 0 || it < iterations {
                    if it > 0, m.repeatDelay > 0 {
                        status?.nextAt = Date().addingTimeInterval(m.repeatDelay)
                        try await sleep(m.repeatDelay)
                    }
                    for (i, step) in m.steps.enumerated() {
                        if let only = onlyStep, i != only { continue }
                        try Task.checkCancellation()
                        status?.stepIndex = i
                        status?.step = step
                        status?.iteration = it
                        let delay = step.type == .wait ? step.seconds : (onlyStep == nil ? step.delayBefore : 0)
                        if delay > 0 {
                            status?.nextAt = Date().addingTimeInterval(delay)
                            try await sleep(delay)
                        }
                        status?.nextAt = nil
                        guard step.type != .wait else { continue }
                        guard AXIsProcessTrusted() else { throw EngineError.noPermission }
                        let dodged = step.type.hasPoint && HUD.shared.dodge(step.point)
                        try await ClickEngine.perform(step)
                        if step.type.isClick, Prefs.clickRing { ClickRing.show(at: step.point) }
                        if dodged {
                            try? await Task.sleep(nanoseconds: 150_000_000)
                            HUD.shared.undodge()
                        }
                    }
                    it += 1
                }
            } catch is CancellationError {
                result = .stopped
                let s = status
                reason = s.map { "Stopped at step \($0.stepIndex + 1) of \($0.stepCount)" }
            } catch {
                result = .failed
                reason = error.localizedDescription
            }
            HUD.shared.undodge()
            finish(m, trigger: trigger, started: started, result: result, reason: reason, restoreWindow: hid)
        }
    }

    /// Task.sleep throws the moment the task is cancelled, so Stop is instant even mid-wait.
    private func sleep(_ seconds: Double) async throws {
        try await Task.sleep(nanoseconds: UInt64(max(0, seconds) * 1_000_000_000))
    }

    private func finish(_ m: Macro, trigger: RunTrigger, started: Date, result: RunResult, reason: String?, restoreWindow: Bool) {
        log(m, trigger, result, reason, start: started, end: Date())
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
        if !Recorder.shared.isRecording { HUD.shared.hide() }
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
        if !AXIsProcessTrusted() { return BlockReason(text: "Accessibility permission is off", permission: true) }
        if SystemState.screenLocked { return BlockReason(text: "The screen was locked") }
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
            return BlockReason(text: "Step \(i + 1) points at \(Fmt.coord(s.x)), \(Fmt.coord(s.y)), which is off every display",
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
