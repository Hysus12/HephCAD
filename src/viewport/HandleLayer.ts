import {
  ConeGeometry,
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

/** 箭頭在螢幕上的長度（px）——夠大才好用手指/筆抓。 */
const HANDLE_LENGTH_PX = 72
/** 命中容差（px）。 */
const HIT_TOLERANCE_PX = 26

export type HandleAction =
  | { kind: 'extrudeRegion'; sketchId: number; regionIndex: number }
  | { kind: 'pushPull'; bodyId: number; faceId: number }
  | { kind: 'moveAxis'; bodyId: number }
  | { kind: 'param'; mode: 'fillet' | 'chamfer' | 'shell'; bodyId: number; ids: number[] }

export interface HandleSpec {
  id: string
  origin: Vector3
  /** 單位向量；拖曳沿此軸（反向拖 = 負值）。 */
  dir: Vector3
  color: number
  action: HandleAction
}

interface HandleObject {
  spec: HandleSpec
  root: Group
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
      const root = new Group()
      // 單位長度沿 +Y：底部小球 + 桿 + 錐頭
      const base = new Mesh(new SphereGeometry(0.07, 12, 8), material)
      const shaft = new Mesh(new CylinderGeometry(0.035, 0.035, 0.72, 10), material)
      shaft.position.y = 0.36
      const head = new Mesh(new ConeGeometry(0.11, 0.28, 16), material)
      head.position.y = 0.86
      for (const m of [base, shaft, head]) m.renderOrder = 40
      root.add(base, shaft, head)
      root.quaternion.copy(new Quaternion().setFromUnitVectors(UP, spec.dir))
      this.group.add(root)
      this.handles.push({ spec, root, material })
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
      h.root.position.copy(h.spec.origin).addScaledVector(h.spec.dir, offset)
      h.root.scale.setScalar(HANDLE_LENGTH_PX * worldPerPixelAt(h.root.position))
    }
  }

  /** 螢幕空間命中測試：點到「底部→箭尖」線段的距離。 */
  hitTest(local: Px, project: (p: Vector3) => Px, worldPerPixelAt: (p: Vector3) => number): HandleSpec | null {
    let best: { spec: HandleSpec; d: number } | null = null
    for (const h of this.handles) {
      const offset = this.offsets.get(h.spec.id) ?? 0
      const base = h.spec.origin.clone().addScaledVector(h.spec.dir, offset)
      const tip = base.clone().addScaledVector(h.spec.dir, HANDLE_LENGTH_PX * worldPerPixelAt(base))
      const d = distanceToSegment(local, project(base), project(tip))
      if (d <= HIT_TOLERANCE_PX && (!best || d < best.d)) best = { spec: h.spec, d }
    }
    return best?.spec ?? null
  }

  clear(): void {
    for (const h of this.handles) {
      h.root.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose()
      })
      h.material.dispose()
      h.root.removeFromParent()
    }
    this.handles = []
  }
}
