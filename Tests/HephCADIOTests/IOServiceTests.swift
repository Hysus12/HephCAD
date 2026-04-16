import Foundation
import Testing
import HephCADDomain
import HephCADTestSupport
@testable import HephCADIO

@Test(arguments: [
    ("models/step/box.step", ImportFormat.step, BodyKind.brep),
    ("models/stl/cube_ascii.stl", ImportFormat.stl, BodyKind.mesh),
    ("models/obj/cube.obj", ImportFormat.obj, BodyKind.mesh),
    ("models/3mf/cube.3mf", ImportFormat.threeMF, BodyKind.mesh)
])
func stubImporterAcceptsGoldenAssets(path: String, format: ImportFormat, expectedKind: BodyKind) throws {
    let service = StubCADIOService()
    let url = TestPaths.sampleFile(path)

    let summary = try service.importAsset(at: url, format: format)

    #expect(summary.format == format)
    #expect(summary.bodyKind == expectedKind)
    #expect(summary.bodyCount == 1)
}

@Test(arguments: [
    ExportFormat.step,
    .stl,
    .obj,
    .threeMF
])
func stubExporterWritesNonEmptyFile(format: ExportFormat) throws {
    let service = StubCADIOService()
    let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let document = DocumentModel(title: "Export Demo", bodies: [BodyModel(name: "Box", kind: .brep)])

    try service.exportAsset(document: document, to: outputURL, format: format)
    let data = try Data(contentsOf: outputURL)

    #expect(data.isEmpty == false)
}
