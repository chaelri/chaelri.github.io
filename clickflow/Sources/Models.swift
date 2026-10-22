import Foundation
import AppKit

// MARK: - Steps

enum StepType: String, Codable, CaseIterable, Identifiable {
    case leftClick, doubleClick, rightClick, move, wait, typeText, keyShortcut, postClipboard, readText, openURL, discordMessage, shutdown

    var id: String { rawValue }

    var label: String {
        switch self {
        case .leftClick: return "Left click"
        case .doubleClick: return "Double click"
        case .rightClick: return "Right click"
        case .move: return "Move mouse"
        case .wait: return "Wait"
        case .typeText: return "Type text"
        case .keyShortcut: return "Key shortcut"
        case .postClipboard: return "Post clipboard"
        case .readText: return "Screenshot area"
        case .openURL: return "Open link in Chrome"
        case .discordMessage: return "Send to Discord"
        case .shutdown: return "Force shut down"
        }
    }

    var symbol: String {
        switch self {
        case .leftClick: return "cursorarrow.click"
        case .doubleClick: return "cursorarrow.click.2"
        case .rightClick: return "contextualmenu.and.cursorarrow"
        case .move: return "cursorarrow.motionlines"
        case .wait: return "hourglass"
        case .typeText: return "keyboard"
        case .keyShortcut: return "command"
        case .postClipboard: return "paperplane"
        case .readText: return "text.viewfinder"
        case .openURL: return "globe"
        case .discordMessage: return "paperplane.circle"
        case .shutdown: return "power"
        }
    }

    var hasPoint: Bool {
        switch self {
        case .leftClick, .doubleClick, .rightClick, .move: return true
        default: return false
        }
    }

    var isClick: Bool { hasPoint && self != .move }

    var verb: String {
        switch self {
        case .leftClick: return "Clicking"
        case .doubleClick: return "Double-clicking"
        case .rightClick: return "Right-clicking"
        case .move: return "Moving"
        case .wait: return "Waiting"
        case .typeText: return "Typing"
        case .keyShortcut: return "Pressing"
        case .postClipboard: return "Sending"
        case .readText: return "Capturing"
        case .openURL: return "Opening"
        case .discordMessage: return "Sending"
        case .shutdown: return "Shutting down"
        }
    }

    /// What a preview / show-only step says instead of doing it.
    var wouldVerb: String {
        switch self {
        case .leftClick: return "Would click here"
        case .doubleClick: return "Would double-click here"
        case .rightClick: return "Would right-click here"
        case .move: return "Would move here"
        case .wait: return "Waiting"
        case .typeText: return "Would type this"
        case .keyShortcut: return "Would press this"
        case .postClipboard: return "Would post the clipboard"
        case .readText: return "Would capture this area"
        case .openURL: return "Would open this link"
        case .discordMessage: return "Would send this message"
        case .shutdown: return "Would shut down the computer"
        }
    }

    /// Steps that post synthetic input; a network step works without the permission.
    var needsAccessibility: Bool {
        self != .wait && self != .postClipboard && self != .openURL && self != .discordMessage && self != .shutdown && !hasArea
    }

    /// Steps that work on a screen rectangle (x, y, width, height).
    var hasArea: Bool { self == .readText }
}

/// One step of a macro. Coordinates are global Quartz points: origin at the top-left
/// of the main display, y grows downward, negative on displays left of / above it.
struct Step: Identifiable, Equatable {
    var id = UUID()
    var type: StepType
    /// Optional label shown on the card, in the HUD and in run history.
    var name = ""
    var x: Double = 0
    var y: Double = 0
    var delayBefore: Double = 0
    var seconds: Double = 1
    var text = ""
    var keys = ""
    var url = ""
    /// Never executed: runs only show where it would act (marker + HUD), then move on.
    var showOnly = false
    /// Read text: the area is x, y (top-left) + width × height, in points.
    var width: Double = 300
    var height: Double = 120
    /// Read text: put the result on the clipboard (so Post clipboard can send it).
    var copyResult = true
    /// Screenshot area: post the image straight to the Discord webhook.
    var sendDiscord = false
    /// Screenshot area: send only the message to Discord, no image.
    var textOnly = false

