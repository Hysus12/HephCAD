import Foundation
import SwiftUI

struct AppBody: Identifiable, Hashable {
    let id: String
    var name: String
    var kind: String
    var isVisible: Bool
    var transparency: Double
}

struct AppReferenceImage: Identifiable, Hashable {
    let id: UUID
    var name: String
    var opacity: Double
    var position: SIMD3<Double>
    var rotation: SIMD3<Double>
    var scale: SIMD3<Double>
}

@MainActor
final class WorkspaceState: ObservableObject {
    @Published var bodies: [AppBody]
    @Published var selectedBodyID: String?
    @Published var isolatedBodyIDs: Set<String>?
    @Published var referenceImages: [AppReferenceImage]
    @Published var viewerStatus: String

    private let kernelSession = HCADKernelSession()

    init() {
        let scene = kernelSession.makeDemoShape()
        self.bodies = scene.bodies.map {
            AppBody(
                id: $0.identifier,
                name: $0.name,
                kind: $0.kind,
                isVisible: true,
                transparency: 0.0
            )
        }
        self.selectedBodyID = bodies.first?.id
        self.isolatedBodyIDs = nil
        self.referenceImages = []
        self.viewerStatus = "Demo scene loaded"
    }

    var visibleBodies: [AppBody] {
        guard let isolatedBodyIDs else {
            return bodies.filter(\.isVisible)
        }
        return bodies.filter { $0.isVisible && isolatedBodyIDs.contains($0.id) }
    }

    func importBundledSTEP() {
        guard let url = Bundle.main.url(forResource: "box", withExtension: "step") else {
            viewerStatus = "Bundled STEP sample not found"
            return
        }

        var error: NSError?
        let scene = kernelSession.importSTEP(at: url, error: &error)
        if let error {
            viewerStatus = error.localizedDescription
            return
        }

        bodies = scene.bodies.map {
            AppBody(
                id: $0.identifier,
                name: $0.name,
                kind: $0.kind,
                isVisible: true,
                transparency: 0.0
            )
        }
        selectedBodyID = bodies.first?.id
        viewerStatus = "STEP imported"
    }

    func select(bodyID: String?) {
        selectedBodyID = bodyID
        viewerStatus = bodyID != nil ? "Selected \(bodyID!)" : "Selection cleared"
    }

    func toggleIsolate() {
        guard let selectedBodyID else {
            isolatedBodyIDs = nil
            viewerStatus = "Isolation cleared"
            return
        }
        if isolatedBodyIDs == [selectedBodyID] {
            isolatedBodyIDs = nil
            viewerStatus = "Isolation cleared"
        } else {
            isolatedBodyIDs = [selectedBodyID]
            viewerStatus = "Isolated \(selectedBodyID)"
        }
    }

    func updateTransparency(_ value: Double) {
        guard let selectedBodyID, let index = bodies.firstIndex(where: { $0.id == selectedBodyID }) else {
            return
        }
        bodies[index].transparency = value
        kernelSession.setBodyTransparencyWithID(selectedBodyID, value: value)
        viewerStatus = "Transparency \(String(format: "%.2f", value))"
    }

    func insertReferenceImage() {
        let image = AppReferenceImage(
            id: UUID(),
            name: "grid.png",
            opacity: 0.5,
            position: .zero,
            rotation: .zero,
            scale: SIMD3<Double>(repeating: 1)
        )
        referenceImages.append(image)
        viewerStatus = "Reference image inserted"
    }

    func updateReferenceImageOpacity(_ opacity: Double) {
        guard referenceImages.isEmpty == false else { return }
        referenceImages[0].opacity = opacity
        viewerStatus = "Reference opacity \(String(format: "%.2f", opacity))"
    }

    func nudgeReferenceImageX(_ x: Double) {
        guard referenceImages.isEmpty == false else { return }
        referenceImages[0].position.x = x
        viewerStatus = "Reference X \(String(format: "%.1f", x))"
    }
}
