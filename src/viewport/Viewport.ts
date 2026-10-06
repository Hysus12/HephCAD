import {
  Box3,
  BufferGeometry,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  type Object3D,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  PerspectiveCamera,
  Plane,
  Group,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { BoolMode, JournalOp, Rotation } from '../doc/journal.ts'
import { findSketchOnPlane, type SketchEntity } from '../doc/sketches.ts'
import type { KernelClient } from '../kernel/KernelClient.ts'
import type { BodyMeshResult, MeshData } from '../kernel/protocol.ts'
import { describeCurves, formatMm } from '../sketch/dimensions.ts'
import {
  GROUND_PLANE,
  worldToUv,
  type SketchCurve,
  type SketchPlane,
  type Vec2,
} from '../sketch/model.ts'
import { planeFromNormal } from '../sketch/plane.ts'
import type { ToolKind } from '../sketch/tools.ts'
import {
  isBodySelection,
  useAppStore,
  type BodySelection,
  type SelectionItem,
} from '../state/appStore.ts'
import {
  buildBodyObject,
  disposeBodyObject,
  sharedClippingPlanes,
  type BodyObject,
} from './bodyMesh.ts'
import { CameraRig } from './CameraRig.ts'
import { DrawController, type DrawTarget } from './DrawController.ts'
import { ExtrudePreview } from './ExtrudePreview.ts'
import { dragHeight, type Px } from './extrudeMath.ts'
import { GestureController, type PrimaryRole } from './gestures.ts'
import { HandleLayer, type HandleSpec } from './HandleLayer.ts'
import { angleAboutAxis, screenAngleDelta } from './rotateMath.ts'
import { edgeMidpoint, edgeSnapPoints, faceInfo, faceSubMesh } from './meshGeometry.ts'
import { edgePickThreshold, findTopoGroup } from './picking.ts'
import { SelectionHighlighter } from './SelectionHighlighter.ts'
import { anchorInside, SketchLayer } from './SketchLayer.ts'
import { ViewCube } from './ViewCube.ts'

const BACKGROUND = 0x141416
const GRID_MINOR = 0x232327
const GRID_MAJOR = 0x2e2e34
const FOV_DEG = 45

/** 網格：5mm 細格、25mm 粗格，涵蓋 2m 見方。 */
const GRID_EXTENT = 2000
const MINOR_SPACING = 5
const MAJOR_SPACING = 25

/** 觸控/筆選取的螢幕容差（px）。 */
const PICK_TOLERANCE_PX = 10

const AXIS_COLORS = { x: 0xe0655f, y: 0x6fd08c, z: 0x4a8df0 }
const HANDLE_COLOR = 0x4a8df0
const PARAM_HANDLE_COLOR = 0xf0b46a

/** 被剖面剪掉的點（three 的慣例：到平面的有號距離為負即被剪掉）。 */
function isClipped(point: Vector3): boolean {
  return sharedClippingPlanes.some((plane) => plane.distanceToPoint(point) < 0)
}
const visiblePoint = (p: Vector3) => !isClipped(p)

/** Viewport 對外需要的文件層操作（由 app 層接上 DocumentController）。 */
export interface ViewportHost {
  kernel(): KernelClient | null
  commit(op: JournalOp): Promise<unknown>
  /** 以新參數取代最後一筆（拖曳後輸入精確值）。 */
  amend(op: JournalOp): Promise<unknown>
  commitSketch(plane: SketchPlane, hostBodyId: number | null, curves: SketchCurve[], tool: ToolKind): Promise<void>
  /** 把最後畫的那條線/圓改成指定長度/半徑。 */
  resizeLastSketchCurve(value: number): Promise<void>
  /** 把選取的線/圓改成指定長度/半徑（相接的線跟著動）。 */
  resizeSketchCurve(sketchId: number, curveId: number, value: number): Promise<void>
  undo(): void
  redo(): void
}

/** 拖曳把手進行中的狀態。 */
interface Manipulation {
  spec: HandleSpec
  startPx: Px
  /** 軸向每 1 世界單位在螢幕上的位移。 */
  axisPx: Px
  value: number
  preview: ExtrudePreview | null
  /** angle 只有圓角/倒角用（倒角角度，度）。 */
  build: (value: number, angle?: number) => JournalOp | null
  label: (value: number) => string
  /** 圓角/倒角合一：正值＝圓角、負值＝倒角（倒角時才有角度欄位）。 */
  blend: boolean
  /** 擠出的布林徽章選擇（build 的閉包讀取它）；mode 未設＝自動。 */
  boolRef?: { mode?: BoolMode }
  /** 自動模式在此高度下會是哪一種（徽章顯示目前生效的模式）。 */
  autoBool?: (value: number) => BoolMode
  /** 取代預設的「沿軸投影」換算（旋轉：指標繞環的角度）。 */
  valueFn?: (local: Px) => number
  /** [吸附步長, 自由步長]；預設 [1, 0.1]（mm）。 */
  steps?: [number, number]
  /** 標籤與鍵盤的單位，預設 mm。 */
  unit?: string
  /** 移動/旋轉預覽：讓本體（拷貝時是幽靈）跟著動。 */
  motion?: { bodyId: number; center: Vector3; axis: Vector3 | null; ghost: Group | null }
  /** 圓角/倒角/抽殼的 kernel 預覽節流。 */
  param: { inFlight: boolean; pending: number | null; ghost: BodyObject | null } | null
  minValue: number
}

/**
 * 主 3D 視口：renderer、場景、相機、手勢路由、繪圖、把手、選取的組裝點。
 *
 * 指標按下時的決策（beginPrimary）：
 *   1. 按在把手上 → 操作（擠出、推拉、移動、圓角）
 *   2. 使用草圖工具且這支指標能畫（筆、滑鼠，或尚未偵測到筆時的手指）→ 畫線
 *   3. 其餘 → 旋轉視角
 * 輕點一律是選取。
 */
export class Viewport {
  readonly scene = new Scene()
  readonly camera: PerspectiveCamera
  readonly rig = new CameraRig()
  host: ViewportHost | null = null

  private readonly renderer: WebGLRenderer
  private readonly gestures: GestureController
  private readonly viewCube = new ViewCube()
  private readonly resizeObserver: ResizeObserver
  private readonly bodies = new Map<number, BodyObject>()
  private readonly meshes = new Map<number, MeshData>()
  private readonly sketchLayers = new Map<number, SketchLayer>()
  private readonly raycaster = new Raycaster()
  private readonly highlighter: SelectionHighlighter
  private readonly handles: HandleLayer
  private readonly draw: DrawController
  private readonly unsubscribeStore: () => void
  private drawing = false
  private drawPlane = new Plane()
  private manip: Manipulation | null = null
  private dimension: {
    text: string
    editable: boolean
    value: number
    anchor: Vector3
    secondary: { text: string; value: number; unit: string; apply: ((v: number) => Promise<void>) | null } | null
    unit: string
  } | null = null
  private dimensionApply: ((value: number) => Promise<void>) | null = null
  private lastDimensionPx: Px | null = null
  /** 目前的尺寸標籤是否屬於「選取的草圖線」（換選取時才需要清掉）。 */
  private curveDimensionOwner = false
  /** 剛擠出、徽章可改布林模式的那次操作。 */
  private armedExtrude: { m: Manipulation; value: number; anchor: Vector3 } | null = null
  private rafHandle = 0
  private lastFrameTime = 0
  private needsRender = true
  private width = 1
  private height = 1

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true })
    this.renderer.localClippingEnabled = true
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(new Color(BACKGROUND))
    this.renderer.domElement.style.touchAction = 'none'
    this.renderer.domElement.style.display = 'block'
    container.appendChild(this.renderer.domElement)

    this.camera = new PerspectiveCamera(FOV_DEG, 1, 1, 200_000)
    this.camera.up.set(0, 0, 1)

    this.buildEnvironment()

    this.highlighter = new SelectionHighlighter(this.scene)
    this.handles = new HandleLayer(this.scene)
    this.draw = new DrawController({
      scene: this.scene,
      worldPerPixel: () => this.worldPerPixel(),
      snapSettings: () => {
        const s = useAppStore.getState()
        return { enabled: s.snapEnabled, gridSpacing: s.gridSpacingMm }
      },
      commit: (target, curves, tool) => void this.commitStroke(target, curves, tool),
    })

    this.unsubscribeStore = useAppStore.subscribe((state, prev) => {
      if (state.sectionActive !== prev.sectionActive) this.updateSection(state.sectionActive)
      if (state.activeTool !== prev.activeTool) {
        if (state.activeTool === 'select') this.draw.abort()
        else this.draw.setTool(state.activeTool)
        this.draw.hoverEnd()
        this.invalidate()
      }
      if (state.selection !== prev.selection) {
        this.clearDimension()
        this.refreshCurveDimension()
      }
      if (
        state.selection !== prev.selection ||
        state.bodies !== prev.bodies ||
        state.sketches !== prev.sketches ||
        state.toolMode !== prev.toolMode
      ) {
        this.syncVisibility()
        this.syncHighlights()
        this.syncHandles()
        this.invalidate()
      }
    })

    this.gestures = new GestureController({
      orbit: (dx, dy) => {
        this.rig.orbit(dx, dy)
        this.invalidate()
      },
      pan: (dx, dy) => {
        this.rig.pan(dx, dy, this.height, FOV_DEG)
        this.invalidate()
      },
      dolly: (scale) => {
        this.rig.dolly(scale)
        this.invalidate()
      },
      tap: (x, y, _type, tapCount) => this.handleTap(x, y, tapCount),
      beginPrimary: (x, y, type) => this.beginPrimary(x, y, type),
      primaryMove: (x, y) => this.primaryMove(x, y),
      primaryEnd: (x, y) => this.primaryEnd(x, y),
      primaryCancel: () => this.primaryCancel(),
      hover: (x, y, type) => this.handleHover(x, y, type),
      hoverEnd: () => {
        this.draw.hoverEnd()
        this.invalidate()
      },
      multiTap: (fingers) => {
        if (fingers === 2) this.host?.undo()
        else if (fingers === 3) this.host?.redo()
      },
      penDetected: () => {
        const store = useAppStore.getState()
        if (store.pencilDetected) return
        store.setPencilDetected()
        store.showToast('已偵測到 Apple Pencil：用筆畫圖與選取，用手指旋轉、平移、縮放')
      },
    })
    this.gestures.attach(this.renderer.domElement)

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(container)
    this.handleResize()

    this.lastFrameTime = performance.now()
    this.rafHandle = requestAnimationFrame(this.frame)
  }

  invalidate(): void {
    this.needsRender = true
  }

  /**
   * 同步渲染並擷取畫面（文件截圖/除錯用）。
   * WebGL drawing buffer 在合成後即失效，render 與 toDataURL 必須同步執行。
   */
  captureImage(): string {
    this.renderFrame()
    return this.renderer.domElement.toDataURL('image/png')
  }

  // ---- 文件層同步 ----

  addBody(bodyId: number, mesh: MeshData): void {
    const body = buildBodyObject(bodyId, mesh)
    this.bodies.set(bodyId, body)
    this.meshes.set(bodyId, mesh)
    this.scene.add(body.group)
    this.invalidate()
  }

  removeBody(bodyId: number): void {
    const body = this.bodies.get(bodyId)
    if (!body) return
    disposeBodyObject(body)
    this.bodies.delete(bodyId)
    this.meshes.delete(bodyId)
    this.invalidate()
  }

  replaceBodyMesh(bodyId: number, mesh: MeshData): void {
    const wasVisible = this.bodies.get(bodyId)?.group.visible ?? true
    this.removeBody(bodyId)
    this.addBody(bodyId, mesh)
    this.bodies.get(bodyId)!.group.visible = wasVisible
    this.syncHandles()
  }

  /** 重放/開檔後整批重建場景。 */
  setAllBodies(list: BodyMeshResult[]): void {
    this.cancelInteraction()
    this.clearDimension()
    for (const bodyId of [...this.bodies.keys()]) this.removeBody(bodyId)
    for (const body of list) this.addBody(body.bodyId, body.mesh)
    this.syncHandles()
    this.invalidate()
  }

  /** 由 journal 推導的草圖：新增/更新/移除對應的 SketchLayer。 */
  syncSketches(sketches: Map<number, SketchEntity>): void {
    for (const [id, layer] of this.sketchLayers) {
      if (!sketches.has(id)) {
        layer.dispose()
        this.sketchLayers.delete(id)
      }
    }
    for (const [id, entity] of sketches) {
      const layer = this.sketchLayers.get(id)
      if (layer) layer.update(entity)
      else
        this.sketchLayers.set(
          id,
          new SketchLayer(
            this.scene,
            entity,
            async (plane, curves) => {
              const kernel = this.host?.kernel()
              if (!kernel) return []
              const result = await kernel.sketchRegions(plane, curves)
              return result.regions.map((r) => r.mesh)
            },
            () => {
              this.syncHighlights()
              this.syncHandles()
              this.invalidate()
            },
          ),
        )
    }
    this.syncVisibility()
    this.syncHighlights()
    this.syncHandles()
    this.refreshCurveDimension()
    this.invalidate()
  }

  /**
   * 選到單一草圖線/圓時顯示它的尺寸，點擊輸入精確值（沒有獨立的尺寸工具——
   * 跟 Shapr3D 一樣，選取即顯示）。其他情況不碰標籤（拖曳/繪圖中的標籤另有所有者）。
   */
  private refreshCurveDimension(): void {
    if (this.manip || this.drawing) return
    const { selection } = useAppStore.getState()
    const item = selection.length === 1 ? selection[0] : null
    if (!item || item.kind !== 'curve') {
      if (this.curveDimensionOwner) {
        this.curveDimensionOwner = false
        this.clearDimension()
      }
      return
    }
    const layer = this.sketchLayers.get(item.sketchId)
    const curve = layer?.entity.curves.find((c) => c.id === item.curveId)
    const dim = curve && describeCurves([curve], 'line')
    if (!layer || !curve || !dim) {
      this.curveDimensionOwner = false
      this.clearDimension()
      return
    }
    // 直線標在中點，圓/弧用 describeCurves 給的錨點
    const anchorUv =
      curve.kind === 'line'
        ? { x: (curve.a.x + curve.b.x) / 2, y: (curve.a.y + curve.b.y) / 2 }
        : dim.anchor
    const world = new Vector3(...planeAnchor(layer.entity.plane, anchorUv))
    this.curveDimensionOwner = true
    this.setDimension(
      dim.text,
      world,
      dim.value,
      dim.editable
        ? (v) => this.host!.resizeSketchCurve(item.sketchId, item.curveId, v)
        : null,
    )
  }

  /** 等所有草圖的區域偵測完成。 */
  async settleSketches(): Promise<void> {
    await Promise.all([...this.sketchLayers.values()].map((l) => l.settled()))
  }

  /** Esc / 換工具 / 文件變動：放棄進行中的筆劃與拖曳。 */
  cancelInteraction(): void {
    this.draw.abort()
    this.drawing = false
    if (this.manip) this.endManipulation()
    this.invalidate()
  }

  /** 把相機轉成正對目前選取的平面（草圖、面），網格軸對齊螢幕。 */
  lookAtSelection(): void {
    const plane = this.selectionPlane()
    if (!plane) return
    this.rig.snapToDirection(plane.normal, plane.yDir)
    this.invalidate()
  }

  /** 尺寸標籤上輸入了精確值。 */
  async applyDimensionValue(value: number): Promise<void> {
    const apply = this.dimensionApply
    this.clearDimension()
    if (apply) await apply(value)
  }

  /** 擠出後點徽章：改成聯集/新本體/減去/交集，取代剛才那一步。 */
  async applyBoolMode(mode: BoolMode): Promise<void> {
    const armed = this.armedExtrude
    if (!armed?.m.boolRef || !this.host) return
    const previous = armed.m.boolRef.mode
    armed.m.boolRef.mode = mode
    const op = armed.m.build(armed.value)
    if (!op) return
    try {
      await this.host.amend(op)
    } catch (e) {
      armed.m.boolRef.mode = previous // amendLast 已還原原本那一步
      useAppStore.getState().showToast(`布林運算失敗：${e instanceof Error ? e.message : String(e)}`)
    }
    // 文件重建會清掉選取、連帶清掉標籤與徽章：不論成敗都重新掛上
    this.armDimension(armed.m, armed.value, armed.anchor)
  }

  /** 第二欄位（倒角角度）輸入了精確值。 */
  async applySecondaryValue(value: number): Promise<void> {
    const apply = this.dimension?.secondary?.apply
    this.clearDimension()
    if (apply) await apply(value)
  }

  dispose(): void {
    this.unsubscribeStore()
    cancelAnimationFrame(this.rafHandle)
    this.resizeObserver.disconnect()
    this.gestures.dispose()
    for (const layer of this.sketchLayers.values()) layer.dispose()
    this.handles.clear()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  // ---- 指標路由 ----

  private beginPrimary(clientX: number, clientY: number, type: string): PrimaryRole {
    this.syncCamera()
    const local = this.toLocal(clientX, clientY)
    if (this.viewCube.pick(local.x, local.y, this.width)) return 'none'

    const handle = this.handles.hitTest(
      local,
      (p) => this.worldToLocalPx(p),
      (p) => this.worldPerPixelAt(p),
    )
    if (handle && this.beginManipulation(handle, local)) return 'manipulate'

    const store = useAppStore.getState()
    const canDraw =
      store.activeTool !== 'select' &&
      (type === 'pen' || type === 'mouse' || (type === 'touch' && !store.pencilDetected))
    if (canDraw) {
      const target = this.drawTargetAt(local)
      if (target === 'nonplanar') {
        store.showToast('曲面上不能畫草圖——請在平面或地面上畫')
        return 'none'
      }
      if (!target) return 'none'
      const uv = this.planeUv(local, target.plane)
      if (!uv) return 'none'
      this.clearDimension()
      this.draw.begin(target, uv)
      this.drawing = true
      this.updateDrawDimension()
      this.invalidate()
      return 'draw'
    }
    return 'orbit'
  }

  private primaryMove(clientX: number, clientY: number): void {
    this.syncCamera()
    const local = this.toLocal(clientX, clientY)
    if (this.manip) {
      this.updateManipulation(local)
    } else if (this.drawing) {
      const target = this.draw.pendingTarget()
      const uv = target && this.planeUv(local, target.plane)
      if (uv) this.draw.move(uv)
      this.updateDrawDimension()
    }
    this.invalidate()
  }

  private primaryEnd(clientX: number, clientY: number): void {
    this.syncCamera()
    const local = this.toLocal(clientX, clientY)
    if (this.manip) {
      void this.commitManipulation()
    } else if (this.drawing) {
      const target = this.draw.pendingTarget()
      const uv = target && this.planeUv(local, target.plane)
      if (uv) this.draw.end(uv)
      else this.draw.cancel()
      this.drawing = false
      if (!this.dimensionApply) this.clearDimension()
    }
    this.invalidate()
  }

  private primaryCancel(): void {
    if (this.manip) this.endManipulation()
    if (this.drawing) {
      this.draw.cancel()
      this.drawing = false
      this.clearDimension()
    }
    this.invalidate()
  }

  private handleHover(clientX: number, clientY: number, type: string): void {
    const store = useAppStore.getState()
    if (store.activeTool === 'select' || (type !== 'pen' && type !== 'mouse')) return
    this.syncCamera()
    const local = this.toLocal(clientX, clientY)
    const target = this.drawTargetAt(local)
    if (!target || target === 'nonplanar') {
      this.draw.hover(null, null)
    } else {
      this.draw.hover(target, this.planeUv(local, target.plane))
    }
    this.invalidate()
  }

  // ---- 繪圖 ----

  /**
   * 這一筆畫在哪：進行中的圓弧沿用原平面 → 既有草圖區域 → 模型平面 → 地面。
   * 落在曲面上回傳 'nonplanar'。
   */
  private drawTargetAt(local: Px): DrawTarget | 'nonplanar' | null {
    const pending = this.draw.pendingTarget()
    if (pending) return pending

    this.setRay(local)
    let best: { plane: SketchPlane; host: number | null; distance: number } | null = null

    for (const layer of this.sketchLayers.values()) {
      const hit = layer.pickRegion(this.raycaster, visiblePoint)
      if (hit && (!best || hit.distance < best.distance)) {
        best = { plane: layer.entity.plane, host: layer.entity.hostBodyId, distance: hit.distance }
      }
    }

    const faceHit = this.raycaster
      .intersectObjects(this.visibleBodies().map((b) => b.surface), false)
      .find((h) => visiblePoint(h.point))
    if (faceHit && faceHit.faceIndex != null && (!best || faceHit.distance < best.distance - 1e-3)) {
      const body = this.visibleBodies().find((b) => b.surface === faceHit.object)!
      const mesh = this.meshes.get(body.bodyId)!
      const group = findTopoGroup(body.faceGroups, faceHit.faceIndex * 3)
      if (!group) return null
      const info = faceInfo(mesh, group)
      if (!info.planar) return 'nonplanar'
      best = {
        plane: planeFromNormal(info.normal, [faceHit.point.x, faceHit.point.y, faceHit.point.z]),
        host: body.bodyId,
        distance: faceHit.distance,
      }
    }

    if (!best) {
      const ground = new Plane(new Vector3(0, 0, 1), 0)
      const hit = new Vector3()
      if (!this.raycaster.ray.intersectPlane(ground, hit)) return null
      best = { plane: GROUND_PLANE, host: null, distance: 0 }
    }

    const entities = new Map([...this.sketchLayers].map(([id, l]) => [id, l.entity]))
    const existing = findSketchOnPlane(entities, best.plane, best.host)
    const plane = existing?.plane ?? best.plane
    return {
      plane,
      hostBodyId: best.host,
      existingCurves: existing?.curves ?? [],
      extraPoints: this.modelSnapPoints(plane),
    }
  }

  /** 模型上剛好落在此平面的頂點與直線邊中點（在方塊頂面畫圖時吸附角點）。 */
  private modelSnapPoints(plane: SketchPlane): { endpoints: Vec2[]; midpoints: Vec2[] } {
    const n = new Vector3(...plane.normal)
    const o = new Vector3(...plane.origin)
    const onPlane = (p: [number, number, number]) =>
      Math.abs(new Vector3(...p).sub(o).dot(n)) < 1e-3
    const endpoints: Vec2[] = []
    const midpoints: Vec2[] = []
    for (const body of this.visibleBodies()) {
      const pts = edgeSnapPoints(this.meshes.get(body.bodyId)!)
      for (const p of pts.endpoints) if (onPlane(p)) endpoints.push(worldToUv(plane, p))
      for (const p of pts.midpoints) if (onPlane(p)) midpoints.push(worldToUv(plane, p))
    }
    return { endpoints, midpoints }
  }

  private async commitStroke(target: DrawTarget, curves: SketchCurve[], tool: ToolKind): Promise<void> {
    if (!this.host) return
    const dim = describeCurves(curves, tool)
    try {
      await this.host.commitSketch(target.plane, target.hostBodyId, curves, tool)
    } catch (e) {
      console.warn('[sketch] 提交失敗：', e)
      return
    }
    // 剛畫完的直線/圓：尺寸標籤可點擊輸入精確值
    if (dim?.editable && !this.drawing) {
      const anchor = new Vector3(...planeAnchor(target.plane, dim.anchor))
      this.setDimension(dim.text, anchor, dim.value, (v) => this.host!.resizeLastSketchCurve(v))
    }
  }

  private updateDrawDimension(): void {
    const dim = this.draw.dimension()
    if (dim) this.setDimension(dim.text, dim.world, dim.value, null)
    else this.clearDimension()
  }

  // ---- 把手操作 ----

  private beginManipulation(spec: HandleSpec, local: Px): boolean {
    const action = spec.action
    let manip: Omit<Manipulation, 'spec' | 'startPx' | 'axisPx' | 'value'> | null = null

    switch (action.kind) {
      case 'extrudeRegion': {
        const layer = this.sketchLayers.get(action.sketchId)
        const region = layer?.region(action.regionIndex)
        if (!layer || !region) return false
        const { plane, curves, hostBodyId } = layer.entity
        const ref: { mode?: BoolMode } = {}
        manip = {
          preview: new ExtrudePreview(this.scene, region.mesh, plane.normal, hostBodyId !== null),
          build: (height) =>
            Math.abs(height) < 0.5
              ? null
              : {
                  kind: 'extrude',
                  plane,
                  curves,
                  regionIndex: region.regionIndex,
                  height,
                  hostBodyId,
                  newBodyId: null,
                  name: null,
                  sketchId: action.sketchId,
                  regionKey: region.key,
                  ...(ref.mode ? { boolMode: ref.mode } : {}),
                },
          boolRef: ref,
          autoBool: (h) => (hostBodyId !== null ? (h >= 0 ? 'union' : 'subtract') : 'new'),
          label: formatSigned,
          param: null,
          blend: false,
          minValue: -Infinity,
        }
        break
      }
      case 'pushPull': {
        const mesh = this.meshes.get(action.bodyId)
        const body = this.bodies.get(action.bodyId)
        const group = body?.faceGroups.find((g) => g.topoId === action.faceId)
        if (!mesh || !group) return false
        manip = {
          preview: new ExtrudePreview(
            this.scene,
            faceSubMesh(mesh, group),
            [spec.dir.x, spec.dir.y, spec.dir.z],
            true,
          ),
          build: (distance) =>
            Math.abs(distance) < 0.5
              ? null
              : { kind: 'pushPull', bodyId: action.bodyId, faceId: action.faceId, distance },
          label: formatSigned,
          param: null,
          blend: false,
          minValue: -Infinity,
        }
        break
      }
      case 'moveAxis': {
        const dir = spec.dir.clone()
        manip = {
          preview: null,
          build: (d) =>
            Math.abs(d) < 0.5
              ? null
              : this.motionOp(action.bodyId, [dir.x * d, dir.y * d, dir.z * d], undefined),
          label: formatSigned,
          param: null,
          blend: false,
          minValue: -Infinity,
          motion: { bodyId: action.bodyId, center: spec.origin.clone(), axis: null, ghost: null },
        }
        break
      }
      case 'rotateAxis': {
        const center = spec.origin.clone()
        const axis = spec.dir.clone()
        const startPoint = this.planePoint(local, center, axis)
        const centerPx = this.worldToLocalPx(center)
        // 環幾乎側對相機時射線打不到環平面：改用螢幕角度，方向依軸朝向相機與否決定
        const toCamera = this.camera.position.clone().sub(center).normalize()
        const screenSign = axis.dot(toCamera) > 0 ? 1 : -1
        let previous = 0
        let accumulated = 0
        manip = {
          preview: null,
          build: (deg) =>
            Math.abs(deg) < 0.1
              ? null
              : this.motionOp(action.bodyId, [0, 0, 0], {
                  axis: [axis.x, axis.y, axis.z],
                  center: [center.x, center.y, center.z],
                  angleDeg: deg,
                }),
          label: (deg) => `旋轉 ${deg.toFixed(1)}°`,
          // 連續累加（越過 ±180° 不會跳回），所以可以一路轉超過半圈
          valueFn: (p) => {
            const current = this.planePoint(p, center, axis)
            const raw =
              startPoint && current
                ? angleAboutAxis(
                    [center.x, center.y, center.z],
                    [axis.x, axis.y, axis.z],
                    [startPoint.x, startPoint.y, startPoint.z],
                    [current.x, current.y, current.z],
                  )
                : screenAngleDelta(centerPx, local, p) * screenSign
            let delta = raw - previous
            if (delta > 180) delta -= 360
            if (delta < -180) delta += 360
            accumulated += delta
            previous = raw
            return accumulated
          },
          steps: [5, 1],
          unit: '°',
          param: null,
          blend: false,
          minValue: -Infinity,
          motion: { bodyId: action.bodyId, center, axis, ghost: null },
        }
        break
      }
      case 'patternLinear':
      case 'patternCircular':
        return false
      case 'blend': {
        const { bodyId, ids } = action
        manip = {
          preview: null,
          // 外拉（正）＝圓角、內推（負）＝倒角；倒角帶角度，45° 即兩側等距
          build: (v, angle) => {
            if (Math.abs(v) < 0.1) return null
            if (v > 0) return { kind: 'fillet', bodyId, edgeIds: ids, radius: v, chamfer: false }
            const deg = angle ?? useAppStore.getState().chamferAngleDeg
            return {
              kind: 'fillet',
              bodyId,
              edgeIds: ids,
              radius: -v,
              chamfer: true,
              ...(Math.abs(deg - 45) > 1e-6 ? { angleDeg: deg } : {}),
            }
          },
          label: (v) => (v >= 0 ? `圓角 R ${formatMm(v)}` : `倒角 ${formatMm(-v)}`),
          param: { inFlight: false, pending: null, ghost: null },
          blend: true,
          minValue: -Infinity,
        }
        break
      }
      case 'shell': {
        const { bodyId, ids } = action
        manip = {
          preview: null,
          build: (v) => (v < 0.1 ? null : { kind: 'shell', bodyId, faceIds: ids, thickness: v }),
          label: (v) => `壁厚 ${formatMm(v)}`,
          param: { inFlight: false, pending: null, ghost: null },
          blend: false,
          minValue: 0.1,
        }
        break
      }
    }

    const po = this.worldToLocalPx(spec.origin)
    const pt = this.worldToLocalPx(spec.origin.clone().add(spec.dir))
    this.manip = {
      ...manip,
      spec,
      startPx: local,
      axisPx: { x: pt.x - po.x, y: pt.y - po.y },
      value: 0,
    }
    this.clearDimension()
    this.handles.setActive(spec.id)
    return true
  }

  private updateManipulation(local: Px): void {
    const m = this.manip
    if (!m) return
    const raw = m.valueFn ? m.valueFn(local) : dragHeight(m.startPx, local, m.axisPx)
    // 開吸附時以固定級距（預設 1mm、旋轉 5°），數字乾淨（Shapr3D 拖曳時的手感）
    const [snapStep, freeStep] = m.steps ?? [1, 0.1]
    const step = useAppStore.getState().snapEnabled ? snapStep : freeStep
    m.value = Math.max(m.minValue, Math.round(raw / step) * step)

    m.preview?.setHeight(m.value)
    this.applyMotionPreview(m)
    if (m.param) this.requestParamPreview(m, m.value)
    this.handles.setOffset(m.spec.id, slidesWithDrag(m.spec.action) ? m.value : 0)
    const angle = useAppStore.getState().chamferAngleDeg
    this.setDimension(
      m.label(m.value),
      this.manipAnchor(m),
      m.value,
      null,
      m.blend && m.value < 0
        ? { text: `∠ ${angle.toFixed(0)}°`, value: angle, unit: '°', apply: null }
        : null,
      m.unit,
    )
  }

  private async commitManipulation(): Promise<void> {
    const m = this.manip
    if (!m) return
    const value = m.value
    const anchor = this.manipAnchor(m)
    this.endManipulation()
    const op = m.build(value)
    if (!op || !this.host) return
    try {
      await this.host.commit(op)
    } catch (e) {
      useAppStore.getState().showToast(`操作失敗：${e instanceof Error ? e.message : String(e)}`)
      return
    }
    if (m.spec.action.kind === 'extrudeRegion') useAppStore.getState().clearSelection()
    this.armDimension(m, value, anchor)
  }

  /**
   * 放開後的可編輯尺寸：點它輸入精確值，以新參數取代剛才那一步；
   * 每次修改完會重新掛上，所以能連續微調（圓角 ↔ 倒角、改角度…）。
   */
  private armDimension(m: Manipulation, value: number, anchor: Vector3): void {
    if (m.boolRef && m.autoBool) {
      this.armedExtrude = { m, value, anchor }
      useAppStore.getState().setBoolBadge({ mode: m.boolRef.mode ?? m.autoBool(value) })
    }
    const amendWith = async (next: JournalOp | null, nextValue: number) => {
      if (!next || !this.host) return
      try {
        await this.host.amend(next)
      } catch (e) {
        useAppStore.getState().showToast(`操作失敗：${e instanceof Error ? e.message : String(e)}`)
        return
      }
      this.armDimension(m, nextValue, anchor)
    }
    const angle = useAppStore.getState().chamferAngleDeg
    const isChamfer = m.blend && value < 0
    this.setDimension(
      m.label(value),
      anchor,
      value,
      (v) => {
        const next = m.minValue > 0 ? Math.max(m.minValue, v) : v
        return amendWith(m.build(next), next)
      },
      isChamfer
        ? {
            text: `∠ ${angle.toFixed(0)}°`,
            value: angle,
            unit: '°',
            apply: (deg) => {
              if (!(deg > 0 && deg < 90)) {
                useAppStore.getState().showToast('倒角角度需介於 0° 與 90° 之間')
                return Promise.resolve()
              }
              useAppStore.getState().setChamferAngle(deg)
              return amendWith(m.build(value, deg), value)
            },
          }
        : null,
      m.unit,
    )
  }

  private endManipulation(): void {
    const m = this.manip
    if (!m) return
    this.manip = null
    m.preview?.dispose()
    if (m.motion) {
      const body = this.bodies.get(m.motion.bodyId)
      body?.group.position.set(0, 0, 0)
      body?.group.quaternion.identity()
      if (m.motion.ghost) this.disposeGhost(m.motion.ghost)
    }
    if (m.param) {
      if (m.param.ghost) disposeBodyObject(m.param.ghost)
      m.param.pending = null
      if (usesKernelPreview(m.spec.action)) this.syncVisibility()
    }
    this.handles.setOffset(m.spec.id, 0)
    this.handles.setActive(null)
    this.invalidate()
  }

  private requestParamPreview(m: Manipulation, value: number): void {
    const kernel = this.host?.kernel()
    const param = m.param
    if (!kernel || !param || !usesKernelPreview(m.spec.action)) return
    if (param.inFlight) {
      param.pending = value
      return
    }
    const op = m.build(value)
    if (!op) return
    const bodyId = (m.spec.action as { bodyId: number }).bodyId
    param.inFlight = true
    kernel
      .previewOp(op)
      .then((body) => {
        if (this.manip !== m) return
        const real = this.bodies.get(bodyId)
        if (real) real.group.visible = false
        if (param.ghost) disposeBodyObject(param.ghost)
        param.ghost = buildBodyObject(bodyId, body.mesh)
        this.scene.add(param.ghost.group)
        this.invalidate()
      })
      .catch(() => {
        // 半徑/壁厚超出可行範圍：保留上一個成功的預覽
      })
      .finally(() => {
        param.inFlight = false
        if (param.pending !== null && this.manip === m) {
          const next = param.pending
          param.pending = null
          this.requestParamPreview(m, next)
        }
      })
  }

  /** 移動/旋轉的 journal op；拷貝徽章開啟時是 copyBody（原本體不動）。 */
  private motionOp(
    bodyId: number,
    translation: [number, number, number],
    rotation: Rotation | undefined,
  ): JournalOp {
    const store = useAppStore.getState()
    const extra = rotation ? { rotation } : {}
    if (store.copyMode) {
      const name = store.bodies.find((b) => b.bodyId === bodyId)?.name ?? '主體'
      return { kind: 'copyBody', sourceBodyId: bodyId, bodyId: 0, name: `${name} 副本`, translation, ...extra }
    }
    return { kind: 'transform', bodyId, translation, ...extra }
  }

  /** 射線與「過 center、法線 axis」的平面交點；幾乎平行時回傳 null。 */
  private planePoint(local: Px, center: Vector3, axis: Vector3): Vector3 | null {
    this.setRay(local)
    if (Math.abs(this.raycaster.ray.direction.dot(axis)) < 0.1) return null
    const plane = new Plane().setFromNormalAndCoplanarPoint(axis, center)
    const hit = new Vector3()
    return this.raycaster.ray.intersectPlane(plane, hit) ? hit : null
  }

  /** 讓本體（拷貝時是半透明幽靈）依目前數值移動/旋轉。 */
  private applyMotionPreview(m: Manipulation): void {
    const motion = m.motion
    if (!motion) return
    const body = this.bodies.get(motion.bodyId)
    if (!body) return
    const copy = useAppStore.getState().copyMode
    if (copy && !motion.ghost) motion.ghost = this.makeGhost(body)
    if (!copy && motion.ghost) {
      this.disposeGhost(motion.ghost)
      motion.ghost = null
    }
    if (motion.ghost) {
      body.group.position.set(0, 0, 0)
      body.group.quaternion.identity()
    }
    const target = motion.ghost ?? body.group
    if (motion.axis) {
      setPivotTransform(target, new Vector3(), {
        axis: motion.axis,
        center: motion.center,
        angleRad: (m.value * Math.PI) / 180,
      })
    } else {
      setPivotTransform(target, m.spec.dir.clone().multiplyScalar(m.value))
    }
  }

  /** 本體的半透明副本（拷貝預覽）：共用幾何、各自的材質。 */
  private makeGhost(body: BodyObject): Group {
    const ghost = new Group()
    const surface = new MeshBasicMaterial({
      color: HANDLE_COLOR,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    })
    const edge = new LineBasicMaterial({ color: 0x9cc3ff, toneMapped: false })
    body.group.traverse((o) => {
      if (o instanceof LineSegments) ghost.add(new LineSegments(o.geometry, edge))
      else if (o instanceof Mesh) ghost.add(new Mesh(o.geometry, surface))
    })
    this.scene.add(ghost)
    return ghost
  }

  private disposeGhost(ghost: Group): void {
    const materials = new Set<{ dispose(): void }>()
    ghost.traverse((o) => {
      if (o instanceof LineSegments || o instanceof Mesh) materials.add(o.material as { dispose(): void })
    })
    for (const material of materials) material.dispose() // 幾何與本體共用，不能釋放
    ghost.removeFromParent()
  }

  private manipAnchor(m: Manipulation): Vector3 {
    const offset = slidesWithDrag(m.spec.action) ? m.value : 0
    const tip = m.spec.origin.clone().addScaledVector(m.spec.dir, offset)
    return tip.addScaledVector(m.spec.dir, 80 * this.worldPerPixelAt(tip))
  }

  /** 依選取與情境模式決定要顯示哪些把手。 */
  private syncHandles(): void {
    const specs = this.manip ? this.handles.specs() : this.computeHandles()
    if (!this.manip) this.handles.set(specs)
    this.invalidate()
  }

  private computeHandles(): HandleSpec[] {
    const { selection, toolMode } = useAppStore.getState()
    const bodyItems = selection.filter(isBodySelection)

    if (toolMode === 'move') {
      const body = bodyItems.find((i) => i.kind === 'body')
      const obj = body && this.bodies.get(body.bodyId)
      if (!body || !obj) return []
      const center = new Box3().setFromObject(obj.group).getCenter(new Vector3())
      const axes = ['x', 'y', 'z'] as const
      const unit = (axis: 'x' | 'y' | 'z') =>
        new Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0)
      return [
        ...axes.map((axis) => ({
          id: `move-${axis}`,
          origin: center,
          dir: unit(axis),
          color: AXIS_COLORS[axis],
          action: { kind: 'moveAxis' as const, bodyId: body.bodyId },
        })),
        // 旋轉環：繞各軸（Shapr3D 的 Move/Rotate gizmo 同時有平移箭頭與旋轉弧）
        ...axes.map((axis) => ({
          id: `rotate-${axis}`,
          origin: center,
          dir: unit(axis),
          ring: true,
          color: AXIS_COLORS[axis],
          action: { kind: 'rotateAxis' as const, bodyId: body.bodyId },
        })),
      ]
    }

    // 選了邊就有雙向箭頭（不需模式）：往外拉＝圓角、往內推＝倒角
    const edges = bodyItems.filter((i) => i.kind === 'edge')
    if (edges.length > 0 && edges.length === selection.length) {
      const first = edges[0]
      const mesh = this.meshes.get(first.bodyId)
      const obj = this.bodies.get(first.bodyId)
      const group = obj?.edgeGroups.find((g) => g.topoId === first.topoId)
      if (!mesh || !obj || !group || edges.some((e) => e.bodyId !== first.bodyId)) return []
      const mid = new Vector3(...edgeMidpoint(mesh, group))
      const center = new Box3().setFromObject(obj.group).getCenter(new Vector3())
      const dir = mid.clone().sub(center).normalize()
      return [
        {
          id: 'blend',
          origin: mid,
          dir: dir.lengthSq() > 0 ? dir : new Vector3(0, 0, 1),
          bidirectional: true,
          color: PARAM_HANDLE_COLOR,
          action: { kind: 'blend', bodyId: first.bodyId, ids: edges.map((e) => e.topoId) },
        },
      ]
    }

    if (toolMode === 'shell') {
      const face = bodyItems.find((i) => i.kind === 'face')
      const placed = face && this.facePlacement(face)
      if (!face || !placed) return []
      return [
        {
          id: 'param',
          origin: placed.origin,
          dir: placed.normal.clone().negate(),
          color: PARAM_HANDLE_COLOR,
          action: { kind: 'shell', bodyId: face.bodyId, ids: [face.topoId] },
        },
      ]
    }

    if (selection.length !== 1) return []
    const item = selection[0]
    if (item.kind === 'region') {
      const layer = this.sketchLayers.get(item.sketchId)
      const region = layer?.visible ? layer.region(item.regionIndex) : undefined
      if (!layer || !region) return []
      return [
        {
          id: 'extrude',
          origin: region.centroid.clone(),
          dir: new Vector3(...layer.entity.plane.normal),
          color: HANDLE_COLOR,
          action: { kind: 'extrudeRegion', sketchId: item.sketchId, regionIndex: item.regionIndex },
        },
      ]
    }
    if (item.kind === 'face') {
      const placed = this.facePlacement(item)
      if (!placed?.planar) return []
      return [
        {
          id: 'pushPull',
          origin: placed.origin,
          dir: placed.normal,
          color: HANDLE_COLOR,
          action: { kind: 'pushPull', bodyId: item.bodyId, faceId: item.topoId },
        },
      ]
    }
    return []
  }

  private facePlacement(
    item: BodySelection,
  ): { origin: Vector3; normal: Vector3; planar: boolean } | null {
    const mesh = this.meshes.get(item.bodyId)
    const obj = this.bodies.get(item.bodyId)
    const group = obj?.faceGroups.find((g) => g.topoId === item.topoId)
    if (!mesh || !obj || !obj.group.visible || !group) return null
    const info = faceInfo(mesh, group)
    return {
      origin: anchorInside(faceSubMesh(mesh, group)),
      normal: new Vector3(...info.normal),
      planar: info.planar,
    }
  }

  // ---- 選取 ----

  private handleTap(clientX: number, clientY: number, tapCount: number): void {
    this.syncCamera()
    const local = this.toLocal(clientX, clientY)
    const orientation = this.viewCube.pick(local.x, local.y, this.width)
    if (orientation) {
      this.rig.snapTo(orientation)
      this.invalidate()
      return
    }
    const store = useAppStore.getState()
    const item = this.pickAt(local)
    if (!item) {
      store.clearSelection()
      return
    }
    if (tapCount >= 2) {
      // 雙擊：選整個主體 / 整張草圖
      if (isBodySelection(item)) {
        const whole: SelectionItem = { bodyId: item.bodyId, kind: 'body', topoId: 0 }
        // 已經在選本體時，雙擊另一個本體是「加選/取消」（布林運算要選兩個以上）
        const onlyBodies =
          store.selection.length > 0 &&
          store.selection.every((s) => isBodySelection(s) && s.kind === 'body')
        if (onlyBodies) store.toggleSelection(whole)
        else store.replaceSelection([whole])
      } else {
        const layer = this.sketchLayers.get(item.sketchId)
        if (layer) {
          store.replaceSelection(
            layer.entity.curves.map((c) => ({ kind: 'curve', sketchId: item.sketchId, curveId: c.id })),
          )
        }
      }
      return
    }
    store.toggleSelection(item)
  }

  /** 選取優先序：草圖線 > 草圖區域 > 模型邊 > 模型面（邊/線有螢幕容差，好點中）。 */
  private pickAt(local: Px): SelectionItem | null {
    this.setRay(local)
    const threshold = edgePickThreshold(
      PICK_TOLERANCE_PX,
      this.camera.position.distanceTo(this.rig.currentTarget(new Vector3())),
      FOV_DEG,
      this.height,
    )
    this.raycaster.params.Line.threshold = threshold

    const bodies = this.visibleBodies()
    const faceHit = this.raycaster
      .intersectObjects(bodies.map((b) => b.surface), false)
      .find((h) => visiblePoint(h.point))

    // 草圖線：被實體擋住的（例如板子底下的原始矩形）不可選，否則會搶走面上的點選
    let curveHit: { sketchId: number; curveId: number; distance: number } | null = null
    for (const [sketchId, layer] of this.sketchLayers) {
      const hit = layer.pickCurve(this.raycaster, visiblePoint)
      if (hit && (!curveHit || hit.distance < curveHit.distance)) {
        curveHit = { sketchId, curveId: hit.curveId, distance: hit.distance }
      }
    }
    if (curveHit && (!faceHit || curveHit.distance <= faceHit.distance + threshold)) {
      return { kind: 'curve', sketchId: curveHit.sketchId, curveId: curveHit.curveId }
    }

    const edgeHit = this.raycaster
      .intersectObjects(bodies.map((b) => b.edges), false)
      .find((h) => visiblePoint(h.point))

    let regionHit: { sketchId: number; regionIndex: number; distance: number } | null = null
    for (const [sketchId, layer] of this.sketchLayers) {
      const hit = layer.pickRegion(this.raycaster, visiblePoint)
      if (hit && (!regionHit || hit.distance < regionHit.distance)) {
        regionHit = { sketchId, regionIndex: hit.region.regionIndex, distance: hit.distance }
      }
    }
    // 畫在面上的區域與面共平面：只要沒被更近的面擋住就選區域
    if (regionHit && (!faceHit || regionHit.distance <= faceHit.distance + threshold)) {
      return { kind: 'region', sketchId: regionHit.sketchId, regionIndex: regionHit.regionIndex }
    }

    if (edgeHit && edgeHit.index !== undefined && (!faceHit || edgeHit.distance <= faceHit.distance + threshold * 2)) {
      const body = bodies.find((b) => b.edges === edgeHit.object)
      const group = body && findTopoGroup(body.edgeGroups, edgeHit.index)
      if (body && group) return { bodyId: body.bodyId, kind: 'edge', topoId: group.topoId }
    }
    if (faceHit && faceHit.faceIndex != null) {
      const body = bodies.find((b) => b.surface === faceHit.object)
      const group = body && findTopoGroup(body.faceGroups, faceHit.faceIndex * 3)
      if (body && group) return { bodyId: body.bodyId, kind: 'face', topoId: group.topoId }
    }
    return null
  }

  private selectionPlane(): SketchPlane | null {
    const { selection } = useAppStore.getState()
    for (const item of selection) {
      if (item.kind === 'curve' || item.kind === 'region') {
        const layer = this.sketchLayers.get(item.sketchId)
        if (layer) return layer.entity.plane
      } else if (item.kind === 'face') {
        const placed = this.facePlacement(item)
        if (placed?.planar) {
          const o = placed.origin
          return planeFromNormal([placed.normal.x, placed.normal.y, placed.normal.z], [o.x, o.y, o.z])
        }
      }
    }
    return null
  }

  // ---- 畫面同步 ----

  private syncVisibility(): void {
    const { bodies, sketches } = useAppStore.getState()
    for (const entry of bodies) {
      const body = this.bodies.get(entry.bodyId)
      if (body) body.group.visible = entry.visible
    }
    for (const entry of sketches) this.sketchLayers.get(entry.sketchId)?.setVisible(entry.visible)
  }

  private syncHighlights(): void {
    const { selection } = useAppStore.getState()
    this.highlighter.apply(selection.filter(isBodySelection), this.bodies)
    for (const [sketchId, layer] of this.sketchLayers) {
      const curves = new Set<number>()
      const regions = new Set<number>()
      for (const item of selection) {
        if (item.kind === 'curve' && item.sketchId === sketchId) curves.add(item.curveId)
        if (item.kind === 'region' && item.sketchId === sketchId) regions.add(item.regionIndex)
      }
      layer.setHighlight(curves, regions)
    }
  }

  private updateSection(active: boolean): void {
    sharedClippingPlanes.length = 0
    if (active) {
      // 切在所有 body 的 bbox 中心，移除靠近前視/等角視相機（-Y 側）的那一半，
      // 剖口才會朝向使用者、看得到內部。保留 y ≥ centerY。
      let centerY = 0
      if (this.bodies.size > 0) {
        const bbox = new Box3()
        for (const body of this.bodies.values()) bbox.expandByObject(body.group)
        centerY = (bbox.min.y + bbox.max.y) / 2
      }
      sharedClippingPlanes.push(new Plane(new Vector3(0, 1, 0), -centerY))
    }
    this.invalidate()
  }

  // ---- 尺寸標籤（世界錨點，每幀投影到螢幕） ----

  private setDimension(
    text: string,
    anchor: Vector3,
    value: number,
    apply: ((value: number) => Promise<void>) | null,
    secondary: {
      text: string
      value: number
      unit: string
      apply: ((v: number) => Promise<void>) | null
    } | null = null,
    unit = 'mm',
  ): void {
    this.dimension = { text, editable: apply !== null, value, anchor, secondary, unit }
    this.dimensionApply = apply
    this.lastDimensionPx = null
    this.invalidate()
  }

  private clearDimension(): void {
    this.curveDimensionOwner = false
    if (this.armedExtrude) {
      this.armedExtrude = null
      useAppStore.getState().setBoolBadge(null)
    }
    if (!this.dimension && !this.dimensionApply) return
    this.dimension = null
    this.dimensionApply = null
    this.lastDimensionPx = null
    useAppStore.getState().setDimension(null)
  }

  private publishDimension(): void {
    if (!this.dimension) return
    const px = this.worldToLocalPx(this.dimension.anchor)
    const last = this.lastDimensionPx
    const current = useAppStore.getState().dimension
    if (
      last &&
      Math.abs(last.x - px.x) < 0.5 &&
      Math.abs(last.y - px.y) < 0.5 &&
      current?.text === this.dimension.text
    ) {
      return
    }
    this.lastDimensionPx = px
    const secondary = this.dimension.secondary
    useAppStore.getState().setDimension({
      text: this.dimension.text,
      editable: this.dimension.editable,
      value: this.dimension.value,
      unit: this.dimension.unit,
      x: px.x,
      y: px.y,
      secondary: secondary
        ? { text: secondary.text, value: secondary.value, unit: secondary.unit, editable: secondary.apply !== null }
        : undefined,
    })
  }

  // ---- 渲染 ----

  private readonly frame = (time: number) => {
    this.rafHandle = requestAnimationFrame(this.frame)
    const dt = Math.min((time - this.lastFrameTime) / 1000, 0.1)
    this.lastFrameTime = time

    const animating = this.rig.update(dt)
    if (!animating && !this.needsRender) return
    this.needsRender = false
    this.renderFrame()
  }

  private renderFrame(): void {
    this.syncCamera()
    this.handles.update((p) => this.worldPerPixelAt(p))
    this.publishDimension()
    this.renderer.render(this.scene, this.camera)
    this.viewCube.render(this.renderer, this.rig, this.width, this.height)
  }

  /**
   * 相機矩陣跟上 rig。渲染前與每次指標事件做射線換算前都要呼叫——
   * 否則換算會用「上一次渲染」的矩陣，在降頻或手勢剛改過 rig 時對不上手指位置。
   */
  private syncCamera(): void {
    this.rig.position(this.camera.position)
    this.camera.lookAt(this.rig.currentTarget(new Vector3()))
    this.camera.updateMatrixWorld()
  }

  // ---- 幾何工具 ----

  private visibleBodies(): BodyObject[] {
    return [...this.bodies.values()].filter((b) => b.group.visible)
  }

  private toLocal(clientX: number, clientY: number): Px {
    const rect = this.container.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  private setRay(local: Px): void {
    const ndc = new Vector2((local.x / this.width) * 2 - 1, -((local.y / this.height) * 2 - 1))
    this.raycaster.setFromCamera(ndc, this.camera)
  }

  /** 螢幕點投到平面上的 uv；射線與平面平行或在相機後方時回傳 null。 */
  private planeUv(local: Px, plane: SketchPlane): Vec2 | null {
    this.setRay(local)
    this.drawPlane.setFromNormalAndCoplanarPoint(
      new Vector3(...plane.normal),
      new Vector3(...plane.origin),
    )
    const hit = new Vector3()
    if (!this.raycaster.ray.intersectPlane(this.drawPlane, hit)) return null
    return worldToUv(plane, [hit.x, hit.y, hit.z])
  }

  private worldPerPixel(): number {
    return (2 * this.rig.currentRadius() * Math.tan(((FOV_DEG / 2) * Math.PI) / 180)) / this.height
  }

  private worldPerPixelAt(p: Vector3): number {
    const distance = this.camera.position.distanceTo(p)
    return (2 * distance * Math.tan(((FOV_DEG / 2) * Math.PI) / 180)) / this.height
  }

  private worldToLocalPx(world: Vector3): Px {
    const ndc = world.clone().project(this.camera)
    return {
      x: ((ndc.x + 1) / 2) * this.width,
      y: ((1 - ndc.y) / 2) * this.height,
    }
  }

  private handleResize(): void {
    const rect = this.container.getBoundingClientRect()
    this.width = Math.max(1, rect.width)
    this.height = Math.max(1, rect.height)
    this.renderer.setSize(this.width, this.height, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.camera.aspect = this.width / this.height
    this.camera.updateProjectionMatrix()
    this.invalidate()
  }

  private buildEnvironment(): void {
    // GridHelper 產生在 XZ 平面，旋轉到 XY（Z-up 世界的地面）。
    const minor = new GridHelper(GRID_EXTENT, GRID_EXTENT / MINOR_SPACING, GRID_MINOR, GRID_MINOR)
    minor.rotation.x = Math.PI / 2
    this.scene.add(minor)

    const major = new GridHelper(GRID_EXTENT, GRID_EXTENT / MAJOR_SPACING, GRID_MAJOR, GRID_MAJOR)
    major.rotation.x = Math.PI / 2
    major.position.z = 0.02 // 避免與細格 z-fighting
    this.scene.add(major)

    this.addAxisLine(new Vector3(1, 0, 0), 0x9c3d3d)
    this.addAxisLine(new Vector3(0, 1, 0), 0x3d9c50)
    this.addAxisLine(new Vector3(0, 0, 1), 0x3d5d9c)

    this.scene.add(new HemisphereLight(0xdedee4, 0x3a3a40, 1.2))
    const key = new DirectionalLight(0xffffff, 1.6)
    key.position.set(400, -300, 600)
    this.scene.add(key)
  }

  private addAxisLine(dir: Vector3, color: number): void {
    const half = GRID_EXTENT / 2
    const geometry = new BufferGeometry().setFromPoints([
      dir.clone().multiplyScalar(-half),
      dir.clone().multiplyScalar(half),
    ])
    this.scene.add(new Line(geometry, new LineBasicMaterial({ color, toneMapped: false })))
  }
}

/** 圓角/倒角/抽殼的預覽要問 kernel（其餘用純 JS 幽靈）。 */
function usesKernelPreview(action: HandleSpec['action']): boolean {
  return action.kind === 'blend' || action.kind === 'shell'
}

/** 沿拖曳方向跟著滑動的把手（擠出、推拉、移動的箭頭）。 */
function slidesWithDrag(action: HandleSpec['action']): boolean {
  return action.kind === 'extrudeRegion' || action.kind === 'pushPull' || action.kind === 'moveAxis'
}

/**
 * 先繞「過 center 的 axis」旋轉、再平移——與 kernel 的 rigidTransform 同序，
 * 預覽才會與提交後的結果一致。
 */
function setPivotTransform(
  obj: Object3D,
  translation: Vector3,
  rotation?: { axis: Vector3; center: Vector3; angleRad: number },
): void {
  const q = rotation
    ? new Quaternion().setFromAxisAngle(rotation.axis, rotation.angleRad)
    : new Quaternion()
  obj.quaternion.copy(q)
  obj.position.copy(translation)
  if (rotation) {
    obj.position.add(rotation.center.clone().sub(rotation.center.clone().applyQuaternion(q)))
  }
}

function formatSigned(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} mm`
}

function planeAnchor(plane: SketchPlane, uv: Vec2): [number, number, number] {
  return [
    plane.origin[0] + plane.xDir[0] * uv.x + plane.yDir[0] * uv.y,
    plane.origin[1] + plane.xDir[1] * uv.x + plane.yDir[1] * uv.y,
    plane.origin[2] + plane.xDir[2] * uv.x + plane.yDir[2] * uv.y,
  ]
}
