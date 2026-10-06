import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
  type Scene,
} from 'three'
import { describeCurves, type CurveDimension } from '../sketch/dimensions.ts'
import { uvToWorld, type SketchCurve, type SketchPlane, type Vec2 } from '../sketch/model.ts'
import { snapPoint, type SnapResult } from '../sketch/snapping.ts'
import { createTool, type SketchTool, type ToolKind } from '../sketch/tools.ts'
import { setCurveBuffer } from './SketchLayer.ts'

const PREVIEW_COLOR = 0x4a8df0
const SNAP_COLOR = 0x7ab4ff
const AXIS_GUIDE_COLOR = 0x7a7a84
const HOVER_COLOR = 0xe8e8ec
/** snap 容差（螢幕 px）——筆比手指準，但仍要寬容。 */
const SNAP_TOLERANCE_PX = 12

/** 這一筆要畫在哪裡：平面、宿主 body、可吸附的既有幾何。 */
export interface DrawTarget {
  plane: SketchPlane
  hostBodyId: number | null
  existingCurves: SketchCurve[]
  extraPoints: { endpoints: Vec2[]; midpoints: Vec2[] }
}

export interface DrawDeps {
  scene: Scene
  worldPerPixel: () => number
  snapSettings: () => { enabled: boolean; gridSpacing: number }
  commit: (target: DrawTarget, curves: SketchCurve[], tool: ToolKind) => void
}

/**
 * 免模式繪圖：筆落下時由 Viewport 決定平面（面上 / 既有草圖 / 地面），
 * 這裡負責工具狀態機、吸附、預覽與尺寸。圓弧需要兩筆，第二筆沿用同一平面。
 */
export class DrawController {
  private kind: ToolKind = 'line'
  private tool: SketchTool = createTool('line')
  private target: DrawTarget | null = null
  private preview: SketchCurve[] = []
  private lastSnap: SnapResult | null = null
  private readonly overlay: DrawOverlay

  constructor(private readonly deps: DrawDeps) {
    this.overlay = new DrawOverlay(deps.scene)
  }

  get toolKind(): ToolKind {
    return this.kind
  }

  setTool(kind: ToolKind): void {
    if (kind === this.kind) return
    this.abort()
    this.kind = kind
    this.tool = createTool(kind)
  }

  /** 進行中（如圓弧已拉好弦、等第二筆）：下一筆必須沿用這個平面。 */
  pendingTarget(): DrawTarget | null {
    return this.target
  }

  begin(target: DrawTarget, uv: Vec2): void {
    this.target = target
    this.apply(this.tool.strokeStart(this.snap(uv)))
  }

  move(uv: Vec2): void {
    if (!this.target) return
    this.apply(this.tool.strokeMove(this.snap(uv)))
  }

  end(uv: Vec2): void {
    if (!this.target) return
    const target = this.target
    const update = this.tool.strokeEnd(this.snap(uv))
    this.lastSnap = null
    this.apply(update)
    if (update.commit.length > 0) this.deps.commit(target, update.commit, this.kind)
    // 工具仍有預覽（圓弧的弦）= 還在等下一筆
    if (update.preview.length === 0) this.target = null
  }

  /** 筆劃被打斷/其實是輕點：圓弧保留已拉好的弦，其餘清空。 */
  cancel(): void {
    const update = this.tool.cancel()
    this.lastSnap = null
    this.apply(update)
    if (update.preview.length === 0) this.target = null
  }

  /** 完全放棄（換工具、undo、Esc）。 */
  abort(): void {
    this.tool = createTool(this.kind)
    this.target = null
    this.preview = []
    this.lastSnap = null
    this.overlay.clear()
  }

  /** 筆懸停/滑鼠移動：顯示落筆會吸附到的位置。 */
  hover(target: DrawTarget | null, uv: Vec2 | null): void {
    if (this.preview.length > 0) return
    if (!target || !uv) {
      this.overlay.setHover(null, null, false, 0)
      return
    }
    const snap = snapPoint(uv, this.snapOptions(target))
    this.overlay.setHover(target.plane, snap.point, snap.kind !== 'none', this.deps.worldPerPixel())
  }

  hoverEnd(): void {
    this.overlay.setHover(null, null, false, 0)
  }

