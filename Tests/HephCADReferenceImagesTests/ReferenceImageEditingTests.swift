import Foundation
import Testing
import HephCADDomain
@testable import HephCADReferenceImages

@Test func referenceImageEditorUpdatesOpacityAndTransform() {
    let editor = ReferenceImageEditor()
    let original = ReferenceImageModel(
        imageURL: URL(fileURLWithPath: "/tmp/grid.png"),
        plane: .xy
    )

    let positioned = editor.apply(.setPosition(.init(x: 2, y: 3, z: 4)), to: original)
    let updated = editor.apply(.setOpacity(1.5), to: positioned)

    #expect(positioned.transform.position == Vector3(x: 2, y: 3, z: 4))
    #expect(updated.opacity == 1.0)
}
