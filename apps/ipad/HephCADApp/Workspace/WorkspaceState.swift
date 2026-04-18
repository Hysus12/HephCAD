import Foundation
import SwiftUI

struct AppBody: Identifiable, Hashable {
    let id: String
    var name: String
    var kind: String
    var isVisible: Bool
    var transparency: Double
}

struct AppReferenceImage: Identifiable, Hashable {
    let id: UUID
    var name: String
    var opacity: Double
    var position: SIMD3<Double>
    var rotation: SIMD3<Double>
    var scale: SIMD3<Double>
}

enum SketchPlane: String, CaseIterable, Identifiable {
    case top
    case front
    case right

    var id: String { rawValue }

    var title: String {
        switch self {
        case .top: return "Top Plane"
        case .front: return "Front Plane"
        case .right: return "Right Plane"
        }
    }
}

enum SketchTool: String, CaseIterable, Identifiable {
    case line
    case arc
    case spline

    var id: String { rawValue }

    var title: String {
        rawValue.capitalized
    }
}

struct SketchEntity: Identifiable, Hashable {
    let id: UUID
    let tool: SketchTool
    let displayPoints: [CGPoint]
    let planePoints: [CGPoint]
}

@MainActor
final class WorkspaceState: ObservableObject {
    @Published var bodies: [AppBody]
    @Published var selectedBodyID: String?
    @Published var isolatedBodyIDs: Set<String>?
    @Published var referenceImages: [AppReferenceImage]
    @Published var viewerStatus: String
    @Published private(set) var sceneRevision: Int
    @Published var activeSketchPlane: SketchPlane?
    @Published var activeSketchTool: SketchTool
    @Published var sketchEntities: [SketchEntity]
    @Published var sketchPreviewPoints: [CGPoint]
    @Published private(set) var hasClosedSketchProfile: Bool

    let kernelSession = HCADKernelSession()

    init() {
        let scene = kernelSession.makeDemoShape()
        let initialBodies = scene.bodies.map {
            AppBody(
                id: $0.identifier,
                name: $0.name,
                kind: $0.kind,
                isVisible: true,
                transparency: 0.0
            )
        }
        self.bodies = initialBodies
        self.selectedBodyID = initialBodies.first?.id
        self.isolatedBodyIDs = nil
        self.referenceImages = []
        self.viewerStatus = "Demo scene loaded"
        self.sceneRevision = 0
        self.activeSketchPlane = nil
        self.activeSketchTool = .line
        self.sketchEntities = []
        self.sketchPreviewPoints = []
        self.hasClosedSketchProfile = false
    }

    var visibleBodies: [AppBody] {
        guard let isolatedBodyIDs else {
            return bodies.filter(\.isVisible)
        }
        return bodies.filter { $0.isVisible && isolatedBodyIDs.contains($0.id) }
    }

    var isSketchModeActive: Bool {
        activeSketchPlane != nil
    }

    var isExtrudeAvailable: Bool {
        isSketchModeActive && hasClosedSketchProfile
    }

    func importBundledSTEP() {
        guard let url = Bundle.main.url(forResource: "screw", withExtension: "step") else {
            viewerStatus = "Bundled STEP sample not found"
            return
        }

        var error: NSError?
        let scene = kernelSession.importSTEP(at: url, error: &error)
        if let error {
            viewerStatus = error.localizedDescription
            return
        }

        bodies = scene.bodies.map {
            AppBody(
                id: $0.identifier,
                name: $0.name,
                kind: $0.kind,
                isVisible: true,
                transparency: 0.0
            )
        }
        selectedBodyID = bodies.first?.id
        isolatedBodyIDs = nil
        sceneRevision += 1
        viewerStatus = "STEP imported"
    }

    func select(bodyID: String?) {
        selectedBodyID = bodyID
        viewerStatus = bodyID != nil ? "Selected \(bodyID!)" : "Selection cleared"
    }

