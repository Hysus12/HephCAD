import SwiftUI

struct ViewerWorkspaceView: View {
    @ObservedObject var state: WorkspaceState

    var body: some View {
        VStack(spacing: 0) {
            ViewerContainer(state: state)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black.opacity(0.85))

            HStack {
                Text(state.viewerStatus)
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Import STEP") {
                    state.importBundledSTEP()
                }
                Button("Isolate") {
                    state.toggleIsolate()
                }
                Button("Reference Image") {
                    state.insertReferenceImage()
                }
            }
            .padding()
            .background(.ultraThinMaterial)
        }
    }
}