    var point: CGPoint { CGPoint(x: x, y: y) }
    var area: CGRect { CGRect(x: x, y: y, width: max(1, width), height: max(1, height)) }

    /// "Step 3 · Open timesheet" when named, "Step 3" otherwise.
    func title(_ number: Int) -> String {
        let n = name.trimmingCharacters(in: .whitespaces)
        return n.isEmpty ? "Step \(number)" : "Step \(number) · \(n)"
    }

    /// The step's own name, or its type when unnamed.
    var heading: String {
        let n = name.trimmingCharacters(in: .whitespaces)
        return n.isEmpty ? type.label : n
    }

    /// One line on what the step does, for the run HUD.
    var detail: String {
        switch type {
        case .move:
            return "Move to \(Fmt.coord(x)), \(Fmt.coord(y))"
        case .leftClick, .doubleClick, .rightClick:
            return "\(type.label) at \(Fmt.coord(x)), \(Fmt.coord(y))"
        case .wait:
            return "Wait \(Fmt.seconds(seconds))"
        case .typeText:
            let flat = text.replacingOccurrences(of: "\n", with: " ⏎ ")
            return "Type “\(flat)” · \(text.count) chars"
        case .keyShortcut:
            return "Press \(KeyCombo.parse(keys)?.display ?? keys)"
        case .postClipboard:
            return "Post clipboard → \(URL(string: url)?.host ?? url)"
        case .discordMessage:
            let flat = text.replacingOccurrences(of: "\n", with: " ⏎ ")
            return "Send “\(flat)” to Discord"
        case .openURL:
            return "Open \(OpenLink.normalized(url)?.host ?? (url.isEmpty ? "a link" : url)) in Chrome"
        case .shutdown:
            return text.isEmpty ? "Force shut down the Mac (unsaved work is lost)" : "Send to Discord, then force shut down the Mac"
        case .readText:
            var outs = ["text"]
            if copyResult { outs.append("clipboard") }
            if sendDiscord { outs.append("Discord") }
            return "Screenshot \(Int(width))×\(Int(height)) at \(Fmt.coord(x)), \(Fmt.coord(y)) → " + outs.joined(separator: " · ")
        }
    }

    /// Time this step adds to a run (waits + delays; the actions themselves are near-instant).
    var duration: Double { type == .wait ? seconds : delayBefore }
}

extension Step: Codable {
    enum CodingKeys: String, CodingKey { case type, name, x, y, delayBefore, seconds, text, keys, url, showOnly, width, height, copyResult, sendDiscord, includeText, textOnly }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // "sendScreenshot" was its own step before it merged into Screenshot area.
        let rawType = try c.decode(String.self, forKey: .type)
        let legacyDiscord = rawType == "sendScreenshot"
        guard let t = legacyDiscord ? .readText : StepType(rawValue: rawType) else {
            throw DecodingError.dataCorruptedError(forKey: .type, in: c, debugDescription: "Unknown step type \(rawType)")
        }
        type = t
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        x = try c.decodeIfPresent(Double.self, forKey: .x) ?? 0
        y = try c.decodeIfPresent(Double.self, forKey: .y) ?? 0
        delayBefore = max(0, try c.decodeIfPresent(Double.self, forKey: .delayBefore) ?? 0)
        seconds = max(0, try c.decodeIfPresent(Double.self, forKey: .seconds) ?? 1)
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
        keys = try c.decodeIfPresent(String.self, forKey: .keys) ?? ""
        url = try c.decodeIfPresent(String.self, forKey: .url) ?? ""
        showOnly = try c.decodeIfPresent(Bool.self, forKey: .showOnly) ?? false
        width = try c.decodeIfPresent(Double.self, forKey: .width) ?? 300
        height = try c.decodeIfPresent(Double.self, forKey: .height) ?? 120
        copyResult = try c.decodeIfPresent(Bool.self, forKey: .copyResult) ?? !legacyDiscord
        sendDiscord = try c.decodeIfPresent(Bool.self, forKey: .sendDiscord) ?? legacyDiscord
        textOnly = try c.decodeIfPresent(Bool.self, forKey: .textOnly) ?? false
        // "Include the text it read" became the {text} variable in the message.
        if type == .readText, try c.decodeIfPresent(Bool.self, forKey: .includeText) ?? !legacyDiscord,
           !text.contains("{text}") {
            text = text.isEmpty ? "{text}" : text + "\n{text}"
        }
    }

    // Only the fields a step's type uses, so exports read like the spec's example.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(type, forKey: .type)
        if !name.isEmpty { try c.encode(name, forKey: .name) }
        if showOnly, type != .wait { try c.encode(true, forKey: .showOnly) }
        switch type {
        case .wait:
            try c.encode(seconds, forKey: .seconds)
        case .typeText:
            try c.encode(text, forKey: .text)
            try c.encode(delayBefore, forKey: .delayBefore)
        case .keyShortcut:
            try c.encode(keys, forKey: .keys)
            try c.encode(delayBefore, forKey: .delayBefore)
        case .postClipboard, .openURL:
            try c.encode(url, forKey: .url)
            try c.encode(delayBefore, forKey: .delayBefore)
        case .discordMessage:
            try c.encode(text, forKey: .text)
            try c.encode(delayBefore, forKey: .delayBefore)
        case .shutdown:
            try c.encode(text, forKey: .text)
            try c.encode(delayBefore, forKey: .delayBefore)
        case .readText:
            try c.encode(x, forKey: .x)
            try c.encode(y, forKey: .y)
            try c.encode(width, forKey: .width)
            try c.encode(height, forKey: .height)
            try c.encode(copyResult, forKey: .copyResult)
            try c.encode(sendDiscord, forKey: .sendDiscord)
            try c.encode(textOnly, forKey: .textOnly)
            if !text.isEmpty { try c.encode(text, forKey: .text) }
            try c.encode(delayBefore, forKey: .delayBefore)
        default:
            try c.encode(x, forKey: .x)
            try c.encode(y, forKey: .y)
            try c.encode(delayBefore, forKey: .delayBefore)
        }
    }
}

