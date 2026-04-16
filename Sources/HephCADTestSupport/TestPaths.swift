import Foundation

public enum TestPaths {
    public static func repoRoot(file: StaticString = #filePath) -> URL {
        var url = URL(fileURLWithPath: "\(file)")
        while url.path != "/" {
            if FileManager.default.fileExists(atPath: url.appendingPathComponent("Package.swift").path) {
                return url
            }
            url.deleteLastPathComponent()
        }
        fatalError("Could not locate repo root from \(file)")
    }

    public static func docsFile(_ name: String) -> URL {
        repoRoot().appendingPathComponent("docs/\(name)")
    }

    public static func sampleFile(_ relativePath: String) -> URL {
        repoRoot().appendingPathComponent("samples/\(relativePath)")
    }
}
