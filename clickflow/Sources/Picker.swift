import AppKit
import ScreenCaptureKit

/// Full-screen crosshair overlay on every display. Click (or ↩) captures, esc cancels,
/// arrow keys nudge the pointer 1 pt (⇧ for 10). The loupe magnifies a still capture
/// taken just before the overlay opens, which needs Screen Recording permission; without
/// it the picker still works, just without magnification.
@MainActor
final class CoordinatePicker {
    private static var active: CoordinatePicker?

    static func pick() async -> CGPoint? {
        guard active == nil else { return nil }
        let hid = WindowManager.hideMain()
        try? await Task.sleep(nanoseconds: 250_000_000)
        let shots = await captureDisplays()
        let point: CGPoint? = await withCheckedContinuation { cont in
            let p = CoordinatePicker(shots: shots) { cont.resume(returning: $0) }
            active = p
            p.begin()
        }
        active = nil
        if hid { WindowManager.restoreMain(activate: true) }
        return point
    }

    private static func captureDisplays() async -> [CGDirectDisplayID: CGImage] {
        guard CGPreflightScreenCaptureAccess() else { return [:] }
        guard let content = try? await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true) else { return [:] }
        var out: [CGDirectDisplayID: CGImage] = [:]
        for d in content.displays {
            let scale = NSScreen.screens.first { $0.displayID == d.displayID }?.backingScaleFactor ?? 2
            let cfg = SCStreamConfiguration()
            cfg.width = Int(CGFloat(d.width) * scale)
            cfg.height = Int(CGFloat(d.height) * scale)
            cfg.showsCursor = false
            let filter = SCContentFilter(display: d, excludingWindows: [])
            if let img = try? await SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg) {
                out[d.displayID] = img
            }
        }
        return out
    }

    // MARK: Instance

    let shots: [CGDirectDisplayID: CGImage]
    private let done: (CGPoint?) -> Void
    private var windows: [PickerWindow] = []
    private var timer: Timer?
    private var keyMonitor: Any?
    private var finished = false
    /// Rounded to whole points: what you see in the readout is exactly what gets stored.
    private(set) var point = CGPoint.zero

    private init(shots: [CGDirectDisplayID: CGImage], done: @escaping (CGPoint?) -> Void) {
        self.shots = shots
        self.done = done
    }

    private func begin() {
        point = rounded(Geo.mouse)
        for screen in NSScreen.screens {
            windows.append(PickerWindow(screen: screen, picker: self))
        }
        NSApp.activate(ignoringOtherApps: true)
        windows.forEach { $0.orderFrontRegardless() }
        (windows.first { Geo.frame(of: $0.pickScreen).contains(point) } ?? windows.first)?.makeKey()
        NSCursor.crosshair.set()

        // Polling the pointer is the one approach that tracks across every display uniformly.
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60, repeats: true) { _ in
            MainActor.assumeIsolated { CoordinatePicker.active?.tick() }
        }
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { e in
            MainActor.assumeIsolated { CoordinatePicker.active?.key(e) ?? false } ? nil : e
        }
    }

    private func rounded(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x.rounded(), y: p.y.rounded()) }

    private func tick() {
        let p = rounded(Geo.mouse)
        guard p != point else { return }
        point = p
        windows.forEach { $0.contentView?.needsDisplay = true }
    }

    private func key(_ e: NSEvent) -> Bool {
        let step: CGFloat = e.modifierFlags.contains(.shift) ? 10 : 1
        switch e.keyCode {
        case 53: finish(nil)
        case 36, 76: finish(point)
        case 123: nudge(-step, 0)
        case 124: nudge(step, 0)
        case 125: nudge(0, step)
        case 126: nudge(0, -step)
        default: return false
        }
        return true
    }

    private func nudge(_ dx: CGFloat, _ dy: CGFloat) {
        let p = CGPoint(x: point.x + dx, y: point.y + dy)
        guard Geo.isOnScreen(p) else { return }
        CGWarpMouseCursorPosition(p)
        CGAssociateMouseAndMouseCursorPosition(1)
        tick()
    }

    func clicked() { finish(point) }

    private func finish(_ result: CGPoint?) {
        guard !finished else { return }
        finished = true
        timer?.invalidate()
        if let m = keyMonitor { NSEvent.removeMonitor(m) }
        windows.forEach { $0.orderOut(nil) }
        windows.removeAll()
        NSCursor.arrow.set()
        done(result)
    }
}

// MARK: - Overlay window

final class PickerWindow: NSWindow {
    let pickScreen: NSScreen

    init(screen: NSScreen, picker: CoordinatePicker) {
        pickScreen = screen
        super.init(contentRect: screen.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        setFrame(screen.frame, display: false)
        level = .screenSaver
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        isReleasedWhenClosed = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        contentView = PickerView(screen: screen, picker: picker)
    }

    override var canBecomeKey: Bool { true }
}

final class PickerView: NSView {
    private let screen: NSScreen
    private unowned let picker: CoordinatePicker
    private let zoom: CGFloat = 11
    private let span = 15  // points across the loupe; odd so there is a centre cell

    init(screen: NSScreen, picker: CoordinatePicker) {
        self.screen = screen
        self.picker = picker
        super.init(frame: NSRect(origin: .zero, size: screen.frame.size))
    }

    required init?(coder: NSCoder) { fatalError() }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func mouseDown(with event: NSEvent) {
        MainActor.assumeIsolated { picker.clicked() }
    }

    override func resetCursorRects() { addCursorRect(bounds, cursor: .crosshair) }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        // A faint tint (never fully clear, or clicks would fall through to the apps below).
        NSColor.black.withAlphaComponent(0.12).setFill()
        bounds.fill()

