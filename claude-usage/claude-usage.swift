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

// Spike watch. A long session burns the 5-hour window fast and quietly — you
// look up and it's at 75%. So compare the session percentage against where it
// was WINDOW ago and say something when the climb is steep.
let SPIKE_WINDOW = 15.0 * 60    // look back this far
let SPIKE_COOLDOWN = 20.0 * 60  // never nag twice inside this
let SPIKE_DEFAULT = 10          // points gained in the window = "a lot"
let SPIKE_CHOICES = [5, 10, 15, 20]
let KEY_SPIKE_ON = "spikeAlerts"
let KEY_SPIKE_THRESHOLD = "spikeThreshold"
let KEY_COMPACT = "compactTitle"

// Under the notch there isn't room for every status item, and macOS drops them
// from the left — the slot nearest the app menus goes first. Two defences:
// remember where the item was dragged to (below), and let the item shrink.
let STATUS_ITEM_AUTOSAVE = "claude-usage"

struct Limit {
    let label: String
    let percent: Int
    let resetsAt: Date?
    let isSession: Bool
}

struct Spike {
    let gain: Int               // points added
    let minutes: Int            // over this long
    let percent: Int            // where the session sits now
    let at: Date
}

final class Controller: NSObject, NSApplicationDelegate, NSMenuDelegate {

    // The autosave name is what makes a drag stick. Without one the item has no
    // saved slot, so every launch puts it back at the far left — the first
    // position macOS culls when the menu bar runs out of room. Set at creation:
    // AppKit restores the position as the item comes up, not later.
    private let item: NSStatusItem = {
        let created = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        created.autosaveName = STATUS_ITEM_AUTOSAVE
        return created
    }()
    private var timer: Timer?
    private var limits: [Limit] = []
    private var lastUpdate: Date?
    private var loading = false
    private var errorText: String?

    // Spike watch state.
    private var samples: [(date: Date, percent: Int)] = []
    private var sessionResetsAt: Date?      // to notice a 5-hour rollover
    private var spike: Spike?               // the banner currently showing
    private var lastSpikeAt: Date?
    private var spikeFloor: Int?            // percent when we last spoke up

    private var spikeAlertsOn: Bool {
        // Defaults to on: the whole point is to catch you when you aren't looking.
        UserDefaults.standard.object(forKey: KEY_SPIKE_ON) as? Bool ?? true
    }
    private var spikeThreshold: Int {
        let stored = UserDefaults.standard.integer(forKey: KEY_SPIKE_THRESHOLD)
        return stored > 0 ? stored : SPIKE_DEFAULT
    }
    /// Drops the asterisk and keeps the number — about 20 pt narrower, which is
    /// the difference between fitting and being hidden on a crowded menu bar.
    private var compactTitle: Bool {
        UserDefaults.standard.bool(forKey: KEY_COMPACT)
    }

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
                    self.noteSession()
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

    // MARK: - spike watch

    private var sessionLimit: Limit? {
        limits.first(where: { $0.isSession }) ?? limits.first
    }

    /// Record this reading and decide whether the climb since WINDOW ago counts
    /// as a jump worth interrupting for.
    private func noteSession() {
        guard let session = limits.first(where: { $0.isSession }) else { return }
        let now = Date()

        // A new 5-hour window starts: the reset stamp moves and the count drops
        // back toward zero. Wipe the history so the rollover itself — and the
        // climb that preceded it — can't read as a spike in the new window.
        let rolled: Bool = {
            guard let previous = sessionResetsAt, let current = session.resetsAt else { return false }
            return abs(current.timeIntervalSince(previous)) > 60
        }()
        if rolled || session.percent < (samples.last?.percent ?? 0) {
            samples.removeAll()
            spike = nil
            lastSpikeAt = nil
            spikeFloor = nil
        }
        sessionResetsAt = session.resetsAt

        samples.append((now, session.percent))
        samples.removeAll { now.timeIntervalSince($0.date) > SPIKE_WINDOW }

        // The banner outlives its cooldown by a bit, then clears itself so a
        // stale warning never sits in the menu.
        if let showing = spike, now.timeIntervalSince(showing.at) > SPIKE_COOLDOWN { spike = nil }

        guard spikeAlertsOn,
              // The oldest reading still inside the window is the anchor. It has
              // to be old enough that the delta means something.
              let anchor = samples.first, samples.count > 1,
              now.timeIntervalSince(anchor.date) >= 120
        else { return }

        let gain = session.percent - anchor.percent
        guard gain >= spikeThreshold else { return }
        // Don't re-nag on the same climb: cooldown, and require another
        // threshold's worth of ground gained before speaking up again.
        if let last = lastSpikeAt, now.timeIntervalSince(last) < SPIKE_COOLDOWN { return }
        if let floor = spikeFloor, session.percent < floor + spikeThreshold { return }

        let minutes = max(1, Int((now.timeIntervalSince(anchor.date) / 60).rounded()))
        let found = Spike(gain: gain, minutes: minutes, percent: session.percent, at: now)
        spike = found
        lastSpikeAt = now
        spikeFloor = session.percent
        notify(found)
    }

