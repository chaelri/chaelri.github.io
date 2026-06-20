import Foundation
import Combine

struct ClipInfo: Identifiable, Hashable {
    let idx: Int
    let name: String
    let duration: Double           // seconds (source)
    var status: ClipStatus
    var outBytes: Int64

    var id: Int { idx }

    enum ClipStatus: String {
        case done, encoding, pending
    }
}

struct RenderState {
    var clips: [ClipInfo] = []
    var totalSec: Double = 0
    var encodedSec: Double = 0
    var elapsedSec: Int = 0
    var etaSec: Int? = nil
    var totalEstSec: Int? = nil
    var outBytes: Int64 = 0
    var currentIdx: Int = 0
    var currentSrc: String? = nil
    var currentClipBytes: Int64 = 0
    var currentClipDur: Double = 0
    var logTail: [String] = []
    var finished: Bool = false
    var finalPath: URL? = nil

    var percent: Double {
        guard totalSec > 0 else { return 0 }
        return min(100, encodedSec / totalSec * 100)
    }
}

@MainActor
final class RenderMonitor: ObservableObject {
    @Published private(set) var state = RenderState()
    @Published private(set) var sourceURL: URL?

    private var timer: Timer?
    private var startEpoch: Date?
    private let bytesPerSec: Double = 14_000_000 / 8 + 24_000   // matches render.sh 14M video + audio

