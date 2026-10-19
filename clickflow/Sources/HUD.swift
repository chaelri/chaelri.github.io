import AppKit
import SwiftUI
import QuartzCore

// MARK: - Panel

/// The floating run / record / countdown card. It resizes per mode, keeping its top
/// edge fixed, and fades in and out.
@MainActor
final class HUD {
    static let shared = HUD()
    static let width: CGFloat = 470

    static func height(runner: Runner, recorder: Recorder) -> CGFloat {
        if recorder.isRecording || runner.countdown != nil { return 82 }
        if let s = runner.status { return s.testOnly == nil ? 236 : 150 }
        return 82   // summary
    }

    private lazy var panel: FloatingPanel = {
        let p = FloatingPanel(size: NSSize(width: HUD.width, height: 82), interactive: true)
        let host = FirstClickHostingView(rootView: HUDView())
        host.sizingOptions = []
        host.autoresizingMask = [.width, .height]
        host.frame = NSRect(x: 0, y: 0, width: HUD.width, height: 82)
        p.contentView = host
        return p
    }()
    private var top: NSPoint?
    private var dodging = false
    private var generation = 0

    func show() {
        generation += 1
        let h = HUD.height(runner: .shared, recorder: .shared)
        if top == nil {
            let screen = NSScreen.screens.first { $0.frame.contains(NSEvent.mouseLocation) } ?? NSScreen.main
            if let f = screen?.visibleFrame { top = NSPoint(x: f.midX - HUD.width / 2, y: f.maxY - 14) }
        }
        // Follow the panel if it was dragged.
        if panel.isVisible { top = NSPoint(x: panel.frame.minX, y: panel.frame.maxY) }
        guard let t = top else { return }
        let frame = NSRect(x: t.x, y: t.y - h, width: HUD.width, height: h)
        if panel.isVisible, !dodging {
            if panel.frame != frame {
                NSAnimationContext.runAnimationGroup { ctx in
                    ctx.duration = 0.22
                    ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
                    panel.animator().setFrame(frame, display: true)
                }
            }
            panel.animator().alphaValue = 1
        } else if !panel.isVisible {
            panel.setFrame(frame, display: true)
            panel.alphaValue = 0
            panel.orderFrontRegardless()
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = 0.18
                panel.animator().alphaValue = 1
            }
        }
    }

    func hide() {
        undodge()
        guard panel.isVisible else { return }
        generation += 1
        let g = generation
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.2
            panel.animator().alphaValue = 0
        }, completionHandler: {
            MainActor.assumeIsolated {
                guard HUD.shared.generation == g else { return }   // shown again meanwhile
                HUD.shared.panel.orderOut(nil)
            }
        })
    }

    /// If a click is about to land on the HUD, step it aside so the click reaches the app below.
    func dodge(_ p: CGPoint) -> Bool {
        guard panel.isVisible, Geo.quartz(fromCocoa: panel.frame).insetBy(dx: -4, dy: -4).contains(p) else { return false }
        dodging = true
        panel.alphaValue = 0
        panel.ignoresMouseEvents = true
        return true
    }

    func undodge() {
        guard dodging else { return }
        dodging = false
        panel.alphaValue = 1
        panel.ignoresMouseEvents = false
    }
}

// MARK: - Root view

struct HUDView: View {
    @ObservedObject private var live = RunLive.shared
    @ObservedObject private var recorder = Recorder.shared
    private let runner = Runner.shared

    var body: some View {
        ZStack {
            if recorder.isRecording {
                RecordingCard(recorder: recorder)
            } else if let c = live.countdown {
                CountdownCard(pending: c, runner: runner)
            } else if let s = live.status {
                RunCard(status: s, runner: runner)
            } else if let sum = live.summary {
                SummaryCard(summary: sum)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(.primary.opacity(0.1)))
        .animation(.easeOut(duration: 0.2), value: live.status == nil)
    }
}

// MARK: - Running

private struct RunCard: View {
    let status: RunStatus
    let runner: Runner

    struct Row: Identifiable {
        enum Role { case done, current, next }
        var index: Int
        var role: Role
        var id: Int { index }
    }

