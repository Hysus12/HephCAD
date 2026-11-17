import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  EdgesGeometry,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three'
import type { CameraRig } from './CameraRig.ts'

/** 螢幕右上角的視角方塊（CSS px）。 */
export const VIEWCUBE_SIZE = 96
export const VIEWCUBE_MARGIN = 10

// BoxGeometry 材質順序：+x, -x, +y, -y, +z, -z
const FACE_LABELS = ['右', '左', '後', '前', '頂', '底'] as const

/** 面上靠邊這一段比例算「邊/角」（點它＝轉到斜 45° 的視角）。 */
export const EDGE_BAND = 0.22

/**
 * 方塊表面上的點（各軸 -0.5…0.5）→ 要正對的方向（從中心指向相機）。
 * 點面中央＝該面；靠近一條邊＝兩面之間；靠近角＝三面之間（等角視）。
 */
export function cubeDirection(point: [number, number, number]): [number, number, number] {
  const threshold = 0.5 - EDGE_BAND
  const dir = point.map((c) => (Math.abs(c) >= threshold ? Math.sign(c) : 0)) as [number, number, number]
  const len = Math.hypot(dir[0], dir[1], dir[2])
  if (len === 0) return [0, 0, 1]
  return [dir[0] / len, dir[1] / len, dir[2] / len]
}

export class ViewCube {
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(35, 1, 0.1, 20)
  private readonly cube: Mesh
  private readonly raycaster = new Raycaster()

  constructor() {
    const materials = FACE_LABELS.map(
      (label) =>
        new MeshBasicMaterial({ map: makeFaceTexture(label), toneMapped: false }),
    )
    this.cube = new Mesh(new BoxGeometry(1, 1, 1), materials)
    this.scene.add(this.cube)

    const edges = new LineSegments(
      new EdgesGeometry(this.cube.geometry as BoxGeometry),
      new LineBasicMaterial({ color: 0x555560, toneMapped: false }),
    )
    this.cube.add(edges)

    // 從左後下角伸出的 X/Y/Z 軸（紅/綠/藍），一眼看出世界方向
    const corner = new Vector3(-0.5, -0.5, -0.5)
    for (const [axis, color] of [
      [new Vector3(1, 0, 0), 0xd9534f],
      [new Vector3(0, 1, 0), 0x4caf6d],
      [new Vector3(0, 0, 1), 0x4a8df0],
    ] as const) {
      const geometry = new BufferGeometry().setFromPoints([corner, corner.clone().addScaledVector(axis, 1.32)])
      this.scene.add(new Line(geometry, new LineBasicMaterial({ color, toneMapped: false })))
    }
  }

  /** 螢幕座標是否落在方塊的互動範圍（整個小視窗；在上面拖曳＝轉視角）。 */
  contains(xPx: number, yPx: number, width: number): boolean {
    const left = width - VIEWCUBE_SIZE - VIEWCUBE_MARGIN
    const top = VIEWCUBE_MARGIN
    return xPx >= left && xPx <= left + VIEWCUBE_SIZE && yPx >= top && yPx <= top + VIEWCUBE_SIZE
  }

  /** 在主畫面渲染完後，於右上角小視窗渲染方塊。寬高為 CSS px。 */
  render(renderer: WebGLRenderer, rig: CameraRig, width: number, height: number): void {
    this.syncCamera(rig)

    const x = width - VIEWCUBE_SIZE - VIEWCUBE_MARGIN
    const y = height - VIEWCUBE_SIZE - VIEWCUBE_MARGIN // setViewport 的 y 從底部起算
    renderer.setViewport(x, y, VIEWCUBE_SIZE, VIEWCUBE_SIZE)
    renderer.setScissor(x, y, VIEWCUBE_SIZE, VIEWCUBE_SIZE)
    renderer.setScissorTest(true)
    renderer.clearDepth()
    renderer.render(this.scene, this.camera)
    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, width, height)
  }

  /**
   * 螢幕座標（CSS px，原點左上）點到方塊時回傳要正對的方向（面/邊/角），否則 null。
   */
  pick(xPx: number, yPx: number, width: number): [number, number, number] | null {
    if (!this.contains(xPx, yPx, width)) return null
    const left = width - VIEWCUBE_SIZE - VIEWCUBE_MARGIN
    const top = VIEWCUBE_MARGIN
    const ndc = new Vector2(
      ((xPx - left) / VIEWCUBE_SIZE) * 2 - 1,
      -(((yPx - top) / VIEWCUBE_SIZE) * 2 - 1),
    )
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = this.raycaster.intersectObject(this.cube, false)[0]
    if (!hit) return null
    return cubeDirection([hit.point.x, hit.point.y, hit.point.z])
  }

  private syncCamera(rig: CameraRig): void {
    const dir = rig.direction(new Vector3())
    this.camera.position.copy(dir).multiplyScalar(2.8)
    this.camera.up.set(0, 0, 1)
    this.camera.lookAt(0, 0, 0)
  }
}

function makeFaceTexture(label: string): CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#2a2a2e'
  ctx.fillRect(0, 0, size, size)
  // 邊/角的可點區域用稍亮的底色標出來（點邊＝斜視角、點角＝等角視）
  const band = size * EDGE_BAND
  ctx.fillStyle = '#3a3a41'
  ctx.fillRect(0, 0, size, band)
  ctx.fillRect(0, size - band, size, band)
  ctx.fillRect(0, 0, band, size)
  ctx.fillRect(size - band, 0, band, size)
  ctx.fillStyle = '#4a4a53'
  for (const [x, y] of [[0, 0], [size - band, 0], [0, size - band], [size - band, size - band]]) {
    ctx.fillRect(x, y, band, band)
  }

  ctx.fillStyle = '#e8e8ec'
  ctx.font = `bold 46px -apple-system, "PingFang TC", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, size / 2, size / 2 + 4)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}
