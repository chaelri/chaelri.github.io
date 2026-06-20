import SwiftUI
import AppKit

@main
struct RenderProgressApp: App {
    @StateObject private var monitor = RenderMonitor()

    var body: some Scene {
        WindowGroup("Render Progress") {
            ContentView()
                .environmentObject(monitor)
                .frame(minWidth: 720, minHeight: 560)
                .onAppear {
                    if let src = autoDetectSource() {
                        monitor.start(sourceURL: src)
                    }
                }
        }
        .defaultSize(width: 760, height: 600)
        .windowResizability(.contentMinSize)
    }

    /// Pick the most-recent ~/Desktop/Camera01/YYYY-MM-DD/ that contains _render/.
    /// Returns nil if nothing matches — the UI surfaces a picker in that case.
    private func autoDetectSource() -> URL? {
        let fm = FileManager.default
        let home = fm.homeDirectoryForCurrentUser
        let root = home.appendingPathComponent("Desktop/Camera01")
        guard let entries = try? fm.contentsOfDirectory(at: root,
                                                       includingPropertiesForKeys: [.contentModificationDateKey]) else {
            return nil
        }
        let datePattern = try! NSRegularExpression(pattern: #"^\d{4}-\d{2}-\d{2}$"#)
        let candidates = entries.filter {
            let name = $0.lastPathComponent
            let ns = name as NSString
            return datePattern.firstMatch(in: name, range: NSRange(location: 0, length: ns.length)) != nil
                && fm.fileExists(atPath: $0.appendingPathComponent("_render").path)
        }
        let sorted = candidates.sorted {
            (try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate)
                ?? .distantPast >
            (try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate)
                ?? .distantPast
        }
        return sorted.first
    }
}
