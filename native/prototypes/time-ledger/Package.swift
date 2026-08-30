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
        .executable(name: "StashIntegrationChecks", targets: ["StashIntegrationChecks"]),
        .library(name: "StashCore", targets: ["StashCore"]),
        .library(name: "StashKeeplineIntegration", targets: ["StashKeeplineIntegration"])
    ],
    dependencies: [
        .package(name: "KeeplineKit", path: "../../../../keepline/sdk/swift")
    ],
    targets: [
        .target(
            name: "StashCore",
            path: "Sources/StashCore"
        ),
        .target(
            name: "StashKeeplineIntegration",
            dependencies: [
                "StashCore",
                .product(name: "KeeplineKit", package: "KeeplineKit")
            ],
            path: "Sources/StashKeeplineIntegration"
        ),
        .executableTarget(
            name: "StashTimeLedger",
            dependencies: [
                "StashCore",
                "StashKeeplineIntegration",
                .product(name: "KeeplineKit", package: "KeeplineKit")
            ],
            path: "Sources/StashTimeLedger",
            resources: [
                .process("Resources")
            ]
        ),
        .executableTarget(
            name: "StashCoreChecks",
            dependencies: ["StashCore"],
            path: "Sources/StashCoreChecks"
        ),
        .executableTarget(
            name: "StashIntegrationChecks",
            dependencies: [
                "StashCore",
                "StashKeeplineIntegration",
                .product(name: "KeeplineKit", package: "KeeplineKit")
            ],
            path: "Sources/StashIntegrationChecks"
        )
    ]
)
