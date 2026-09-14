// mac-toggle menu bar indicator
//
// Shows whether "always on" is active, and toggles it with one click.
//
//   left click   → toggle (PUT "toggle" to /mac-toggle/command)
//   right click  → menu (status, toggle, open remote, quit)
//
// Reads state from `pmset` LOCALLY rather than from Firebase: it's the actual
// source of truth, it's instant, and the icon stays correct with no network.
// Writes go through Firebase so the daemon stays the only thing touching pmset
// — this runs as the user and has no business doing root work.
//
// Build: swiftc -O -o menubar mac-toggle-menubar.swift   (Xcode CLT is enough)

import Cocoa

let DB = "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
let REMOTE_URL = "https://chaelri.github.io/mac-toggle/"
let POLL_SECONDS = 5.0
let STATE_POLL_SECONDS = 20.0   // how often we ask the daemon how the nudge is doing
let DAEMON_STALE_SECONDS = 180.0 // no /state heartbeat this long = daemon is gone
let NUDGE_LATE_SECONDS = 420.0   // nudge runs every 300 s; later than this is wrong

final class Controller: NSObject, NSApplicationDelegate {

    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private var timer: Timer?
    private var alwaysOn = false
    private var busy = false
    private var failed = false

    /// What the daemon says about the F15 nudge. `pmset` can be perfectly set to
    /// Never while the keystroke is being refused by TCC — that failure is silent
    /// and has bitten before (blocked 2026-09-10, unnoticed for four days), so the
    /// nudge gets its own reported status rather than being inferred from the toggle.
    private enum Nudge {
        case unknown                 // haven't heard from the daemon yet
        case unreachable             // couldn't read /state
        case daemonGone(age: TimeInterval)
        case off                     // Always On is off, so the nudge is meant to be idle
        case starting                // on, but hasn't tapped once yet
        case ok(age: TimeInterval)
        case blocked
    }
    private var nudge: Nudge = .unknown
    private var stateTimer: Timer?

    // While a toggle is in flight we poll fast and spin, so the icon lands with
    // the spoken announcement instead of trailing it by up to a poll interval.
    private var burstTimer: Timer?
    private var spinTimer: Timer?
    private var spinAngle: CGFloat = 0

    func applicationDidFinishLaunching(_ note: Notification) {
        if let button = item.button {
            button.target = self
            button.action = #selector(clicked(_:))
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: POLL_SECONDS, repeats: true) { [weak self] _ in
            self?.refresh()
        }
        fetchNudge()
        stateTimer = Timer.scheduledTimer(withTimeInterval: STATE_POLL_SECONDS, repeats: true) { [weak self] _ in
            self?.fetchNudge()
        }
    }

    // MARK: - reading truth

    /// True when every displaysleep timer (battery + adapter) is 0 = Never.
    private func readAlwaysOn() -> Bool? {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/pmset")
        task.arguments = ["-g", "custom"]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()
        do { try task.run() } catch { return nil }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        task.waitUntilExit()
        guard let out = String(data: data, encoding: .utf8) else { return nil }

        var values: [Int] = []
        for line in out.split(separator: "\n") {
            let parts = line.split(separator: " ").filter { !$0.isEmpty }
            if parts.count >= 2, parts[0] == "displaysleep", let v = Int(parts[1]) {
                values.append(v)
            }
        }
        guard !values.isEmpty else { return nil }
        return values.allSatisfy { $0 == 0 }
    }

    private func refresh() {
        if let state = readAlwaysOn() {
            alwaysOn = state
        }
        render()
    }

