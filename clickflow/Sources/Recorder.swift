import AppKit

/// Records real clicks into steps, with the real gaps between them as Wait steps.
/// Clicks on ClickFlow's own windows (the indicator) never reach a global monitor,
/// so pressing Stop is never recorded.
@MainActor
final class Recorder: ObservableObject {
    static let shared = Recorder()

    @Published private(set) var isRecording = false
    @Published private(set) var steps: [Step] = []
    private var monitors: [Any] = []
    private var lastTime: TimeInterval?
    private var restoreWindow = false
    private var onFinish: (([Step]) -> Void)?

    var clickCount: Int { steps.filter { $0.type.isClick }.count }

    func start(onFinish: @escaping ([Step]) -> Void) {
        guard !isRecording else { return }
        guard !Runner.shared.isBusy else { NSSound.beep(); return }
        guard AXIsProcessTrusted() else {
            if Alerts.confirm("ClickFlow can't record yet", "Recording and playback both need ClickFlow turned on in System Settings › Privacy & Security › Accessibility.",
                              ok: "Open Settings") { PermissionMonitor.requestAccessibility() }
            return
        }
        steps = []
        lastTime = nil
        self.onFinish = onFinish
        restoreWindow = WindowManager.hideMain()
        isRecording = true
        HUD.shared.show()

        if let g = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .keyDown], handler: { e in
            MainActor.assumeIsolated { Recorder.shared.handle(e) }
        }) { monitors.append(g) }
        if let l = NSEvent.addLocalMonitorForEvents(matching: .keyDown, handler: { e in
            guard e.keyCode == 53 else { return e }
            MainActor.assumeIsolated { Recorder.shared.stop() }
            return nil
        }) { monitors.append(l) }
    }

    private func handle(_ e: NSEvent) {
        guard isRecording, !ClickEngine.isSynthetic(e) else { return }
        if e.type == .keyDown {
            if e.keyCode == 53 { stop() }
            return
        }
        guard let loc = e.cgEvent?.location else { return }
        let p = CGPoint(x: loc.x.rounded(), y: loc.y.rounded())

        // The second press of a double-click upgrades the click before it.
        if e.type == .leftMouseDown, e.clickCount >= 2 {
            if e.clickCount == 2, let last = steps.last, last.type == .leftClick,
               hypot(last.x - p.x, last.y - p.y) <= 5 {
                steps[steps.count - 1].type = .doubleClick
            }
            lastTime = e.timestamp
            return
        }

        if let t = lastTime {
            let gap = ((e.timestamp - t) * 10).rounded() / 10
            if gap >= 0.1 { steps.append(Step(type: .wait, seconds: gap)) }
        }
        steps.append(Step(type: e.type == .rightMouseDown ? .rightClick : .leftClick, x: p.x, y: p.y))
        lastTime = e.timestamp
    }

    func stop() {
        guard isRecording else { return }
        monitors.forEach(NSEvent.removeMonitor)
        monitors.removeAll()
        isRecording = false
        HUD.shared.hide()
        let result = steps
        let done = onFinish
        onFinish = nil
        if restoreWindow { WindowManager.restoreMain(activate: true) }
        done?(result)
        Runner.shared.resumeQueue()
    }
}
