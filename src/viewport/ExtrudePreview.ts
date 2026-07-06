import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  Scene,
} from 'three'
import type { MeshData } from '../kernel/protocol.ts'
import type { Vec3Tuple } from '../sketch/model.ts'

const PREVIEW_COLOR = 0x4a8df0

/**
 * 拖曳擠出時的幽靈稜柱：底/頂 cap 用區域的三角化，側壁沿輪廓折線拉出。
 * 幾何模板建一次，之後每幀只改「頂面偏移」——不打 kernel。
 */
export class ExtrudePreview {
  private readonly mesh: Mesh
  private readonly geometry: BufferGeometry
  private readonly positions: Float32Array
  /** 每個頂點沿法線的偏移比例（0 = 底、1 = 頂）。 */
  private readonly offsetFactor: Float32Array
  private readonly base: Float32Array
  private readonly normal: Vec3Tuple

  constructor(scene: Scene, region: MeshData, normal: Vec3Tuple) {
    this.normal = normal

    const capVerts = region.positions.length / 3
    const sideSegments = region.edgePositions.length / 6 // 每段兩點
    const totalVerts = capVerts * 2 + sideSegments * 4

    this.base = new Float32Array(totalVerts * 3)
    this.offsetFactor = new Float32Array(totalVerts)
    const indices: number[] = []

    // 底 cap（0..capVerts-1）與頂 cap（capVerts..2*capVerts-1）
    this.base.set(region.positions, 0)
    this.base.set(region.positions, capVerts * 3)
    this.offsetFactor.fill(0, 0, capVerts)
    this.offsetFactor.fill(1, capVerts, capVerts * 2)
    for (let i = 0; i < region.indices.length; i += 3) {
      const a = region.indices[i]
      const b = region.indices[i + 1]
      const c = region.indices[i + 2]
      indices.push(a, c, b) // 底面反向
      indices.push(capVerts + a, capVerts + b, capVerts + c)
    }

    // 側壁：每段輪廓線 (p,q) → 四頂點 quad
    let v = capVerts * 2
    for (let s = 0; s < sideSegments; s++) {
      const o = s * 6
      for (const [pi, factor] of [
        [0, 0],
        [3, 0],
        [0, 1],
        [3, 1],
      ] as const) {
        this.base[v * 3] = region.edgePositions[o + pi]
        this.base[v * 3 + 1] = region.edgePositions[o + pi + 1]
        this.base[v * 3 + 2] = region.edgePositions[o + pi + 2]
        this.offsetFactor[v] = factor
        v++
      }
      const b0 = capVerts * 2 + s * 4
      indices.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2)
    }

    this.positions = this.base.slice()
    this.geometry = new BufferGeometry()
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3))
    this.geometry.setIndex(indices)

    this.mesh = new Mesh(
      this.geometry,
      new MeshBasicMaterial({
        color: PREVIEW_COLOR,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: 2, // DoubleSide
      }),
    )
    this.mesh.renderOrder = 15
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
    this.setHeight(0)
  }

  setHeight(height: number): void {
    const [nx, ny, nz] = this.normal
    for (let i = 0; i < this.offsetFactor.length; i++) {
      const off = this.offsetFactor[i] * height
      this.positions[i * 3] = this.base[i * 3] + nx * off
      this.positions[i * 3 + 1] = this.base[i * 3 + 1] + ny * off
      this.positions[i * 3 + 2] = this.base[i * 3 + 2] + nz * off
    }
    this.geometry.getAttribute('position').needsUpdate = true
  }

  dispose(): void {
    this.geometry.dispose()
    ;(this.mesh.material as MeshBasicMaterial).dispose()
    this.mesh.removeFromParent()
  }
}
