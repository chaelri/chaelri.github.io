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

final class Controller: NSObject, NSApplicationDelegate {

    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private var timer: Timer?
    private var alwaysOn = false
    private var busy = false
    private var failed = false

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

    /// After sending a toggle, sample a few times so the icon catches up fast
    /// instead of waiting out the poll interval.
    private func refreshSoon() {
        for delay in [1.0, 2.0, 3.5, 5.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.refresh() }
        }
    }

    // MARK: - drawing

    private func render() {
        guard let button = item.button else { return }
        let symbol: String
        if failed        { symbol = "exclamationmark.triangle.fill" }
        else if busy     { symbol = "ellipsis.circle" }
        else if alwaysOn { symbol = "checkmark.circle.fill" }
        else             { symbol = "xmark.circle" }

        let label = alwaysOn ? "Always On activated" : "Always On deactivated"
        let image = NSImage(systemSymbolName: symbol, accessibilityDescription: label)
        image?.isTemplate = true
        button.image = image
        button.toolTip = failed
            ? "mac-toggle: couldn't reach Firebase"
            : (alwaysOn ? "Always On — display stays awake" : "Display sleeps when idle")
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
        busy = true
        failed = false
        render()

        var request = URLRequest(url: URL(string: DB + "/mac-toggle/command.json")!)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = "\"toggle\"".data(using: .utf8)
        request.timeoutInterval = 10

        URLSession.shared.dataTask(with: request) { [weak self] _, response, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.busy = false
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                // The daemon may be asleep or offline; the write still lands in
                // Firebase and applies on reconnect. Only flag transport failures.
                self.failed = (error != nil) || !(200..<300).contains(code)
                self.render()
                if !self.failed { self.refreshSoon() }
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
        menu.addItem(.separator())

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
