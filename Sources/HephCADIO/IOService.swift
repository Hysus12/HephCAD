import Foundation
import HephCADDomain

public struct ImportedAssetSummary: Sendable, Equatable {
    public var format: ImportFormat
    public var bodyCount: Int
    public var bodyKind: BodyKind
    public var sourceURL: URL

    public init(format: ImportFormat, bodyCount: Int, bodyKind: BodyKind, sourceURL: URL) {
        self.format = format
        self.bodyCount = bodyCount
        self.bodyKind = bodyKind
        self.sourceURL = sourceURL
    }
}

public protocol CADIOService: Sendable {
    func importAsset(at url: URL, format: ImportFormat) throws -> ImportedAssetSummary
    func exportAsset(document: DocumentModel, to url: URL, format: ExportFormat) throws
}

public enum StubIOError: Error, LocalizedError {
    case unreadableAsset(URL)

    public var errorDescription: String? {
        switch self {
        case let .unreadableAsset(url):
            return "Asset could not be read: \(url.path)"
        }
    }
}

public struct StubCADIOService: CADIOService {
    public init() {}

    public func importAsset(at url: URL, format: ImportFormat) throws -> ImportedAssetSummary {
        let data = try Data(contentsOf: url)
        guard data.isEmpty == false else {
            throw StubIOError.unreadableAsset(url)
        }

        let bodyKind: BodyKind = format == .step ? .brep : .mesh
        return ImportedAssetSummary(
            format: format,
            bodyCount: 1,
            bodyKind: bodyKind,
            sourceURL: url
        )
    }

    public func exportAsset(document: DocumentModel, to url: URL, format: ExportFormat) throws {
        let content = """
        format=\(format.rawValue)
        title=\(document.title)
        bodies=\(document.bodies.count)
        reference_images=\(document.referenceImages.count)
        """
        try content.write(to: url, atomically: true, encoding: .utf8)
    }
}