    func start(sourceURL: URL) {
        stop()
        self.sourceURL = sourceURL
        bootstrap()
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        tick()
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func renderRoot() -> URL? {
        sourceURL?.appendingPathComponent("_render", isDirectory: true)
    }

    private func bootstrap() {
        guard let src = sourceURL else { return }
        // Probe each source clip's duration with ffprobe.
        let fm = FileManager.default
        guard let entries = try? fm.contentsOfDirectory(atPath: src.path) else { return }
        let mp4s = entries.filter { $0.lowercased().hasSuffix(".mp4") }.sorted()
        var clips: [ClipInfo] = []
        var total: Double = 0
        for (i, name) in mp4s.enumerated() {
            let dur = ffprobeDuration(url: src.appendingPathComponent(name)) ?? 0
            total += dur
            clips.append(ClipInfo(idx: i + 1, name: name, duration: dur, status: .pending, outBytes: 0))
        }
        state.clips = clips
        state.totalSec = total
        state.currentClipDur = clips.first?.duration ?? 0

        // Recover start epoch from log first line if it exists.
        startEpoch = recoverStartEpoch()
    }

    private func ffprobeDuration(url: URL) -> Double? {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        task.arguments = ["ffprobe", "-v", "error",
                          "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", url.path]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()
        do { try task.run() } catch { return nil }
        task.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard let s = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
              let v = Double(s) else { return nil }
        return v
    }

    private func recoverStartEpoch() -> Date? {
        guard let log = renderRoot()?.appendingPathComponent("render.log"),
              let text = try? String(contentsOf: log, encoding: .utf8),
              let firstLine = text.split(separator: "\n").first else { return nil }
        // Match [HH:MM:SS] at start of line.
        let re = try! NSRegularExpression(pattern: #"^\[(\d{2}):(\d{2}):(\d{2})\]"#)
        let ns = String(firstLine) as NSString
        guard let m = re.firstMatch(in: ns as String, range: NSRange(location: 0, length: ns.length)) else { return nil }
        let h = Int(ns.substring(with: m.range(at: 1))) ?? 0
        let mm = Int(ns.substring(with: m.range(at: 2))) ?? 0
        let s = Int(ns.substring(with: m.range(at: 3))) ?? 0
        var comps = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        comps.hour = h; comps.minute = mm; comps.second = s
        var date = Calendar.current.date(from: comps)
        if let d = date, d > Date() {
            date = d.addingTimeInterval(-86400)   // crossed midnight
        }
        return date
    }

    private func finalURL() -> URL? {
        guard let root = renderRoot(), let src = sourceURL else { return nil }
        let dateName = src.lastPathComponent
        let parts = dateName.split(separator: "-")
        if parts.count == 3, let mm = Int(parts[1]), let dd = Int(parts[2]), let yyyy = Int(parts[0]) {
            let months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
            if (1...12).contains(mm) {
                return root.appendingPathComponent("\(months[mm-1])\(String(format: "%02d", dd))_\(yyyy).mp4")
            }
        }
        return root.appendingPathComponent("merged.mp4")
    }

    private func tick() {
        guard let root = renderRoot() else { return }
        let fm = FileManager.default
        let log = root.appendingPathComponent("render.log")
        let final = finalURL()
        let finished = final.map { fm.fileExists(atPath: $0.path) } ?? false

        // Parse current encoding clip from last "encode" log line.
        var currentOut: String? = nil
        var currentSrc: String? = nil
        var lines: [String] = []
        if let text = try? String(contentsOf: log, encoding: .utf8) {
            lines = text.split(separator: "\n", omittingEmptySubsequences: true).map(String.init)
            let re = try! NSRegularExpression(pattern: #"encode \([^)]+\): (\S+) -> (clip_\d{2}\.mp4)"#)
            for line in lines {
                let ns = line as NSString
                if let m = re.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)) {
                    currentSrc = ns.substring(with: m.range(at: 1))
                    currentOut = ns.substring(with: m.range(at: 2))
                }
            }
        }
        let tail = lines.filter { !$0.contains("swscaler") && !$0.isEmpty }.suffix(10).map { $0 }

        var curIdx = 1
        if let out = currentOut,
           let n = Int(out.replacingOccurrences(of: "clip_", with: "")
                        .replacingOccurrences(of: ".mp4", with: "")) {
            curIdx = n
        }
        if finished { curIdx = state.clips.count }

        // Update clip statuses + sizes.
        for i in 0..<state.clips.count {
            let outName = String(format: "clip_%02d.mp4", state.clips[i].idx)
            let p = root.appendingPathComponent(outName)
            let attrs = try? fm.attributesOfItem(atPath: p.path)
            let sz = (attrs?[.size] as? NSNumber)?.int64Value ?? 0
            state.clips[i].outBytes = sz
            if finished || state.clips[i].idx < curIdx {
                state.clips[i].status = .done
            } else if state.clips[i].idx == curIdx && !finished {
                state.clips[i].status = .encoding
            } else {
                state.clips[i].status = .pending
            }
        }

        // Encoded source seconds: done clips full, current clip partial.
        var encoded: Double = 0
        for c in state.clips where c.status == .done { encoded += c.duration }
        var curClipBytes: Int64 = 0
        var curClipDur: Double = 0
        if !finished, curIdx >= 1, curIdx <= state.clips.count {
            let cur = state.clips[curIdx - 1]
            curClipBytes = cur.outBytes
            curClipDur = cur.duration
            let projected = cur.duration * bytesPerSec
            if projected > 0 {
                let frac = min(0.98, Double(cur.outBytes) / projected)
                encoded += frac * cur.duration
            }
        }
        if finished { encoded = state.totalSec }

        // Output bytes total.
        var outBytes: Int64 = 0
        for c in state.clips { outBytes += c.outBytes }
        if let f = final, let attrs = try? fm.attributesOfItem(atPath: f.path),
           let sz = (attrs[.size] as? NSNumber)?.int64Value {
            outBytes = max(outBytes, sz)
        }

        // Elapsed + ETA.
        var elapsed = 0
        if let start = startEpoch {
            elapsed = Int(Date().timeIntervalSince(start))
        } else if let log = try? FileManager.default.attributesOfItem(atPath: log.path),
                  let mtime = log[.modificationDate] as? Date {
            elapsed = Int(Date().timeIntervalSince(mtime))
        }
        var eta: Int? = nil
        var totalEst: Int? = nil
        if !finished, encoded > 2, elapsed > 1 {
            let rate = encoded / Double(elapsed)
            if rate > 0 {
                let rem = (state.totalSec - encoded) / rate
                eta = Int(rem)
                totalEst = elapsed + Int(rem)
            }
        }

        state.encodedSec = encoded
        state.elapsedSec = elapsed
        state.etaSec = eta
        state.totalEstSec = finished ? elapsed : totalEst
        state.outBytes = outBytes
        state.currentIdx = curIdx
        state.currentSrc = currentSrc
        state.currentClipBytes = curClipBytes
        state.currentClipDur = curClipDur
        state.logTail = tail
        state.finished = finished
        state.finalPath = finished ? final : nil
    }
}