    /// Previous, current, next. Ids are step indexes, so when the step advances the rows
    /// slide up instead of being swapped in place.
    private var rows: [Row] {
        let i = status.stepIndex
        if status.testOnly != nil { return [Row(index: i, role: .current)] }
        if status.phase == .pausingLoop {
            return [Row(index: status.stepCount - 1, role: .done), Row(index: 0, role: .next)]
                .filter { status.steps.indices.contains($0.index) }
        }
        var out: [Row] = []
        if i > 0 { out.append(Row(index: i - 1, role: .done)) }
        out.append(Row(index: i, role: .current))
        if i + 1 < status.stepCount { out.append(Row(index: i + 1, role: .next)) }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if status.testOnly == nil { SegmentBar(status: status) }
            VStack(spacing: 6) {
                ForEach(rows) { row in
                    StepRow(step: status.steps[row.index], number: row.index + 1, role: row.role, status: status)
                        .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity),
                                                removal: .move(edge: .top).combined(with: .opacity)))
                }
            }
            .frame(maxHeight: .infinity, alignment: .top)
            .clipped()
            .animation(.spring(response: 0.42, dampingFraction: 0.84), value: status.stepIndex)
            .animation(.spring(response: 0.42, dampingFraction: 0.84), value: status.phase == .pausingLoop)
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    if status.preview {
                        Label("PREVIEW", systemImage: "eye")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.purple))
                            .help("Nothing is clicked, typed or sent")
                    }
                    Text(status.testOnly != nil ? "Testing a step" : status.macroName)
                        .font(.headline)
                        .lineLimit(1)
                }
                TimelineView(.periodic(from: .now, by: 0.25)) { ctx in
                    Text(subtitle(now: ctx.date))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                HStack(spacing: 6) {
                    if status.preview {
                        Button {
                            runner.skipStep()
                        } label: {
                            Label("Skip", systemImage: "forward.fill")
                        }
                        .buttonStyle(PillButtonStyle(color: .purple))
                        .help("Jump past this step")
                    }
                    Button {
                        runner.stop()
                    } label: {
                        Label("Stop", systemImage: "stop.fill")
                    }
                    .buttonStyle(PillButtonStyle(color: .red))
                }
                Text("\(HotKey.display) or esc").font(.caption2).foregroundStyle(.tertiary)
            }
        }
    }

    private func subtitle(now: Date) -> String {
        if status.testOnly != nil { return status.macroName }
        var parts = ["Step \(status.stepIndex + 1) of \(status.stepCount)"]
        if status.iterations != 1 {
            parts.append(status.iterations == 0 ? "loop \(status.iteration + 1)" : "loop \(status.iteration + 1) of \(status.iterations)")
        }
        if let left = remaining(now: now) {
            parts.append("about \(Fmt.seconds(left)) left")
        }
        parts.append("\(Fmt.seconds(now.timeIntervalSince(status.started))) in")
        return parts.joined(separator: " · ")
    }

    /// Rest of this phase + the steps after it + any loops still to come.
    private func remaining(now: Date) -> Double? {
        guard status.iterations != 0 else { return nil }
        let phaseLeft = status.phaseEnd.map { max(0, $0.timeIntervalSince(now)) } ?? 0
        let after = status.steps.dropFirst(status.stepIndex + 1).reduce(0) { $0 + $1.duration }
        var total = phaseLeft + after
        if status.phase == .pausingLoop { total = phaseLeft + status.steps.reduce(0) { $0 + $1.duration } }
        let loopsLeft = max(0, status.iterations - status.iteration - 1)
        let loopLength = status.steps.reduce(0) { $0 + $1.duration }
        if loopsLeft > 0 { total += Double(loopsLeft) * (loopLength + status.repeatDelay) }
        return total
    }
}

