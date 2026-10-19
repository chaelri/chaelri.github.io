import AppKit
import ScreenCaptureKit
import Vision

/// "Read text from area": capture a rectangle of the screen and run Apple's on-device
/// text recognition (Vision) over it. No network and no language model; it needs
/// Screen Recording permission for the capture.
enum ScreenText {
    enum Failure: LocalizedError {
        case noPermission, offScreen, captureFailed, noText

        var errorDescription: String? {
            switch self {
            case .noPermission: return "Screen Recording permission is off (needed to read text)"
            case .offScreen: return "The area isn't on any connected display"
            case .captureFailed: return "Couldn't capture the area"
            case .noText: return "No text found in the area"
            }
        }
    }

    @MainActor
    static func read(_ area: CGRect) async throws -> String {
        let image = try await capture(area)
        try Task.checkCancellation()
        let text = try await recognize(image)
        guard !text.isEmpty else { throw Failure.noText }
        return text
    }

    /// The display under the area's centre, cropped to the area. ClickFlow's own windows
    /// (HUD, markers) are left out of the capture.
    @MainActor
    static func capture(_ area: CGRect) async throws -> CGImage {
        guard CGPreflightScreenCaptureAccess() else { throw Failure.noPermission }
        let center = CGPoint(x: area.midX, y: area.midY)
        guard let screen = Geo.screen(at: center), let id = screen.displayID else { throw Failure.offScreen }
        let frame = Geo.frame(of: screen)
        let local = area.intersection(frame).offsetBy(dx: -frame.minX, dy: -frame.minY)
        guard !local.isNull, local.width >= 1, local.height >= 1 else { throw Failure.offScreen }

        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first(where: { $0.displayID == id }) else { throw Failure.captureFailed }
        let mine = content.applications.filter { $0.bundleIdentifier == Bundle.main.bundleIdentifier }
        let filter = SCContentFilter(display: display, excludingApplications: mine, exceptingWindows: [])
        let cfg = SCStreamConfiguration()
        cfg.sourceRect = local
        cfg.width = Int(local.width * screen.backingScaleFactor)
        cfg.height = Int(local.height * screen.backingScaleFactor)
        cfg.showsCursor = false
        return try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg)
    }

    /// Lines top to bottom, left to right within a row.
    static func recognize(_ image: CGImage) async throws -> String {
        try await Task.detached(priority: .userInitiated) {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
            let lines = (request.results ?? [])
                .compactMap { obs -> (CGRect, String)? in
                    guard let s = obs.topCandidates(1).first?.string else { return nil }
                    return (obs.boundingBox, s)
                }
                // Vision boxes are normalised with a bottom-left origin.
                .sorted { a, b in
                    abs(a.0.midY - b.0.midY) > 0.02 ? a.0.midY > b.0.midY : a.0.minX < b.0.minX
                }
                .map(\.1)
            return lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        }.value
    }
}

/// Last text each Read-text step produced, for the editor card. Separate from the run
/// state so it only redraws the cards when a read actually finishes.
@MainActor
final class StepOutputs: ObservableObject {
    static let shared = StepOutputs()
    @Published var text: [UUID: String] = [:]
    @Published var images: [UUID: CGImage] = [:]
}