    /// Ask the daemon how the nudge is going. This is the one thing we can't read
    /// locally: only the daemon knows whether its last synthetic F15 was accepted.
    private func fetchNudge() {
        var request = URLRequest(url: URL(string: DB + "/mac-toggle/state.json")!)
        request.timeoutInterval = 8
        request.cachePolicy = .reloadIgnoringLocalCacheData

        URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
            let parsed = Controller.parseNudge(data)
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.nudge = parsed
                self.render()
            }
        }.resume()
    }

    private static func parseNudge(_ data: Data?) -> Nudge {
        guard let data = data,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return .unreachable }

        let now = Date().timeIntervalSince1970
        // No heartbeat for a while means the daemon isn't running — everything
        // else in the payload is then a stale snapshot, so say that and stop.
        if let updated = obj["updatedAt"] as? Double {
            let age = now - updated / 1000
            if age > DAEMON_STALE_SECONDS { return .daemonGone(age: age) }
        }

        guard (obj["jiggling"] as? Bool) == true else { return .off }
        // jiggleOk is null until the first tap, false once one has been refused.
        guard let ok = obj["jiggleOk"] as? Bool else { return .starting }
        if !ok { return .blocked }
        guard let at = obj["jiggleAt"] as? Double else { return .starting }
        return .ok(age: now - at / 1000)
    }

    /// "just now" / "4 min ago" / "1 h 12 min ago" — short enough for a menu line.
    private static func ago(_ seconds: TimeInterval) -> String {
        let s = max(0, Int(seconds.rounded()))
        if s < 45 { return "just now" }
        let minutes = (s + 30) / 60
        if minutes < 60 { return "\(minutes) min ago" }
        let h = minutes / 60, m = minutes % 60
        return m == 0 ? "\(h) h ago" : "\(h) h \(m) min ago"
    }

    /// True only when Always On is meant to be doing something and it isn't.
    private var nudgeBroken: Bool {
        switch nudge {
        case .blocked, .unreachable, .daemonGone:            return alwaysOn
        case .ok(let age):                                   return alwaysOn && age > NUDGE_LATE_SECONDS
        case .unknown, .off, .starting:                      return false
        }
    }

    private func nudgeLine() -> String {
        switch nudge {
        case .unknown:              return "Nudge — checking…"
        case .unreachable:          return "Nudge — can't reach the daemon"
        case .daemonGone(let age):  return "Nudge — daemon offline (last seen \(Controller.ago(age)))"
        case .off:                  return "Nudge — off, follows Always On"
        case .starting:             return "Nudge — starting…"
        case .blocked:              return "Nudge BLOCKED — grant Accessibility to osascript"
        case .ok(let age):
            return age > NUDGE_LATE_SECONDS
                ? "Nudge — overdue, last landed \(Controller.ago(age))"
                : "Nudge — F15 landed \(Controller.ago(age))"
        }
    }

    /// After sending a toggle, watch `pmset` closely until it actually flips.
    /// The daemon applies the setting and *then* speaks, so polling this tight
    /// makes the icon change land with the voice rather than seconds later.
    private func startBurst() {
        burstTimer?.invalidate()
        let was = alwaysOn
        let deadline = Date().addingTimeInterval(15)
        burstTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] t in
            guard let self = self else { t.invalidate(); return }
            if let now = self.readAlwaysOn() { self.alwaysOn = now }
            if self.alwaysOn != was || Date() > deadline {
                t.invalidate()
                self.burstTimer = nil
                self.setBusy(false)          // stops the spinner and repaints
            }
        }
    }

    // MARK: - drawing

    /// Spinner while a toggle is in flight: rotate one symbol rather than
    /// embedding an NSProgressIndicator subview in the status button.
    private func setBusy(_ on: Bool) {
        busy = on
        spinTimer?.invalidate()
        spinTimer = nil
        if on {
            spinAngle = 0
            spinTimer = Timer.scheduledTimer(withTimeInterval: 0.06, repeats: true) { [weak self] _ in
                guard let self = self else { return }
                self.spinAngle -= 24                 // clockwise
                self.render()
            }
        }
        render()
    }

    private func rotated(_ image: NSImage, _ degrees: CGFloat) -> NSImage {
        let size = image.size
        let out = NSImage(size: size)
        out.lockFocus()
        let t = NSAffineTransform()
        t.translateX(by: size.width / 2, yBy: size.height / 2)
        t.rotate(byDegrees: degrees)
        t.translateX(by: -size.width / 2, yBy: -size.height / 2)
        t.concat()
        image.draw(at: .zero, from: NSRect(origin: .zero, size: size),
                   operation: .sourceOver, fraction: 1)
        out.unlockFocus()
        out.isTemplate = true
        return out
    }

    private func render() {
        guard let button = item.button else { return }

        // Sun / moon rather than check / cross: an ✗ reads as "something went
        // wrong", when it only means the display is allowed to sleep.
        let symbol: String
        if failed             { symbol = "exclamationmark.triangle.fill" }
        else if busy          { symbol = "arrow.triangle.2.circlepath" }
        else if nudgeBroken   { symbol = "sun.max.trianglebadge.exclamationmark.fill" }
        else if alwaysOn      { symbol = "sun.max.fill" }
        else                  { symbol = "moon.zzz.fill" }

        let label = alwaysOn ? "Always On activated" : "Always On deactivated"
        var image = NSImage(systemSymbolName: symbol, accessibilityDescription: label)
        // The badged sun is SF Symbols 4+; fall back rather than lose the icon.
        if image == nil && nudgeBroken {
            image = NSImage(systemSymbolName: "exclamationmark.triangle.fill",
                            accessibilityDescription: label)
        }
        image?.isTemplate = true
        if busy, let base = image { image = rotated(base, spinAngle) }
        button.image = image
        button.toolTip = failed
            ? "mac-toggle: couldn't reach Firebase"
            : (busy ? "Applying…"
                    : (alwaysOn ? "Always On — display stays awake\n" + nudgeLine()
                                : "Display sleeps when idle"))
    }

    // MARK: - actions

    @objc private func clicked(_ sender: Any?) {
        let event = NSApp.currentEvent
        let wantsMenu = event?.type == .rightMouseUp
            || event?.modifierFlags.contains(.control) == true
        if wantsMenu { showMenu() } else { toggle() }
    }

    @objc private func toggle() {
        guard !busy else { return }
        failed = false
        setBusy(true)

        var request = URLRequest(url: URL(string: DB + "/mac-toggle/command.json")!)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = "\"toggle\"".data(using: .utf8)
        request.timeoutInterval = 10

        URLSession.shared.dataTask(with: request) { [weak self] _, response, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                // The daemon may be asleep or offline; the write still lands in
                // Firebase and applies on reconnect. Only flag transport failures.
                self.failed = (error != nil) || !(200..<300).contains(code)
                if self.failed {
                    self.setBusy(false)          // nothing to wait for
                } else {
                    // Keep spinning until pmset actually changes.
                    self.startBurst()
                }
            }
        }.resume()
    }

    private func showMenu() {
        let menu = NSMenu()

        let status = NSMenuItem(
            title: alwaysOn ? "Always On — activated" : "Always On — deactivated",
            action: nil, keyEquivalent: "")
        status.isEnabled = false
        menu.addItem(status)

        // Whether the keystroke is actually landing — the part the toggle label
        // can't tell you. Clickable only when there's something to go fix.
        let nudgeItem = NSMenuItem(title: nudgeLine(), action: nil, keyEquivalent: "")
        if case .blocked = nudge {
            nudgeItem.action = #selector(openAccessibility)
            nudgeItem.target = self
            nudgeItem.toolTip = "Open System Settings › Privacy & Security › Accessibility"
        } else {
            nudgeItem.isEnabled = false
        }
        if nudgeBroken {
            nudgeItem.image = NSImage(systemSymbolName: "exclamationmark.triangle.fill",
                                      accessibilityDescription: "problem")
        }
        menu.addItem(nudgeItem)
        menu.addItem(.separator())

        // Refresh in the background so the next open is current.
        fetchNudge()

        let flip = NSMenuItem(title: alwaysOn ? "Turn off (sleep when idle)" : "Turn on (stay awake)",
                              action: #selector(toggle), keyEquivalent: "")
        flip.target = self
        menu.addItem(flip)

        let open = NSMenuItem(title: "Open remote…", action: #selector(openRemote), keyEquivalent: "")
        open.target = self
        menu.addItem(open)

        menu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)

        // Attach only for this click so left-click still reaches our action.
        item.menu = menu
        item.button?.performClick(nil)
        item.menu = nil
    }

    @objc private func openAccessibility() {
        // Synthesising key events is TCC-gated and a LaunchDaemon can't answer a
        // prompt, so this always ends in a manual grant. Take him straight there.
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc private func openRemote() {
        if let url = URL(string: REMOTE_URL) { NSWorkspace.shared.open(url) }
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}

@main
enum MenuBarApp {
    static func main() {
        let app = NSApplication.shared
        let controller = Controller()      // held by the delegate reference below
        app.delegate = controller
        app.setActivationPolicy(.accessory)   // menu bar only: no Dock icon, no window
        app.run()
    }
}