    func toggleIsolate() {
        guard let selectedBodyID else {
            isolatedBodyIDs = nil
            viewerStatus = "Isolation cleared"
            return
        }
        if isolatedBodyIDs == [selectedBodyID] {
            isolatedBodyIDs = nil
            viewerStatus = "Isolation cleared"
        } else {
            isolatedBodyIDs = [selectedBodyID]
            viewerStatus = "Isolated \(selectedBodyID)"
        }
    }

    func updateTransparency(_ value: Double) {
        guard let selectedBodyID, let index = bodies.firstIndex(where: { $0.id == selectedBodyID }) else {
            return
        }
        bodies[index].transparency = value
        kernelSession.setBodyTransparencyWithID(selectedBodyID, value: value)
        viewerStatus = "Transparency \(String(format: "%.2f", value))"
    }

    func insertReferenceImage() {
        let image = AppReferenceImage(
            id: UUID(),
            name: "grid.png",
            opacity: 0.5,
            position: .zero,
            rotation: .zero,
            scale: SIMD3<Double>(repeating: 1)
        )
        referenceImages.append(image)
        viewerStatus = "Reference image inserted"
    }

    func updateReferenceImageOpacity(_ opacity: Double) {
        guard referenceImages.isEmpty == false else { return }
        referenceImages[0].opacity = opacity
        viewerStatus = "Reference opacity \(String(format: "%.2f", opacity))"
    }

    func nudgeReferenceImageX(_ x: Double) {
        guard referenceImages.isEmpty == false else { return }
        referenceImages[0].position.x = x
        viewerStatus = "Reference X \(String(format: "%.1f", x))"
    }

    func nudgeReferenceImageY(_ y: Double) {
        guard referenceImages.isEmpty == false else { return }
        referenceImages[0].position.y = y
        viewerStatus = "Reference Y \(String(format: "%.1f", y))"
    }

    func updateReferenceImageRotation(_ rotation: Double) {
        guard referenceImages.isEmpty == false else { return }
        referenceImages[0].rotation.z = rotation
        viewerStatus = "Reference rot \(String(format: "%.2f", rotation))"
    }

    func updateReferenceImageScale(_ scale: Double) {
        guard referenceImages.isEmpty == false else { return }
        referenceImages[0].scale = SIMD3<Double>(repeating: scale)
        viewerStatus = "Reference scale \(String(format: "%.2f", scale))"
    }

    func enterSketchMode(on plane: SketchPlane) {
        activeSketchPlane = plane
        activeSketchTool = .line
        sketchEntities = []
        sketchPreviewPoints = []
        hasClosedSketchProfile = false
        isolatedBodyIDs = nil
        viewerStatus = "Sketching on \(plane.title)"
    }

    func exitSketchMode() {
        activeSketchPlane = nil
        sketchEntities = []
        sketchPreviewPoints = []
        hasClosedSketchProfile = false
        viewerStatus = "Sketch mode exited"
    }

    func updateSketchPreview(with displayPoints: [CGPoint]) {
        sketchPreviewPoints = displayPoints
    }

    func commitSketchStroke(displayPoints: [CGPoint], canvasSize: CGSize) {
        guard let activeSketchPlane, displayPoints.count >= 2 else {
            sketchPreviewPoints = []
            return
        }

        let entity: SketchEntity?
        switch activeSketchTool {
        case .line:
            entity = makeLineEntity(from: displayPoints, canvasSize: canvasSize)
        case .arc:
            entity = makeArcEntity(from: displayPoints, canvasSize: canvasSize)
        case .spline:
            entity = makeSplineEntity(from: displayPoints, canvasSize: canvasSize)
        }

        sketchPreviewPoints = []

        guard let entity else {
            viewerStatus = "Sketch stroke too short for \(activeSketchTool.title.lowercased())"
            return
        }

        sketchEntities.append(entity)
        refreshProfileState(on: activeSketchPlane)
    }

