import Foundation
import Testing
@testable import HephCADDomain

@Test func documentModelStoresBodiesAndReferenceImages() {
    let body = BodyModel(name: "Box", kind: .brep)
    let image = ReferenceImageModel(
        imageURL: URL(fileURLWithPath: "/tmp/grid.png"),
        plane: .xy
    )
    let document = DocumentModel(title: "Demo", bodies: [body], referenceImages: [image])

    #expect(document.bodies.count == 1)
    #expect(document.referenceImages.count == 1)
    #expect(document.bodies[0].kind == BodyKind.brep)
}
