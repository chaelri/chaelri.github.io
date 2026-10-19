import Foundation
import AppKit

/// `ClickFlow --selftest`: schedule maths, missed-run decisions, shortcut parsing and
/// the spec's JSON example, checked without any UI. Exits non-zero on any failure.
enum SelfTest {
    static func run() -> Bool {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        var failures = 0

        func at(_ s: String) -> Date {
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.calendar = cal
            f.dateFormat = "yyyy-MM-dd HH:mm:ss"
            return f.date(from: s)!
        }
        func show(_ d: Date?) -> String {
            guard let d else { return "nil" }
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.dateFormat = "EEE yyyy-MM-dd HH:mm:ss"
            return f.string(from: d)
        }
        func check(_ name: String, _ got: String, _ want: String) {
            let ok = got == want
            if !ok { failures += 1 }
            print("\(ok ? "PASS" : "FAIL")  \(name)\(ok ? "" : "\n      got  \(got)\n      want \(want)")")
        }
        func next(_ s: Schedule, _ after: String) -> String { show(s.nextOccurrence(after: at(after), calendar: cal)) }

        // 2026-10-19 is a Monday.
        var s = Schedule(time: "09:00", repeatKind: .weekdays)
        check("weekdays, Mon before 9", next(s, "2026-10-19 08:59:00"), "Mon 2026-10-19 09:00:00")
        check("weekdays, exactly 9:00 is not 'after'", next(s, "2026-10-19 09:00:00"), "Tue 2026-10-20 09:00:00")
        check("weekdays, Fri after 9 → Mon", next(s, "2026-10-23 10:00:00"), "Mon 2026-10-26 09:00:00")
        s.repeatKind = .weekends
        check("weekends, from Mon", next(s, "2026-10-19 10:00:00"), "Sat 2026-10-24 09:00:00")
        check("weekends, Sat after 9 → Sun", next(s, "2026-10-24 09:30:00"), "Sun 2026-10-25 09:00:00")
        s.repeatKind = .daily
        check("every day", next(s, "2026-10-19 21:00:00"), "Tue 2026-10-20 09:00:00")
        s.repeatKind = .custom
        s.customDays = [2, 4, 6]
        check("custom Mon/Wed/Fri, Mon after 9", next(s, "2026-10-19 09:01:00"), "Wed 2026-10-21 09:00:00")
        s.customDays = []
        check("custom with no days", next(s, "2026-10-19 09:01:00"), "nil")

        var once = Schedule(time: "14:30", repeatKind: .once)
        once.date = "2026-10-20"
        check("once, before", next(once, "2026-10-19 12:00:00"), "Tue 2026-10-20 14:30:00")
        check("once, after", next(once, "2026-10-20 14:31:00"), "nil")

        var iv = Schedule(time: "09:00", repeatKind: .interval, customDays: [2, 3, 4, 5, 6], intervalMinutes: 30, endTime: "10:00")
        check("interval, mid-window", next(iv, "2026-10-19 09:10:00"), "Mon 2026-10-19 09:30:00")
        check("interval, last slot is the end time", next(iv, "2026-10-19 09:45:00"), "Mon 2026-10-19 10:00:00")
        check("interval, after window → next weekday", next(iv, "2026-10-23 10:00:00"), "Mon 2026-10-26 09:00:00")
        iv.intervalMinutes = 45
        check("interval 45 min doesn't overshoot end", next(iv, "2026-10-19 09:46:00"), "Tue 2026-10-20 09:00:00")

        var ranged = Schedule(time: "09:00", repeatKind: .daily)
        ranged.conditions.startDate = "2026-11-01"
        check("start date pushes first run", next(ranged, "2026-10-19 12:00:00"), "Sun 2026-11-01 09:00:00")
        ranged.conditions.startDate = nil
        ranged.conditions.endDate = "2026-10-20"
        check("end date is inclusive", next(ranged, "2026-10-19 12:00:00"), "Tue 2026-10-20 09:00:00")
        check("past end date", next(ranged, "2026-10-20 12:00:00"), "nil")

        // Missed-run decisions.
        let daily = Schedule(time: "09:00", repeatKind: .daily)
        func decide(_ last: String, _ now: String) -> String {
            switch Scheduler.decide(daily, lastCheck: at(last), now: at(now), calendar: cal) {
            case .none: return "none"
            case .fire(let d): return "fire \(show(d))"
            case .missed(let d, let n): return "missed \(show(d)) x\(n)"
            }
        }
        check("tick across 9:00 fires", decide("2026-10-19 08:59:59", "2026-10-19 09:00:00"), "fire Mon 2026-10-19 09:00:00")
        check("nothing due", decide("2026-10-19 09:00:01", "2026-10-19 09:00:02"), "none")
        check("woke 60s late still on time", decide("2026-10-19 08:50:00", "2026-10-19 09:01:00"), "fire Mon 2026-10-19 09:00:00")
        check("asleep through it", decide("2026-10-19 08:00:00", "2026-10-19 11:00:00"), "missed Mon 2026-10-19 09:00:00 x1")
        check("closed for three days", decide("2026-10-16 20:00:00", "2026-10-19 12:00:00"), "missed Mon 2026-10-19 09:00:00 x3")
        check("missed yesterday but today's is on time", decide("2026-10-18 08:00:00", "2026-10-19 09:00:30"), "fire Mon 2026-10-19 09:00:00")

        // Summaries.
        check("summary weekdays", Schedule(time: "09:00", repeatKind: .weekdays).summary.replacingOccurrences(of: "\u{202F}", with: " "),
              "Every weekday at 9:00 AM")

        // Shortcuts.
        func key(_ s: String) -> String { KeyCombo.parse(s).map { "\($0.display) #\($0.keyCode)" } ?? "nil" }
        check("cmd+s", key("cmd+s"), "⌘S #1")
        check("⌘⇧4", key("⌘⇧4"), "⇧⌘4 #21")
        check("Return", key("Return"), "↩ #36")
        check("ctrl opt delete", key("ctrl opt delete"), "⌃⌥⌫ #51")
        check("cmd+shift+left", key("cmd+shift+left"), "⇧⌘← #123")
        check("two keys rejected", key("a+b"), "nil")
        check("unknown key", key("cmd+banana"), "nil")

        var named = Step(type: .wait, seconds: 5)
        named.name = "Wait for login"
        let namedBack = try! JSONDecoder().decode(Step.self, from: JSONEncoder().encode(named))
        check("step name round trip", namedBack.title(2), "Step 2 · Wait for login")

        let legacy = #"{"type":"sendScreenshot","x":10,"y":20,"width":75,"height":73,"text":"hi","delayBefore":0.5}"#
        let migrated = try! JSONDecoder().decode(Step.self, from: Data(legacy.utf8))
        check("old Screenshot to Discord step migrates",
              "\(migrated.type.rawValue) discord=\(migrated.sendDiscord) clip=\(migrated.copyResult) caption=\(migrated.text)",
              "readText discord=true clip=false caption=hi")
        check("message variables",
              MessageVars.fill("{macro}: {text}", text: "Clocked-in for 8h", macro: "Auto Clock-Out"),
              "Auto Clock-Out: Clocked-in for 8h")
        check("empty read fills a placeholder", MessageVars.fill("{text}", text: "", macro: ""), "(no text found)")

        check("link without scheme", OpenLink.normalized("eva.hrforte.com/login")?.absoluteString ?? "nil", "https://eva.hrforte.com/login")
        check("non-web link rejected", OpenLink.normalized("file:///etc/passwd")?.absoluteString ?? "nil", "nil")
        var link = Step(type: .openURL, delayBefore: 0.5)
        link.url = "https://example.com"
        let linkBack = try! JSONDecoder().decode(Step.self, from: JSONEncoder().encode(link))
        check("open link step round trip", "\(linkBack.type.rawValue) \(linkBack.url)", "openURL https://example.com")

        var post = Step(type: .postClipboard, delayBefore: 0.5)
        post.url = "https://example.com/hook"
        let postJSON = String(decoding: try! JSONEncoder().encode(post), as: UTF8.self)
        let postBack = try! JSONDecoder().decode(Step.self, from: Data(postJSON.utf8))
        check("post clipboard step round trip", "\(postBack.type.rawValue) \(postBack.url) \(postBack.delayBefore)",
              "postClipboard https://example.com/hook 0.5")

        // The spec's own JSON example, then a round trip.
        let spec = """
        {
          "name": "Morning Check-in",
          "repeatCount": 1,
          "steps": [
            { "type": "leftClick",   "x": 812,  "y": 446, "delayBefore": 0.0 },
            { "type": "wait",        "seconds": 3.0 },
            { "type": "doubleClick", "x": 1204, "y": 88,  "delayBefore": 0.5 }
          ],
          "schedules": [
            {
              "enabled": true,
              "time": "09:00",
              "repeat": "weekdays",
              "customDays": [],
              "missedRunPolicy": "skip",
              "conditions": { "requireAppRunning": null, "minIdleSeconds": 30 }
            }
          ]
        }
        """
        if let list = Store.parseMacros(Data(spec.utf8)), let m = list.first {
            check("spec JSON: steps", m.steps.map { "\($0.type.rawValue)" }.joined(separator: ","), "leftClick,wait,doubleClick")
            check("spec JSON: duration", Fmt.seconds(m.totalDuration ?? -1), "3.5s")
            check("spec JSON: schedule", "\(m.schedules[0].repeatKind) idle=\(m.schedules[0].conditions.minIdleSeconds ?? -1)", "weekdays idle=30")
            let data = try! Store.encoder.encode(MacroFile(macros: list))
            // Step ids aren't written (exports stay tidy), so compare the files, not the structs.
            let again = Store.parseMacros(data).flatMap { try? Store.encoder.encode(MacroFile(macros: $0)) }
            check("round trip", again == data ? "equal" : "different", "equal")
        } else {
            check("spec JSON parses", "no", "yes")
        }

        // On-device OCR on a rendered image (no screen capture involved).
        let ocrImage: CGImage = {
            let w = 900, h = 200
            let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
            ctx.setFillColor(CGColor(gray: 1, alpha: 1))
            ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
            let ns = NSGraphicsContext(cgContext: ctx, flipped: false)
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = ns
            let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 44, weight: .medium),
                                                        .foregroundColor: NSColor.black]
            ("Clocked-in for 8h 12m" as NSString).draw(at: NSPoint(x: 30, y: 110), withAttributes: attrs)
            ("Status: ON SHIFT" as NSString).draw(at: NSPoint(x: 30, y: 30), withAttributes: attrs)
            NSGraphicsContext.restoreGraphicsState()
            return ctx.makeImage()!
        }()
        let sem = DispatchSemaphore(value: 0)
        var ocr = ""
        Task.detached {
            ocr = (try? await ScreenText.recognize(ocrImage)) ?? "error"
            sem.signal()
        }
        sem.wait()
        check("OCR reads rendered text in order", ocr.replacingOccurrences(of: "\n", with: " | "),
              "Clocked-in for 8h 12m | Status: ON SHIFT")

        print(failures == 0 ? "\nAll checks passed." : "\n\(failures) check(s) failed.")
        return failures == 0
    }
}
