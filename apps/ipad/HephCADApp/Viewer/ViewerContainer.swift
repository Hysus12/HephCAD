import SwiftUI

struct ViewerContainer: UIViewControllerRepresentable {
    @ObservedObject var state: WorkspaceState

    final class Coordinator: NSObject, HCADViewerSelectionDelegate {
        let state: WorkspaceState

        init(state: WorkspaceState) {
            self.state = state
        }

        func viewerController(_ viewerController: HCADViewerViewController, didSelectBodyWithIdentifier bodyIdentifier: String?) {
            Task { @MainActor in
                self.state.select(bodyID: bodyIdentifier)
            }
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(state: state)
    }

    func makeUIViewController(context: Context) -> HCADViewerViewController {
        let controller = HCADViewerViewController()
        controller.kernelSession = state.kernelSession
        controller.selectionDelegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: HCADViewerViewController, context: Context) {
        if let isolated = state.isolatedBodyIDs {
            uiViewController.applyIsolation(forBodyIDs: Array(isolated))
        } else {
            uiViewController.applyIsolation(forBodyIDs: nil)
        }

        if let selected = state.selectedBodyID,
           let body = state.bodies.first(where: { $0.id == selected }) {
            uiViewController.applyTransparency(body.transparency, forBodyID: body.id)
        }

        if let reference = state.referenceImages.first {
            uiViewController.updateReferenceImageNamed(
                reference.name,
                opacity: reference.opacity,
                positionX: reference.position.x,
                positionY: reference.position.y,
                rotation: reference.rotation.z,
                scale: reference.scale.x
            )
        } else {
            uiViewController.updateReferenceImageNamed(nil, opacity: 0, positionX: 0, positionY: 0, rotation: 0, scale: 1)
        }
    }
}
