import {
  BufferGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { KernelClient } from '../kernel/KernelClient.ts'
import type { MeshData } from '../kernel/protocol.ts'
import { worldToUv, type SketchPlane, type Vec2 } from '../sketch/model.ts'
import type { ToolKind } from '../sketch/tools.ts'
import { useAppStore, type SelectionItem } from '../state/appStore.ts'
import { buildBodyObject, disposeBodyObject, type BodyObject } from './bodyMesh.ts'
import { CameraRig } from './CameraRig.ts'
import { GestureController } from './gestures.ts'
import { ExtrudePreview } from './ExtrudePreview.ts'
import { dragHeight, type Px } from './extrudeMath.ts'
import { edgePickThreshold, findTopoGroup } from './picking.ts'
import { SelectionHighlighter } from './SelectionHighlighter.ts'
import { SketchSession, type CommittedSketch } from './SketchSession.ts'
import { ViewCube } from './ViewCube.ts'

const BACKGROUND = 0x141416
const GRID_MINOR = 0x232327
const GRID_MAJOR = 0x2e2e34
const FOV_DEG = 45

/** 網格：5mm 細格、25mm 粗格，涵蓋 2m 見方。 */
const GRID_EXTENT = 2000
const MINOR_SPACING = 5
const MAJOR_SPACING = 25

/** 觸控選 edge 的螢幕容差（px）。 */
const EDGE_PICK_TOLERANCE_PX = 10

/**
 * 主 3D 視口：renderer、場景（網格、座標軸、光源）、相機 rig、
 * 手勢與 ViewCube 的組裝點。之後的 body mesh、選取高亮都掛在這裡。
 */
export class Viewport {
  readonly scene = new Scene()
  readonly camera: PerspectiveCamera
  readonly rig = new CameraRig()

  private readonly renderer: WebGLRenderer
  private readonly gestures: GestureController
  private readonly viewCube = new ViewCube()
  private readonly resizeObserver: ResizeObserver
  private readonly bodies = new Map<number, BodyObject>()
  private readonly raycaster = new Raycaster()
  private readonly highlighter: SelectionHighlighter
  private readonly unsubscribeStore: () => void
  private sketch: SketchSession | null = null
  private sketchIntersectPlane = new Plane()
  private kernel: KernelClient | null = null
  /** 完成草圖後留下的可擠出區域。 */
  private readonly committedSketches: CommittedSketch[] = []
  private extrudeDrag: {
    sketch: CommittedSketch
    regionId: number
    startPx: Px
    axisPx: Px
    preview: ExtrudePreview
    height: number
  } | null = null
  private rafHandle = 0
  private lastFrameTime = 0
  private needsRender = true
  private width = 1
  private height = 1

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(new Color(BACKGROUND))
    this.renderer.domElement.style.touchAction = 'none'
    this.renderer.domElement.style.display = 'block'
    container.appendChild(this.renderer.domElement)

    this.camera = new PerspectiveCamera(FOV_DEG, 1, 1, 200_000)
    this.camera.up.set(0, 0, 1)

    this.buildEnvironment()

    this.highlighter = new SelectionHighlighter(this.scene)
    this.unsubscribeStore = useAppStore.subscribe((state, prev) => {
      if (state.selection === prev.selection && state.bodies === prev.bodies) return
      for (const entry of state.bodies) {
        const body = this.bodies.get(entry.bodyId)
        if (body) body.group.visible = entry.visible
      }
      this.highlighter.apply(state.selection, this.bodies)
      this.invalidate()
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
      drawStart: (x, y) => this.forwardStroke('start', x, y),
      drawMove: (x, y) => this.forwardStroke('move', x, y),
      drawEnd: (x, y) => this.forwardStroke('end', x, y),
      drawCancel: () => this.sketch?.strokeCancel(),
      beginGrab: (x, y) => this.tryBeginExtrude(x, y),
      grabMove: (x, y) => this.updateExtrude(x, y),
      grabEnd: () => void this.commitExtrude(),
      grabCancel: () => this.cancelExtrude(),
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

  addBody(bodyId: number, mesh: MeshData): void {
    const body = buildBodyObject(bodyId, mesh)
    this.bodies.set(bodyId, body)
    this.scene.add(body.group)
    this.invalidate()
  }

  removeBody(bodyId: number): void {
    const body = this.bodies.get(bodyId)
    if (!body) return
    disposeBodyObject(body)
    this.bodies.delete(bodyId)
    this.invalidate()
  }

  /** 進入草圖模式：相機轉正對平面、單指改為繪圖、其餘實體變半透明。 */
  enterSketch(plane: SketchPlane, kernel: KernelClient, hostBodyId: number | null): void {
    if (this.sketch) return
    this.kernel = kernel
    this.sketch = new SketchSession(plane, hostBodyId, {
      scene: this.scene,
      kernel,
      invalidate: () => this.invalidate(),
      worldPerPixel: () => this.worldPerPixel(),
    })
    this.sketchIntersectPlane.setFromNormalAndCoplanarPoint(
      new Vector3(...plane.normal),
      new Vector3(...plane.origin),
    )
    this.rig.snapToDirection(plane.normal)
    this.gestures.setMode('draw')
    this.setBodiesDimmed(true)
    this.invalidate()
  }

  async exitSketch(commit: boolean): Promise<void> {
    if (!this.sketch) return
    const session = this.sketch
    this.sketch = null
    this.gestures.setMode('navigate')
    this.setBodiesDimmed(false)
    const committed = await session.finish(commit)
    if (committed) {
      this.committedSketches.push(committed)
      // 拉回等角視，避免正對平面時擠出軸在螢幕上退化
      this.rig.snapTo('iso')
      this.syncExtrudableCount()
    }
    this.invalidate()
  }

  setSketchTool(kind: ToolKind): void {
    this.sketch?.setTool(kind)
  }

  private forwardStroke(phase: 'start' | 'move' | 'end', clientX: number, clientY: number): void {
    if (!this.sketch) return
    const uv = this.clientToSketchUv(clientX, clientY)
    if (!uv) return
    if (phase === 'start') this.sketch.strokeStart(uv)
    else if (phase === 'move') this.sketch.strokeMove(uv)
    else this.sketch.strokeEnd(uv)
  }

  private clientToSketchUv(clientX: number, clientY: number): Vec2 | null {
    if (!this.sketch) return null
    const rect = this.container.getBoundingClientRect()
    const ndc = new Vector2(
      ((clientX - rect.left) / this.width) * 2 - 1,
      -(((clientY - rect.top) / this.height) * 2 - 1),
    )
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = new Vector3()
    if (!this.raycaster.ray.intersectPlane(this.sketchIntersectPlane, hit)) return null
    return worldToUv(this.sketch.plane, [hit.x, hit.y, hit.z])
  }

  private worldPerPixel(): number {
    return (
      (2 * this.rig.currentRadius() * Math.tan(((FOV_DEG / 2) * Math.PI) / 180)) /
      this.height
    )
  }

  // ---- 拖曳擠出 ----

  private tryBeginExtrude(clientX: number, clientY: number): boolean {
    if (this.sketch || !this.kernel || this.committedSketches.length === 0) return false
    const rect = this.container.getBoundingClientRect()
    const local: Px = { x: clientX - rect.left, y: clientY - rect.top }
    const ndc = new Vector2(
      (local.x / this.width) * 2 - 1,
      -((local.y / this.height) * 2 - 1),
    )
    this.raycaster.setFromCamera(ndc, this.camera)

    const targets = this.committedSketches.flatMap((s) => s.regions.map((r) => r.object))
    const hit = this.raycaster.intersectObjects(targets, false)[0]
    if (!hit) return false

    const sketch = this.committedSketches.find((s) =>
      s.regions.some((r) => r.object === hit.object),
    )!
    const region = sketch.regions.find((r) => r.object === hit.object)!

    // 法線方向每 1 世界單位的螢幕位移（px）
    const origin = new Vector3(...sketch.plane.origin)
    const tip = origin.clone().add(new Vector3(...sketch.plane.normal))
    const po = this.worldToLocalPx(origin)
    const pt = this.worldToLocalPx(tip)
    const axisPx: Px = { x: pt.x - po.x, y: pt.y - po.y }

    this.extrudeDrag = {
      sketch,
      regionId: region.regionId,
      startPx: local,
      axisPx,
      preview: new ExtrudePreview(this.scene, region.meshData, sketch.plane.normal),
      height: 0,
    }
    this.invalidate()
    return true
  }

  private updateExtrude(clientX: number, clientY: number): void {
    const drag = this.extrudeDrag
    if (!drag) return
    const rect = this.container.getBoundingClientRect()
    const local: Px = { x: clientX - rect.left, y: clientY - rect.top }
    drag.height = dragHeight(drag.startPx, local, drag.axisPx)
    drag.preview.setHeight(drag.height)
    this.invalidate()
  }

  private async commitExtrude(): Promise<void> {
    const drag = this.extrudeDrag
    if (!drag) return
    this.extrudeDrag = null
    drag.preview.dispose()
    this.invalidate()
    if (Math.abs(drag.height) < 0.5 || !this.kernel) return

    try {
      const result = await this.kernel.extrude(
        drag.sketch.sketchId,
        drag.regionId,
        drag.height,
        drag.sketch.hostBodyId,
      )

      drag.sketch.consumeRegion(drag.regionId)
      drag.sketch.regions = drag.sketch.regions.filter(
        (r) => r.regionId !== drag.regionId,
      )
      if (drag.sketch.regions.length === 0) {
        const i = this.committedSketches.indexOf(drag.sketch)
        if (i >= 0) this.committedSketches.splice(i, 1)
      }
      this.syncExtrudableCount()

      const store = useAppStore.getState()
      if (result.kind === 'updatedBody') {
        this.replaceBodyMesh(result.body.bodyId, result.body.mesh)
        // 布林後拓撲 ID 重排，舊的 face/edge 選取不再有效
        store.replaceSelection(
          store.selection.filter((s) => s.bodyId !== result.body.bodyId),
        )
      } else {
        this.addBody(result.body.bodyId, result.body.mesh)
        store.addBody({
          bodyId: result.body.bodyId,
          name: `主體 ${result.body.bodyId}`,
          visible: true,
        })
      }
    } catch (e) {
      console.warn('[extrude] 擠出失敗：', e)
    }
    this.invalidate()
  }

  private cancelExtrude(): void {
    if (!this.extrudeDrag) return
    this.extrudeDrag.preview.dispose()
    this.extrudeDrag = null
    this.invalidate()
  }

  private replaceBodyMesh(bodyId: number, mesh: MeshData): void {
    const wasVisible = this.bodies.get(bodyId)?.group.visible ?? true
    this.removeBody(bodyId)
    this.addBody(bodyId, mesh)
    this.bodies.get(bodyId)!.group.visible = wasVisible
  }

  private worldToLocalPx(world: Vector3): Px {
    const ndc = world.clone().project(this.camera)
    return {
      x: ((ndc.x + 1) / 2) * this.width,
      y: ((1 - ndc.y) / 2) * this.height,
    }
  }

  private syncExtrudableCount(): void {
    const count = this.committedSketches.reduce((n, s) => n + s.regions.length, 0)
    useAppStore.getState().setExtrudableRegionCount(count)
  }

  private setBodiesDimmed(dimmed: boolean): void {
    for (const body of this.bodies.values()) {
      const material = body.surface.material as MeshStandardMaterial
      material.transparent = dimmed
      material.opacity = dimmed ? 0.35 : 1
      material.needsUpdate = true
      ;(body.edges.material as LineBasicMaterial).transparent = dimmed
      ;(body.edges.material as LineBasicMaterial).opacity = dimmed ? 0.4 : 1
    }
  }

  dispose(): void {
    this.unsubscribeStore()
    cancelAnimationFrame(this.rafHandle)
    this.resizeObserver.disconnect()
    this.gestures.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private readonly frame = (time: number) => {
    this.rafHandle = requestAnimationFrame(this.frame)
    const dt = Math.min((time - this.lastFrameTime) / 1000, 0.1)
    this.lastFrameTime = time

    const animating = this.rig.update(dt)
    if (!animating && !this.needsRender) return
    this.needsRender = false

    this.rig.position(this.camera.position)
    this.camera.lookAt(this.rig.currentTarget(new Vector3()))

    this.renderer.render(this.scene, this.camera)
    this.viewCube.render(this.renderer, this.rig, this.width, this.height)
  }

  private handleTap(clientX: number, clientY: number, tapCount: number): void {
    // 手勢回報的是 client 座標，轉成視口內座標再交給 ViewCube。
    const rect = this.container.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    if (this.sketch) return // 草圖模式：tap 由筆劃事件涵蓋，不做選取/視角切換
    const orientation = this.viewCube.pick(x, y, this.width)
    if (orientation) {
      this.rig.snapTo(orientation)
      this.invalidate()
      return
    }
    this.pickAt(x, y, tapCount)
  }

  /** face/edge/body 三級選取：單擊 face/edge（edge 有螢幕容差優先），雙擊整個 body。 */
  private pickAt(x: number, y: number, tapCount: number): void {
    const store = useAppStore.getState()
    const ndc = new Vector2((x / this.width) * 2 - 1, -((y / this.height) * 2 - 1))
    this.raycaster.setFromCamera(ndc, this.camera)

    const cameraDistance = this.camera.position.distanceTo(
      this.rig.currentTarget(new Vector3()),
    )
    const threshold = edgePickThreshold(
      EDGE_PICK_TOLERANCE_PX,
      cameraDistance,
      FOV_DEG,
      this.height,
    )
    this.raycaster.params.Line.threshold = threshold

    const visibleBodies = [...this.bodies.values()].filter((b) => b.group.visible)
    const faceHit = this.raycaster.intersectObjects(
      visibleBodies.map((b) => b.surface),
      false,
    )[0]
    const edgeHit = this.raycaster.intersectObjects(
      visibleBodies.map((b) => b.edges),
      false,
    )[0]

    // edge 疊在 face 表面上，允許在容差內比 face 略遠仍然勝出。
    const preferEdge =
      edgeHit && (!faceHit || edgeHit.distance <= faceHit.distance + threshold * 2)

    let item: SelectionItem | null = null
    if (preferEdge && edgeHit.index !== undefined) {
      const body = visibleBodies.find((b) => b.edges === edgeHit.object)
      const group = body && findTopoGroup(body.edgeGroups, edgeHit.index)
      if (body && group) item = { bodyId: body.bodyId, kind: 'edge', topoId: group.topoId }
    } else if (faceHit && faceHit.faceIndex !== undefined && faceHit.faceIndex !== null) {
      const body = visibleBodies.find((b) => b.surface === faceHit.object)
      const group = body && findTopoGroup(body.faceGroups, faceHit.faceIndex * 3)
      if (body && group) item = { bodyId: body.bodyId, kind: 'face', topoId: group.topoId }
    }

    if (!item) {
      store.clearSelection()
      return
    }
    if (tapCount >= 2) {
      store.replaceSelection([{ bodyId: item.bodyId, kind: 'body', topoId: 0 }])
    } else {
      store.toggleSelection(item)
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
    const minor = new GridHelper(
      GRID_EXTENT,
      GRID_EXTENT / MINOR_SPACING,
      GRID_MINOR,
      GRID_MINOR,
    )
    minor.rotation.x = Math.PI / 2
    this.scene.add(minor)

    const major = new GridHelper(
      GRID_EXTENT,
      GRID_EXTENT / MAJOR_SPACING,
      GRID_MAJOR,
      GRID_MAJOR,
    )
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
