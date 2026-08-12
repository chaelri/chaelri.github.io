import Foundation
import Vision
import CoreImage
import AppKit

@main
struct Cutout {
    static func main() {
        let args = CommandLine.arguments
        guard args.count >= 3 else { print("usage: cutout <in> <out.png>"); exit(2) }
        let inURL = URL(fileURLWithPath: args[1])
        let outURL = URL(fileURLWithPath: args[2])

        guard let src = CIImage(contentsOf: inURL) else { print("cannot read \(args[1])"); exit(1) }

        let handler = VNImageRequestHandler(ciImage: src, options: [:])
        let request = VNGenerateForegroundInstanceMaskRequest()
        do {
            try handler.perform([request])
        } catch {
            print("vision failed: \(error)"); exit(1)
        }
        guard let result = request.results?.first else { print("no subject found"); exit(1) }

        do {
            let masked = try result.generateMaskedImage(
                ofInstances: result.allInstances,
                from: handler,
                croppedToInstancesExtent: true
            )
            let ci = CIImage(cvPixelBuffer: masked)
            let ctx = CIContext()
            guard let data = ctx.pngRepresentation(
                of: ci,
                format: .RGBA8,
                colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!
            ) else { print("encode failed"); exit(1) }
            try data.write(to: outURL)
            print("ok \(Int(ci.extent.width))x\(Int(ci.extent.height))")
        } catch {
            print("mask failed: \(error)"); exit(1)
        }
    }
}