    func extrudeClosedProfile() {
        guard let sketchPlane = activeSketchPlane else {
            viewerStatus = "Select a sketch plane first"
            return
        }
        guard let profilePoints = orderedClosedProfilePoints() else {
            viewerStatus = "Closed profile required for extrude"
            return
        }

        let nsValues = profilePoints.map { NSValue(cgPoint: $0) }
        var error: NSError?
        let scene = kernelSession.extrudeProfilePoints(nsValues, onPlane: sketchPlane.rawValue, depth: 60.0, error: &error)
        if let error {
            viewerStatus = error.localizedDescription
            return
        }

        bodies = scene.bodies.map {
            AppBody(
                id: $0.identifier,
                name: $0.name,
                kind: $0.kind,
                isVisible: true,
                transparency: 0.0
            )
        }
        selectedBodyID = bodies.first?.id
        isolatedBodyIDs = nil
        activeSketchPlane = nil
        sketchEntities = []
        sketchPreviewPoints = []
        hasClosedSketchProfile = false
        sceneRevision += 1
        viewerStatus = "Extrude created"
    }

    private func makeLineEntity(from displayPoints: [CGPoint], canvasSize: CGSize) -> SketchEntity? {
        guard let rawFirst = displayPoints.first, let rawLast = displayPoints.last else {
            return nil
        }

        let first = snappedDisplayPoint(rawFirst, canvasSize: canvasSize, preferLastEndpoint: true)
        var last = snappedDisplayPoint(rawLast, canvasSize: canvasSize, preferLastEndpoint: false)
        last = orthogonallyAdjustedPoint(start: first, end: last)

        if distance(first, last) < 4 {
            return nil
        }
        let display = [first, last]
        return SketchEntity(
            id: UUID(),
            tool: .line,
            displayPoints: display,
            planePoints: display.map { planePoint(from: $0, canvasSize: canvasSize) }
        )
    }

    private func makeArcEntity(from displayPoints: [CGPoint], canvasSize: CGSize) -> SketchEntity? {
        guard let first = displayPoints.first, let last = displayPoints.last else { return nil }
        let middle = displayPoints[displayPoints.count / 2]
        guard distance(first, last) >= 4 else { return nil }

        let snappedStart = snappedDisplayPoint(first, canvasSize: canvasSize, preferLastEndpoint: true)
        let snappedEnd = snappedDisplayPoint(last, canvasSize: canvasSize, preferLastEndpoint: false)
        let sampled = sampleArc(start: snappedStart, through: middle, end: snappedEnd)
        guard sampled.count >= 3 else {
            return makeLineEntity(from: displayPoints, canvasSize: canvasSize)
        }

        return SketchEntity(
            id: UUID(),
            tool: .arc,
            displayPoints: sampled,
            planePoints: sampled.map { planePoint(from: $0, canvasSize: canvasSize) }
        )
    }

    private func makeSplineEntity(from displayPoints: [CGPoint], canvasSize: CGSize) -> SketchEntity? {
        var simplified = simplify(points: displayPoints, minimumDistance: 6)
        if let first = simplified.first {
            simplified[0] = snappedDisplayPoint(first, canvasSize: canvasSize, preferLastEndpoint: true)
        }
        if let last = simplified.last {
            simplified[simplified.count - 1] = snappedDisplayPoint(last, canvasSize: canvasSize, preferLastEndpoint: false)
        }
        guard simplified.count >= 3 else { return nil }
        return SketchEntity(
            id: UUID(),
            tool: .spline,
            displayPoints: simplified,
            planePoints: simplified.map { planePoint(from: $0, canvasSize: canvasSize) }
        )
    }

    private func planePoint(from displayPoint: CGPoint, canvasSize: CGSize) -> CGPoint {
        let scale = max(min(canvasSize.width, canvasSize.height) / 240.0, 1.0)
        let centeredX = (displayPoint.x - canvasSize.width / 2.0) / scale
        let centeredY = (canvasSize.height / 2.0 - displayPoint.y) / scale
        return CGPoint(x: centeredX, y: centeredY)
    }

