import SwiftUI

struct WorkspaceRootView: View {
    @StateObject private var state = WorkspaceState()

    var body: some View {
        NavigationSplitView {
            InspectorSidebar(state: state)
                .navigationTitle("HephCAD")
        } detail: {
            ViewerWorkspaceView(state: state)
                .navigationTitle("Workspace")
        }
    }
}
