// claude-usage — Claude plan usage as a menu bar percentage.
//
// The percentage is the title itself, so it's readable at a glance with no
// clicking. Left click opens the detail menu (that's the whole point — the
// stock Claude menu item needs a right click to show anything).
//
// Data: GET https://api.anthropic.com/api/oauth/usage with the OAuth token
// Claude Code already stores in the login keychain. Same endpoint the Claude
// app's own menu item uses. It's an account-metadata call, not inference, so
// polling it costs no tokens.
//
// UNDOCUMENTED ENDPOINT: this is an internal API, not a published one. It can
// change or disappear without notice. Failure is visible (the title shows "–"
// or "auth"), never silent.
//
// Build: swiftc -O -parse-as-library -o claude-usage claude-usage.swift

import Cocoa

let USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
let CLAUDE_ORANGE = NSColor(srgbRed: 0xD9 / 255.0, green: 0x77 / 255.0, blue: 0x57 / 255.0, alpha: 1)
// Read the mark from the installed app rather than vendoring a copy: no
// redistributing Anthropic's asset, and it tracks whatever version is installed.
let CLAUDE_ICON_PATHS = [
    "/Applications/Claude.app/Contents/Resources/TrayIconTemplate@2x.png",
    "/Applications/Claude.app/Contents/Resources/TrayIconTemplate.png",
]
let KEYCHAIN_SERVICE = "Claude Code-credentials"
let SETTINGS_URL = "https://claude.ai/settings/usage"
let POLL_SECONDS = 300.0        // 5 min: these numbers move slowly, and the
                                // menu refreshes on open anyway

struct Limit {
    let label: String
    let percent: Int
    let resetsAt: Date?
    let isSession: Bool
}

final class Controller: NSObject, NSApplicationDelegate, NSMenuDelegate {

    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private var timer: Timer?
    private var limits: [Limit] = []
    private var lastUpdate: Date?
    private var loading = false
    private var errorText: String?

