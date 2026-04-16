import Foundation
import Testing
import HephCADTestSupport

@Test(arguments: [
    "AT-001 Repo bootstrap",
    "AT-002 Acceptance spec completeness",
    "AT-101 Viewer loads demo B-rep shape",
    "AT-102 STEP import succeeds",
    "AT-103 STEP round-trip basic success",
    "AT-104 STL import/export basic success",
    "AT-105 OBJ import/export basic success",
    "AT-106 3MF import/export standard file success",
    "AT-107 Body selection",
    "AT-108 Isolate selected body",
    "AT-109 Transparency adjustment",
    "AT-110 Reference image insertion and editing",
    "AT-111 Orbit/pan/zoom gestures"
])
func acceptanceCasesExistInDocumentation(_ label: String) throws {
    let content = try String(contentsOf: TestPaths.docsFile("acceptance_tests.md"), encoding: .utf8)
    #expect(content.contains(label))
}
