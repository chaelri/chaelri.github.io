import SwiftUI
import AppKit

struct ContentView: View {
    @EnvironmentObject var monitor: RenderMonitor

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HeaderView()
            HeroProgress()
            ClipStrip()
            StatsRow()
            CurrentClipCard()
            if monitor.state.finished { DoneCard() }
            UploadCard()
            Spacer(minLength: 0)
        }
        .padding(22)
        .background(
            LinearGradient(colors: [Color(red: 0.03, green: 0.05, blue: 0.09),
                                    Color(red: 0.04, green: 0.07, blue: 0.13)],
                            startPoint: .top, endPoint: .bottom)
            .ignoresSafeArea()
        )
        .foregroundColor(Color(white: 0.92))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: pickFolder) {
                    Label("Open folder…", systemImage: "folder")
                }
            }
        }
    }

    private func pickFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.directoryURL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Desktop/Camera01")
        panel.title = "Choose a date folder"
        panel.prompt = "Watch"
        if panel.runModal() == .OK, let url = panel.url {
            monitor.start(sourceURL: url)
        }
    }
}

private struct HeaderView: View {
    @EnvironmentObject var monitor: RenderMonitor
    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(monitor.state.finished ? Color.green : Color.blue)
                .frame(width: 8, height: 8)
                .opacity(monitor.state.finished ? 1 : 0.85)
                .modifier(Pulse(active: !monitor.state.finished))
                .shadow(color: monitor.state.finished ? .green : .blue, radius: 5)
            VStack(alignment: .leading, spacing: 2) {
                Text(monitor.sourceURL?.lastPathComponent ?? "no folder")
                    .font(.system(size: 18, weight: .semibold))
                Text(headline)
                    .font(.system(size: 11))
                    .foregroundColor(Color(white: 0.55))
            }
            Spacer()
        }
    }
    private var headline: String {
        let n = monitor.state.clips.count
        let mins = monitor.state.totalSec / 60
        return monitor.state.finished
            ? "complete — \(n) clips · 1080p60 · h264_videotoolbox"
            : "\(n) clips · \(String(format: "%.1f", mins)) min source · 1080p60 · h264_videotoolbox"
    }
}

private struct Pulse: ViewModifier {
    let active: Bool
    @State private var on = false
    func body(content: Content) -> some View {
        content
            .scaleEffect(on ? 1.15 : 0.85)
            .opacity(active ? (on ? 1 : 0.45) : 1)
            .animation(active
                       ? .easeInOut(duration: 0.75).repeatForever(autoreverses: true)
                       : .default, value: on)
            .onAppear { if active { on = true } }
    }
}

private struct HeroProgress: View {
    @EnvironmentObject var monitor: RenderMonitor
    var body: some View {
        let pct = monitor.state.percent
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(red: 0.06, green: 0.10, blue: 0.16))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(red: 0.10, green: 0.14, blue: 0.22), lineWidth: 1)
                )
            GeometryReader { geo in
                RoundedRectangle(cornerRadius: 12)
                    .fill(
                        LinearGradient(
                            colors: monitor.state.finished
                                ? [Color.green, Color(red: 0.06, green: 0.72, blue: 0.5)]
                                : [Color.blue, Color(red: 0.39, green: 0.4, blue: 0.95),
                                   Color(red: 0.55, green: 0.36, blue: 0.97)],
                            startPoint: .leading, endPoint: .trailing
                        )
                    )
                    .frame(width: geo.size.width * pct / 100)
                    .shadow(color: (monitor.state.finished ? Color.green : Color.blue).opacity(0.4), radius: 10)
                    .animation(.easeOut(duration: 0.25), value: pct)
            }
            Text(String(format: "%.1f%%", pct))
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
                .shadow(color: .black.opacity(0.5), radius: 1.5)
        }
        .frame(height: 26)
    }
}

private struct ClipStrip: View {
    @EnvironmentObject var monitor: RenderMonitor
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Label("clip-by-clip", systemImage: "")
                    .font(.system(size: 10, weight: .semibold))
                    .textCase(.uppercase)
                    .tracking(0.5)
                    .foregroundColor(Color(white: 0.55))
                let done = monitor.state.clips.filter { $0.status == .done }.count
                let left = monitor.state.clips.count - done
                Text("· \(done) done · \(left) left")
                    .font(.system(size: 11))
                    .foregroundColor(Color(white: 0.6))
                Spacer()
                LegendDot(color: .green, label: "done")
                LegendDot(color: .blue, label: "encoding")
                LegendDot(color: Color(white: 0.2), label: "pending")
            }
            HStack(spacing: 2) {
                ForEach(monitor.state.clips) { c in
                    ClipTile(clip: c)
                }
            }
            .frame(height: 36)
        }
    }
}

