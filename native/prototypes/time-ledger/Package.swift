// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "StashTimeLedger",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "StashTimeLedger", targets: ["StashTimeLedger"]),
        .executable(name: "StashCoreChecks", targets: ["StashCoreChecks"]),
        .library(name: "StashCore", targets: ["StashCore"])
    ],
    targets: [
        .target(
            name: "StashCore",
            path: "Sources/StashCore"
        ),
        .executableTarget(
            name: "StashTimeLedger",
            dependencies: ["StashCore"],
            path: "Sources/StashTimeLedger"
        ),
        .executableTarget(
            name: "StashCoreChecks",
            dependencies: ["StashCore"],
            path: "Sources/StashCoreChecks"
        )
    ]
)
