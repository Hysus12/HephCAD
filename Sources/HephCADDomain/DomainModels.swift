import Foundation

public struct BodyID: Hashable, Codable, Sendable, RawRepresentable {
    public let rawValue: UUID

    public init(rawValue: UUID) {
        self.rawValue = rawValue
    }

    public init() {
        self.rawValue = UUID()
    }
}

public struct SceneNodeID: Hashable, Codable, Sendable, RawRepresentable {
    public let rawValue: UUID

    public init(rawValue: UUID) {
        self.rawValue = rawValue
    }

    public init() {
        self.rawValue = UUID()
    }
}

public struct ReferenceImageID: Hashable, Codable, Sendable, RawRepresentable {
    public let rawValue: UUID

    public init(rawValue: UUID) {
        self.rawValue = rawValue
    }

    public init() {
        self.rawValue = UUID()
    }
}

public enum BodyKind: String, Codable, Sendable, CaseIterable {
    case brep
    case mesh
}

public enum ImportFormat: String, Codable, Sendable, CaseIterable {
    case step
    case stl
    case obj
    case threeMF
}

public enum ExportFormat: String, Codable, Sendable, CaseIterable {
    case step
    case stl
    case obj
    case threeMF
}

public struct Vector3: Codable, Hashable, Sendable {
    public var x: Double
    public var y: Double
    public var z: Double

    public init(x: Double, y: Double, z: Double) {
        self.x = x
        self.y = y
        self.z = z
    }

    public static let zero = Vector3(x: 0, y: 0, z: 0)
    public static let unit = Vector3(x: 1, y: 1, z: 1)
}

public struct Transform3D: Codable, Hashable, Sendable {
    public var position: Vector3
    public var rotation: Vector3
    public var scale: Vector3

    public init(
        position: Vector3 = .zero,
        rotation: Vector3 = .zero,
        scale: Vector3 = .unit
    ) {
        self.position = position
        self.rotation = rotation
        self.scale = scale
    }
}

public struct BoundingBox: Codable, Hashable, Sendable {
    public var min: Vector3
    public var max: Vector3

    public init(min: Vector3, max: Vector3) {
        self.min = min
        self.max = max
    }

    public static let unitCube = BoundingBox(
        min: .zero,
        max: Vector3(x: 1, y: 1, z: 1)
    )
}

public enum ReferencePlane: String, Codable, Sendable, CaseIterable {
    case xy
    case yz
    case xz
    case custom
}

public struct ReferenceImageModel: Codable, Hashable, Sendable {
    public var id: ReferenceImageID
    public var imageURL: URL
    public var plane: ReferencePlane
    public var transform: Transform3D
    public var opacity: Double

    public init(
        id: ReferenceImageID = ReferenceImageID(),
        imageURL: URL,
        plane: ReferencePlane,
        transform: Transform3D = Transform3D(),
        opacity: Double = 0.5
    ) {
        self.id = id
        self.imageURL = imageURL
        self.plane = plane
        self.transform = transform
        self.opacity = opacity
    }
}

public struct BodyModel: Codable, Hashable, Sendable {
    public var id: BodyID
    public var nodeID: SceneNodeID
    public var name: String
    public var kind: BodyKind
    public var isVisible: Bool
    public var transparency: Double
    public var boundingBox: BoundingBox

    public init(
        id: BodyID = BodyID(),
        nodeID: SceneNodeID = SceneNodeID(),
        name: String,
        kind: BodyKind,
        isVisible: Bool = true,
        transparency: Double = 0.0,
        boundingBox: BoundingBox = .unitCube
    ) {
        self.id = id
        self.nodeID = nodeID
        self.name = name
        self.kind = kind
        self.isVisible = isVisible
        self.transparency = transparency
        self.boundingBox = boundingBox
    }
}

public struct DocumentModel: Codable, Sendable, Equatable {
    public var id: UUID
    public var title: String
    public var bodies: [BodyModel]
    public var referenceImages: [ReferenceImageModel]

    public init(
        id: UUID = UUID(),
        title: String,
        bodies: [BodyModel] = [],
        referenceImages: [ReferenceImageModel] = []
    ) {
        self.id = id
        self.title = title
        self.bodies = bodies
        self.referenceImages = referenceImages
    }
}
