import AppKit

/// Ticks once a second. For each schedule it remembers the last moment it checked
/// (persisted, so closing the app or sleeping the Mac is noticed on the next tick) and
/// asks: did a fire time pass since then? On time → run; long overdue → missed-run policy.
@MainActor
final class Scheduler {
    static let shared = Scheduler()

    /// A fire time this late still counts as on time (timer jitter, a slow wake).
    nonisolated static let grace: TimeInterval = 90

    private struct Entry: Codable {
        var lastCheck: Date
        var signature: String
    }

    private var state: [String: Entry] = [:]
    private var timer: Timer?
    private var dirty = false
    private var lastSave = Date.distantPast
    private let systemAwake = PowerAssertion(type: "PreventUserIdleSystemSleep", reason: "A ClickFlow macro is due soon")

    enum Decision: Equatable {
        case none
        case fire(Date)
        case missed(latest: Date, count: Int)
    }

    /// Pure: what should happen for `schedule` given when it was last checked.
    nonisolated static func decide(_ schedule: Schedule, lastCheck: Date, now: Date, calendar: Calendar = .current) -> Decision {
        guard var latest = schedule.nextOccurrence(after: lastCheck, calendar: calendar), latest <= now else { return .none }
        var count = 1
        while count < 100_000, let n = schedule.nextOccurrence(after: latest, calendar: calendar), n <= now {
            latest = n
            count += 1
        }
        return now.timeIntervalSince(latest) <= grace ? .fire(latest) : .missed(latest: latest, count: count)
    }

    func start() {
        load()
        tick()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            MainActor.assumeIsolated { Scheduler.shared.tick() }
        }
        timer?.tolerance = 0.2
        let ws = NSWorkspace.shared.notificationCenter
        ws.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated { Scheduler.shared.tick() }
        }
        ws.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated { Scheduler.shared.save() }
        }
    }

    private func signature(_ s: Schedule) -> String {
        (try? String(data: JSONEncoder().encode(s), encoding: .utf8)) ?? UUID().uuidString
    }

    func tick() {
        let store = Store.shared
        let now = Date()
        var seen = Set<String>()
        var soonest: Date?

        for macro in store.macros {
            for s in macro.schedules {
                let key = "\(macro.id)/\(s.id)"
                seen.insert(key)
                let sig = signature(s)
                // New or edited schedule: start counting from now, so editing never fires a past time.
                guard var entry = state[key], entry.signature == sig else {
                    state[key] = Entry(lastCheck: now, signature: sig)
                    dirty = true
                    continue
                }
                let active = macro.enabled && s.enabled && !store.pausedAll
                if active {
                    switch Scheduler.decide(s, lastCheck: entry.lastCheck, now: now) {
                    case .none:
                        break
                    case .fire:
                        Runner.shared.enqueueScheduled(macro, schedule: s, note: nil)
                        dirty = true
                    case .missed(let latest, let count):
                        let when = Fmt.nextRun(latest)
                        let many = count > 1 ? " (\(count) runs missed)" : ""
                        if s.missedRunPolicy == .runOnce {
                            Runner.shared.enqueueScheduled(macro, schedule: s, note: "Ran late: was due \(when)\(many)")
                        } else {
                            Runner.shared.logSkip(macro, reason: "Missed \(when) — Mac asleep or ClickFlow closed\(many)", at: now)
                        }
                        dirty = true
                    }
                    if let n = s.nextOccurrence(after: now), soonest.map({ n < $0 }) ?? true { soonest = n }
                }
                entry.lastCheck = now
                state[key] = entry
            }
        }

        let before = state.count
        state = state.filter { seen.contains($0.key) }
        if state.count != before { dirty = true }

        // Keep the Mac from idle-sleeping through a run that is about to happen.
        systemAwake.set(soonest.map { $0.timeIntervalSince(now) < 15 * 60 } ?? false)

        if dirty || now.timeIntervalSince(lastSave) > 30 { save() }
    }

    func save() {
        guard let data = try? Store.encoder.encode(state) else { return }
        try? data.write(to: Store.shared.stateURL, options: .atomic)
        dirty = false
        lastSave = Date()
    }

    private func load() {
        guard let data = try? Data(contentsOf: Store.shared.stateURL),
              let s = try? Store.decoder.decode([String: Entry].self, from: data) else { return }
        state = s
    }
}
