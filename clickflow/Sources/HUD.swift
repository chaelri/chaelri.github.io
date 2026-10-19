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
    @ObservedObject private var runner = Runner.shared
    @ObservedObject private var recorder = Recorder.shared

    var body: some View {
        ZStack {
            if recorder.isRecording {
                RecordingCard(recorder: recorder)
            } else if let c = runner.countdown {
                CountdownCard(pending: c, runner: runner)
            } else if let s = runner.status {
                RunCard(status: s, runner: runner)
            } else if let sum = runner.summary {
                SummaryCard(summary: sum)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(.primary.opacity(0.1)))
        .animation(.easeOut(duration: 0.2), value: runner.status == nil)
    }
}

// MARK: - Running

private struct RunCard: View {
    let status: RunStatus
    @ObservedObject var runner: Runner

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
                Text(status.testOnly != nil ? "Testing a step" : status.macroName)
                    .font(.headline)
                    .lineLimit(1)
                TimelineView(.periodic(from: .now, by: 0.25)) { ctx in
                    Text(subtitle(now: ctx.date))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .contentTransition(.numericText())
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Button {
                    runner.stop()
                } label: {
                    Label("Stop", systemImage: "stop.fill")
                }
                .buttonStyle(StopButtonStyle())
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
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { ctx in
            let fraction = phaseFraction(status, now: ctx.date)
            if status.stepCount <= 48 {
                HStack(spacing: 3) {
                    ForEach(0..<status.stepCount, id: \.self) { i in
                        GeometryReader { g in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.primary.opacity(0.12))
                                Capsule()
                                    .fill(status.steps[i].type.tint)
                                    .frame(width: g.size.width * fill(i, fraction))
                            }
                        }
                    }
                }
                .frame(height: 5)
            } else {
                // Too many steps for segments: one continuous bar.
                let overall = (Double(status.stepIndex) + fraction) / Double(max(1, status.stepCount))
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.primary.opacity(0.12))
                        Capsule().fill(Color.accentColor).frame(width: g.size.width * overall)
                    }
                }
                .frame(height: 5)
            }
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
                    TimelineView(.animation(minimumInterval: 1.0 / 30)) { ctx in
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
                    .fill(step.type.tint.opacity(0.12))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(step.type.tint.opacity(0.35)))
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
            Label("Done", systemImage: "checkmark.circle.fill")
                .labelStyle(.titleAndIcon)
                .font(.caption.weight(.medium))
                .foregroundStyle(.green)
        case .next:
            Text(step.type == .wait || step.delayBefore == 0 ? "Up next" : "Up next · after \(Fmt.seconds(step.delayBefore))")
                .font(.caption)
                .foregroundStyle(.secondary)
        case .current:
            TimelineView(.periodic(from: .now, by: 0.1)) { ctx in
                Text(currentState(now: ctx.date))
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(step.type.tint)
                    .contentTransition(.numericText())
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
            return String(format: "\(step.type.verb) in %.1fs", left ?? 0)
        case .acting:
            if let p = status.progress { return "\(step.type.verb) \(Int(p * 100))%" }
            return "\(step.type.verb)…"
        }
    }
}

private struct ProgressLine: View {
    let fraction: Double
    let tint: Color

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.primary.opacity(0.1))
                Capsule()
                    .fill(LinearGradient(colors: [tint.opacity(0.7), tint], startPoint: .leading, endPoint: .trailing))
                    .frame(width: max(4, g.size.width * fraction))
            }
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
private struct StopButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.callout.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(Capsule().fill(Color.red.opacity(configuration.isPressed ? 0.75 : 1)))
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
    @ObservedObject var runner: Runner

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
                Text(summary.reason ?? "\(summary.stepCount) step\(summary.stepCount == 1 ? "" : "s") in \(Fmt.seconds(summary.duration))")
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