/// One capsule per step: done, the current one filling with its phase, and the rest.
private struct SegmentBar: View {
    let status: RunStatus

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60)) { ctx in
            let fraction = phaseFraction(status, now: ctx.date)
            Canvas { gc, size in
                let track = Color.primary.opacity(0.12)
                let h = size.height
                if status.stepCount <= 48 {
                    let gap: CGFloat = 3
                    let n = CGFloat(status.stepCount)
                    let w = (size.width - gap * (n - 1)) / n
                    for i in 0..<status.stepCount {
                        let x = CGFloat(i) * (w + gap)
                        gc.fill(Path(roundedRect: CGRect(x: x, y: 0, width: w, height: h), cornerRadius: h / 2), with: .color(track))
                        let f = fill(i, fraction)
                        if f > 0 {
                            gc.fill(Path(roundedRect: CGRect(x: x, y: 0, width: max(h, w * f), height: h), cornerRadius: h / 2),
                                    with: .color(status.steps[i].type.tint))
                        }
                    }
                } else {
                    // Too many steps for segments: one continuous bar.
                    let overall = (Double(status.stepIndex) + fraction) / Double(max(1, status.stepCount))
                    gc.fill(Path(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: h / 2), with: .color(track))
                    gc.fill(Path(roundedRect: CGRect(x: 0, y: 0, width: max(h, size.width * overall), height: h), cornerRadius: h / 2),
                            with: .color(.accentColor))
                }
            }
            .frame(height: 5)
        }
    }

    private func fill(_ i: Int, _ fraction: Double) -> Double {
        if status.phase == .pausingLoop { return 1 }
        if status.completed.contains(i) || i < status.stepIndex { return 1 }
        if i == status.stepIndex { return fraction }
        return 0
    }
}

private func phaseFraction(_ s: RunStatus, now: Date) -> Double {
    if let p = s.progress { return min(1, max(0, p)) }
    if s.completed.contains(s.stepIndex) { return 1 }
    guard let end = s.phaseEnd else { return s.phase == .acting ? 0.6 : 0 }
    let total = end.timeIntervalSince(s.phaseStart)
    guard total > 0 else { return 1 }
    // A delay fills the first 90%; the action itself finishes the segment.
    let f = min(1, max(0, now.timeIntervalSince(s.phaseStart) / total))
    return s.steps.indices.contains(s.stepIndex) && s.steps[s.stepIndex].type == .wait ? f : f * 0.9
}

private struct StepRow: View {
    let step: Step
    let number: Int
    let role: RunCardRole
    let status: RunStatus

    typealias RunCardRole = RunCard.Row.Role

    private var isCurrent: Bool { role == .current }
    private var isGhost: Bool { step.type != .wait && (status.preview || step.showOnly) }

    var body: some View {
        HStack(alignment: .center, spacing: 11) {
            icon
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text("\(number)")
                        .font(.caption.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text(step.heading)
                        .font(isCurrent ? .callout.weight(.semibold) : .callout)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer(minLength: 6)
                    trailing
                }
                Text(step.detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                if isCurrent, showsBar {
                    TimelineView(.animation(minimumInterval: 1.0 / 60)) { ctx in
                        ProgressLine(fraction: phaseFraction(status, now: ctx.date), tint: step.type.tint)
                    }
                    .padding(.top, 2)
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, isCurrent ? 9 : 5)
        .background {
            if isCurrent {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill((isGhost ? Color.purple : step.type.tint).opacity(0.12))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder((isGhost ? Color.purple : step.type.tint).opacity(0.45),
                                      style: StrokeStyle(lineWidth: 1, dash: isGhost ? [5, 4] : [])))
            }
        }
        .opacity(isCurrent ? 1 : 0.55)
        .scaleEffect(isCurrent ? 1 : 0.97, anchor: .leading)
    }

    /// Timed phases and typing get a bar; a click is over too fast for one to mean anything.
    private var showsBar: Bool {
        status.progress != nil || (status.phaseEnd != nil && status.phase != .acting)
    }

    private var icon: some View {
        ZStack {
            Circle().fill(step.type.tint.opacity(isCurrent ? 0.2 : 0.1))
            if role == .done {
                Image(systemName: "checkmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.green)
                    .transition(.scale.combined(with: .opacity))
            } else {
                Image(systemName: step.type.symbol)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(step.type.tint)
                    .symbolEffect(.pulse, options: .repeating, isActive: isCurrent && status.phase == .acting)
            }
            if isCurrent { PulseRing(color: step.type.tint) }
        }
        .frame(width: 30, height: 30)
    }

    @ViewBuilder private var trailing: some View {
        switch role {
        case .done:
            if status.skipped.contains(number - 1) {
                Label("Skipped", systemImage: "forward.circle.fill")
                    .labelStyle(.titleAndIcon)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
            } else if isGhost {
                Label("Shown", systemImage: "eye.circle.fill")
                    .labelStyle(.titleAndIcon)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.purple)
            } else {
                Label("Done", systemImage: "checkmark.circle.fill")
                    .labelStyle(.titleAndIcon)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.green)
            }
        case .next:
            Text((step.showOnly && !status.preview ? "Show only · " : "")
                 + (step.type == .wait || step.delayBefore == 0 ? "Up next" : "Up next · after \(Fmt.seconds(step.delayBefore))"))
                .font(.caption)
                .foregroundStyle(.secondary)
        case .current:
            TimelineView(.periodic(from: .now, by: 0.1)) { ctx in
                Text(currentState(now: ctx.date))
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(isGhost ? Color.purple : step.type.tint)
            }
        }
    }

