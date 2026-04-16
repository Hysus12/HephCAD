import Foundation
import Testing
@testable import HephCADTelemetry

@Test func telemetryEventEncodesAndWritesJsonLines() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let fileURL = directory.appendingPathComponent("events.jsonl")
    let sink = JSONLinesTelemetrySink(url: fileURL)

    try sink.record(.init(type: .toolInvoked, payload: ["tool": "import"]))
    let content = try String(contentsOf: fileURL, encoding: .utf8)

    #expect(content.contains("\"tool_invoked\""))
    #expect(content.contains("\"tool\":\"import\""))
}
