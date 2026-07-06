import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Scene,
  Vector3,
} from 'three'
import type { MeshData } from '../kernel/protocol.ts'
import {
  discretizeCurve,
  uvToWorld,
  type SketchCurve,
  type SketchPlane,
  type Vec2,
} from '../sketch/model.ts'
import type { SnapResult } from '../sketch/snapping.ts'

const CURVE_COLOR = 0xe8e8ec
const PREVIEW_COLOR = 0x4a8df0
const SNAP_COLOR = 0x7ab4ff
const REGION_COLOR = 0x4a8df0
const AXIS_GUIDE_COLOR = 0x6a6a72

/** 草圖的所有 three 物件：已提交曲線、預覽、snap 標記、區域填色。 */
export class SketchRenderer {
  private readonly group = new Group()
  private readonly committedLines: LineSegments
  private readonly previewLines: LineSegments
  private readonly axisGuide: LineSegments
  private readonly snapMarker: Mesh
  private readonly regionGroup = new Group()

  constructor(
    scene: Scene,
    private readonly plane: SketchPlane,
  ) {
    this.group.name = 'sketch'
    this.committedLines = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: CURVE_COLOR, toneMapped: false }),
    )
    this.committedLines.renderOrder = 20
    this.previewLines = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: PREVIEW_COLOR, toneMapped: false }),
    )
    this.previewLines.renderOrder = 21
    this.axisGuide = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({
        color: AXIS_GUIDE_COLOR,
        toneMapped: false,
        transparent: true,
        opacity: 0.7,
      }),
    )
    this.axisGuide.renderOrder = 19
    this.snapMarker = new Mesh(
      new RingGeometry(0.7, 1, 20),
      new MeshBasicMaterial({ color: SNAP_COLOR, toneMapped: false, depthTest: false }),
    )
    this.snapMarker.renderOrder = 22
    this.snapMarker.visible = false
    this.orientMarkerToPlane()

    this.group.add(
      this.regionGroup,
      this.committedLines,
      this.previewLines,
      this.axisGuide,
      this.snapMarker,
    )
    scene.add(this.group)
  }

  setCurves(curves: SketchCurve[]): void {
    setLineBuffer(this.committedLines.geometry, this.plane, curves)
  }

  /** wpp = 世界單位/px，讓 snap 標記維持螢幕定值大小。 */
  setPreview(curves: SketchCurve[], snap: SnapResult | null, wpp: number): void {
    setLineBuffer(this.previewLines.geometry, this.plane, curves)

    if (snap && snap.kind !== 'none') {
      this.snapMarker.visible = true
      const [x, y, z] = uvToWorld(this.plane, snap.point)
      this.snapMarker.position.set(x, y, z)
      const s = 6 * wpp
      this.snapMarker.scale.set(s, s, s)
    } else {
      this.snapMarker.visible = false
    }

    if (snap?.kind === 'axis' && snap.anchor) {
      setRawSegments(this.axisGuide.geometry, [
        uvToWorld(this.plane, snap.anchor),
        uvToWorld(this.plane, snap.point),
      ])
      this.axisGuide.visible = true
    } else {
      this.axisGuide.visible = false
    }
  }

  /** 依 setRegions 的順序回傳區域 fill mesh（index = regionId - 1）。 */
  regionMeshes(): Mesh[] {
    return this.regionGroup.children.filter((c): c is Mesh => c instanceof Mesh)
  }

  removeRegionMesh(mesh: Mesh): void {
    mesh.geometry.dispose()
    ;(mesh.material as MeshBasicMaterial).dispose()
    mesh.removeFromParent()
  }

  setRegions(meshes: MeshData[]): void {
    for (const child of [...this.regionGroup.children]) {
      const mesh = child as Mesh
      mesh.geometry.dispose()
      ;(mesh.material as MeshBasicMaterial).dispose()
      mesh.removeFromParent()
    }
    for (const data of meshes) {
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(data.positions, 3))
      geometry.setIndex(new BufferAttribute(data.indices, 1))
      const mesh = new Mesh(
        geometry,
        new MeshBasicMaterial({
          color: REGION_COLOR,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
          side: 2, // DoubleSide
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      )
      mesh.renderOrder = 18
      this.regionGroup.add(mesh)
    }
  }

  /** commit=true 保留曲線與區域（清掉互動元素）；false 全部移除。 */
  dispose(keepCommitted: boolean): void {
    this.previewLines.geometry.dispose()
    ;(this.previewLines.material as LineBasicMaterial).dispose()
    this.previewLines.removeFromParent()
    this.axisGuide.geometry.dispose()
    ;(this.axisGuide.material as LineBasicMaterial).dispose()
    this.axisGuide.removeFromParent()
    this.snapMarker.geometry.dispose()
    ;(this.snapMarker.material as MeshBasicMaterial).dispose()
    this.snapMarker.removeFromParent()

    if (!keepCommitted) {
      this.setRegions([])
      this.committedLines.geometry.dispose()
      ;(this.committedLines.material as LineBasicMaterial).dispose()
      this.group.removeFromParent()
    }
  }

  private orientMarkerToPlane(): void {
    const n = this.plane.normal
    this.snapMarker.lookAt(new Vector3(n[0], n[1], n[2]))
  }
}

function setLineBuffer(
  geometry: BufferGeometry,
  plane: SketchPlane,
  curves: SketchCurve[],
): void {
  const positions: number[] = []
  for (const curve of curves) {
    const pts = discretizeCurve(curve)
    for (let i = 0; i + 1 < pts.length; i++) {
      pushWorld(positions, plane, pts[i])
      pushWorld(positions, plane, pts[i + 1])
    }
  }
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.computeBoundingSphere()
}

function setRawSegments(geometry: BufferGeometry, points: [number, number, number][]): void {
  const positions = new Float32Array(points.flat())
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.computeBoundingSphere()
}

function pushWorld(out: number[], plane: SketchPlane, p: Vec2): void {
  const [x, y, z] = uvToWorld(plane, p)
  out.push(x, y, z)
}
