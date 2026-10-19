import AppKit
import SwiftUI
import QuartzCore

/// Borderless, non-activating, on every Space. Never becomes key, so typing steps
/// keep going to the app the macro is driving.
final class FloatingPanel: NSPanel {
    init(size: NSSize, interactive: Bool) {
        super.init(contentRect: NSRect(origin: .zero, size: size),
                   styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        isFloatingPanel = true
        level = .statusBar
        backgroundColor = .clear
        isOpaque = false
        hasShadow = interactive
        hidesOnDeactivate = false
        isReleasedWhenClosed = false
        isMovableByWindowBackground = interactive
        ignoresMouseEvents = !interactive
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

/// Buttons must work on the first click even though the panel is never key.
final class FirstClickHostingView<Content: View>: NSHostingView<Content> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

// MARK: - HUD

@MainActor
final class HUD {
    static let shared = HUD()
    static let size = NSSize(width: 420, height: 78)

    private lazy var panel: FloatingPanel = {
        let p = FloatingPanel(size: HUD.size, interactive: true)
        let host = FirstClickHostingView(rootView: HUDView())
        host.sizingOptions = []
        host.frame = NSRect(origin: .zero, size: HUD.size)
        p.contentView = host
        return p
    }()
    private var placed = false
    private var dodging = false

    func show() {
        if !placed {
            let screen = NSScreen.screens.first { $0.frame.contains(NSEvent.mouseLocation) } ?? NSScreen.main
            if let f = screen?.visibleFrame {
                panel.setFrameOrigin(NSPoint(x: f.midX - HUD.size.width / 2, y: f.maxY - HUD.size.height - 14))
            }
            placed = true
        }
        panel.alphaValue = 1
        panel.orderFrontRegardless()
    }

    func hide() {
        undodge()
        panel.orderOut(nil)
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

struct HUDView: View {
    @ObservedObject private var runner = Runner.shared
    @ObservedObject private var recorder = Recorder.shared

    var body: some View {
        ZStack {
            if recorder.isRecording {
                recording
            } else if let c = runner.countdown {
                countdown(c)
            } else if let s = runner.status {
                running(s)
            }
        }
        .padding(.horizontal, 18)
        .frame(width: HUD.size.width, height: HUD.size.height)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.primary.opacity(0.1)))
    }

    private var recording: some View {
        HStack(spacing: 14) {
            Circle().fill(.red).frame(width: 12, height: 12)
                .shadow(color: .red.opacity(0.6), radius: 4)
            VStack(alignment: .leading, spacing: 3) {
                Text("Recording…").font(.headline)
                Text("\(recorder.clickCount) click\(recorder.clickCount == 1 ? "" : "s") · esc to stop")
                    .font(.callout).foregroundStyle(.secondary).monospacedDigit()
            }
            Spacer()
            Button("Stop") { recorder.stop() }
                .controlSize(.large)
                .keyboardShortcut(.cancelAction)
        }
    }

    private func countdown(_ c: PendingRun) -> some View {
        HStack(spacing: 14) {
            Image(systemName: "alarm.fill").font(.title2).foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 3) {
                Text(c.macroName).font(.headline).lineLimit(1)
                TimelineView(.periodic(from: .now, by: 0.2)) { ctx in
                    let left = max(0, (c.fireAt ?? ctx.date).timeIntervalSince(ctx.date))
                    Text("About to run in \(Int(left.rounded(.up)))s · esc cancels")
                        .font(.callout).foregroundStyle(.secondary).monospacedDigit()
                }
            }
            Spacer()
            Button("Cancel") { runner.cancelCountdown() }
            Button("Run Now") { runner.skipCountdown() }.buttonStyle(.borderedProminent)
        }
    }

    private func running(_ s: RunStatus) -> some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().stroke(.primary.opacity(0.12), lineWidth: 4)
                Circle()
                    .trim(from: 0, to: s.stepCount == 0 ? 0 : Double(s.stepIndex + 1) / Double(s.stepCount))
                    .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Image(systemName: s.step?.type.symbol ?? "play.fill").font(.system(size: 13, weight: .semibold))
            }
            .frame(width: 38, height: 38)
            VStack(alignment: .leading, spacing: 3) {
                Text(s.macroName).font(.headline).lineLimit(1)
                TimelineView(.periodic(from: .now, by: 0.1)) { ctx in
                    Text(detail(s, now: ctx.date))
                        .font(.callout).foregroundStyle(.secondary).monospacedDigit().lineLimit(1)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Button("Stop") { runner.stop() }.controlSize(.large)
                Text("\(HotKey.display) or esc").font(.caption2).foregroundStyle(.tertiary)
            }
        }
    }

    private func detail(_ s: RunStatus, now: Date) -> String {
        let name = s.step?.name.trimmingCharacters(in: .whitespaces) ?? ""
        var parts = ["Step \(s.stepIndex + 1) of \(s.stepCount)" + (name.isEmpty ? "" : " · \(name)")]
        if s.iterations != 1 {
            parts.append(s.iterations == 0 ? "loop \(s.iteration + 1)" : "loop \(s.iteration + 1)/\(s.iterations)")
        }
        if let next = s.nextAt {
            parts.append(String(format: "next in %.1fs", max(0, next.timeIntervalSince(now))))
        } else if let step = s.step {
            parts.append(step.type.label)
        }
        return parts.joined(separator: " · ")
    }
}

