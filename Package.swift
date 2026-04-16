// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "HephCAD",
    platforms: [
        .macOS(.v14),
        .iOS(.v17)
    ],
    products: [
        .library(name: "HephCADDomain", targets: ["HephCADDomain"]),
        .library(name: "HephCADReferenceImages", targets: ["HephCADReferenceImages"]),
        .library(name: "HephCADTelemetry", targets: ["HephCADTelemetry"]),
        .library(name: "HephCADIO", targets: ["HephCADIO"]),
        .library(name: "HephCADScene", targets: ["HephCADScene"]),
        .library(name: "HephCADTestSupport", targets: ["HephCADTestSupport"])
    ],
    targets: [
        .target(
            name: "HephCADDomain"
        ),
        .target(
            name: "HephCADReferenceImages",
            dependencies: ["HephCADDomain"]
        ),
        .target(
            name: "HephCADTelemetry",
            dependencies: ["HephCADDomain"]
        ),
        .target(
            name: "HephCADIO",
            dependencies: ["HephCADDomain"]
        ),
        .target(
            name: "HephCADScene",
            dependencies: [
                "HephCADDomain",
                "HephCADReferenceImages",
                "HephCADTelemetry"
            ]
        ),
        .target(
            name: "HephCADTestSupport"
        ),
        .testTarget(
            name: "HephCADDomainTests",
            dependencies: ["HephCADDomain"]
        ),
        .testTarget(
            name: "HephCADSceneTests",
            dependencies: [
                "HephCADScene",
                "HephCADDomain",
                "HephCADReferenceImages"
            ]
        ),
        .testTarget(
            name: "HephCADReferenceImagesTests",
            dependencies: [
                "HephCADReferenceImages",
                "HephCADDomain"
            ]
        ),
        .testTarget(
            name: "HephCADIOTests",
            dependencies: [
                "HephCADIO",
                "HephCADDomain",
                "HephCADTestSupport"
            ]
        ),
        .testTarget(
            name: "HephCADTelemetryTests",
            dependencies: [
                "HephCADTelemetry",
                "HephCADDomain"
            ]
        ),
        .testTarget(
            name: "AcceptanceSpecTests",
            dependencies: ["HephCADTestSupport"]
        )
    ]
)
