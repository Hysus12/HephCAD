import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type Raycaster,
  type Scene,
} from 'three'
import { regionKey, type SketchEntity } from '../doc/sketches.ts'
import type { MeshData, TopoGroup } from '../kernel/protocol.ts'
import {
  discretizeCurve,
  uvToWorld,
  type SketchCurve,
  type SketchPlane,
} from '../sketch/model.ts'
import { findTopoGroup } from './picking.ts'

const CURVE_COLOR = 0xd4d4da
const CURVE_SELECTED_COLOR = 0x7ab4ff
const REGION_COLOR = 0x4a8df0

export interface RegionView {
  /** kernel 區域清單中的索引（擠出 op 用）。 */
  regionIndex: number
  key: string
  mesh: MeshData
  object: Mesh
  centroid: Vector3
}

export type RegionFetcher = (plane: SketchPlane, curves: SketchCurve[]) => Promise<MeshData[]>

/**
 * 一張持久草圖的畫面：曲線（可逐條點選）、尚未擠出的閉合區域（可點選、可擠出）。
 * 由 DocumentController 推導的 SketchEntity 驅動；曲線變動才重新向 kernel 要區域。
 */
export class SketchLayer {
  readonly group = new Group()
  entity: SketchEntity
  private readonly lines: LineSegments
  private readonly selectedLines: LineSegments
  private curveGroups: TopoGroup[] = []
  private regionGroup = new Group()
  private regions: RegionView[] = []
  private allRegions: MeshData[] = []
  private curvesSignature = ''
  private epoch = 0
  private pending: Promise<void> = Promise.resolve()
  private selectedRegions = new Set<number>()

  constructor(
    scene: Scene,
    entity: SketchEntity,
    private readonly fetchRegions: RegionFetcher,
    private readonly onChange: () => void,
  ) {
    this.entity = entity
    this.group.name = 'sketch'
    this.lines = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: CURVE_COLOR, toneMapped: false }),
    )
    this.lines.renderOrder = 20
    this.selectedLines = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: CURVE_SELECTED_COLOR, toneMapped: false, depthTest: false }),
    )
    this.selectedLines.renderOrder = 23
    this.group.add(this.regionGroup, this.lines, this.selectedLines)
    scene.add(this.group)
    this.update(entity)
  }

  update(entity: SketchEntity): void {
    this.entity = entity
    const signature = JSON.stringify(entity.curves)
    if (signature !== this.curvesSignature) {
      this.curvesSignature = signature
      this.curveGroups = setCurveBuffer(this.lines.geometry, entity.plane, entity.curves)
      this.refreshRegions()
    } else {
      this.rebuildRegionViews()
    }
  }

  /** 等最後一次區域偵測完成（畫完立刻要拖曳時用）。 */
  settled(): Promise<void> {
    return this.pending
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible
  }

  get visible(): boolean {
    return this.group.visible
  }

  setHighlight(curveIds: Set<number>, regionIndices: Set<number>): void {
    const selected = this.entity.curves.filter((c) => curveIds.has(c.id))
    setCurveBuffer(this.selectedLines.geometry, this.entity.plane, selected)
    this.selectedRegions = regionIndices
    for (const r of this.regions) styleRegion(r.object, regionIndices.has(r.regionIndex))
  }

  /** 呼叫前需設定 raycaster.params.Line.threshold。 */
  pickCurve(raycaster: Raycaster, accept: (p: Vector3) => boolean): { curveId: number; distance: number } | null {
    if (!this.group.visible) return null
    const hit = raycaster.intersectObject(this.lines, false).find((h) => accept(h.point))
    if (!hit || hit.index === undefined) return null
    const g = findTopoGroup(this.curveGroups, hit.index)
    return g ? { curveId: g.topoId, distance: hit.distance } : null
  }

  pickRegion(
    raycaster: Raycaster,
    accept: (p: Vector3) => boolean,
  ): { region: RegionView; distance: number; point: Vector3 } | null {
    if (!this.group.visible) return null
    const objects = this.regions.map((r) => r.object)
    const hit = raycaster.intersectObjects(objects, false).find((h) => accept(h.point))
    if (!hit) return null
    const region = this.regions.find((r) => r.object === hit.object)
    return region ? { region, distance: hit.distance, point: hit.point.clone() } : null
  }

  region(regionIndex: number): RegionView | undefined {
    return this.regions.find((r) => r.regionIndex === regionIndex)
  }

  regionObjects(): Mesh[] {
    return this.regions.map((r) => r.object)
  }

  dispose(): void {
    this.epoch++
    this.clearRegionObjects()
    this.lines.geometry.dispose()
    ;(this.lines.material as LineBasicMaterial).dispose()
    this.selectedLines.geometry.dispose()
    ;(this.selectedLines.material as LineBasicMaterial).dispose()
    this.group.removeFromParent()
  }

  private refreshRegions(): void {
    const epoch = ++this.epoch
    const { plane, curves } = this.entity
    this.pending = this.fetchRegions(plane, curves)
      .then((meshes) => {
        if (epoch !== this.epoch) return
        this.allRegions = meshes
        this.rebuildRegionViews()
        this.onChange()
      })
      .catch((e) => console.warn('[sketch] 區域偵測失敗：', e))
  }

  /** 依消耗標記重建可見區域（被擠出過的不再顯示）。 */
  private rebuildRegionViews(): void {
    this.clearRegionObjects()
    this.allRegions.forEach((mesh, regionIndex) => {
      const key = regionKey(mesh)
      if (this.entity.consumed.has(key)) return
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3))
      geometry.setIndex(new BufferAttribute(mesh.indices, 1))
      geometry.computeBoundingSphere()
      const object = new Mesh(
        geometry,
        new MeshBasicMaterial({
          color: REGION_COLOR,
          transparent: true,
          depthWrite: false,
          side: 2, // DoubleSide
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      )
      object.renderOrder = 18
      styleRegion(object, this.selectedRegions.has(regionIndex))
      this.regionGroup.add(object)
      this.regions.push({ regionIndex, key, mesh, object, centroid: anchorInside(mesh) })
    })
  }

  private clearRegionObjects(): void {
    for (const r of this.regions) {
      r.object.geometry.dispose()
      ;(r.object.material as MeshBasicMaterial).dispose()
      r.object.removeFromParent()
    }
    this.regions = []
  }
}

