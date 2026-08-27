// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "StashCommandCanvas",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "StashCommandCanvas", targets: ["CommandCanvas"])
    ],
    targets: [
        .executableTarget(
            name: "CommandCanvas",
            path: "Sources/CommandCanvas"
        )
    ]
)
