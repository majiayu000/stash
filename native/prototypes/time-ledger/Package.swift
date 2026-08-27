// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "StashTimeLedger",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "StashTimeLedger", targets: ["StashTimeLedger"])
    ],
    targets: [
        .executableTarget(
            name: "StashTimeLedger",
            path: "Sources/StashTimeLedger"
        )
    ]
)
