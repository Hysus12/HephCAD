import SwiftUI
import UIKit

@main
struct HephCADApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            WorkspaceRootView()
        }
    }
}
