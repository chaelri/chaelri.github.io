// Renders Resources/AppIcon.icns. Run once: swift make-icon.swift (needs iconutil).
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon-1024.png"
let size: CGFloat = 1024
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                           bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

// macOS icon grid: 824 pt body inside the 1024 canvas.
let body = NSRect(x: 100, y: 100, width: 824, height: 824)
let shape = NSBezierPath(roundedRect: body, xRadius: 186, yRadius: 186)
let shadow = NSShadow()
shadow.shadowColor = NSColor.black.withAlphaComponent(0.28)
shadow.shadowOffset = NSSize(width: 0, height: -12)
shadow.shadowBlurRadius = 24
NSGraphicsContext.saveGraphicsState()
shadow.set()
NSColor.black.setFill()
shape.fill()
NSGraphicsContext.restoreGraphicsState()
NSGradient(colors: [NSColor(srgbRed: 0.24, green: 0.47, blue: 1.0, alpha: 1),
                    NSColor(srgbRed: 0.47, green: 0.29, blue: 0.96, alpha: 1)])!.draw(in: shape, angle: -70)

// Three "step" dots trailing toward the cursor.
NSColor.white.withAlphaComponent(0.35).setFill()
for (i, r) in [CGFloat(34), 44, 56].enumerated() {
    let c = NSPoint(x: 245 + CGFloat(i) * 105, y: 300 + CGFloat(i) * 70)
    NSBezierPath(ovalIn: NSRect(x: c.x - r / 2, y: c.y - r / 2, width: r, height: r)).fill()
}

let cfg = NSImage.SymbolConfiguration(pointSize: 430, weight: .semibold)
    .applying(NSImage.SymbolConfiguration(paletteColors: [.white]))
if let sym = NSImage(systemSymbolName: "cursorarrow.click.2", accessibilityDescription: nil)?.withSymbolConfiguration(cfg) {
    let s = sym.size
    sym.draw(in: NSRect(x: 560 - s.width / 2, y: 545 - s.height / 2, width: s.width, height: s.height))
}
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