    private func detectClosedProfile(in entities: [SketchEntity]) -> Bool {
        guard entities.count >= 2 else { return false }

        let tolerance = 10.0
        struct Cluster {
            var center: CGPoint
            var degree: Int
        }

        var clusters: [Cluster] = []

        func clusterIndex(for point: CGPoint) -> Int {
            if let index = clusters.firstIndex(where: { distance($0.center, point) <= tolerance }) {
                return index
            }
            clusters.append(Cluster(center: point, degree: 0))
            return clusters.count - 1
        }

        var adjacency: [Int: Set<Int>] = [:]

        for entity in entities {
            guard let start = entity.planePoints.first, let end = entity.planePoints.last else { continue }
            let startIndex = clusterIndex(for: start)
            let endIndex = clusterIndex(for: end)
            if startIndex == endIndex { return false }
            clusters[startIndex].degree += 1
            clusters[endIndex].degree += 1
            adjacency[startIndex, default: []].insert(endIndex)
            adjacency[endIndex, default: []].insert(startIndex)
        }

        guard clusters.count >= 3 else { return false }
        guard clusters.allSatisfy({ $0.degree == 2 }) else { return false }

        var visited: Set<Int> = []
        var stack = [0]
        while let current = stack.popLast() {
            if !visited.insert(current).inserted { continue }
            stack.append(contentsOf: adjacency[current, default: []].filter { !visited.contains($0) })
        }
        return visited.count == clusters.count
    }

    private func orderedClosedProfilePoints(from entities: [SketchEntity]? = nil) -> [CGPoint]? {
        let entities = entities ?? sketchEntities
        guard let firstEntity = entities.first else { return nil }

        let tolerance = 10.0
        var ordered = firstEntity.planePoints
        for entity in entities.dropFirst() {
            guard let currentEnd = ordered.last,
                  let start = entity.planePoints.first,
                  let end = entity.planePoints.last else { return nil }

            if distance(currentEnd, start) <= tolerance {
                ordered.append(contentsOf: entity.planePoints.dropFirst())
            } else if distance(currentEnd, end) <= tolerance {
                ordered.append(contentsOf: entity.planePoints.reversed().dropFirst())
            } else {
                return nil
            }
        }

        guard let first = ordered.first, let last = ordered.last else { return nil }
        if distance(first, last) > tolerance {
            ordered.append(first)
        } else {
            ordered[ordered.count - 1] = first
        }

        return simplify(points: ordered, minimumDistance: 2)
    }

    private func refreshProfileState(on plane: SketchPlane) {
        guard detectClosedProfile(in: sketchEntities),
              let profilePoints = orderedClosedProfilePoints(from: sketchEntities) else {
            hasClosedSketchProfile = false
            viewerStatus = "\(activeSketchTool.title) added"
            return
        }

        let nsValues = profilePoints.map { NSValue(cgPoint: $0) }
        do {
            try kernelSession.validateClosedProfilePoints(nsValues, onPlane: plane.rawValue)
            hasClosedSketchProfile = true
            viewerStatus = "\(plane.title) profile ready for Extrude"
        } catch {
            hasClosedSketchProfile = false
            viewerStatus = error.localizedDescription
        }
    }

    private func snappedDisplayPoint(_ point: CGPoint, canvasSize: CGSize, preferLastEndpoint: Bool) -> CGPoint {
        let tolerance = 18.0
        let endpoints = sketchEntities.flatMap { entity -> [CGPoint] in
            guard let start = entity.displayPoints.first, let end = entity.displayPoints.last else { return [] }
            return [start, end]
        }

        if preferLastEndpoint,
           let last = sketchEntities.last?.displayPoints.last,
           distance(last, point) <= tolerance {
            return last
        }

        if let snapped = endpoints.min(by: { distance($0, point) < distance($1, point) }),
           distance(snapped, point) <= tolerance {
            return snapped
        }

        return point
    }

