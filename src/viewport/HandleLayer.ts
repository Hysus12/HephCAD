import {
  ConeGeometry,
  TorusGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three'
import { distanceToSegment, type Px } from './extrudeMath.ts'
import { distanceToPolyline } from './rotateMath.ts'

/** 箭頭在螢幕上的長度（px）——夠大才好用手指/筆抓。 */
const HANDLE_LENGTH_PX = 72
/** 命中容差（px）。 */
const HIT_TOLERANCE_PX = 26
/** 旋轉環在螢幕上的半徑（px）——在箭頭外圍，不互相遮擋。 */
const RING_RADIUS_PX = 112
const RING_HIT_TOLERANCE_PX = 22
/**
 * 等角視角下環投影成橢圓，會與箭頭在螢幕上交疊；兩者都命中時環優先
 * （箭頭本來就在中心附近，環在外圍，使用者要抓環時通常是真的想轉）。
 */
const RING_PRIORITY_BONUS_PX = 12
const RING_SAMPLES = 72

export type HandleAction =
  | { kind: 'extrudeRegion'; sketchId: number; regionIndex: number }
  | { kind: 'pushPull'; bodyId: number; faceId: number }
  | { kind: 'moveAxis'; bodyId: number }
  /** 繞 spec.dir 軸（過 spec.origin）旋轉；value＝角度（度）。 */
  | { kind: 'rotateAxis'; bodyId: number }
  /** 陣列：線性＝沿 dir 的間距（mm）；圓形＝繞 dir 的總角度（度）。 */
  | { kind: 'patternLinear'; bodyId: number }
  | { kind: 'patternCircular'; bodyId: number }
  /** 圓角/倒角合一：往外拖＝圓角，往內拖＝倒角。 */
  | { kind: 'blend'; bodyId: number; ids: number[] }
  | { kind: 'shell'; bodyId: number; ids: number[] }

export interface HandleSpec {
  id: string
  origin: Vector3
  /** 單位向量；拖曳沿此軸（反向拖 = 負值）。 */
  dir: Vector3
  /** 雙向箭頭：兩端都有箭頭（圓角/倒角），原點在中央。 */
  bidirectional?: boolean
  /** 旋轉環：以 origin 為圓心、dir 為法線，取代箭頭。 */
  ring?: boolean
  color: number
  action: HandleAction
}

interface HandleObject {
  spec: HandleSpec
  /** 沿 +dir 的箭頭；雙向時另有沿 -dir 的第二支。 */
  roots: Group[]
  material: MeshBasicMaterial
}

const UP = new Vector3(0, 1, 0)

/**
 * Shapr3D 式的箭頭把手：選取區域/面/主體後出現，拖曳它來擠出、推拉、移動、設定圓角。
 * 永遠畫在最上層（不被模型遮住），每幀依相機距離縮放成固定螢幕大小。
 */
export class HandleLayer {
  private readonly group = new Group()
  private handles: HandleObject[] = []
  /** 拖曳中把手沿軸的位移（世界單位），讓箭頭跟著被拉動的面走。 */
  private offsets = new Map<string, number>()

  constructor(scene: Scene) {
    this.group.name = 'handles'
    scene.add(this.group)
  }

  set(specs: HandleSpec[]): void {
    this.clear()
    for (const spec of specs) {
      const material = new MeshBasicMaterial({
        color: spec.color,
        toneMapped: false,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      })
      if (spec.ring) {
        const root = new Group()
        // 單位圓（半徑 1）在 XY 平面，法線 +Z
        const torus = new Mesh(new TorusGeometry(1, 0.022, 8, 96), material)
        torus.renderOrder = 40
        root.add(torus)
        root.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), spec.dir))
        this.group.add(root)
        this.handles.push({ spec, roots: [root], material })
        continue
      }
      const directions = spec.bidirectional ? [spec.dir, spec.dir.clone().negate()] : [spec.dir]
      const roots = directions.map((dir) => {
        const root = new Group()
        // 單位長度沿 +Y：底部小球 + 桿 + 錐頭
        const base = new Mesh(new SphereGeometry(0.07, 12, 8), material)
        const shaft = new Mesh(new CylinderGeometry(0.035, 0.035, 0.72, 10), material)
        shaft.position.y = 0.36
        const head = new Mesh(new ConeGeometry(0.11, 0.28, 16), material)
        head.position.y = 0.86
        for (const m of [base, shaft, head]) m.renderOrder = 40
        root.add(base, shaft, head)
        root.quaternion.copy(new Quaternion().setFromUnitVectors(UP, dir))
        this.group.add(root)
        return root
      })
      this.handles.push({ spec, roots, material })
    }
    this.offsets.clear()
  }

  specs(): HandleSpec[] {
    return this.handles.map((h) => h.spec)
  }

  setOffset(id: string, value: number): void {
    this.offsets.set(id, value)
  }

  setActive(id: string | null): void {
    for (const h of this.handles) h.material.opacity = id === null || h.spec.id === id ? 0.95 : 0.25
  }

  /** 每幀呼叫：位置（含拖曳位移）與固定螢幕大小。 */
  update(worldPerPixelAt: (p: Vector3) => number): void {
    for (const h of this.handles) {
      const offset = this.offsets.get(h.spec.id) ?? 0
      for (const root of h.roots) {
        root.position.copy(h.spec.origin).addScaledVector(h.spec.dir, offset)
        root.scale.setScalar(
          (h.spec.ring ? RING_RADIUS_PX : HANDLE_LENGTH_PX) * worldPerPixelAt(root.position),
        )
      }
    }
  }

  /** 螢幕空間命中測試：點到「底部→箭尖」線段的距離。 */
  hitTest(local: Px, project: (p: Vector3) => Px, worldPerPixelAt: (p: Vector3) => number): HandleSpec | null {
    let best: { spec: HandleSpec; d: number } | null = null
    for (const h of this.handles) {
      if (h.spec.ring) {
        const raw = distanceToPolyline(local, this.ringPoints(h.spec, project, worldPerPixelAt))
        const d = raw - RING_PRIORITY_BONUS_PX
        if (raw <= RING_HIT_TOLERANCE_PX && (!best || d < best.d)) best = { spec: h.spec, d }
        continue
      }
      const offset = this.offsets.get(h.spec.id) ?? 0
      const base = h.spec.origin.clone().addScaledVector(h.spec.dir, offset)
      const reach = HANDLE_LENGTH_PX * worldPerPixelAt(base)
      const tips = [base.clone().addScaledVector(h.spec.dir, reach)]
      if (h.spec.bidirectional) tips.push(base.clone().addScaledVector(h.spec.dir, -reach))
      for (const tip of tips) {
        const d = distanceToSegment(local, project(base), project(tip))
        if (d <= HIT_TOLERANCE_PX && (!best || d < best.d)) best = { spec: h.spec, d }
      }
    }
    return best?.spec ?? null
  }

  /** 環取樣點投影到螢幕（命中測試用）。 */
  private ringPoints(
    spec: HandleSpec,
    project: (p: Vector3) => Px,
    worldPerPixelAt: (p: Vector3) => number,
  ): Px[] {
    const radius = RING_RADIUS_PX * worldPerPixelAt(spec.origin)
    const { u, v } = ringBasis(spec.dir)
    const pts: Px[] = []
    for (let i = 0; i <= RING_SAMPLES; i++) {
      const t = (i / RING_SAMPLES) * Math.PI * 2
      pts.push(
        project(
          spec.origin
            .clone()
            .addScaledVector(u, Math.cos(t) * radius)
            .addScaledVector(v, Math.sin(t) * radius),
        ),
      )
    }
    return pts
  }

  clear(): void {
    for (const h of this.handles) {
      for (const root of h.roots) {
        root.traverse((o) => {
          if (o instanceof Mesh) o.geometry.dispose()
        })
        root.removeFromParent()
      }
      h.material.dispose()
    }
    this.handles = []
  }
}

/** 垂直於 normal 的兩個正交單位向量。 */
export function ringBasis(normal: Vector3): { u: Vector3; v: Vector3 } {
  const ref = Math.abs(normal.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0)
  const u = new Vector3().crossVectors(normal, ref).normalize()
  const v = new Vector3().crossVectors(normal, u).normalize()
  return { u, v }
}
