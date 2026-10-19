import SwiftUI
import AppKit
import UniformTypeIdentifiers

/// On-disk shape of macros.json and of export files.
struct MacroFile: Codable {
    var version = 1
    var macros: [Macro]
}

enum Prefs {
    static let hideWindowDuringRuns = "hideWindowDuringRuns"
    static let showClickRing = "showClickRing"
    static let onboarded = "onboarded"
    static let pausedAll = "pausedAll"

    static func registerDefaults() {
        UserDefaults.standard.register(defaults: [hideWindowDuringRuns: true, showClickRing: true])
    }

    static var hideWindow: Bool { UserDefaults.standard.bool(forKey: hideWindowDuringRuns) }
    static var clickRing: Bool { UserDefaults.standard.bool(forKey: showClickRing) }
}

@MainActor
final class Store: ObservableObject {
    static let shared = Store()

    @Published var macros: [Macro] = [] { didSet { if loaded { scheduleSave(macros: true) } } }
    @Published var history: [RunRecord] = [] { didSet { if loaded { scheduleSave(macros: false) } } }
    @Published var pausedAll: Bool = UserDefaults.standard.bool(forKey: Prefs.pausedAll) {
        didSet { UserDefaults.standard.set(pausedAll, forKey: Prefs.pausedAll) }
    }

    let directory: URL
    private var loaded = false
    private var pendingMacros: DispatchWorkItem?
    private var pendingHistory: DispatchWorkItem?

    var macrosURL: URL { directory.appendingPathComponent("macros.json") }
    var historyURL: URL { directory.appendingPathComponent("history.json") }
    var stateURL: URL { directory.appendingPathComponent("scheduler-state.json") }

    nonisolated(unsafe) static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    nonisolated(unsafe) static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private init() {
        Prefs.registerDefaults()
        directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ClickFlow", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        load()
    }

    private func load() {
        if let data = try? Data(contentsOf: macrosURL) {
            if let file = try? Store.decoder.decode(MacroFile.self, from: data) {
                macros = file.macros
            } else {
                // Never overwrite a file we couldn't read: set it aside and start fresh.
                let backup = directory.appendingPathComponent("macros.unreadable-\(Int(Date().timeIntervalSince1970)).json")
                try? FileManager.default.moveItem(at: macrosURL, to: backup)
            }
        } else {
            macros = [Store.exampleMacro()]
        }
        if let data = try? Data(contentsOf: historyURL),
           let h = try? Store.decoder.decode([RunRecord].self, from: data) {
            history = h
        }
        loaded = true
        if !FileManager.default.fileExists(atPath: macrosURL.path) { writeMacros() }
    }

    private static func exampleMacro() -> Macro {
        let f = CGDisplayBounds(CGMainDisplayID())
        let cx = (f.midX).rounded(), cy = (f.midY).rounded()
        return Macro(name: "Example", steps: [
            Step(type: .leftClick, x: cx, y: cy),
            Step(type: .wait, seconds: 1.5),
            Step(type: .leftClick, x: cx + 120, y: cy, delayBefore: 0.5),
        ])
    }

    // MARK: Saving