    func applicationDidFinishLaunching(_ note: Notification) {
        let menu = NSMenu()
        menu.delegate = self
        item.menu = menu
        render()
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: POLL_SECONDS, repeats: true) { [weak self] _ in
            self?.refresh()
        }
    }

    // MARK: - auth

    /// Claude Code keeps its OAuth credential in the login keychain and rotates
    /// it, so re-read every time rather than caching a token that goes stale.
    private func accessToken() -> String? {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/security")
        task.arguments = ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()
        do { try task.run() } catch { return nil }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        task.waitUntilExit()
        guard task.terminationStatus == 0,
              let raw = String(data: data, encoding: .utf8)?
                  .trimmingCharacters(in: .whitespacesAndNewlines),
              let blob = raw.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: blob) as? [String: Any]
        else { return nil }

        if let oauth = json["claudeAiOauth"] as? [String: Any],
           let token = oauth["accessToken"] as? String { return token }
        return json["accessToken"] as? String
    }

    // MARK: - fetching

    @objc private func refresh() {
        guard !loading else { return }
        guard let token = accessToken() else {
            errorText = "No Claude Code login found in the keychain."
            limits = []
            render()
            return
        }
        loading = true
        render()

        var request = URLRequest(url: URL(string: USAGE_URL)!)
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("oauth-2025-04-20", forHTTPHeaderField: "anthropic-beta")
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalCacheData

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.loading = false
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                if let error = error {
                    self.errorText = "Network: " + error.localizedDescription
                } else if code == 401 || code == 403 {
                    self.errorText = "Login expired — run `claude` once to refresh it."
                } else if !(200..<300).contains(code) {
                    self.errorText = "Usage API returned HTTP \(code)."
                } else if let data = data, let parsed = self.parse(data) {
                    self.limits = parsed
                    self.errorText = nil
                    self.lastUpdate = Date()
                } else {
                    self.errorText = "Couldn't read the usage response."
                }
                self.render()
            }
        }.resume()
    }

    private func parse(_ data: Data) -> [Limit]? {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }

        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoPlain = ISO8601DateFormatter()
        isoPlain.formatOptions = [.withInternetDateTime]
        func date(_ s: Any?) -> Date? {
            guard let s = s as? String else { return nil }
            return iso.date(from: s) ?? isoPlain.date(from: s)
        }

        // Prefer the `limits` array — it carries the same labels the Claude app
        // shows. Fall back to the flat five_hour/seven_day fields.
        if let rows = root["limits"] as? [[String: Any]], !rows.isEmpty {
            var out: [Limit] = []
            for row in rows {
                let kind = row["kind"] as? String ?? ""
                let percent = (row["percent"] as? NSNumber)?.intValue ?? 0
                var label: String
                switch kind {
                case "session":       label = "Session · 5 hr"
                case "weekly_all":    label = "Weekly · all models"
                case "weekly_scoped":
                    let scope = row["scope"] as? [String: Any]
                    let model = scope?["model"] as? [String: Any]
                    label = "Weekly · " + ((model?["display_name"] as? String) ?? "scoped")
                default:              label = kind.replacingOccurrences(of: "_", with: " ").capitalized
                }
                out.append(Limit(label: label,
                                 percent: percent,
                                 resetsAt: date(row["resets_at"]),
                                 isSession: kind == "session"))
            }
            return out
        }

        var out: [Limit] = []
        if let five = root["five_hour"] as? [String: Any] {
            out.append(Limit(label: "Session · 5 hr",
                             percent: Int(((five["utilization"] as? NSNumber)?.doubleValue ?? 0).rounded()),
                             resetsAt: date(five["resets_at"]), isSession: true))
        }
        if let week = root["seven_day"] as? [String: Any] {
            out.append(Limit(label: "Weekly · all models",
                             percent: Int(((week["utilization"] as? NSNumber)?.doubleValue ?? 0).rounded()),
                             resetsAt: date(week["resets_at"]), isSession: false))
        }
        return out.isEmpty ? nil : out
    }

    // MARK: - drawing

    private var sessionLimit: Limit? {
        limits.first(where: { $0.isSession }) ?? limits.first
    }

    /// The Claude asterisk, tinted orange, sized for the menu bar.
    /// Built once — it never changes — and shown to the left of the percentage.
    private lazy var claudeIcon: NSImage? = {
        let size = NSSize(width: 13, height: 13)
        var source: NSImage?
        for path in CLAUDE_ICON_PATHS {
            if let image = NSImage(contentsOfFile: path) { source = image; break }
        }
        // Fall back to an SF Symbol if Claude.app isn't installed where we expect.
        if source == nil {
            source = NSImage(systemSymbolName: "asterisk", accessibilityDescription: "Claude")
        }
        guard let base = source else { return nil }

        // The shipped asset is a black template; recolor it by filling the
        // opaque pixels (.sourceAtop) rather than drawing a coloured rectangle.
        let tinted = NSImage(size: size)
        tinted.lockFocus()
        let rect = NSRect(origin: .zero, size: size)
        base.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1.0)
        CLAUDE_ORANGE.set()
        rect.fill(using: .sourceAtop)
        tinted.unlockFocus()
        tinted.isTemplate = false          // keep the orange; templates go monochrome
        return tinted
    }()

    private func render() {
        guard let button = item.button else { return }
        button.image = claudeIcon
        button.imagePosition = .imageLeading
        button.imageHugsTitle = true
        let text: String
        var color = NSColor.labelColor

        if errorText != nil {
            text = "–"
        } else if let session = sessionLimit {
            text = "\(session.percent)%"
            if session.percent >= 90 { color = .systemRed }
            else if session.percent >= 75 { color = .systemOrange }
        } else {
            text = loading ? "…" : "–"
        }

        // Monospaced digits so the width doesn't jitter as the number changes.
        button.attributedTitle = NSAttributedString(string: text, attributes: [
            // 11.5pt matches the Control Center battery percentage; the menu bar
            // default (13pt) reads noticeably larger than everything around it.
            .font: NSFont.monospacedDigitSystemFont(ofSize: 11.5, weight: .regular),
            .foregroundColor: color,
        ])
        button.toolTip = errorText ?? limits.map { "\($0.label): \($0.percent)%" }
            .joined(separator: "\n")
    }

    /// "resets 12:20 AM" today, "resets Sun 8:00 PM" later in the week.
    private func resetText(_ date: Date?) -> String? {
        guard let date = date else { return nil }
        let cal = Calendar.current
        let fmt = DateFormatter()
        fmt.locale = Locale.current
        fmt.dateFormat = cal.isDateInToday(date) ? "h:mm a"
            : (cal.isDateInTomorrow(date) ? "'tomorrow' h:mm a" : "EEE h:mm a")
        let clock = fmt.string(from: date)

        let mins = Int(date.timeIntervalSinceNow / 60)
        guard mins > 0 else { return "resets " + clock }
        let left = mins >= 60 ? "\(mins / 60)h \(mins % 60)m" : "\(mins)m"
        return "resets \(clock) · in \(left)"
    }

    // MARK: - menu

    func menuWillOpen(_ menu: NSMenu) {
        rebuild(menu)
        refresh()                       // opening it is an implicit "show me now"
    }

    private func rebuild(_ menu: NSMenu) {
        menu.removeAllItems()

        let header = NSMenuItem(title: "Claude plan usage", action: nil, keyEquivalent: "")
        header.isEnabled = false
        menu.addItem(header)
        menu.addItem(.separator())

        if let errorText = errorText {
            let row = NSMenuItem(title: errorText, action: nil, keyEquivalent: "")
            row.isEnabled = false
            menu.addItem(row)
        } else if limits.isEmpty {
            let row = NSMenuItem(title: loading ? "Loading…" : "No data", action: nil, keyEquivalent: "")
            row.isEnabled = false
            menu.addItem(row)
        } else {
            for limit in limits {
                let row = NSMenuItem(title: "\(limit.label)   \(limit.percent)%",
                                     action: nil, keyEquivalent: "")
                row.isEnabled = false
                // A text bar keeps it readable without drawing custom views.
                let filled = max(0, min(20, Int((Double(limit.percent) / 100.0 * 20).rounded())))
                let bar = String(repeating: "█", count: filled)
                    + String(repeating: "─", count: 20 - filled)
                var sub = bar
                if let reset = resetText(limit.resetsAt) { sub += "   " + reset }
                let detail = NSMenuItem(title: sub, action: nil, keyEquivalent: "")
                detail.isEnabled = false
                detail.attributedTitle = NSAttributedString(string: sub, attributes: [
                    .font: NSFont.monospacedSystemFont(ofSize: 10, weight: .regular),
                    .foregroundColor: NSColor.secondaryLabelColor,
                ])
                menu.addItem(row)
                menu.addItem(detail)
                menu.addItem(.separator())
            }
        }

        let updated: String
        if loading { updated = "Refreshing…" }
        else if let last = lastUpdate {
            let secs = Int(-last.timeIntervalSinceNow)
            updated = secs < 45 ? "Updated just now"
                : (secs < 3600 ? "Updated \(secs / 60)m ago" : "Updated \(secs / 3600)h ago")
        } else { updated = "Never updated" }

        let refreshItem = NSMenuItem(title: "Refresh  (\(updated))",
                                     action: #selector(refresh), keyEquivalent: "r")
        refreshItem.target = self
        menu.addItem(refreshItem)

        let settings = NSMenuItem(title: "Usage settings…", action: #selector(openSettings), keyEquivalent: "")
        settings.target = self
        menu.addItem(settings)

        menu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
    }

    @objc private func openSettings() {
        if let url = URL(string: SETTINGS_URL) { NSWorkspace.shared.open(url) }
    }

    @objc private func quit() { NSApp.terminate(nil) }
}

@main
enum ClaudeUsageApp {
    static func main() {
        let app = NSApplication.shared
        let controller = Controller()
        app.delegate = controller
        app.setActivationPolicy(.accessory)
        app.run()
    }
}
