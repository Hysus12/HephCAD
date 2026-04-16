import Foundation
import HephCADDomain

public enum TelemetryEventType: String, Codable, Sendable, CaseIterable {
    case toolInvoked = "tool_invoked"
    case selectionAttempt = "selection_attempt"
    case selectionCommitted = "selection_committed"
    case cameraGesture = "camera_gesture"
    case importCompleted = "import_completed"
    case exportCompleted = "export_completed"
    case referenceImageAdjusted = "reference_image_adjusted"
}

public struct TelemetryEvent: Codable, Sendable, Equatable {
    public var timestamp: Date
    public var type: TelemetryEventType
    public var payload: [String: String]

    public init(
        timestamp: Date = Date(),
        type: TelemetryEventType,
        payload: [String: String] = [:]
    ) {
        self.timestamp = timestamp
        self.type = type
        self.payload = payload
    }
}

public protocol TelemetrySink: Sendable {
    func record(_ event: TelemetryEvent) throws
}

public struct JSONLinesTelemetrySink: TelemetrySink {
    public let url: URL
    private let encoder: JSONEncoder

    public init(url: URL) {
        self.url = url
        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    public func record(_ event: TelemetryEvent) throws {
        let data = try encoder.encode(event)
        let line = data + Data([0x0A])
        if FileManager.default.fileExists(atPath: url.path) == false {
            FileManager.default.createFile(atPath: url.path, contents: line)
            return
        }

        let handle = try FileHandle(forWritingTo: url)
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: line)
    }
}