    private func orthogonallyAdjustedPoint(start: CGPoint, end: CGPoint) -> CGPoint {
        let tolerance = 12.0
        let dx = end.x - start.x
        let dy = end.y - start.y
        if abs(dx) <= tolerance {
            return CGPoint(x: start.x, y: end.y)
        }
        if abs(dy) <= tolerance {
            return CGPoint(x: end.x, y: start.y)
        }
        return end
    }

    private func simplify(points: [CGPoint], minimumDistance: Double) -> [CGPoint] {
        guard let first = points.first else { return [] }
        var result = [first]
        for point in points.dropFirst() where distance(result.last ?? point, point) >= minimumDistance {
            result.append(point)
        }
        if let last = points.last, result.last != last {
            result.append(last)
        }
        return result
    }

    private func sampleArc(start: CGPoint, through middle: CGPoint, end: CGPoint) -> [CGPoint] {
        let determinant = 2.0 * (
            start.x * (middle.y - end.y) +
            middle.x * (end.y - start.y) +
            end.x * (start.y - middle.y)
        )
        guard abs(determinant) > 0.001 else {
            return [start, end]
        }

        let startSq = start.x * start.x + start.y * start.y
        let middleSq = middle.x * middle.x + middle.y * middle.y
        let endSq = end.x * end.x + end.y * end.y

        let centerX = (
            startSq * (middle.y - end.y) +
            middleSq * (end.y - start.y) +
            endSq * (start.y - middle.y)
        ) / determinant
        let centerY = (
            startSq * (end.x - middle.x) +
            middleSq * (start.x - end.x) +
            endSq * (middle.x - start.x)
        ) / determinant

        let center = CGPoint(x: centerX, y: centerY)
        let radius = distance(center, start)
        guard radius > 0.001 else {
            return [start, end]
        }

        let startAngle = atan2(start.y - center.y, start.x - center.x)
        let middleAngle = atan2(middle.y - center.y, middle.x - center.x)
        let endAngle = atan2(end.y - center.y, end.x - center.x)

        let ccwSweep = normalizedSweep(from: startAngle, to: endAngle, passing: middleAngle, clockwise: false)
        let cwSweep = normalizedSweep(from: startAngle, to: endAngle, passing: middleAngle, clockwise: true)
        let useClockwise = abs(cwSweep) < abs(ccwSweep)
        let sweep = useClockwise ? cwSweep : ccwSweep

        let segmentCount = 24
        return (0...segmentCount).map { index in
            let t = Double(index) / Double(segmentCount)
            let angle = startAngle + sweep * t
            return CGPoint(
                x: center.x + CGFloat(Darwin.cos(angle) * radius),
                y: center.y + CGFloat(Darwin.sin(angle) * radius)
            )
        }
    }

    private func normalizedSweep(from start: Double, to end: Double, passing middle: Double, clockwise: Bool) -> Double {
        func normalize(_ angle: Double) -> Double {
            var value = angle
            while value < 0 { value += .pi * 2 }
            while value >= .pi * 2 { value -= .pi * 2 }
            return value
        }

        let startN = normalize(start)
        let endN = normalize(end)
        let middleN = normalize(middle)

        if clockwise {
            var sweep = endN - startN
            if sweep > 0 { sweep -= .pi * 2 }
            let midSweep = middleN - startN
            let normalizedMidSweep = midSweep > 0 ? midSweep - .pi * 2 : midSweep
            return normalizedMidSweep >= sweep ? sweep : sweep - .pi * 2
        } else {
            var sweep = endN - startN
            if sweep < 0 { sweep += .pi * 2 }
            let midSweep = middleN - startN
            let normalizedMidSweep = midSweep < 0 ? midSweep + .pi * 2 : midSweep
            return normalizedMidSweep <= sweep ? sweep : sweep + .pi * 2
        }
    }

    private func distance(_ lhs: CGPoint, _ rhs: CGPoint) -> Double {
        hypot(lhs.x - rhs.x, lhs.y - rhs.y)
    }
}
