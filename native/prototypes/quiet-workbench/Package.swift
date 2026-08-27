// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "QuietWorkbench",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "QuietWorkbench", targets: ["QuietWorkbench"])
    ],
    targets: [
        .executableTarget(
            name: "QuietWorkbench",
            path: "Sources/QuietWorkbench"
        )
    ]
)