function styleRegion(object: Mesh, selected: boolean): void {
  const material = object.material as MeshBasicMaterial
  material.opacity = selected ? 0.45 : 0.16
}

/**
 * 把手的落點：最接近面積形心的三角形中心。直接用形心不行——
 * 方框內挖圓孔的環形區域，形心會落在孔裡（區域外）。
 */
export function anchorInside(mesh: MeshData): Vector3 {
  const p = mesh.positions
  const idx = mesh.indices
  const centers: Vector3[] = []
  const total = new Vector3()
  let area = 0
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  for (let t = 0; t < idx.length; t += 3) {
    a.fromArray(p, idx[t] * 3)
    b.fromArray(p, idx[t + 1] * 3)
    c.fromArray(p, idx[t + 2] * 3)
    const center = a.clone().add(b).add(c).divideScalar(3)
    const triArea = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2
    centers.push(center)
    total.addScaledVector(center, triArea)
    area += triArea
  }
  if (centers.length === 0) return new Vector3()
  const centroid = total.divideScalar(area || 1)
  let best = centers[0]
  for (const center of centers) {
    if (center.distanceToSquared(centroid) < best.distanceToSquared(centroid)) best = center
  }
  return best
}

/** 曲線寫入 LineSegments，回傳每條曲線的頂點區段（topoId = curveId），供點選反查。 */
export function setCurveBuffer(
  geometry: BufferGeometry,
  plane: SketchPlane,
  curves: SketchCurve[],
): TopoGroup[] {
  const positions: number[] = []
  const groups: TopoGroup[] = []
  for (const curve of curves) {
    const start = positions.length / 3
    const pts = discretizeCurve(curve)
    for (let i = 0; i + 1 < pts.length; i++) {
      positions.push(...uvToWorld(plane, pts[i]), ...uvToWorld(plane, pts[i + 1]))
    }
    groups.push({ topoId: curve.id, start, count: positions.length / 3 - start })
  }
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.computeBoundingSphere()
  return groups
}