    private func currentState(now: Date) -> String {
        let left = status.phaseEnd.map { max(0, $0.timeIntervalSince(now)) }
        switch status.phase {
        case .starting:
            return "Starting…"
        case .pausingLoop:
            return "Next loop in \(String(format: "%.1fs", left ?? 0))"
        case .waiting:
            if step.type == .wait { return String(format: "%.1fs left", left ?? 0) }
            if isGhost { return String(format: "Shows in %.1fs", left ?? 0) }
            return String(format: "\(step.type.verb) in %.1fs", left ?? 0)
        case .acting:
            if isGhost { return step.type.wouldVerb }
            if let p = status.progress { return "\(step.type.verb) \(Int(p * 100))%" }
            return "\(step.type.verb)…"
        }
    }
}

private struct ProgressLine: View {
    let fraction: Double
    let tint: Color

    var body: some View {
        Canvas { gc, size in
            let h = size.height
            gc.fill(Path(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: h / 2), with: .color(.primary.opacity(0.1)))
            let w = max(h, size.width * fraction)
            gc.fill(Path(roundedRect: CGRect(x: 0, y: 0, width: w, height: h), cornerRadius: h / 2),
                    with: .linearGradient(Gradient(colors: [tint.opacity(0.7), tint]),
                                          startPoint: .zero, endPoint: CGPoint(x: w, y: 0)))
        }
        .frame(height: 4)
    }
}

/// A soft ring that keeps expanding from the current step's icon.
private struct PulseRing: View {
    let color: Color
    @ViewState private var on = false

    var body: some View {
        Circle()
            .stroke(color.opacity(on ? 0 : 0.6), lineWidth: 2)
            .scaleEffect(on ? 1.55 : 1)
            .onAppear {
                withAnimation(.easeOut(duration: 1.2).repeatForever(autoreverses: false)) { on = true }
            }
    }
}

/// The panel is never key, so a system prominent button would render dimmed grey.
private struct PillButtonStyle: ButtonStyle {
    let color: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.callout.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(Capsule().fill(color.opacity(configuration.isPressed ? 0.75 : 1)))
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.snappy(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - Other modes

private struct RecordingCard: View {
    @ObservedObject var recorder: Recorder

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                PulseRing(color: .red)
                Circle().fill(.red).frame(width: 12, height: 12)
            }
            .frame(width: 22, height: 22)
            VStack(alignment: .leading, spacing: 3) {
                Text("Recording…").font(.headline)
                Text("\(recorder.clickCount) click\(recorder.clickCount == 1 ? "" : "s") · esc to stop")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .animation(.snappy, value: recorder.clickCount)
            }
            Spacer()
            Button("Stop") { recorder.stop() }
                .controlSize(.large)
                .keyboardShortcut(.cancelAction)
        }
    }
}

private struct CountdownCard: View {
    let pending: PendingRun
    let runner: Runner

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { ctx in
            let left = max(0, (pending.fireAt ?? ctx.date).timeIntervalSince(ctx.date))
            HStack(spacing: 14) {
                ZStack {
                    Circle().stroke(Color.orange.opacity(0.18), lineWidth: 4)
                    Circle()
                        .trim(from: 0, to: left / 5)
                        .stroke(Color.orange, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text("\(Int(left.rounded(.up)))")
                        .font(.system(.callout, design: .rounded).weight(.bold).monospacedDigit())
                        .contentTransition(.numericText(countsDown: true))
                }
                .frame(width: 40, height: 40)
                VStack(alignment: .leading, spacing: 3) {
                    Text(pending.macroName).font(.headline).lineLimit(1)
                    Text("About to run · esc cancels").font(.callout).foregroundStyle(.secondary)
                }
                Spacer()
                Button("Cancel") { runner.cancelCountdown() }
                Button("Run Now") { runner.skipCountdown() }.buttonStyle(.borderedProminent)
            }
        }
    }
}

