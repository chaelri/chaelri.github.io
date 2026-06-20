// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "RenderProgress",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "RenderProgress", targets: ["RenderProgress"]),
    ],
    targets: [
        .executableTarget(
            name: "RenderProgress",
            path: "Sources/RenderProgress"
        ),
    ]
)