private struct LegendDot: View {
    let color: Color
    let label: String
    var body: some View {
        HStack(spacing: 4) {
            Rectangle().fill(color).frame(width: 8, height: 8).cornerRadius(2)
            Text(label).font(.system(size: 10)).foregroundColor(Color(white: 0.55))
        }
    }
}

private struct ClipTile: View {
    let clip: ClipInfo
    var body: some View {
        GeometryReader { geo in
            ZStack {
                base
                if clip.status == .encoding {
                    GeometryReader { inner in
                        Rectangle()
                            .fill(LinearGradient(
                                colors: [Color.blue, Color(red: 0.39, green: 0.4, blue: 0.95)],
                                startPoint: .leading, endPoint: .trailing))
                            .frame(width: inner.size.width * fillFraction)
                    }
                }
                Text("\(clip.idx)")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(clip.status == .pending ? Color(white: 0.4) : .white)
            }
            .cornerRadius(5)
        }
        .frame(minWidth: 22)
        .layoutPriority(clip.duration)
        .help("#\(clip.idx) · \(clip.name) · \(Self.minSec(clip.duration))")
    }

    private var base: some View {
        Group {
            switch clip.status {
            case .done:
                LinearGradient(colors: [Color.green, Color(red: 0.06, green: 0.72, blue: 0.5)],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
            case .encoding:
                Color(red: 0.06, green: 0.10, blue: 0.16)
                    .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color.blue, lineWidth: 1).shadow(color: .blue, radius: 8))
            case .pending:
                Color(red: 0.06, green: 0.10, blue: 0.16)
            }
        }
    }
    private var fillFraction: Double {
        let bytesPerSec: Double = 14_000_000 / 8 + 24_000
        let projected = clip.duration * bytesPerSec
        guard projected > 0 else { return 0 }
        return min(0.99, Double(clip.outBytes) / projected)
    }
    static func minSec(_ s: Double) -> String {
        let m = Int(s) / 60, r = Int(s) % 60
        return "\(m):\(String(format: "%02d", r))"
    }
}

private struct StatsRow: View {
    @EnvironmentObject var monitor: RenderMonitor
    var body: some View {
        HStack(spacing: 10) {
            StatPill(key: "elapsed", value: fmt(monitor.state.elapsedSec),
                     sub: "\(String(format: "%.1f", monitor.state.encodedSec / 60)) min encoded",
                     accent: Color(white: 0.7))
            StatPill(key: "remaining",
                     value: monitor.state.finished ? "—" : (monitor.state.etaSec.map { fmt($0) } ?? "—"),
                     sub: monitor.state.finished
                          ? "complete"
                          : "\(String(format: "%.1f", (monitor.state.totalSec - monitor.state.encodedSec) / 60)) min source left",
                     accent: Color(red: 0.66, green: 0.55, blue: 0.97))
            StatPill(key: "total est",
                     value: monitor.state.totalEstSec.map { fmt($0) } ?? "—",
                     sub: monitor.state.finished ? "actual" : "projected",
                     accent: Color(white: 0.8))
            StatPill(key: "output",
                     value: String(format: "%.2f GB", Double(monitor.state.outBytes) / 1e9),
                     sub: projected,
                     accent: Color(white: 0.92))
        }
    }
    private var projected: String {
        let bytesPerSec: Double = 14_000_000 / 8 + 24_000
        let bytes = monitor.state.totalSec * bytesPerSec
        return String(format: "~%.2f GB projected", bytes / 1e9)
    }
    private func fmt(_ s: Int) -> String {
        let h = s / 3600, m = (s % 3600) / 60, ss = s % 60
        if h > 0 { return "\(h)h \(String(format: "%02d", m))m" }
        if m > 0 { return "\(m)m \(String(format: "%02d", ss))s" }
        return "\(ss)s"
    }
}

private struct StatPill: View {
    let key: String; let value: String; let sub: String; let accent: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(key).font(.system(size: 10, weight: .semibold))
                .textCase(.uppercase).tracking(0.5)
                .foregroundColor(Color(white: 0.5))
            Text(value).font(.system(size: 18, weight: .semibold))
                .foregroundColor(accent)
                .monospacedDigit()
            Text(sub).font(.system(size: 11))
                .foregroundColor(Color(white: 0.5))
        }
        .padding(.horizontal, 13).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(red: 0.05, green: 0.09, blue: 0.16))
        .cornerRadius(10)
        .overlay(RoundedRectangle(cornerRadius: 10)
                 .stroke(Color(red: 0.10, green: 0.14, blue: 0.22), lineWidth: 1))
    }
}

