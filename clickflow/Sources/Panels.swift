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
