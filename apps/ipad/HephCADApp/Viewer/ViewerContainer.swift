import SwiftUI

struct ViewerContainer: UIViewControllerRepresentable {
    @ObservedObject var state: WorkspaceState

    func makeUIViewController(context: Context) -> HCADViewerViewController {
        let controller = HCADViewerViewController()
        controller.loadScene(withBodyNames: state.visibleBodies.map(\.name))
        return controller
    }

    func updateUIViewController(_ uiViewController: HCADViewerViewController, context: Context) {
        uiViewController.loadScene(withBodyNames: state.visibleBodies.map(\.name))
        uiViewController.applyVisibility(forBodyNames: state.visibleBodies.map(\.name))
        if let isolated = state.isolatedBodyIDs {
            let names = state.bodies.filter { isolated.contains($0.id) }.map(\.name)
            uiViewController.applyIsolation(forBodyNames: names)
        } else {
            uiViewController.applyIsolation(forBodyNames: nil)
        }

        if let selected = state.selectedBodyID,
           let body = state.bodies.first(where: { $0.id == selected }) {
            uiViewController.applyTransparency(body.transparency, forBodyName: body.name)
        }

        if let reference = state.referenceImages.first {
            uiViewController.insertReferenceImagePlaneNamed(reference.name, opacity: reference.opacity)
        }
    }
}