  /** 目前預覽的尺寸（世界座標錨點）。 */
  dimension(): (CurveDimension & { world: Vector3 }) | null {
    const plane = this.target?.plane
    if (!plane) return null
    const dim = describeCurves(this.preview, this.kind)
    if (!dim) return null
    return { ...dim, world: new Vector3(...uvToWorld(plane, dim.anchor)) }
  }

  private snap(raw: Vec2): Vec2 {
    if (!this.target) return raw
    const result = snapPoint(raw, {
      ...this.snapOptions(this.target),
      axisAnchor: this.tool.axisAnchor(),
    })
    this.lastSnap = result
    return result.point
  }

  private snapOptions(target: DrawTarget) {
    const { enabled, gridSpacing } = this.deps.snapSettings()
    return {
      curves: target.existingCurves,
      tolerance: SNAP_TOLERANCE_PX * this.deps.worldPerPixel(),
      gridSpacing: enabled ? gridSpacing : null,
      axisAnchor: null,
      extraPoints: target.extraPoints,
    }
  }

  private apply(update: { preview: SketchCurve[]; commit: SketchCurve[] }): void {
    this.preview = update.preview
    if (!this.target) return
    this.overlay.setHover(null, null, false, 0)
    this.overlay.show(this.target.plane, update.preview, this.lastSnap, this.deps.worldPerPixel())
  }
}

/** 進行中筆劃的 three 物件：預覽線、吸附標記、水平/垂直導引線、懸停游標。 */
class DrawOverlay {
  private readonly group = new Group()
  private readonly previewLines: LineSegments
  private readonly axisGuide: LineSegments
  private readonly snapMarker: Mesh
  private readonly hoverMarker: Mesh

  constructor(scene: Scene) {
    this.group.name = 'draw-overlay'
    this.previewLines = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: PREVIEW_COLOR, toneMapped: false, depthTest: false }),
    )
    this.previewLines.renderOrder = 30
    this.axisGuide = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({
        color: AXIS_GUIDE_COLOR,
        toneMapped: false,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
      }),
    )
    this.axisGuide.renderOrder = 29
    this.snapMarker = makeRing(SNAP_COLOR, 0.65)
    this.hoverMarker = makeRing(HOVER_COLOR, 0.8)
    this.group.add(this.previewLines, this.axisGuide, this.snapMarker, this.hoverMarker)
    scene.add(this.group)
  }

  show(plane: SketchPlane, curves: SketchCurve[], snap: SnapResult | null, wpp: number): void {
    setCurveBuffer(this.previewLines.geometry, plane, curves)
    placeRing(this.snapMarker, plane, snap && snap.kind !== 'none' ? snap.point : null, 7 * wpp)
    if (snap?.kind === 'axis' && snap.anchor) {
      const pts = [...uvToWorld(plane, snap.anchor), ...uvToWorld(plane, snap.point)]
      this.axisGuide.geometry.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
      this.axisGuide.visible = true
    } else {
      this.axisGuide.visible = false
    }
  }

  setHover(plane: SketchPlane | null, point: Vec2 | null, snapped: boolean, wpp: number): void {
    placeRing(this.hoverMarker, plane, point, (snapped ? 7 : 4) * wpp)
    ;(this.hoverMarker.material as MeshBasicMaterial).color.setHex(snapped ? SNAP_COLOR : HOVER_COLOR)
  }

  clear(): void {
    setCurveBuffer(this.previewLines.geometry, { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 1, 0], normal: [0, 0, 1] }, [])
    this.snapMarker.visible = false
    this.hoverMarker.visible = false
    this.axisGuide.visible = false
  }
}

function makeRing(color: number, inner: number): Mesh {
  const ring = new Mesh(
    new RingGeometry(inner, 1, 24),
    new MeshBasicMaterial({ color, toneMapped: false, depthTest: false, side: 2 }),
  )
  ring.renderOrder = 31
  ring.visible = false
  return ring
}

function placeRing(ring: Mesh, plane: SketchPlane | null, point: Vec2 | null, size: number): void {
  if (!plane || !point) {
    ring.visible = false
    return
  }
  ring.visible = true
  ring.position.set(...uvToWorld(plane, point))
  ring.lookAt(ring.position.clone().add(new Vector3(...plane.normal)))
  ring.scale.setScalar(size)
}