// MARK: - Macro

struct Macro: Identifiable, Equatable {
    var id = UUID()
    var name: String
    var enabled = true
    /// 0 = until stopped.
    var repeatCount = 1
    var repeatDelay: Double = 0
    var steps: [Step] = []
    var schedules: [Schedule] = []

    var singleRunDuration: Double { steps.reduce(0) { $0 + $1.duration } }

    /// nil when the macro repeats until stopped.
    var totalDuration: Double? {
        guard repeatCount > 0 else { return nil }
        return singleRunDuration * Double(repeatCount) + repeatDelay * Double(repeatCount - 1)
    }

    var scheduleSummary: String? {
        let active = schedules.filter(\.enabled)
        guard let first = active.first else {
            return schedules.isEmpty ? nil : "Schedules off"
        }
        return active.count > 1 ? "\(first.summary) +\(active.count - 1)" : first.summary
    }

    func nextRun(after date: Date = Date()) -> Date? {
        guard enabled else { return nil }
        return schedules.filter(\.enabled).compactMap { $0.nextOccurrence(after: date) }.min()
    }
}

extension Macro: Codable {
    enum CodingKeys: String, CodingKey { case id, name, enabled, repeatCount, repeatDelay, steps, schedules }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? "Untitled"
        enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled) ?? true
        repeatCount = max(0, try c.decodeIfPresent(Int.self, forKey: .repeatCount) ?? 1)
        repeatDelay = max(0, try c.decodeIfPresent(Double.self, forKey: .repeatDelay) ?? 0)
        steps = try c.decodeIfPresent([Step].self, forKey: .steps) ?? []
        schedules = try c.decodeIfPresent([Schedule].self, forKey: .schedules) ?? []
    }
}

// MARK: - Schedules

enum RepeatKind: String, Codable, CaseIterable, Identifiable {
    case daily, weekdays, weekends, custom, once, interval
    var id: String { rawValue }

    var label: String {
        switch self {
        case .daily: return "Every day"
        case .weekdays: return "Every weekday"
        case .weekends: return "Every weekend"
        case .custom: return "Custom days"
        case .once: return "Once"
        case .interval: return "Interval"
        }
    }
}

enum MissedRunPolicy: String, Codable, CaseIterable {
    case skip, runOnce
}

