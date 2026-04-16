import SwiftUI

struct InspectorSidebar: View {
    @ObservedObject var state: WorkspaceState

    var body: some View {
        List {
            Section("Bodies") {
                ForEach(state.bodies) { body in
                    Button {
                        state.select(bodyID: body.id)
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(body.name)
                                Text(body.kind.uppercased())
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if state.selectedBodyID == body.id {
                                Image(systemName: "checkmark.circle.fill")
                            }
                        }
                    }
                }
            }

            Section("Selected Body") {
                if let selected = state.selectedBodyID,
                   let body = state.bodies.first(where: { $0.id == selected }) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(body.name)
                            .font(.headline)
                        Slider(
                            value: Binding(
                                get: { body.transparency },
                                set: { state.updateTransparency($0) }
                            ),
                            in: 0...1
                        )
                        Text("Transparency \(body.transparency.formatted(.number.precision(.fractionLength(2))))")
                            .font(.caption)
                    }
                } else {
                    Text("No body selected")
                        .foregroundStyle(.secondary)
                }
            }

            Section("Reference Image") {
                if state.referenceImages.isEmpty {
                    Text("No reference image")
                        .foregroundStyle(.secondary)
                } else {
                    let image = state.referenceImages[0]
                    Slider(
                        value: Binding(
                            get: { image.opacity },
                            set: { state.updateReferenceImageOpacity($0) }
                        ),
                        in: 0...1
                    )
                    Slider(
                        value: Binding(
                            get: { image.position.x },
                            set: { state.nudgeReferenceImageX($0) }
                        ),
                        in: -100...100
                    )
                    Slider(
                        value: Binding(
                            get: { image.position.y },
                            set: { state.nudgeReferenceImageY($0) }
                        ),
                        in: -100...100
                    )
                    Slider(
                        value: Binding(
                            get: { image.rotation.z },
                            set: { state.updateReferenceImageRotation($0) }
                        ),
                        in: -Double.pi...Double.pi
                    )
                    Slider(
                        value: Binding(
                            get: { image.scale.x },
                            set: { state.updateReferenceImageScale($0) }
                        ),
                        in: 0.2...3.0
                    )
                    Text("Opacity \(image.opacity.formatted(.number.precision(.fractionLength(2))))")
                    Text("X \(image.position.x.formatted(.number.precision(.fractionLength(1))))")
                    Text("Y \(image.position.y.formatted(.number.precision(.fractionLength(1))))")
                    Text("Rot \(image.rotation.z.formatted(.number.precision(.fractionLength(2))))")
                    Text("Scale \(image.scale.x.formatted(.number.precision(.fractionLength(2))))")
                }
            }
        }
    }
}
