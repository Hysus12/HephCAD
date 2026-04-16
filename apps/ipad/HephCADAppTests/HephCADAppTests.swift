import XCTest
@testable import HephCADApp

final class HephCADAppTests: XCTestCase {
    func testWorkspaceStateLoadsDemoBodies() {
        let state = WorkspaceState()
        XCTAssertFalse(state.bodies.isEmpty)
        XCTAssertNotNil(state.selectedBodyID)
    }
}