private struct SummaryCard: View {
    let summary: RunSummary
    @ViewState private var appeared = false

    private var look: (String, Color, String) {
        switch summary.result {
        case .completed: return ("checkmark.circle.fill", .green, "Done")
        case .stopped: return ("stop.circle.fill", .orange, "Stopped")
        case .failed: return ("xmark.octagon.fill", .red, "Failed")
        case .skipped: return ("forward.end.circle.fill", .gray, "Skipped")
        }
    }

    var body: some View {
        let (symbol, color, word) = look
        HStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.system(size: 30))
                .foregroundStyle(color)
                .scaleEffect(appeared ? 1 : 0.4)
                .opacity(appeared ? 1 : 0)
            VStack(alignment: .leading, spacing: 3) {
                Text("\(word) · \(summary.macroName)").font(.headline).lineLimit(1)
                Text(summary.reason
                     ?? summary.output.map { "Read: " + $0.replacingOccurrences(of: "\n", with: " ⏎ ") }
                     ?? "\(summary.stepCount) step\(summary.stepCount == 1 ? "" : "s") in \(Fmt.seconds(summary.duration))")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            Spacer()
        }
        .onAppear {
            withAnimation(.spring(response: 0.38, dampingFraction: 0.55)) { appeared = true }
        }
    }
}

// MARK: - Ghost marker

/// Where a preview / show-only step would act: a dashed target on the exact point
/// plus a label. Never takes clicks.
@MainActor
enum Ghost {
    static let size = NSSize(width: 320, height: 120)
    /// Target centre inside the panel (top-left origin, SwiftUI space).
    static let anchor = CGPoint(x: 60, y: 60)
    private static var panel: FloatingPanel?

    static func show(_ step: Step, number: Int) {
        let p = panel ?? {
            let p = FloatingPanel(size: size, interactive: false)
            p.level = .screenSaver
            p.hasShadow = false
            panel = p
            return p
        }()
        let host = NSHostingView(rootView: GhostView(step: step, number: number))
        host.frame = NSRect(origin: .zero, size: size)
        p.contentView = host
        let c = Geo.cocoa(fromQuartz: step.point)
        p.setFrameOrigin(NSPoint(x: c.x - anchor.x, y: c.y - (size.height - anchor.y)))
        p.orderFrontRegardless()
    }

    static func hide() {
        panel?.orderOut(nil)
        areaPanel?.orderOut(nil)
    }

    private static var areaPanel: FloatingPanel?

    /// A dashed box over the exact area a Read-text step would capture.
    static func showArea(_ step: Step, number: Int) {
        let r = step.area
        let p = areaPanel ?? {
            let p = FloatingPanel(size: r.size, interactive: false)
            p.level = .screenSaver
            p.hasShadow = false
            areaPanel = p
            return p
        }()
        let host = NSHostingView(rootView: GhostAreaView(step: step, number: number))
        p.contentView = host
        let c = Geo.cocoa(fromQuartz: CGPoint(x: r.minX, y: r.maxY))
        // Room above the box for the label.
        p.setFrame(NSRect(x: c.x - 3, y: c.y - 3, width: r.width + 6, height: r.height + 30), display: true)
        p.orderFrontRegardless()
    }
}

private struct GhostAreaView: View {
    let step: Step
    let number: Int
    @ViewState private var phase: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("\(number) · \(step.heading) · Would read this area")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(RoundedRectangle(cornerRadius: 6).fill(Color.purple))
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.purple.opacity(0.1))
                .overlay(RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(Color.purple, style: StrokeStyle(lineWidth: 2.5, dash: [7, 5], dashPhase: phase)))
                .padding(3)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .onAppear {
            withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) { phase = -24 }
        }
    }
}

private struct GhostView: View {
    let step: Step
    let number: Int
    @ViewState private var spin = false
    @ViewState private var pulse = false

