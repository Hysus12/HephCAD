import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, type Scene } from 'three'
import type { MeshData } from '../kernel/protocol.ts'
import type { Vec3Tuple } from '../sketch/model.ts'

const COLOR = 0x4a8df0
/** 掃掠方向的取樣數（整圈時每 7.5° 一片）。 */
const STEPS = 48

/**
 * 拖曳旋轉成形時的幽靈：區域輪廓繞軸掃出的側壁＋終點 cap。
 * 模板建一次，之後每幀只重算頂點——不打 kernel。
 */
export class RevolvePreview {
  private readonly mesh: Mesh
  private readonly geometry: BufferGeometry
  private readonly positions: Float32Array
  private readonly outline: Float32Array
  private readonly cap: Float32Array

  constructor(
    scene: Scene,
    region: MeshData,
    private readonly origin: Vec3Tuple,
    private readonly axis: Vec3Tuple,
  ) {
    this.outline = region.edgePositions
    this.cap = region.positions
    const outlineVerts = this.outline.length / 3
    const capVerts = this.cap.length / 3
    this.positions = new Float32Array((outlineVerts * (STEPS + 1) + capVerts) * 3)

    const indices: number[] = []
    // 側壁：每段輪廓 (p,q) 在相鄰兩個取樣角之間連成 quad
    for (let k = 0; k < STEPS; k++) {
      for (let s = 0; s + 1 < outlineVerts; s += 2) {
        const a = k * outlineVerts + s
        const b = a + 1
        const c = a + outlineVerts
        const d = c + 1
        indices.push(a, b, c, b, d, c)
      }
    }
    const capStart = outlineVerts * (STEPS + 1)
    for (let i = 0; i < region.indices.length; i++) indices.push(capStart + region.indices[i])

    this.geometry = new BufferGeometry()
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3))
    this.geometry.setIndex(indices)
    this.mesh = new Mesh(
      this.geometry,
      new MeshBasicMaterial({
        color: COLOR,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        depthTest: false,
        side: 2, // DoubleSide
      }),
    )
    this.mesh.renderOrder = 15
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
    this.setHeight(0)
  }

  /** value＝角度（度）；名稱沿用 ExtrudePreview 的介面。 */
  setHeight(angleDeg: number): void {
    const outlineVerts = this.outline.length / 3
    const total = (Math.max(-360, Math.min(360, angleDeg)) * Math.PI) / 180
    for (let k = 0; k <= STEPS; k++) {
      rotateInto(this.outline, this.positions, k * outlineVerts * 3, this.origin, this.axis, (total * k) / STEPS)
    }
    rotateInto(this.cap, this.positions, outlineVerts * (STEPS + 1) * 3, this.origin, this.axis, total)
    this.geometry.getAttribute('position').needsUpdate = true
  }

  dispose(): void {
    this.geometry.dispose()
    ;(this.mesh.material as MeshBasicMaterial).dispose()
    this.mesh.removeFromParent()
  }
}

/** Rodrigues 旋轉：source 的每個點繞（origin, axis）轉 angle，寫進 target[offset…]。 */
export function rotateInto(
  source: ArrayLike<number>,
  target: Float32Array,
  offset: number,
  origin: Vec3Tuple,
  axis: Vec3Tuple,
  angle: number,
): void {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const [kx, ky, kz] = axis
  for (let i = 0; i < source.length; i += 3) {
    const x = source[i] - origin[0]
    const y = source[i + 1] - origin[1]
    const z = source[i + 2] - origin[2]
    const dot = kx * x + ky * y + kz * z
    const cx = ky * z - kz * y
    const cy = kz * x - kx * z
    const cz = kx * y - ky * x
    target[offset + i] = origin[0] + x * cos + cx * sin + kx * dot * (1 - cos)
    target[offset + i + 1] = origin[1] + y * cos + cy * sin + ky * dot * (1 - cos)
    target[offset + i + 2] = origin[2] + z * cos + cz * sin + kz * dot * (1 - cos)
  }
}
