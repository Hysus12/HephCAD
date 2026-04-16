import Foundation
import HephCADDomain
import HephCADReferenceImages
import HephCADTelemetry

public enum ViewerCommand: Equatable, Sendable {
    case loadDocument(UUID)
    case focusSelection(Set<BodyID>)
    case setTransparency(BodyID, Double)
    case setIsolation(Set<BodyID>?)
    case insertReferenceImage(ReferenceImageID)
}

public final class WorkspaceStore: @unchecked Sendable {
    public private(set) var document: DocumentModel
    public private(set) var selectedBodyIDs: Set<BodyID>
    public private(set) var isolatedBodyIDs: Set<BodyID>?
    public private(set) var commandLog: [ViewerCommand]

    private let telemetrySink: TelemetrySink?
    private let imageEditor = ReferenceImageEditor()

    public init(document: DocumentModel, telemetrySink: TelemetrySink? = nil) {
        self.document = document
        self.selectedBodyIDs = []
        self.isolatedBodyIDs = nil
        self.commandLog = [.loadDocument(document.id)]
        self.telemetrySink = telemetrySink
    }

    public var visibleBodies: [BodyModel] {
        guard let isolatedBodyIDs else {
            return document.bodies.filter(\.isVisible)
        }
        return document.bodies.filter { body in
            body.isVisible && isolatedBodyIDs.contains(body.id)
        }
    }

    public func load(document: DocumentModel) {
        self.document = document
        self.selectedBodyIDs = []
        self.isolatedBodyIDs = nil
        self.commandLog.append(.loadDocument(document.id))
    }

    public func select(bodyID: BodyID) {
        selectedBodyIDs = [bodyID]
        commandLog.append(.focusSelection(selectedBodyIDs))
        try? telemetrySink?.record(.init(
            type: .selectionCommitted,
            payload: ["bodyID": bodyID.rawValue.uuidString]
        ))
    }

    public func toggleVisibility(bodyID: BodyID, isVisible: Bool) {
        mutateBody(bodyID: bodyID) { body in
            body.isVisible = isVisible
        }
    }

    public func setTransparency(bodyID: BodyID, value: Double) {
        let clamped = min(max(value, 0.0), 1.0)
        mutateBody(bodyID: bodyID) { body in
            body.transparency = clamped
        }
        commandLog.append(.setTransparency(bodyID, clamped))
    }

    public func isolateSelection() {
        isolatedBodyIDs = selectedBodyIDs.isEmpty ? nil : selectedBodyIDs
        commandLog.append(.setIsolation(isolatedBodyIDs))
    }

    public func clearIsolation() {
        isolatedBodyIDs = nil
        commandLog.append(.setIsolation(nil))
    }

    public func insertReferenceImage(url: URL, plane: ReferencePlane) -> ReferenceImageModel {
        let image = ReferenceImageModel(imageURL: url, plane: plane)
        document.referenceImages.append(image)
        commandLog.append(.insertReferenceImage(image.id))
        return image
    }

    public func updateReferenceImage(id: ReferenceImageID, mutation: ReferenceImageMutation) {
        guard let index = document.referenceImages.firstIndex(where: { $0.id == id }) else {
            return
        }
        document.referenceImages[index] = imageEditor.apply(mutation, to: document.referenceImages[index])
        try? telemetrySink?.record(.init(
            type: .referenceImageAdjusted,
            payload: ["referenceImageID": id.rawValue.uuidString]
        ))
    }

    private func mutateBody(bodyID: BodyID, mutation: (inout BodyModel) -> Void) {
        guard let index = document.bodies.firstIndex(where: { $0.id == bodyID }) else {
            return
        }
        mutation(&document.bodies[index])
    }
}