        let (frame, p, shot) = MainActor.assumeIsolated {
            (Geo.frame(of: screen), picker.point, screen.displayID.flatMap { picker.shots[$0] })
        }
        drawHint()
        guard frame.contains(p) else { return }

        // View coordinates are bottom-left within this screen.
        let lp = NSPoint(x: p.x - frame.minX, y: frame.maxY - p.y)

        let accent = NSColor.controlAccentColor
        ctx.saveGState()
        ctx.setStrokeColor(accent.withAlphaComponent(0.9).cgColor)
        ctx.setLineWidth(1)
        let gap: CGFloat = 8
        let x = lp.x.rounded() + 0.5, y = lp.y.rounded() - 0.5
        ctx.strokeLineSegments(between: [
            CGPoint(x: 0, y: y), CGPoint(x: x - gap, y: y), CGPoint(x: x + gap, y: y), CGPoint(x: bounds.maxX, y: y),
            CGPoint(x: x, y: 0), CGPoint(x: x, y: y - gap), CGPoint(x: x, y: y + gap), CGPoint(x: x, y: bounds.maxY),
        ])
        ctx.restoreGState()

        // Loupe, flipped to whichever side keeps it on screen.
        let size = CGFloat(span) * zoom
        var origin = NSPoint(x: lp.x + 28, y: lp.y - 28 - size)
        if origin.x + size > bounds.maxX - 8 { origin.x = lp.x - 28 - size }
        if origin.y < 40 { origin.y = lp.y + 28 }
        let loupe = NSRect(origin: origin, size: NSSize(width: size, height: size))
        let clip = NSBezierPath(roundedRect: loupe, xRadius: 14, yRadius: 14)

        NSGraphicsContext.saveGraphicsState()
        clip.addClip()
        NSColor.windowBackgroundColor.setFill()
        loupe.fill()
        if let shot {
            ctx.interpolationQuality = .none
            let scale = CGFloat(shot.width) / frame.width
            let half = CGFloat(span / 2)
            let sample = CGRect(x: p.x - frame.minX - half, y: p.y - frame.minY - half,
                                width: CGFloat(span), height: CGFloat(span))
            let bounded = sample.intersection(CGRect(x: 0, y: 0, width: frame.width, height: frame.height))
            if !bounded.isNull,
               let crop = shot.cropping(to: CGRect(x: bounded.minX * scale, y: bounded.minY * scale,
                                                   width: bounded.width * scale, height: bounded.height * scale)) {
                let dest = CGRect(x: loupe.minX + (bounded.minX - sample.minX) * zoom,
                                  y: loupe.maxY - (bounded.maxY - sample.minY) * zoom,
                                  width: bounded.width * zoom, height: bounded.height * zoom)
                ctx.draw(crop, in: dest)
            }
            // Point grid + the centre cell.
            ctx.setStrokeColor(NSColor.black.withAlphaComponent(0.12).cgColor)
            ctx.setLineWidth(0.5)
            for i in 1..<span {
                let o = CGFloat(i) * zoom
                ctx.strokeLineSegments(between: [CGPoint(x: loupe.minX + o, y: loupe.minY), CGPoint(x: loupe.minX + o, y: loupe.maxY),
                                                 CGPoint(x: loupe.minX, y: loupe.minY + o), CGPoint(x: loupe.maxX, y: loupe.minY + o)])
            }
        } else {
            let msg = "Turn on Screen Recording\nfor ClickFlow to magnify" as NSString
            let style = NSMutableParagraphStyle()
            style.alignment = .center
            let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 12), .foregroundColor: NSColor.secondaryLabelColor,
                                                        .paragraphStyle: style]
            msg.draw(in: loupe.insetBy(dx: 10, dy: size / 2 - 20), withAttributes: attrs)
        }
        let c = CGFloat(span / 2) * zoom
        ctx.setStrokeColor(NSColor.systemRed.cgColor)
        ctx.setLineWidth(2)
        ctx.stroke(CGRect(x: loupe.minX + c, y: loupe.maxY - c - zoom, width: zoom, height: zoom))
        NSGraphicsContext.restoreGraphicsState()

        accent.setStroke()
        clip.lineWidth = 2
        clip.stroke()

        // Readout.
        let label = "X \(Fmt.coord(p.x))   Y \(Fmt.coord(p.y))" as NSString
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedDigitSystemFont(ofSize: 13, weight: .semibold), .foregroundColor: NSColor.white,
        ]
        let ts = label.size(withAttributes: attrs)
        let pill = NSRect(x: loupe.midX - ts.width / 2 - 10, y: loupe.minY - ts.height - 14, width: ts.width + 20, height: ts.height + 8)
        NSColor.black.withAlphaComponent(0.78).setFill()
        NSBezierPath(roundedRect: pill, xRadius: pill.height / 2, yRadius: pill.height / 2).fill()
        label.draw(at: NSPoint(x: pill.minX + 10, y: pill.minY + 4), withAttributes: attrs)
    }

    private func drawHint() {
        let text = "Click to pick a point  ·  ← → ↑ ↓ nudge (⇧ ×10)  ·  ↩ pick  ·  esc cancel" as NSString
        let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 13, weight: .medium), .foregroundColor: NSColor.white]
        let ts = text.size(withAttributes: attrs)
        let top = bounds.maxY - (screen.frame.maxY - screen.visibleFrame.maxY)
        let r = NSRect(x: bounds.midX - ts.width / 2 - 14, y: top - ts.height - 30, width: ts.width + 28, height: ts.height + 12)
        NSColor.black.withAlphaComponent(0.72).setFill()
        NSBezierPath(roundedRect: r, xRadius: r.height / 2, yRadius: r.height / 2).fill()
        text.draw(at: NSPoint(x: r.minX + 14, y: r.minY + 6), withAttributes: attrs)
    }
}
