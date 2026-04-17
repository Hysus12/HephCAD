import SwiftUI
import UIKit

struct ViewerWorkspaceView: View {
    @ObservedObject var state: WorkspaceState

    var body: some View {
        VStack(spacing: 0) {
            GeometryReader { proxy in
                ZStack(alignment: .topLeading) {
                    ViewerContainer(state: state)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.black.opacity(0.85))

                    if state.isSketchModeActive {
                        SketchCanvasOverlay(state: state, canvasSize: proxy.size)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        if state.isSketchModeActive {
                            SketchModeToolbar(state: state)
                        } else {
                            SketchPlaneEntryBar(state: state)
                        }
                        Spacer()
                    }
                    .padding()
                }
            }

            HStack {
                Text(state.viewerStatus)
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(.secondary)
                Spacer()
                if !state.isSketchModeActive {
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
            }
            .padding()
            .background(.ultraThinMaterial)
        }
    }
}

private struct SketchPlaneEntryBar: View {
    @ObservedObject var state: WorkspaceState

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Pencil Sketch")
                .font(.headline)
            Text("Pick a base plane, then draw with Apple Pencil.")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                ForEach(SketchPlane.allCases) { plane in
                    Button(plane.title) {
                        state.enterSketchMode(on: plane)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.accentColor)
                }
            }
        }
        .padding(12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct SketchModeToolbar: View {
    @ObservedObject var state: WorkspaceState

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(state.activeSketchPlane?.title ?? "Sketch")
                    .font(.headline)
                Spacer()
                Button("Done") {
                    state.exitSketchMode()
                }
                .buttonStyle(.bordered)
            }

            Picker("Sketch Tool", selection: $state.activeSketchTool) {
                ForEach(SketchTool.allCases) { tool in
                    Text(tool.title).tag(tool)
                }
            }
            .pickerStyle(.segmented)

            HStack(spacing: 8) {
                Text(state.hasClosedSketchProfile ? "Closed profile ready" : "Draw a closed profile")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                if state.isExtrudeAvailable {
                    Button("Extrude") {
                        state.extrudeClosedProfile()
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
        .padding(12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct SketchCanvasOverlay: View {
    @ObservedObject var state: WorkspaceState
    let canvasSize: CGSize

    var body: some View {
        ZStack {
            Canvas { context, _ in
                for entity in state.sketchEntities {
                    guard entity.displayPoints.count >= 2 else { continue }
                    var path = Path()
                    path.addLines(entity.displayPoints)
                    context.stroke(path, with: .color(color(for: entity.tool)), lineWidth: 3)
                }

                if state.sketchPreviewPoints.count >= 2 {
                    var preview = Path()
                    preview.addLines(state.sketchPreviewPoints)
                    context.stroke(preview, with: .color(.white.opacity(0.85)), style: StrokeStyle(lineWidth: 2, dash: [8, 4]))
                }
            }

            PencilSketchCaptureRepresentable(
                canvasSize: canvasSize,
                onStrokeChanged: { state.updateSketchPreview(with: $0) },
                onStrokeEnded: { state.commitSketchStroke(displayPoints: $0, canvasSize: canvasSize) }
            )
        }
        .background(Color.white.opacity(0.04))
    }

    private func color(for tool: SketchTool) -> Color {
        switch tool {
        case .line: return .cyan
        case .arc: return .orange
        case .spline: return .green
        }
    }
}

private struct PencilSketchCaptureRepresentable: UIViewRepresentable {
    let canvasSize: CGSize
    let onStrokeChanged: ([CGPoint]) -> Void
    let onStrokeEnded: ([CGPoint]) -> Void

    func makeUIView(context: Context) -> PencilSketchCaptureView {
        let view = PencilSketchCaptureView()
        view.onStrokeChanged = onStrokeChanged
        view.onStrokeEnded = onStrokeEnded
        return view
    }

    func updateUIView(_ uiView: PencilSketchCaptureView, context: Context) {
        uiView.onStrokeChanged = onStrokeChanged
        uiView.onStrokeEnded = onStrokeEnded
    }
}

private final class PencilSketchCaptureView: UIView {
    var onStrokeChanged: (([CGPoint]) -> Void)?
    var onStrokeEnded: (([CGPoint]) -> Void)?
    private var currentPoints: [CGPoint] = []

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isMultipleTouchEnabled = false
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch = touches.first, touch.type == .pencil else { return }
        currentPoints = [touch.location(in: self)]
        onStrokeChanged?(currentPoints)
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch = touches.first, touch.type == .pencil else { return }
        currentPoints.append(touch.location(in: self))
        onStrokeChanged?(currentPoints)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch = touches.first, touch.type == .pencil else { return }
        currentPoints.append(touch.location(in: self))
        let finishedPoints = currentPoints
        currentPoints = []
        onStrokeEnded?(finishedPoints)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        currentPoints = []
        onStrokeChanged?([])
    }
}