// MARK: - Click ring

@MainActor
enum ClickRing {
    private static var live: Set<NSPanel> = []

    static func show(at p: CGPoint) {
        let size: CGFloat = 46
        let c = Geo.cocoa(fromQuartz: p)
        let panel = FloatingPanel(size: NSSize(width: size, height: size), interactive: false)
        panel.level = .screenSaver
        let view = NSView(frame: NSRect(x: 0, y: 0, width: size, height: size))
        view.wantsLayer = true
        let ring = CAShapeLayer()
        ring.bounds = view.bounds
        ring.position = CGPoint(x: size / 2, y: size / 2)
        ring.path = CGPath(ellipseIn: view.bounds.insetBy(dx: 5, dy: 5), transform: nil)
        ring.fillColor = NSColor.controlAccentColor.withAlphaComponent(0.18).cgColor
        ring.strokeColor = NSColor.controlAccentColor.cgColor
        ring.lineWidth = 3
        view.layer?.addSublayer(ring)
        panel.contentView = view
        panel.setFrameOrigin(NSPoint(x: c.x - size / 2, y: c.y - size / 2))
        panel.orderFrontRegardless()
        live.insert(panel)

        let scale = CABasicAnimation(keyPath: "transform.scale")
        scale.fromValue = 0.35
        scale.toValue = 1.15
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 1
        fade.toValue = 0
        let group = CAAnimationGroup()
        group.animations = [scale, fade]
        group.duration = 0.45
        group.timingFunction = CAMediaTimingFunction(name: .easeOut)
        ring.opacity = 0
        ring.add(group, forKey: "pulse")

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            MainActor.assumeIsolated {
                panel.orderOut(nil)
                live.remove(panel)
            }
        }
    }
}

// MARK: - Click accuracy test

/// Puts a target on every display, clicks its centre through the real engine, and
/// reports where AppKit says the click actually landed.
@MainActor
enum AccuracyTest {
    final class TargetView: NSView {
        var hit: CGPoint?
        override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
        override func mouseDown(with event: NSEvent) {
            guard let w = window else { return }
            hit = Geo.quartz(fromCocoa: w.convertPoint(toScreen: event.locationInWindow))
        }
        override func draw(_ dirtyRect: NSRect) {
            NSColor.controlAccentColor.withAlphaComponent(0.25).setFill()
            NSBezierPath(ovalIn: bounds).fill()
            NSColor.controlAccentColor.setStroke()
            let p = NSBezierPath()
            p.move(to: NSPoint(x: bounds.midX, y: 0)); p.line(to: NSPoint(x: bounds.midX, y: bounds.maxY))
            p.move(to: NSPoint(x: 0, y: bounds.midY)); p.line(to: NSPoint(x: bounds.maxX, y: bounds.midY))
            p.stroke()
        }
    }

    static func run() async -> [String] {
        guard AXIsProcessTrusted() else { return ["Accessibility permission is off, so no clicks can be sent."] }
        let restore = Geo.mouse
        var lines: [String] = []
        for screen in NSScreen.screens {
            let f = Geo.frame(of: screen)
            // An off-centre, odd point so a y-flip or a 2x scale error can't cancel out.
            let target = CGPoint(x: (f.minX + f.width * 0.37).rounded(), y: (f.minY + f.height * 0.61).rounded())
            let size: CGFloat = 90
            let panel = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
            panel.level = .screenSaver
            panel.backgroundColor = .clear
            panel.isOpaque = false
            let view = TargetView(frame: NSRect(x: 0, y: 0, width: size, height: size))
            panel.contentView = view
            let c = Geo.cocoa(fromQuartz: target)
            panel.setFrame(NSRect(x: c.x - size / 2, y: c.y - size / 2, width: size, height: size), display: true)
            panel.orderFrontRegardless()
            try? await Task.sleep(nanoseconds: 350_000_000)
            try? await ClickEngine.click(target, button: .left, count: 1)
            try? await Task.sleep(nanoseconds: 300_000_000)
            let name = screen.localizedName
            if let hit = view.hit {
                let dx = hit.x - target.x, dy = hit.y - target.y
                lines.append(abs(dx) < 0.01 && abs(dy) < 0.01
                    ? "\(name): landed exactly on \(Fmt.coord(target.x)), \(Fmt.coord(target.y))"
                    : String(format: "\(name): off by %.2f, %.2f pt (aimed \(Fmt.coord(target.x)), \(Fmt.coord(target.y)))", dx, dy))
            } else {
                lines.append("\(name): the click never arrived (aimed \(Fmt.coord(target.x)), \(Fmt.coord(target.y)))")
            }
            panel.orderOut(nil)
        }
        CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: restore, mouseButton: .left)?
            .post(tap: .cghidEventTap)
        return lines
    }
}