struct Conditions: Equatable {
    /// yyyy-MM-dd, inclusive.
    var startDate: String?
    var endDate: String?
    /// App name or bundle identifier.
    var requireApp: String?
    var requireFrontmost = false
    var minIdleSeconds: Int?

    var activeCount: Int {
        [startDate != nil, endDate != nil, !(requireApp ?? "").isEmpty, (minIdleSeconds ?? 0) > 0]
            .filter { $0 }.count
    }
}

extension Conditions: Codable {
    enum CodingKeys: String, CodingKey {
        case startDate, endDate, requireApp, requireFrontmost, minIdleSeconds
        case requireAppRunning   // spelling used in the spec's example
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        startDate = try c.decodeIfPresent(String.self, forKey: .startDate)
        endDate = try c.decodeIfPresent(String.self, forKey: .endDate)
        requireApp = try c.decodeIfPresent(String.self, forKey: .requireApp)
            ?? c.decodeIfPresent(String.self, forKey: .requireAppRunning)
        requireFrontmost = try c.decodeIfPresent(Bool.self, forKey: .requireFrontmost) ?? false
        minIdleSeconds = try c.decodeIfPresent(Int.self, forKey: .minIdleSeconds)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(startDate, forKey: .startDate)
        try c.encodeIfPresent(endDate, forKey: .endDate)
        try c.encodeIfPresent(requireApp, forKey: .requireApp)
        try c.encode(requireFrontmost, forKey: .requireFrontmost)
        try c.encodeIfPresent(minIdleSeconds, forKey: .minIdleSeconds)
    }
}

struct Schedule: Identifiable, Equatable {
    var id = UUID()
    var enabled = true
    /// HH:mm, 24-hour, local time. For `.interval` this is the window start.
    var time = "09:00"
    var repeatKind: RepeatKind = .weekdays
    /// Calendar weekdays, 1 = Sunday … 7 = Saturday. Used by `.custom` and `.interval`.
    var customDays: [Int] = []
    /// yyyy-MM-dd, for `.once`.
    var date: String?
    var intervalMinutes = 30
    /// HH:mm, window end for `.interval`.
    var endTime = "17:00"
    var missedRunPolicy: MissedRunPolicy = .skip
    var conditions = Conditions()
}

extension Schedule: Codable {
    enum CodingKeys: String, CodingKey {
        case id, enabled, time, customDays, date, intervalMinutes, endTime, missedRunPolicy, conditions
        case repeatKind = "repeat"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled) ?? true
        time = try c.decodeIfPresent(String.self, forKey: .time) ?? "09:00"
        repeatKind = try c.decodeIfPresent(RepeatKind.self, forKey: .repeatKind) ?? .daily
        customDays = try c.decodeIfPresent([Int].self, forKey: .customDays) ?? []
        date = try c.decodeIfPresent(String.self, forKey: .date)
        intervalMinutes = max(1, try c.decodeIfPresent(Int.self, forKey: .intervalMinutes) ?? 30)
        endTime = try c.decodeIfPresent(String.self, forKey: .endTime) ?? "17:00"
        missedRunPolicy = try c.decodeIfPresent(MissedRunPolicy.self, forKey: .missedRunPolicy) ?? .skip
        conditions = try c.decodeIfPresent(Conditions.self, forKey: .conditions) ?? Conditions()
    }
}

extension Schedule {
    static let allDays = Set(1...7)

    var weekdaySet: Set<Int> {
        switch repeatKind {
        case .daily: return Schedule.allDays
        case .weekdays: return [2, 3, 4, 5, 6]
        case .weekends: return [1, 7]
        case .custom, .interval: return Set(customDays.filter { (1...7).contains($0) })
        case .once: return []
        }
    }

    /// Fire times on a given day, ignoring the weekday filter.
    func times(on day: Date, calendar cal: Calendar) -> [Date] {
        guard let (h, m) = Clock.parse(time),
              let start = cal.date(bySettingHour: h, minute: m, second: 0, of: day) else { return [] }
        guard repeatKind == .interval else { return [start] }
        guard intervalMinutes > 0, let (eh, em) = Clock.parse(endTime),
              let end = cal.date(bySettingHour: eh, minute: em, second: 0, of: day), end > start else { return [start] }
        var out: [Date] = []
        var t = start
        while t <= end {
            out.append(t)
            t = t.addingTimeInterval(Double(intervalMinutes) * 60)
        }
        return out
    }

