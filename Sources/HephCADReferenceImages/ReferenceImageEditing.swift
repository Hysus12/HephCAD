import Foundation
import HephCADDomain

public enum ReferenceImageMutation: Sendable {
    case setOpacity(Double)
    case setPosition(Vector3)
    case setRotation(Vector3)
    case setScale(Vector3)
    case setPlane(ReferencePlane)
}

public struct ReferenceImageEditor {
    public init() {}

    public func apply(
        _ mutation: ReferenceImageMutation,
        to model: ReferenceImageModel
    ) -> ReferenceImageModel {
        var updated = model
        switch mutation {
        case let .setOpacity(value):
            updated.opacity = min(max(value, 0.0), 1.0)
        case let .setPosition(value):
            updated.transform.position = value
        case let .setRotation(value):
            updated.transform.rotation = value
        case let .setScale(value):
            updated.transform.scale = value
        case let .setPlane(plane):
            updated.plane = plane
        }
        return updated
    }
}