    var body: some View {
        ZStack(alignment: .topLeading) {
            ZStack {
                Circle()
                    .fill(Color.purple.opacity(0.14))
                    .frame(width: 70, height: 70)
                    .scaleEffect(pulse ? 1.15 : 0.9)
                Circle()
                    .strokeBorder(Color.purple, style: StrokeStyle(lineWidth: 2.5, dash: [6, 5]))
                    .frame(width: 46, height: 46)
                    .rotationEffect(.degrees(spin ? 360 : 0))
                Path { p in
                    p.move(to: CGPoint(x: 60, y: 40)); p.addLine(to: CGPoint(x: 60, y: 53))
                    p.move(to: CGPoint(x: 60, y: 67)); p.addLine(to: CGPoint(x: 60, y: 80))
                    p.move(to: CGPoint(x: 40, y: 60)); p.addLine(to: CGPoint(x: 53, y: 60))
                    p.move(to: CGPoint(x: 67, y: 60)); p.addLine(to: CGPoint(x: 80, y: 60))
                }
                .stroke(Color.purple, lineWidth: 2)
                .frame(width: 120, height: 120)
                Circle().fill(Color.purple).frame(width: 6, height: 6)
            }
            .frame(width: 120, height: 120)

            VStack(alignment: .leading, spacing: 1) {
                Text("\(number) · \(step.heading)")
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                Text("\(step.type.wouldVerb) · \(Fmt.coord(step.x)), \(Fmt.coord(step.y))")
                    .font(.caption2)
                    .opacity(0.85)
                    .lineLimit(1)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.purple))
            .frame(maxWidth: 200, alignment: .leading)
            .offset(x: 100, y: 40)
        }
        .frame(width: Ghost.size.width, height: Ghost.size.height, alignment: .topLeading)
        .onAppear {
            withAnimation(.linear(duration: 4).repeatForever(autoreverses: false)) { spin = true }
            withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { pulse = true }
        }
    }
}

// MARK: - Click ring

@MainActor
enum ClickRing {
    private static var live: Set<NSPanel> = []

    /// Two expanding ripples and a dot where the click landed.
    static func show(at p: CGPoint) {
        let size: CGFloat = 84
        let c = Geo.cocoa(fromQuartz: p)
        let panel = FloatingPanel(size: NSSize(width: size, height: size), interactive: false)
        panel.level = .screenSaver
        let view = NSView(frame: NSRect(x: 0, y: 0, width: size, height: size))
        view.wantsLayer = true
        let accent = NSColor.controlAccentColor
        let center = CGPoint(x: size / 2, y: size / 2)

        func ring(delay: CFTimeInterval, width: CGFloat) {
            let r = CAShapeLayer()
            r.bounds = CGRect(x: 0, y: 0, width: 40, height: 40)
            r.position = center
            r.path = CGPath(ellipseIn: r.bounds.insetBy(dx: 2, dy: 2), transform: nil)
            r.fillColor = nil
            r.strokeColor = accent.cgColor
            r.lineWidth = width
            r.opacity = 0
            view.layer?.addSublayer(r)
            let scale = CABasicAnimation(keyPath: "transform.scale")
            scale.fromValue = 0.3
            scale.toValue = 1.9
            let fade = CAKeyframeAnimation(keyPath: "opacity")
            fade.values = [0, 1, 0]
            fade.keyTimes = [0, 0.15, 1]
            let g = CAAnimationGroup()
            g.animations = [scale, fade]
            g.duration = 0.6
            g.beginTime = CACurrentMediaTime() + delay
            g.timingFunction = CAMediaTimingFunction(name: .easeOut)
            r.add(g, forKey: "ripple")
        }
        ring(delay: 0, width: 3)
        ring(delay: 0.12, width: 2)

        let dot = CAShapeLayer()
        dot.bounds = CGRect(x: 0, y: 0, width: 12, height: 12)
        dot.position = center
        dot.path = CGPath(ellipseIn: dot.bounds, transform: nil)
        dot.fillColor = accent.cgColor
        dot.opacity = 0
        view.layer?.addSublayer(dot)
        let pop = CAKeyframeAnimation(keyPath: "transform.scale")
        pop.values = [0.2, 1.2, 1, 0.6]
        let dotFade = CAKeyframeAnimation(keyPath: "opacity")
        dotFade.values = [1, 1, 0.8, 0]
        let dg = CAAnimationGroup()
        dg.animations = [pop, dotFade]
        dg.duration = 0.55
        dot.add(dg, forKey: "pop")

        panel.contentView = view
        panel.setFrameOrigin(NSPoint(x: c.x - size / 2, y: c.y - size / 2))
        panel.orderFrontRegardless()
        live.insert(panel)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.85) {
            MainActor.assumeIsolated {
                panel.orderOut(nil)
                live.remove(panel)
            }
        }
    }
}
