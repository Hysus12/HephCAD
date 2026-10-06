// 建構平面的顯示：半透明方塊 + 邊框。雙擊選為草圖平面後邊框與底色加深。

import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Raycaster,
  type Scene,
  Vector3,
} from 'three'
import type { PlaneEntity } from '../doc/planes.ts'

const COLOR = 0x4c8dff

export class PlaneLayer {
  private readonly group = new Group()
  private readonly fill: Mesh
  private readonly border: LineLoop
  private entity: PlaneEntity
  private active = false

  constructor(scene: Scene, entity: PlaneEntity) {
    this.entity = entity
    this.fill = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        color: COLOR,
        transparent: true,
        opacity: 0.12,
        side: DoubleSide,
        depthWrite: false,
      }),
    )
    const border = new BufferGeometry()
    border.setAttribute(
      'position',
      new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3),
    )
    this.border = new LineLoop(border, new LineBasicMaterial({ color: COLOR, transparent: true, opacity: 0.7 }))
    this.group.add(this.fill, this.border)
    this.group.matrixAutoUpdate = false
    this.place()
    scene.add(this.group)
  }

  update(entity: PlaneEntity): void {
    this.entity = entity
    this.place()
  }

  private place(): void {
    const { plane, center, size } = this.entity
    const x = new Vector3(...plane.xDir)
    const y = new Vector3(...plane.yDir)
    const n = new Vector3(...plane.normal)
    this.group.matrix
      .makeBasis(x.multiplyScalar(size), y.multiplyScalar(size), n)
      .setPosition(center[0], center[1], center[2])
    this.group.matrixWorldNeedsUpdate = true
    this.group.updateMatrixWorld(true)
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible
  }

  get visible(): boolean {
    return this.group.visible
  }

  setActive(active: boolean): void {
    this.active = active
    ;(this.fill.material as MeshBasicMaterial).opacity = active ? 0.28 : 0.12
    ;(this.border.material as LineBasicMaterial).opacity = active ? 1 : 0.7
  }

  isActive(): boolean {
    return this.active
  }

  /** 射線與平面方塊的距離；沒打到回傳 null。 */
  pick(raycaster: Raycaster): number | null {
    if (!this.group.visible) return null
    const hit = raycaster.intersectObject(this.fill, false)[0]
    return hit ? hit.distance : null
  }

  dispose(): void {
    this.fill.geometry.dispose()
    ;(this.fill.material as MeshBasicMaterial).dispose()
    this.border.geometry.dispose()
    ;(this.border.material as LineBasicMaterial).dispose()
    this.group.removeFromParent()
  }
}

