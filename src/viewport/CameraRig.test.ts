import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { CameraRig, nearestEquivalentAngle } from './CameraRig.ts'
import { ISO_PHI, ISO_THETA } from './viewOrientations.ts'

describe('CameraRig', () => {
  it('起始為等角視', () => {
    const rig = new CameraRig()
    expect(rig.theta).toBeCloseTo(ISO_THETA)
    expect(rig.phi).toBeCloseTo(ISO_PHI)
  })

  it('orbit 會改變方位角並夾住極角', () => {
    const rig = new CameraRig()
    const theta0 = rig.theta
    rig.orbit(100, 0)
    expect(rig.theta).toBeLessThan(theta0)

    rig.orbit(0, 100_000) // 極端向下拖
    expect(rig.phi).toBeGreaterThan(0)
    expect(rig.phi).toBeLessThan(Math.PI)
  })

  it('dolly 夾住距離範圍', () => {
    const rig = new CameraRig()
    rig.dolly(1e-9)
    expect(rig.radius).toBeGreaterThanOrEqual(5)
    rig.dolly(1e12)
    expect(rig.radius).toBeLessThanOrEqual(100_000)
  })

  it('pan 沿相機的右/上方向移動 target', () => {
    const rig = new CameraRig()
    rig.snapTo('front') // 相機在 -Y，右 = +X、上 = +Z
    rig.update(10) // 讓動畫收斂
    rig.pan(100, 0, 1000, 45)
    expect(rig.target.x).toBeLessThan(0) // 畫面往右拖，場景跟著移 → target 往 -X
    expect(Math.abs(rig.target.y)).toBeLessThan(1e-6)

    const before = rig.target.z
    rig.pan(0, 100, 1000, 45)
    expect(rig.target.z).toBeGreaterThan(before)
  })

  it('手勢直接跟手（不經動畫）', () => {
    const rig = new CameraRig()
    rig.orbit(50, 20)
    const pos = rig.position(new Vector3())
    const expected = new Vector3(
      Math.sin(rig.phi) * Math.cos(rig.theta),
      Math.sin(rig.phi) * Math.sin(rig.theta),
      Math.cos(rig.phi),
    ).multiplyScalar(rig.radius)
    expect(pos.distanceTo(expected)).toBeLessThan(1e-9)
  })

  it('snapTo 之後 update 收斂到目標角度', () => {
    const rig = new CameraRig()
    rig.snapTo('right')
    let moving = true
    for (let i = 0; i < 300 && moving; i++) moving = rig.update(1 / 60)
    expect(moving).toBe(false)

    const pos = rig.position(new Vector3()).normalize()
    expect(pos.x).toBeCloseTo(1, 3)
    expect(pos.y).toBeCloseTo(0, 3)
  })

  it('snapTo top 不會與 up 向量共線', () => {
    const rig = new CameraRig()
    rig.snapTo('top')
    for (let i = 0; i < 300; i++) rig.update(1 / 60)
    const dir = rig.direction(new Vector3())
    expect(dir.z).toBeGreaterThan(0.999)
    expect(dir.z).toBeLessThan(1) // 留有極角下限
  })
})

describe('nearestEquivalentAngle', () => {
  it('選擇最短路徑的等價角', () => {
    expect(nearestEquivalentAngle(0, Math.PI * 1.9)).toBeCloseTo(Math.PI * 2)
    expect(nearestEquivalentAngle(0, -Math.PI * 1.9)).toBeCloseTo(-Math.PI * 2)
    expect(nearestEquivalentAngle(Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2)
  })
})
