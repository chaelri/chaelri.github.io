import AppKit
import CoreGraphics

// MARK: - Coordinates

/// Everything in ClickFlow is stored and shown in global Quartz points: origin at the
/// top-left of the main display, y down. AppKit uses bottom-left / y up, so every
/// NSScreen / NSWindow / NSEvent.mouseLocation value is converted at the boundary.
enum Geo {
    static var mainHeight: CGFloat { CGDisplayBounds(CGMainDisplayID()).height }

    static func quartz(fromCocoa p: NSPoint) -> CGPoint { CGPoint(x: p.x, y: mainHeight - p.y) }
    static func cocoa(fromQuartz p: CGPoint) -> NSPoint { NSPoint(x: p.x, y: mainHeight - p.y) }

    static func quartz(fromCocoa r: NSRect) -> CGRect {
        CGRect(x: r.minX, y: mainHeight - r.maxY, width: r.width, height: r.height)
    }

    static func frame(of screen: NSScreen) -> CGRect {
        if let id = screen.displayID { return CGDisplayBounds(id) }
        return quartz(fromCocoa: screen.frame)
    }

    static func screen(at p: CGPoint) -> NSScreen? {
        NSScreen.screens.first { frame(of: $0).contains(p) }
    }

    static func isOnScreen(_ p: CGPoint) -> Bool { screen(at: p) != nil }

    /// Current pointer position in Quartz points.
    static var mouse: CGPoint { CGEvent(source: nil)?.location ?? quartz(fromCocoa: NSEvent.mouseLocation) }
}

extension NSScreen {
    var displayID: CGDirectDisplayID? {
        deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID
    }
}

// MARK: - Posting events

enum EngineError: LocalizedError {
    case badShortcut(String)
    case noPermission
    case emptyClipboard
    case badURL(String)
    case http(Int, String)

    var errorDescription: String? {
        switch self {
        case .badShortcut(let s): return "Couldn't read the key shortcut \"\(s)\""
        case .noPermission: return "Accessibility permission is off"
        case .emptyClipboard: return "The clipboard had no text to post"
        case .badURL(let s): return "\"\(s)\" isn't a valid http(s) URL"
        case .http(let code, let body): return "POST failed with HTTP \(code)\(body.isEmpty ? "" : ": \(body)")"
        }
    }
}

@MainActor
enum ClickEngine {
    private static let source = CGEventSource(stateID: .hidSystemState)

    static func perform(_ step: Step, progress: ((Double) -> Void)? = nil) async throws {
        switch step.type {
        case .wait:
            return
        case .move:
            postMouse(.mouseMoved, step.point, .left)
        case .leftClick:
            try await click(step.point, button: .left, count: 1)
        case .doubleClick:
            try await click(step.point, button: .left, count: 2)
        case .rightClick:
            try await click(step.point, button: .right, count: 1)
        case .typeText:
            try await type(step.text, progress: progress)
        case .keyShortcut:
            guard let combo = KeyCombo.parse(step.keys) else { throw EngineError.badShortcut(step.keys) }
            press(combo)
        case .postClipboard:
            try await postClipboard(to: step.url)
        }
    }

    /// POSTs the clipboard text as-is. A JSON-looking clipboard goes as application/json.
    static func postClipboard(to raw: String) async throws {
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: s), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
            throw EngineError.badURL(s)
        }
        guard let text = NSPasteboard.general.string(forType: .string), !text.isEmpty else {
            throw EngineError.emptyClipboard
        }
        var req = URLRequest(url: url, timeoutInterval: 20)
        req.httpMethod = "POST"
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let looksJSON = (trimmed.hasPrefix("{") || trimmed.hasPrefix("["))
            && (try? JSONSerialization.jsonObject(with: Data(trimmed.utf8))) != nil
        req.setValue(looksJSON ? "application/json" : "text/plain; charset=utf-8", forHTTPHeaderField: "Content-Type")
        req.httpBody = Data(text.utf8)
        // URLSession's async API throws CancellationError on Stop, so the emergency stop still works mid-request.
        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw EngineError.http(code, String(decoding: data.prefix(200), as: UTF8.self))
        }
    }

    private static func postMouse(_ type: CGEventType, _ p: CGPoint, _ button: CGMouseButton, clickState: Int64? = nil) {
        guard let e = CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: p, mouseButton: button) else { return }
        if let c = clickState { e.setIntegerValueField(.mouseEventClickState, value: c) }
        e.post(tap: .cghidEventTap)
    }

    static func click(_ p: CGPoint, button: CGMouseButton, count: Int) async throws {
        // Hover first: some apps only arm a control after they have seen the pointer over it.
        postMouse(.mouseMoved, p, button)
        try await Task.sleep(nanoseconds: 35_000_000)
        let (down, up): (CGEventType, CGEventType) = button == .left
            ? (.leftMouseDown, .leftMouseUp) : (.rightMouseDown, .rightMouseUp)
        // Once a press starts it always finishes, so a stop can never leave a button held down.
        for n in 1...max(1, count) {
            postMouse(down, p, button, clickState: Int64(n))
            usleep(18_000)
            postMouse(up, p, button, clickState: Int64(n))
            if n < count { usleep(45_000) }
        }
    }

    static func type(_ text: String, progress: ((Double) -> Void)? = nil) async throws {
        let total = max(1, text.count)
        for (n, ch) in text.enumerated() {
            progress?(Double(n) / Double(total))
            try Task.checkCancellation()
            if ch == "\n" || ch == "\r" {
                press(KeyCombo(keyCode: 36, flags: [], name: "↩"))
            } else {
                let units = Array(String(ch).utf16)
                for isDown in [true, false] {
                    guard let e = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: isDown) else { continue }
                    e.flags = []
                    e.keyboardSetUnicodeString(stringLength: units.count, unicodeString: units)
                    e.post(tap: .cghidEventTap)
                }
            }
            try await Task.sleep(nanoseconds: 12_000_000)
        }
    }

    static func press(_ k: KeyCombo) {
        for isDown in [true, false] {
            guard let e = CGEvent(keyboardEventSource: source, virtualKey: k.keyCode, keyDown: isDown) else { continue }
            e.flags = k.flags
            e.post(tap: .cghidEventTap)
        }
    }

    /// True for events ClickFlow itself posted, so monitors can ignore them.
    nonisolated static func isSynthetic(_ e: NSEvent) -> Bool {
        e.cgEvent?.getIntegerValueField(.eventSourceUnixProcessID) == Int64(getpid())
    }
}

