import Foundation
import Testing
import HephCADDomain
@testable import HephCADScene

private func makeDocument() -> DocumentModel {
    DocumentModel(
        title: "Workspace",
        bodies: [
            BodyModel(name: "Box", kind: .brep),
            BodyModel(name: "Mesh", kind: .mesh)
        ]
    )
}

@Test func workspaceStoreTracksSelectionIsolationAndTransparency() {
    let document = makeDocument()
    let store = WorkspaceStore(document: document)
    let firstBody = document.bodies[0]

    store.select(bodyID: firstBody.id)
    store.setTransparency(bodyID: firstBody.id, value: 0.42)
    store.isolateSelection()

    #expect(store.selectedBodyIDs == [firstBody.id])
    #expect(store.document.bodies[0].transparency == 0.42)
    #expect(store.visibleBodies.count == 1)
    #expect(store.commandLog.contains(.setTransparency(firstBody.id, 0.42)))
}

@Test func workspaceStoreInsertsAndUpdatesReferenceImage() {
    let store = WorkspaceStore(document: makeDocument())
    let image = store.insertReferenceImage(
        url: URL(fileURLWithPath: "/tmp/grid.png"),
        plane: .xy
    )

    store.updateReferenceImage(id: image.id, mutation: .setOpacity(0.8))
    store.updateReferenceImage(id: image.id, mutation: .setPosition(.init(x: 1, y: 2, z: 0)))

    #expect(store.document.referenceImages.count == 1)
    #expect(store.document.referenceImages[0].opacity == 0.8)
    #expect(store.document.referenceImages[0].transform.position == Vector3(x: 1, y: 2, z: 0))
}
