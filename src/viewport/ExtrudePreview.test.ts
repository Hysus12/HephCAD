import { describe, expect, it } from 'vitest'
import { Scene } from 'three'
import { ExtrudePreview } from './ExtrudePreview.ts'
import type { MeshData } from '../kernel/protocol.ts'

/** 單位正方形區域：4 頂點 2 三角形，輪廓 4 段。 */
function squareRegion(): MeshData {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    normals: new Float32Array(12),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    faceGroups: [],
    edgePositions: new Float32Array([
      0, 0, 0, 1, 0, 0,
      1, 0, 0, 1, 1, 0,
      1, 1, 0, 0, 1, 0,
      0, 1, 0, 0, 0, 0,
    ]),
    edgeGroups: [],
  }
}

describe('ExtrudePreview', () => {
  it('建立 cap x2 + 側壁 quad x4 的幾何', () => {
    const scene = new Scene()
    const preview = new ExtrudePreview(scene, squareRegion(), [0, 0, 1])
    const mesh = scene.children[0] as import('three').Mesh
    const pos = mesh.geometry.getAttribute('position')
    // 4*2 cap 頂點 + 4 段 * 4 頂點 = 24
    expect(pos.count).toBe(24)
    // 索引：cap 2*2 三角形 + 側壁 4*2 三角形 = 12 tri = 36
    expect(mesh.geometry.getIndex()!.count).toBe(36)
    preview.dispose()
    expect(scene.children).toHaveLength(0)
  })

  it('setHeight 只位移頂面與側壁上緣', () => {
    const scene = new Scene()
    const preview = new ExtrudePreview(scene, squareRegion(), [0, 0, 1])
    preview.setHeight(5)
    const mesh = scene.children[0] as import('three').Mesh
    const pos = mesh.geometry.getAttribute('position')
    // 底 cap（前 4 個頂點）z = 0
    for (let i = 0; i < 4; i++) expect(pos.getZ(i)).toBe(0)
    // 頂 cap（4..7）z = 5
    for (let i = 4; i < 8; i++) expect(pos.getZ(i)).toBe(5)
    // 側壁每個 quad：兩個 z=0、兩個 z=5
    for (let s = 0; s < 4; s++) {
      const b = 8 + s * 4
      expect(pos.getZ(b)).toBe(0)
      expect(pos.getZ(b + 1)).toBe(0)
      expect(pos.getZ(b + 2)).toBe(5)
      expect(pos.getZ(b + 3)).toBe(5)
    }
    preview.dispose()
  })

  it('負高度往反方向', () => {
    const scene = new Scene()
    const preview = new ExtrudePreview(scene, squareRegion(), [0, 0, 1])
    preview.setHeight(-3)
    const mesh = scene.children[0] as import('three').Mesh
    const pos = mesh.geometry.getAttribute('position')
    for (let i = 4; i < 8; i++) expect(pos.getZ(i)).toBe(-3)
    preview.dispose()
  })
})