// MARK: - Key shortcuts

/// Parses "cmd+shift+s", "⌘⇧S", "return", "ctrl opt delete" and similar. US key layout.
struct KeyCombo: Equatable {
    var keyCode: CGKeyCode
    var flags: CGEventFlags
    var name: String

    var display: String {
        var s = ""
        if flags.contains(.maskControl) { s += "⌃" }
        if flags.contains(.maskAlternate) { s += "⌥" }
        if flags.contains(.maskShift) { s += "⇧" }
        if flags.contains(.maskCommand) { s += "⌘" }
        return s + name
    }

    private static let modifierSymbols: [Character: CGEventFlags] = [
        "⌘": .maskCommand, "⇧": .maskShift, "⌥": .maskAlternate, "⌃": .maskControl,
    ]

    private static let modifierWords: [String: CGEventFlags] = [
        "cmd": .maskCommand, "command": .maskCommand,
        "shift": .maskShift,
        "opt": .maskAlternate, "option": .maskAlternate, "alt": .maskAlternate,
        "ctrl": .maskControl, "control": .maskControl,
    ]

    static let keys: [String: (CGKeyCode, String)] = {
        var k: [String: (CGKeyCode, String)] = [:]
        let letters: [(String, CGKeyCode)] = [
            ("a", 0), ("s", 1), ("d", 2), ("f", 3), ("h", 4), ("g", 5), ("z", 6), ("x", 7), ("c", 8), ("v", 9),
            ("b", 11), ("q", 12), ("w", 13), ("e", 14), ("r", 15), ("y", 16), ("t", 17), ("o", 31), ("u", 32),
            ("i", 34), ("p", 35), ("l", 37), ("j", 38), ("k", 40), ("n", 45), ("m", 46),
        ]
        for (l, c) in letters { k[l] = (c, l.uppercased()) }
        let digits: [(String, CGKeyCode)] = [
            ("1", 18), ("2", 19), ("3", 20), ("4", 21), ("6", 22), ("5", 23), ("9", 25), ("7", 26), ("8", 28), ("0", 29),
        ]
        for (d, c) in digits { k[d] = (c, d) }
        let punct: [(String, CGKeyCode)] = [
            ("=", 24), ("-", 27), ("]", 30), ("[", 33), ("'", 39), (";", 41), ("\\", 42), (",", 43), ("/", 44),
            (".", 47), ("`", 50),
        ]
        for (p, c) in punct { k[p] = (c, p) }
        let named: [([String], CGKeyCode, String)] = [
            (["return", "enter", "↩"], 36, "↩"), (["tab", "⇥"], 48, "⇥"), (["space", "spacebar"], 49, "Space"),
            (["delete", "backspace", "⌫"], 51, "⌫"), (["esc", "escape", "⎋"], 53, "⎋"),
            (["forwarddelete", "del", "⌦"], 117, "⌦"),
            (["left", "←"], 123, "←"), (["right", "→"], 124, "→"), (["down", "↓"], 125, "↓"), (["up", "↑"], 126, "↑"),
            (["home"], 115, "↖"), (["end"], 119, "↘"), (["pageup"], 116, "⇞"), (["pagedown"], 121, "⇟"),
            (["f1"], 122, "F1"), (["f2"], 120, "F2"), (["f3"], 99, "F3"), (["f4"], 118, "F4"),
            (["f5"], 96, "F5"), (["f6"], 97, "F6"), (["f7"], 98, "F7"), (["f8"], 100, "F8"),
            (["f9"], 101, "F9"), (["f10"], 109, "F10"), (["f11"], 103, "F11"), (["f12"], 111, "F12"),
        ]
        for (names, c, d) in named { for n in names { k[n] = (c, d) } }
        return k
    }()

    static func parse(_ raw: String) -> KeyCombo? {
        var flags: CGEventFlags = []
        var rest = ""
        for ch in raw {
            if let f = modifierSymbols[ch] { flags.insert(f) } else { rest.append(ch) }
        }
        let tokens = rest.lowercased()
            .split(whereSeparator: { $0 == "+" || $0 == " " })
            .map(String.init)
        var key: (CGKeyCode, String)?
        for t in tokens {
            if let f = modifierWords[t] { flags.insert(f); continue }
            guard key == nil, let k = keys[t] else { return nil }
            key = k
        }
        guard let (code, name) = key else { return nil }
        return KeyCombo(keyCode: code, flags: flags, name: name)
    }
}