private struct CurrentClipCard: View {
    @EnvironmentObject var monitor: RenderMonitor
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("currently encoding")
                    .font(.system(size: 10, weight: .semibold))
                    .textCase(.uppercase).tracking(0.5)
                    .foregroundColor(Color(white: 0.5))
                Spacer()
                Text("\(monitor.state.currentIdx) / \(monitor.state.clips.count)")
                    .font(.system(size: 11)).monospacedDigit()
                    .foregroundColor(Color(white: 0.6))
            }
            Text(monitor.state.currentSrc ?? "—")
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(Color(white: 0.8))
                .lineLimit(1).truncationMode(.middle)
            ProgressView(value: clipFrac)
                .progressViewStyle(.linear)
                .tint(Color(red: 0.39, green: 0.4, blue: 0.95))
            HStack {
                Text(String(format: "%.0f%%", clipFrac * 100))
                    .font(.system(size: 11)).monospacedDigit()
                Spacer()
                Text(currentMeta)
                    .font(.system(size: 11)).monospacedDigit()
            }
            .foregroundColor(Color(white: 0.55))
        }
        .padding(14)
        .background(Color(red: 0.05, green: 0.09, blue: 0.16))
        .cornerRadius(11)
        .overlay(RoundedRectangle(cornerRadius: 11)
                 .stroke(Color(red: 0.10, green: 0.14, blue: 0.22), lineWidth: 1))
    }
    private var clipFrac: Double {
        let bytesPerSec: Double = 14_000_000 / 8 + 24_000
        let projected = monitor.state.currentClipDur * bytesPerSec
        guard projected > 0 else { return monitor.state.finished ? 1 : 0 }
        return min(0.99, Double(monitor.state.currentClipBytes) / projected)
    }
    private var currentMeta: String {
        let mb = Double(monitor.state.currentClipBytes) / 1e6
        let m = Int(monitor.state.currentClipDur) / 60
        let r = Int(monitor.state.currentClipDur) % 60
        return String(format: "%.1f MB · %d:%02d clip", mb, m, r)
    }
}

private struct DoneCard: View {
    @EnvironmentObject var monitor: RenderMonitor
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ThumbnailView(path: monitor.state.thumbnailPath)
                .frame(width: 192, height: 108)
                .cornerRadius(8)
                .overlay(RoundedRectangle(cornerRadius: 8)
                         .stroke(Color(red: 0.10, green: 0.33, blue: 0.21), lineWidth: 1))
            VStack(alignment: .leading, spacing: 6) {
                Text("✓ Render complete").font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(red: 0.53, green: 0.94, blue: 0.68))
                Text(monitor.state.finalPath?.lastPathComponent ?? "")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundColor(Color(red: 0.74, green: 0.97, blue: 0.82))
                Text(monitor.state.finalPath?.path ?? "")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(Color(red: 0.55, green: 0.78, blue: 0.65))
                    .textSelection(.enabled)
                    .lineLimit(2).truncationMode(.middle)
                Spacer(minLength: 0)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(LinearGradient(
            colors: [Color(red: 0.04, green: 0.21, blue: 0.13), Color(red: 0.04, green: 0.17, blue: 0.11)],
            startPoint: .topLeading, endPoint: .bottomTrailing))
        .cornerRadius(11)
        .overlay(RoundedRectangle(cornerRadius: 11)
                 .stroke(Color(red: 0.10, green: 0.33, blue: 0.21), lineWidth: 1))
    }
}

private struct ThumbnailView: View {
    let path: URL?
    var body: some View {
        Group {
            if let p = path, let img = NSImage(contentsOf: p) {
                Image(nsImage: img)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .clipped()
            } else {
                ZStack {
                    Color(red: 0.03, green: 0.08, blue: 0.06)
                    ProgressView().controlSize(.small).tint(.white)
                }
            }
        }
    }
}

