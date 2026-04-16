import XCTest

final class HephCADAppUITests: XCTestCase {
    func testLaunch() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["HephCAD"].exists)
    }
}