    /// The first fire time strictly after `after`, honouring the date-range condition.
    func nextOccurrence(after: Date, calendar cal: Calendar = .current) -> Date? {
        let startBound = conditions.startDate.flatMap(DayString.date).map { cal.startOfDay(for: $0) }
        let endBound = conditions.endDate.flatMap(DayString.date).map { cal.startOfDay(for: $0) }

        if repeatKind == .once {
            guard let d = date.flatMap(DayString.date) else { return nil }
            let day = cal.startOfDay(for: d)
            if let s = startBound, day < s { return nil }
            if let e = endBound, day > e { return nil }
            return times(on: day, calendar: cal).first { $0 > after }
        }

        let days = weekdaySet
        guard !days.isEmpty else { return nil }
        var day = cal.startOfDay(for: after)
        if let s = startBound, s > day { day = s }
        for _ in 0..<370 {
            if let e = endBound, day > e { return nil }
            if days.contains(cal.component(.weekday, from: day)),
               let t = times(on: day, calendar: cal).first(where: { $0 > after }) {
                return t
            }
            guard let next = cal.date(byAdding: .day, value: 1, to: day) else { return nil }
            day = next
        }
        return nil
    }

    var summary: String {
        let t = Clock.display(time)
        switch repeatKind {
        case .daily: return "Every day at \(t)"
        case .weekdays: return "Every weekday at \(t)"
        case .weekends: return "Every weekend at \(t)"
        case .custom:
            return customDays.isEmpty ? "No days picked" : "\(Schedule.dayList(weekdaySet)) at \(t)"
        case .once:
            let d = date.flatMap(DayString.date).map { Fmt.longDay($0) } ?? "no date"
            return "Once on \(d) at \(t)"
        case .interval:
            let every = intervalMinutes % 60 == 0
                ? (intervalMinutes == 60 ? "hour" : "\(intervalMinutes / 60) hours")
                : "\(intervalMinutes) min"
            let days = weekdaySet
            let suffix = days == Schedule.allDays ? "" : (days.isEmpty ? ", no days picked" : ", \(Schedule.dayList(days))")
            return "Every \(every), \(t)–\(Clock.display(endTime))\(suffix)"
        }
    }

    /// "Mon, Wed, Fri" — or "Weekdays" / "Weekends" when it is exactly one of those.
    static func dayList(_ days: Set<Int>) -> String {
        if days == [2, 3, 4, 5, 6] { return "Weekdays" }
        if days == [1, 7] { return "Weekends" }
        if days == allDays { return "Every day" }
        let symbols = Calendar.current.shortWeekdaySymbols
        return [2, 3, 4, 5, 6, 7, 1].filter(days.contains).map { symbols[$0 - 1] }.joined(separator: ", ")
    }
}

// MARK: - Run history

enum RunTrigger: String, Codable {
    case manual, scheduled, test, preview

    var label: String {
        switch self {
        case .manual: return "Manual"
        case .scheduled: return "Scheduled"
        case .test: return "Step test"
        case .preview: return "Preview"
        }
    }

    var symbol: String {
        switch self {
        case .manual: return "hand.tap"
        case .scheduled: return "alarm"
        case .test: return "testtube.2"
        case .preview: return "eye"
        }
    }
}

enum RunResult: String, Codable {
    case completed, stopped, skipped, failed
}

struct RunRecord: Identifiable, Codable, Equatable {
    var id = UUID()
    var macroID: UUID?
    var macroName: String
    var trigger: RunTrigger
    var start: Date
    var end: Date?
    var result: RunResult
    var reason: String?
}

// MARK: - Time helpers

enum Clock {
    static func parse(_ s: String) -> (Int, Int)? {
        let parts = s.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2, (0...23).contains(parts[0]), (0...59).contains(parts[1]) else { return nil }
        return (parts[0], parts[1])
    }

    static func string(_ d: Date, calendar cal: Calendar = .current) -> String {
        let c = cal.dateComponents([.hour, .minute], from: d)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }

