import AppKit
import SwiftUI

/// Floating, non-blocking point / area placement. Unlike the full-screen picker, nothing
/// here takes focus or covers the screen: the target (or box) floats above every app, you
/// keep using the real app underneath (⌘-Tab, scroll, open menus), and confirm with ✓.
///
/// Area: drag the dashed edge to move, the white handles to resize. The inside is fully
/// transparent, so clicks there go straight through to the app below.
@MainActor
final class Placer {
    private static var current: Placer?

    /// Returns the confirmed point (Quartz points, rounded) or nil on ✗.
    static func placePoint(start: CGPoint?) async -> CGPoint? {
        await run(.point, start: start.map { CGRect(origin: $0, size: .zero) })?.origin
    }

    /// Returns the confirmed area (Quartz points, rounded) or nil on ✗.
    static func placeArea(start: CGRect?) async -> CGRect? {
        await run(.area, start: start)
    }

    /// `--placer-test`: puts a ClickFlow-owned target under an area box, clicks the box's
    /// middle (must reach the target) and drags its top edge (must move the box).
    static func selfTest() async -> [String] {
        var out: [String] = []
        let f = Geo.frame(of: NSScreen.main ?? NSScreen.screens[0])
        let area = CGRect(x: (f.midX - 150).rounded(), y: (f.midY - 80).rounded(), width: 300, height: 160)
        let target = AccuracyTest.TargetView(frame: NSRect(x: 0, y: 0, width: 60, height: 60))
        let tp = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        tp.level = .floating
        tp.contentView = target
        let mid = CGPoint(x: area.midX, y: area.midY)
        let mc = Geo.cocoa(fromQuartz: mid)
        tp.setFrame(NSRect(x: mc.x - 30, y: mc.y - 30, width: 60, height: 60), display: true)
        tp.orderFrontRegardless()

        // Let the launch settle (the main window opens over the same spot) before testing.
        try? await Task.sleep(nanoseconds: 1_500_000_000)
        var result: CGRect?
        let task = Task { @MainActor in result = await placeArea(start: area) }
        try? await Task.sleep(nanoseconds: 700_000_000)
        try? await ClickEngine.click(mid, button: .left, count: 1)
        try? await Task.sleep(nanoseconds: 300_000_000)
        out.append(target.hit != nil ? "PASS click inside the box reached the app below" : "FAIL click inside the box was swallowed")
        if target.hit == nil {
            // Which windows sit at that point, front to back?
            let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
            for w in info {
                guard let b = w[kCGWindowBounds as String] as? [String: CGFloat],
                      CGRect(x: b["X"] ?? 0, y: b["Y"] ?? 0, width: b["Width"] ?? 0, height: b["Height"] ?? 0).contains(mid) else { continue }
                out.append("  at point: \(w[kCGWindowOwnerName as String] ?? "?") layer=\(w[kCGWindowLayer as String] ?? "?") "
                           + "bounds=\(b) alpha=\(w[kCGWindowAlpha as String] ?? "?")")
                if out.count > 8 { break }
            }
        }

        // Drag the top edge (away from handles) 40 pt down and 30 pt right.
        let grab = CGPoint(x: area.minX + area.width * 0.3, y: area.minY)
        let src = CGEventSource(stateID: .hidSystemState)
        func post(_ t: CGEventType, _ p: CGPoint) {
            CGEvent(mouseEventSource: src, mouseType: t, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
        }
        post(.mouseMoved, grab)
        try? await Task.sleep(nanoseconds: 80_000_000)
        post(.leftMouseDown, grab)
        for i in 1...10 {
            try? await Task.sleep(nanoseconds: 16_000_000)
            post(.leftMouseDragged, CGPoint(x: grab.x + CGFloat(i) * 3, y: grab.y + CGFloat(i) * 4))
        }
        post(.leftMouseUp, CGPoint(x: grab.x + 30, y: grab.y + 40))
        try? await Task.sleep(nanoseconds: 200_000_000)
        current?.confirm()
        _ = await task.value
        if let r = result {
            let moved = CGPoint(x: r.minX - area.minX, y: r.minY - area.minY)
            out.append(abs(moved.x - 30) <= 1 && abs(moved.y - 40) <= 1 && r.size == area.size
                ? "PASS dragging the edge moved the box by 30, 40"
                : "FAIL drag gave \(r) (moved \(moved.x), \(moved.y))")
        } else {
            out.append("FAIL no result")
        }
        tp.orderOut(nil)
        return out
    }

    private static func run(_ kind: Kind, start: CGRect?) async -> CGRect? {
        current?.finish(nil)   // only one at a time
        let hid = WindowManager.hideMain()
        let result: CGRect? = await withCheckedContinuation { cont in
            let p = Placer(kind: kind, start: start, done: { cont.resume(returning: $0) })
            current = p
            p.open()
        }
        current = nil
        if hid { WindowManager.restoreMain(activate: true) }
        return result
    }

    // MARK: Instance

    enum Kind { case point, area }

    let kind: Kind
    let model = PlacerModel()
    private let done: (CGRect?) -> Void
    private var finished = false
    /// Cocoa (bottom-left) screen coordinates while editing.
    private var box: NSRect
    private var center: NSPoint
    /// Four strips (top, bottom, left, right) so no window covers the inside of the box:
    /// clicks there always reach the app below.
    private var strips: [(PassThroughPanel, AreaBoxView)] = []
    private var targetPanel: FloatingPanel?
    private var barPanel: FloatingPanel?

    static let margin: CGFloat = 12
    static let targetSize: CGFloat = 76
    static let barSize = NSSize(width: 360, height: 64)

    private init(kind: Kind, start: CGRect?, done: @escaping (CGRect?) -> Void) {
        self.kind = kind
        self.done = done
        let screen = NSScreen.screens.first { $0.frame.contains(NSEvent.mouseLocation) } ?? NSScreen.main ?? NSScreen.screens[0]
        let vf = screen.visibleFrame
        // Start from the step's current value when it's on screen, else the middle of this screen.
        if let s = start, kind == .area, s.width >= 8, s.height >= 8, Geo.isOnScreen(CGPoint(x: s.midX, y: s.midY)) {
            box = Geo.cocoaRect(fromQuartz: s)
        } else {
            box = NSRect(x: (vf.midX - 160).rounded(), y: (vf.midY - 60).rounded(), width: 320, height: 120)
        }
        if let s = start, kind == .point, Geo.isOnScreen(s.origin) {
            center = Geo.cocoa(fromQuartz: s.origin)
        } else {
            center = NSPoint(x: vf.midX.rounded(), y: vf.midY.rounded())
        }
    }

    private func open() {
        model.kind = kind
        model.onConfirm = { [weak self] in self?.confirm() }
        model.onCancel = { [weak self] in self?.finish(nil) }

        switch kind {
        case .area:
            for _ in 0..<4 {
                let p = PassThroughPanel()
                let v = AreaBoxView(frame: .zero)
                v.onDrag = { [weak self] r in self?.setBox(r) }
                v.currentBox = { [weak self] in self?.box ?? .zero }
                p.contentView = v
                strips.append((p, v))
            }
        case .point:
            let s = Placer.targetSize
            let p = FloatingPanel(size: NSSize(width: s, height: s), interactive: true)
            p.isMovableByWindowBackground = false
            p.hasShadow = false
            p.level = .statusBar
            let v = PointTargetView(frame: NSRect(x: 0, y: 0, width: s, height: s))
            v.onDrag = { [weak self] c in self?.setCenter(c) }
            v.currentCenter = { [weak self] in self?.center ?? .zero }
            p.contentView = v
            targetPanel = p
        }

        let bar = FloatingPanel(size: Placer.barSize, interactive: true)
        bar.isMovableByWindowBackground = false
        bar.level = .statusBar
        let host = FirstClickHostingView(rootView: PlacerBar(model: model))
        host.sizingOptions = []
        host.frame = NSRect(origin: .zero, size: Placer.barSize)
        bar.contentView = host
        barPanel = bar

        layout()
        strips.forEach { $0.0.orderFrontRegardless() }
        targetPanel?.orderFrontRegardless()
        bar.orderFrontRegardless()
    }

    private func setBox(_ r: NSRect) {
        box = NSRect(x: r.minX.rounded(), y: r.minY.rounded(), width: max(8, r.width.rounded()), height: max(8, r.height.rounded()))
        layout()
    }

    private func setCenter(_ c: NSPoint) {
        center = NSPoint(x: c.x.rounded(), y: c.y.rounded())
        layout()
    }

    private func layout() {
        let m = Placer.margin
        let anchor: NSRect
        switch kind {
        case .area:
            let outer = box.insetBy(dx: -m, dy: -m)
            let t = AreaBoxView.inward
            let (w, h, W) = (box.width, box.height, outer.width)
            let side = max(0, h - 2 * t)
            let parts = [NSRect(x: 0, y: m + h - t, width: W, height: m + t),          // top
                         NSRect(x: 0, y: 0, width: W, height: m + t),                  // bottom
                         NSRect(x: 0, y: m + t, width: m + t, height: side),            // left
                         NSRect(x: m + w - t, y: m + t, width: m + t, height: side)]    // right
            for ((panel, view), part) in zip(strips, parts) {
                view.outerSize = outer.size
                view.offset = part.origin
                if part.height < 1 || part.width < 1 { panel.orderOut(nil); continue }
                panel.setFrame(part.offsetBy(dx: outer.minX, dy: outer.minY), display: false)
                view.frame = NSRect(origin: .zero, size: part.size)
                view.needsDisplay = true
                view.window?.invalidateCursorRects(for: view)
                if !panel.isVisible, !finished { panel.orderFrontRegardless() }
            }
            anchor = outer
            let q = Geo.quartzRect(fromCocoa: box)
            model.label = "\(Int(q.width)) × \(Int(q.height))  at  \(Fmt.coord(q.minX)), \(Fmt.coord(q.minY))"
        case .point:
            let s = Placer.targetSize
            let f = NSRect(x: center.x - s / 2, y: center.y - s / 2, width: s, height: s)
            targetPanel?.setFrame(f, display: true)
            anchor = f
            let q = Geo.quartz(fromCocoa: center)
            model.label = "X \(Fmt.coord(q.x))   Y \(Fmt.coord(q.y))"
        }
        // The bar sits above the marker, or below it near the top of the screen.
        let size = Placer.barSize
        let screen = NSScreen.screens.first { $0.frame.intersects(anchor) } ?? NSScreen.main
        let vf = screen?.visibleFrame ?? anchor
        var origin = NSPoint(x: anchor.midX - size.width / 2, y: anchor.maxY + 4)
        if origin.y + size.height > vf.maxY { origin.y = anchor.minY - size.height - 4 }
        origin.x = min(max(origin.x, vf.minX + 4), vf.maxX - size.width - 4)
        barPanel?.setFrameOrigin(origin)
    }

    fileprivate func confirm() {
        switch kind {
        case .area: finish(Geo.quartzRect(fromCocoa: box))
        case .point:
            let q = Geo.quartz(fromCocoa: center)
            finish(CGRect(x: q.x.rounded(), y: q.y.rounded(), width: 0, height: 0))
        }
    }

    private func finish(_ result: CGRect?) {
        guard !finished else { return }
        finished = true
        strips.forEach { $0.0.orderOut(nil) }
        targetPanel?.orderOut(nil)
        barPanel?.orderOut(nil)
        done(result)
    }
}

final class PlacerModel: ObservableObject {
    @Published var label = ""
    var kind: Placer.Kind = .point
    var onConfirm: () -> Void = {}
    var onCancel: () -> Void = {}
}

// MARK: - Bar

private struct PlacerBar: View {
    @ObservedObject var model: PlacerModel

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: model.kind == .area ? "rectangle.dashed" : "scope")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.purple)
            VStack(alignment: .leading, spacing: 2) {
                Text(model.label)
                    .font(.system(.callout, design: .monospaced).weight(.semibold))
                    .lineLimit(1)
                Text(model.kind == .area ? "Drag the edge to move · handles resize" : "Drag the target onto the spot")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            Button(action: model.onCancel) {
                Image(systemName: "xmark").font(.system(size: 13, weight: .bold))
            }
            .buttonStyle(RoundIconButton(color: .red))
            .help("Cancel")
            Button(action: model.onConfirm) {
                Image(systemName: "checkmark").font(.system(size: 13, weight: .bold))
            }
            .buttonStyle(RoundIconButton(color: .green))
            .help("Use this")
        }
        .padding(.horizontal, 14)
        .frame(width: Placer.barSize.width, height: Placer.barSize.height - 8)
        .background(.regularMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Color.purple.opacity(0.5)))
        .frame(width: Placer.barSize.width, height: Placer.barSize.height)
    }
}