    private var spikeHeadline: String {
        guard let spike = spike else { return "" }
        return "Usage jumped \(spike.gain)% in \(spike.minutes) min — now \(spike.percent)%"
    }
    private let spikeAdvice = "Consider /compact or starting a new session."

    /// Posted through osascript because a bare swiftc binary has no bundle
    /// identifier, and UNUserNotificationCenter refuses to run without one.
    /// Cost of the shortcut: the banner is attributed to Script Editor.
    private func notify(_ spike: Spike) {
        func quoted(_ s: String) -> String {
            "\"" + s.replacingOccurrences(of: "\\", with: "\\\\")
                    .replacingOccurrences(of: "\"", with: "\\\"") + "\""
        }
        let script = "display notification \(quoted(spikeAdvice))"
            + " with title \(quoted("Claude usage"))"
            + " subtitle \(quoted(spikeHeadline))"
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        task.arguments = ["-e", script]
        task.standardOutput = Pipe()
        task.standardError = Pipe()
        try? task.run()
    }

    @objc private func dismissSpike() { spike = nil; render() }

    @objc private func toggleSpikeAlerts() {
        UserDefaults.standard.set(!spikeAlertsOn, forKey: KEY_SPIKE_ON)
        if !spikeAlertsOn { spike = nil }
        render()
    }

    @objc private func toggleCompact() {
        UserDefaults.standard.set(!compactTitle, forKey: KEY_COMPACT)
        render()
    }

    @objc private func setSpikeThreshold(_ sender: NSMenuItem) {
        UserDefaults.standard.set(sender.tag, forKey: KEY_SPIKE_THRESHOLD)
        spikeFloor = nil                  // new bar; re-arm against the current reading
    }

    // MARK: - drawing

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
        button.image = compactTitle ? nil : claudeIcon
        button.imagePosition = compactTitle ? .noImage : .imageLeading
        button.imageHugsTitle = true
        let text: String
        var color = NSColor.labelColor

        if errorText != nil {
            text = "–"
        } else if let session = sessionLimit {
            // The caret is the whole alert as far as the menu bar goes — it
            // changes the shape of the item, so it registers peripherally in a
            // way a colour change alone doesn't.
            text = (spike != nil ? "▲ " : "") + "\(session.percent)%"
            if session.percent >= 90 { color = .systemRed }
            else if session.percent >= 75 || spike != nil { color = .systemOrange }
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
        var tip = errorText ?? limits.map { "\($0.label): \($0.percent)%" }
            .joined(separator: "\n")
        if spike != nil { tip = spikeHeadline + "\n" + spikeAdvice + "\n\n" + tip }
        button.toolTip = tip
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
        menu.autoenablesItems = false    // isEnabled below is the authority

        let header = NSMenuItem(title: "Claude plan usage", action: nil, keyEquivalent: "")
        header.isEnabled = false
        menu.addItem(header)
        menu.addItem(.separator())

        if spike != nil {
            let banner = NSMenuItem(title: spikeHeadline, action: #selector(dismissSpike), keyEquivalent: "")
            banner.target = self
            banner.attributedTitle = NSAttributedString(string: "⚠︎  " + spikeHeadline, attributes: [
                .font: NSFont.systemFont(ofSize: 13, weight: .semibold),
                .foregroundColor: NSColor.systemOrange,
            ])
            menu.addItem(banner)

            let advice = NSMenuItem(title: spikeAdvice, action: nil, keyEquivalent: "")
            advice.isEnabled = false
            advice.attributedTitle = NSAttributedString(
                string: spikeAdvice + "   (click above to dismiss)", attributes: [
                    .font: NSFont.systemFont(ofSize: 11),
                    .foregroundColor: NSColor.secondaryLabelColor,
                ])
            menu.addItem(advice)
            menu.addItem(.separator())
        }

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

        let alerts = NSMenuItem(title: "Alert me on spikes", action: #selector(toggleSpikeAlerts), keyEquivalent: "")
        alerts.target = self
        alerts.state = spikeAlertsOn ? .on : .off
        menu.addItem(alerts)

        let sensitivity = NSMenuItem(title: "Spike is…", action: nil, keyEquivalent: "")
        let choices = NSMenu()
        for points in SPIKE_CHOICES {
            let choice = NSMenuItem(title: "+\(points)% in 15 min",
                                    action: #selector(setSpikeThreshold(_:)), keyEquivalent: "")
            choice.target = self
            choice.tag = points
            choice.state = points == spikeThreshold ? .on : .off
            choices.addItem(choice)
        }
        sensitivity.submenu = choices
        sensitivity.isEnabled = spikeAlertsOn
        menu.addItem(sensitivity)

        let compact = NSMenuItem(title: "Compact (number only)",
                                 action: #selector(toggleCompact), keyEquivalent: "")
        compact.target = self
        compact.state = compactTitle ? .on : .off
        compact.toolTip = "Narrower, so it survives a crowded menu bar. "
            + "Hold ⌘ and drag the item to move it away from the notch."
        menu.addItem(compact)

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