    private func scheduleSave(macros: Bool) {
        let item = DispatchWorkItem { [weak self] in
            MainActor.assumeIsolated { macros ? self?.writeMacros() : self?.writeHistory() }
        }
        if macros { pendingMacros?.cancel(); pendingMacros = item } else { pendingHistory?.cancel(); pendingHistory = item }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: item)
    }

    private func writeMacros() {
        guard let data = try? Store.encoder.encode(MacroFile(macros: macros)) else { return }
        try? data.write(to: macrosURL, options: .atomic)
    }

    private func writeHistory() {
        guard let data = try? Store.encoder.encode(history) else { return }
        try? data.write(to: historyURL, options: .atomic)
    }

    func flush() {
        pendingMacros?.cancel()
        pendingHistory?.cancel()
        writeMacros()
        writeHistory()
    }

    // MARK: Access

    func macro(_ id: UUID) -> Macro? { macros.first { $0.id == id } }

    func binding(_ id: UUID) -> Binding<Macro>? {
        guard let current = macro(id) else { return nil }
        return Binding(
            get: { [weak self] in self?.macro(id) ?? current },
            set: { [weak self] value in
                guard let self, let i = self.macros.firstIndex(where: { $0.id == id }) else { return }
                if self.macros[i] != value { self.macros[i] = value }
            })
    }

    var nextRun: (macro: Macro, date: Date)? {
        guard !pausedAll else { return nil }
        let now = Date()
        return macros.compactMap { m in m.nextRun(after: now).map { (m, $0) } }.min { $0.1 < $1.1 }
    }

    // MARK: Editing

    @discardableResult
    func newMacro(name: String = "New Macro", steps: [Step] = []) -> Macro {
        let m = Macro(name: uniqueName(name), steps: steps)
        macros.append(m)
        AppState.shared.selection = .macro(m.id)
        return m
    }

    func duplicate(_ id: UUID) {
        guard var m = macro(id), let i = macros.firstIndex(where: { $0.id == id }) else { return }
        m.id = UUID()
        m.name = uniqueName("\(m.name) copy")
        m.steps = m.steps.map { var s = $0; s.id = UUID(); return s }
        m.schedules = m.schedules.map { var s = $0; s.id = UUID(); return s }
        macros.insert(m, at: i + 1)
        AppState.shared.selection = .macro(m.id)
    }

    func delete(_ id: UUID) {
        macros.removeAll { $0.id == id }
        if AppState.shared.selection == .macro(id) {
            AppState.shared.selection = macros.first.map { .macro($0.id) }
        }
    }

    func uniqueName(_ base: String) -> String {
        let names = Set(macros.map(\.name))
        guard names.contains(base) else { return base }
        var n = 2
        while names.contains("\(base) \(n)") { n += 1 }
        return "\(base) \(n)"
    }

    func log(_ r: RunRecord) {
        history.append(r)
        if history.count > 2000 { history.removeFirst(history.count - 2000) }
    }

    // MARK: Import / export

    func export(_ list: [Macro]) {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.json]
        let base = list.count == 1 ? list[0].name : "ClickFlow Macros"
        panel.nameFieldStringValue = "\(base.replacingOccurrences(of: "/", with: "-")).clickflow.json"
        NSApp.activate(ignoringOtherApps: true)
        guard panel.runModal() == .OK, let url = panel.url,
              let data = try? Store.encoder.encode(MacroFile(macros: list)) else { return }
        do { try data.write(to: url, options: .atomic) } catch { Alerts.show("Couldn't export", error.localizedDescription) }
    }

    func importMacros() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json]
        panel.allowsMultipleSelection = true
        NSApp.activate(ignoringOtherApps: true)
        guard panel.runModal() == .OK else { return }
        var added: [Macro] = []
        var failed: [String] = []
        for url in panel.urls {
            guard let data = try? Data(contentsOf: url), let list = Store.parseMacros(data) else {
                failed.append(url.lastPathComponent)
                continue
            }
            for var m in list {
                if macro(m.id) != nil || added.contains(where: { $0.id == m.id }) { m.id = UUID() }
                m.name = uniqueName(m.name)
                added.append(m)
                macros.append(m)
            }
        }
        if let last = added.last { AppState.shared.selection = .macro(last.id) }
        if !failed.isEmpty {
            Alerts.show("Some files couldn't be imported", failed.joined(separator: "\n"))
        }
    }

    /// Accepts an export file, a bare array of macros, or a single macro object.
    nonisolated static func parseMacros(_ data: Data) -> [Macro]? {
        if let f = try? decoder.decode(MacroFile.self, from: data) { return f.macros }
        if let a = try? decoder.decode([Macro].self, from: data) { return a }
        if let m = try? decoder.decode(Macro.self, from: data) { return [m] }
        return nil
    }
}

enum SidebarItem: Hashable {
    case macro(UUID), history, settings
}

@MainActor
final class AppState: ObservableObject {
    static let shared = AppState()
    @Published var selection: SidebarItem?
    @Published var showOnboarding = false
}

@MainActor
enum Alerts {
    static func show(_ title: String, _ text: String) {
        let a = NSAlert()
        a.messageText = title
        a.informativeText = text
        NSApp.activate(ignoringOtherApps: true)
        a.runModal()
    }

    /// Returns true if the user picked the first (default) button.
    static func confirm(_ title: String, _ text: String, ok: String, cancel: String = "Cancel") -> Bool {
        let a = NSAlert()
        a.messageText = title
        a.informativeText = text
        a.addButton(withTitle: ok)
        a.addButton(withTitle: cancel)
        NSApp.activate(ignoringOtherApps: true)
        return a.runModal() == .alertFirstButtonReturn
    }
}