private struct RoundIconButton: ButtonStyle {
    let color: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(.white)
            .frame(width: 32, height: 32)
            .background(Circle().fill(color.opacity(configuration.isPressed ? 0.7 : 1)))
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
    }
}

// MARK: - Area box

/// Like FloatingPanel but never touches `ignoresMouseEvents`. Setting it at all (even to
/// false) makes the whole window catch clicks; left alone, the window server lets clicks
/// through wherever the content is fully transparent, which is the inside of the box.
final class PassThroughPanel: NSPanel {
    init() {
        super.init(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        isFloatingPanel = true
        level = .statusBar
        backgroundColor = .clear
        isOpaque = false
        hasShadow = false
        hidesOnDeactivate = false
        isReleasedWhenClosed = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

/// Draws the dashed box, a faint grab band along its edge, and 8 handles. The interior is
/// left fully transparent so the window server passes clicks there to the app below.
/// Absolute pointer position carried by the event itself (Cocoa coordinates). Reading
/// NSEvent.mouseLocation instead can lag behind a fast drag and lose the last stretch.
private func screenLocation(_ e: NSEvent) -> NSPoint {
    if let q = e.cgEvent?.location { return Geo.cocoa(fromQuartz: q) }
    return NSEvent.mouseLocation
}

final class AreaBoxView: NSView {
    var onDrag: (NSRect) -> Void = { _ in }
    var currentBox: () -> NSRect = { .zero }

    private enum Zone { case move, n, s, e, w, ne, nw, se, sw }
    private var zone: Zone?
    private var startMouse = NSPoint.zero
    private var startBox = NSRect.zero

    /// How far each strip reaches inside the box edge.
    static let inward: CGFloat = 11
    /// Size of the whole box + margin, and where this strip sits inside it.
    var outerSize = NSSize.zero
    var offset = NSPoint.zero

    private var inner: NSRect { NSRect(origin: .zero, size: outerSize).insetBy(dx: Placer.margin, dy: Placer.margin) }
    private func toFull(_ p: NSPoint) -> NSPoint { NSPoint(x: p.x + offset.x, y: p.y + offset.y) }
    private func toLocal(_ r: NSRect) -> NSRect { r.offsetBy(dx: -offset.x, dy: -offset.y) }
    private let band: CGFloat = 7
    private let handle: CGFloat = 7

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    private var handles: [(Zone, NSPoint)] {
        let r = inner
        return [(.nw, NSPoint(x: r.minX, y: r.maxY)), (.n, NSPoint(x: r.midX, y: r.maxY)), (.ne, NSPoint(x: r.maxX, y: r.maxY)),
                (.w, NSPoint(x: r.minX, y: r.midY)), (.e, NSPoint(x: r.maxX, y: r.midY)),
                (.sw, NSPoint(x: r.minX, y: r.minY)), (.s, NSPoint(x: r.midX, y: r.minY)), (.se, NSPoint(x: r.maxX, y: r.minY))]
    }

    override func draw(_ dirtyRect: NSRect) {
        let shift = NSAffineTransform()
        shift.translateX(by: -offset.x, yBy: -offset.y)
        shift.concat()
        let r = inner
        // Grab band: barely visible, but non-zero alpha so it receives the mouse.
        let ring = NSBezierPath(rect: r.insetBy(dx: -band, dy: -band))
        ring.append(NSBezierPath(rect: r.insetBy(dx: band, dy: band)).reversed)
        NSColor.systemPurple.withAlphaComponent(0.12).setFill()
        ring.fill()

        let edge = NSBezierPath(rect: r)
        edge.lineWidth = 2
        edge.setLineDash([7, 5], count: 2, phase: 0)
        NSColor.systemPurple.setStroke()
        edge.stroke()

        for (_, p) in handles {
            let h = NSBezierPath(ovalIn: NSRect(x: p.x - handle / 2 - 1, y: p.y - handle / 2 - 1, width: handle + 2, height: handle + 2))
            NSColor.white.setFill()
            h.fill()
            NSColor.systemPurple.setStroke()
            h.lineWidth = 2
            h.stroke()
        }
    }

    override func resetCursorRects() {
        for (z, p) in handles {
            let rect = toLocal(NSRect(x: p.x - 9, y: p.y - 9, width: 18, height: 18))
            switch z {
            case .n, .s: addCursorRect(rect, cursor: .resizeUpDown)
            case .e, .w: addCursorRect(rect, cursor: .resizeLeftRight)
            default: addCursorRect(rect, cursor: .crosshair)
            }
        }
        let r = inner
        for strip in [NSRect(x: r.minX - band, y: r.maxY - band, width: r.width + band * 2, height: band * 2),
                      NSRect(x: r.minX - band, y: r.minY - band, width: r.width + band * 2, height: band * 2),
                      NSRect(x: r.minX - band, y: r.minY, width: band * 2, height: r.height),
                      NSRect(x: r.maxX - band, y: r.minY, width: band * 2, height: r.height)] {
            addCursorRect(toLocal(strip), cursor: .openHand)
        }
    }

    private func hit(_ p: NSPoint) -> Zone? {
        for (z, h) in handles where abs(p.x - h.x) <= 9 && abs(p.y - h.y) <= 9 { return z }
        let outer = inner.insetBy(dx: -band, dy: -band)
        let core = inner.insetBy(dx: band, dy: band)
        return outer.contains(p) && !core.contains(p) ? .move : nil
    }

    override func mouseDown(with event: NSEvent) {
        zone = hit(toFull(convert(event.locationInWindow, from: nil)))
        startMouse = screenLocation(event)
        startBox = currentBox()
        if zone == .move { NSCursor.closedHand.set() }
    }

    override func mouseDragged(with event: NSEvent) {
        guard let zone else { return }
        let m = screenLocation(event)
        let dx = m.x - startMouse.x, dy = m.y - startMouse.y
        var r = startBox
        switch zone {
        case .move: r.origin.x += dx; r.origin.y += dy
        case .e: r.size.width += dx
        case .w: r.origin.x += dx; r.size.width -= dx
        case .n: r.size.height += dy
        case .s: r.origin.y += dy; r.size.height -= dy
        case .ne: r.size.width += dx; r.size.height += dy
        case .nw: r.origin.x += dx; r.size.width -= dx; r.size.height += dy
        case .se: r.size.width += dx; r.origin.y += dy; r.size.height -= dy
        case .sw: r.origin.x += dx; r.size.width -= dx; r.origin.y += dy; r.size.height -= dy
        }
        // Don't let a resize flip the box inside out.
        if r.width < 8 { if zone == .w || zone == .nw || zone == .sw { r.origin.x = startBox.maxX - 8 }; r.size.width = 8 }
        if r.height < 8 { if zone == .s || zone == .se || zone == .sw { r.origin.y = startBox.maxY - 8 }; r.size.height = 8 }
        onDrag(r)
        window?.invalidateCursorRects(for: self)
    }

    override func mouseUp(with event: NSEvent) {
        if zone != nil { mouseDragged(with: event) }   // land exactly where the button came up
        zone = nil
        window?.invalidateCursorRects(for: self)
    }
}

// MARK: - Point target

final class PointTargetView: NSView {
    var onDrag: (NSPoint) -> Void = { _ in }
    var currentCenter: () -> NSPoint = { .zero }
    private var startMouse = NSPoint.zero
    private var startCenter = NSPoint.zero

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        let c = NSPoint(x: bounds.midX, y: bounds.midY)
        let ring = NSBezierPath(ovalIn: bounds.insetBy(dx: 8, dy: 8))
        NSColor.systemPurple.withAlphaComponent(0.16).setFill()
        ring.fill()
        ring.lineWidth = 2
        ring.setLineDash([6, 4], count: 2, phase: 0)
        NSColor.systemPurple.setStroke()
        ring.stroke()

        let cross = NSBezierPath()
        let gap: CGFloat = 5, len: CGFloat = 26
        cross.move(to: NSPoint(x: c.x, y: c.y + gap)); cross.line(to: NSPoint(x: c.x, y: c.y + len))
        cross.move(to: NSPoint(x: c.x, y: c.y - gap)); cross.line(to: NSPoint(x: c.x, y: c.y - len))
        cross.move(to: NSPoint(x: c.x + gap, y: c.y)); cross.line(to: NSPoint(x: c.x + len, y: c.y))
        cross.move(to: NSPoint(x: c.x - gap, y: c.y)); cross.line(to: NSPoint(x: c.x - len, y: c.y))
        cross.lineWidth = 1.5
        NSColor.systemPurple.setStroke()
        cross.stroke()

        // The exact point.
        NSColor.systemRed.setFill()
        NSBezierPath(ovalIn: NSRect(x: c.x - 2, y: c.y - 2, width: 4, height: 4)).fill()
    }

    override func resetCursorRects() { addCursorRect(bounds, cursor: .openHand) }

    override func mouseDown(with event: NSEvent) {
        startMouse = screenLocation(event)
        startCenter = currentCenter()
        NSCursor.closedHand.set()
    }

    override func mouseDragged(with event: NSEvent) {
        let m = screenLocation(event)
        onDrag(NSPoint(x: startCenter.x + m.x - startMouse.x, y: startCenter.y + m.y - startMouse.y))
    }

    override func mouseUp(with event: NSEvent) {
        mouseDragged(with: event)
        NSCursor.openHand.set()
    }
}