private struct UploadCard: View {
    @EnvironmentObject var monitor: RenderMonitor
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("youtube upload")
                    .font(.system(size: 10, weight: .semibold))
                    .textCase(.uppercase).tracking(0.5)
                    .foregroundColor(Color(white: 0.5))
                Spacer()
                if let u = monitor.state.upload {
                    Text(u.status.rawValue)
                        .font(.system(size: 10, weight: .semibold))
                        .textCase(.uppercase).tracking(0.5)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(badgeColor(u.status).opacity(0.18))
                        .foregroundColor(badgeColor(u.status))
                        .cornerRadius(4)
                }
            }

            if let u = monitor.state.upload {
                if !u.title.isEmpty {
                    Text(u.title)
                        .font(.system(size: 13, weight: .semibold))
                        .lineLimit(1).truncationMode(.middle)
                }

                let pct = u.percent
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(red: 0.03, green: 0.04, blue: 0.07))
                        .frame(height: 14)
                        .overlay(RoundedRectangle(cornerRadius: 8)
                                 .stroke(Color(red: 0.10, green: 0.14, blue: 0.22), lineWidth: 1))
                    GeometryReader { geo in
                        RoundedRectangle(cornerRadius: 8)
                            .fill(LinearGradient(
                                colors: u.status == .done
                                    ? [Color.green, Color(red: 0.06, green: 0.72, blue: 0.5)]
                                    : [Color(red: 0.94, green: 0.27, blue: 0.27),
                                       Color(red: 0.99, green: 0.44, blue: 0.18)],
                                startPoint: .leading, endPoint: .trailing))
                            .frame(width: geo.size.width * pct / 100, height: 14)
                            .shadow(color: u.status == .done ? .green : .red, radius: 6)
                            .animation(.easeOut(duration: 0.2), value: pct)
                    }
                    .frame(height: 14)
                }

                HStack {
                    Text(String(format: "%.1f%%", pct))
                        .font(.system(size: 12, weight: .semibold)).monospacedDigit()
                    Spacer()
                    Text(bytesLine(u))
                        .font(.system(size: 11)).monospacedDigit()
                        .foregroundColor(Color(white: 0.55))
                }

                if u.status == .uploading {
                    HStack {
                        Label(String(format: "%.1f MB/s", u.mbps),
                              systemImage: "arrow.up.circle")
                            .font(.system(size: 11)).monospacedDigit()
                            .foregroundColor(Color(white: 0.55))
                        Spacer()
                        if let eta = u.etaSec {
                            Label("eta \(fmt(eta))", systemImage: "clock")
                                .font(.system(size: 11)).monospacedDigit()
                                .foregroundColor(Color(white: 0.55))
                        }
                    }
                } else if u.status == .done, let url = u.url {
                    HStack(spacing: 12) {
                        Link(destination: URL(string: url)!) {
                            Label(url, systemImage: "play.rectangle.fill")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(Color(red: 0.53, green: 0.94, blue: 0.68))
                        }
                        Spacer()
                        if let su = u.studioUrl {
                            Link("studio →", destination: URL(string: su)!)
                                .font(.system(size: 11))
                                .foregroundColor(Color(white: 0.6))
                        }
                    }
                } else if u.status == .error, let err = u.error {
                    Text(err)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(Color(red: 0.99, green: 0.5, blue: 0.5))
                        .lineLimit(3).truncationMode(.tail)
                }
            } else {
                Text(monitor.state.finished
                     ? "waiting to upload — run yt-helper.mjs upload …"
                     : "will appear once upload begins")
                    .font(.system(size: 11))
                    .foregroundColor(Color(white: 0.4))
            }
        }
        .padding(14)
        .background(Color(red: 0.05, green: 0.09, blue: 0.16))
        .cornerRadius(11)
        .overlay(RoundedRectangle(cornerRadius: 11)
                 .stroke(Color(red: 0.10, green: 0.14, blue: 0.22), lineWidth: 1))
    }

    private func badgeColor(_ s: UploadState.Status) -> Color {
        switch s {
        case .starting:  return Color(white: 0.6)
        case .uploading: return Color(red: 0.99, green: 0.44, blue: 0.18)
        case .done:      return Color(red: 0.34, green: 0.85, blue: 0.55)
        case .error:     return Color(red: 0.99, green: 0.5, blue: 0.5)
        }
    }
    private func bytesLine(_ u: UploadState) -> String {
        let gbUp = Double(u.uploadedBytes) / 1e9
        let gbTotal = Double(u.totalBytes) / 1e9
        return String(format: "%.2f / %.2f GB", gbUp, gbTotal)
    }
    private func fmt(_ s: Int) -> String {
        let m = s / 60, ss = s % 60
        return m > 0 ? "\(m)m \(String(format: "%02d", ss))s" : "\(ss)s"
    }
}