    static func date(_ s: String, on day: Date = Date()) -> Date {
        let (h, m) = parse(s) ?? (9, 0)
        return Calendar.current.date(bySettingHour: h, minute: m, second: 0, of: day) ?? day
    }

    static func display(_ s: String) -> String {
        guard parse(s) != nil else { return s }
        return Fmt.time.string(from: date(s))
    }
}

enum DayString {
    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func date(_ s: String) -> Date? { formatter.date(from: s) }
    static func string(_ d: Date) -> String { formatter.string(from: d) }
}

enum Fmt {
    static let time: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .none
        f.timeStyle = .short
        return f
    }()

    private static let weekdayDay: DateFormatter = {
        let f = DateFormatter()
        f.setLocalizedDateFormatFromTemplate("EEEMMMd")
        return f
    }()

    private static let fullDay: DateFormatter = {
        let f = DateFormatter()
        f.setLocalizedDateFormatFromTemplate("EEEMMMdyyyy")
        return f
    }()

    private static let stamp: DateFormatter = {
        let f = DateFormatter()
        f.setLocalizedDateFormatFromTemplate("EEEMMMd jmmss")
        return f
    }()

    /// "Today at 9:00 AM", "Tomorrow at 9:00 AM", "Tue, Oct 20 at 9:00 AM".
    static func nextRun(_ d: Date) -> String {
        let cal = Calendar.current
        let t = time.string(from: d)
        if cal.isDateInToday(d) { return "Today at \(t)" }
        if cal.isDateInTomorrow(d) { return "Tomorrow at \(t)" }
        return "\(weekdayDay.string(from: d)) at \(t)"
    }

    static func longDay(_ d: Date) -> String { fullDay.string(from: d) }
    static func stamp(_ d: Date) -> String { stamp.string(from: d) }

    static func seconds(_ s: Double) -> String {
        if s < 60 { return String(format: "%.1fs", s) }
        let total = Int(s.rounded())
        let h = total / 3600, m = (total % 3600) / 60, sec = total % 60
        return h > 0 ? "\(h)h \(m)m" : "\(m)m \(sec)s"
    }

    static func coord(_ v: Double) -> String {
        v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v)
    }
}

/// `{text}`, `{date}`, `{time}`, `{macro}` in a Discord message.
enum MessageVars {
    static let all: [(token: String, help: String)] = [
        ("{text}", "the text it read"), ("{clipboard}", "what's on the clipboard"),
        ("{date}", "today's date"), ("{time}", "the time now"), ("{macro}", "this macro's name"),
    ]
    /// For a Send to Discord step, {text} is the last Screenshot area read in the same run.
    static let forMessage: [(token: String, help: String)] = [
        ("{clipboard}", "what's on the clipboard"), ("{text}", "the last text a Screenshot area step read in this run"),
        ("{date}", "today's date"), ("{time}", "the time now"), ("{macro}", "this macro's name"),
    ]

    static func fill(_ template: String, text: String, macro: String, now: Date = Date(),
                     clipboard: () -> String = { NSPasteboard.general.string(forType: .string) ?? "" }) -> String {
        let date = DateFormatter.localizedString(from: now, dateStyle: .medium, timeStyle: .none)
        let time = DateFormatter.localizedString(from: now, dateStyle: .none, timeStyle: .short)
        var out = template
        if out.contains("{clipboard}") {
            let c = clipboard()
            out = out.replacingOccurrences(of: "{clipboard}", with: c.isEmpty ? "(clipboard empty)" : c)
        }
        return out
            .replacingOccurrences(of: "{text}", with: text.isEmpty ? "(no text found)" : text)
            .replacingOccurrences(of: "{date}", with: date)
            .replacingOccurrences(of: "{time}", with: time)
            .replacingOccurrences(of: "{macro}", with: macro)
    }
}

enum OpenLink {
    /// Adds https:// when the scheme is missing; nil for anything that isn't a web link.
    static func normalized(_ raw: String) -> URL? {
        let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return nil }
        let withScheme = t.contains("://") ? t : "https://" + t
        guard let u = URL(string: withScheme), let scheme = u.scheme?.lowercased(),
              ["http", "https"].contains(scheme), u.host?.isEmpty == false else { return nil }
        return u
    }
}
