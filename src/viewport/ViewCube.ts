import {
  BoxGeometry,
  CanvasTexture,
  EdgesGeometry,
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
import type { ViewOrientation } from './viewOrientations.ts'

/** 螢幕右上角的視角方塊（CSS px）。 */
export const VIEWCUBE_SIZE = 96
export const VIEWCUBE_MARGIN = 10

// BoxGeometry 材質順序：+x, -x, +y, -y, +z, -z
const FACE_LABELS = ['右', '左', '後', '前', '頂', '底'] as const
const FACE_ORIENTATIONS: readonly ViewOrientation[] = [
  'right',
  'left',
  'back',
  'front',
  'top',
  'bottom',
]

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
   * 螢幕座標（CSS px，原點左上）落在方塊上時回傳對應視角，否則 null。
   */
  pick(xPx: number, yPx: number, width: number): ViewOrientation | null {
    const left = width - VIEWCUBE_SIZE - VIEWCUBE_MARGIN
    const top = VIEWCUBE_MARGIN
    if (xPx < left || xPx > left + VIEWCUBE_SIZE || yPx < top || yPx > top + VIEWCUBE_SIZE) {
      return null
    }
    const ndc = new Vector2(
      ((xPx - left) / VIEWCUBE_SIZE) * 2 - 1,
      -(((yPx - top) / VIEWCUBE_SIZE) * 2 - 1),
    )
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = this.raycaster.intersectObject(this.cube, false)[0]
    if (!hit || hit.faceIndex === undefined || hit.faceIndex === null) return null
    const materialIndex = Math.floor(hit.faceIndex / 2)
    return FACE_ORIENTATIONS[materialIndex] ?? null
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
  ctx.strokeStyle = '#3a3a40'
  ctx.lineWidth = 4
  ctx.strokeRect(2, 2, size - 4, size - 4)

  ctx.fillStyle = '#e8e8ec'
  ctx.font = `bold 56px -apple-system, "PingFang TC", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, size / 2, size / 2 + 4)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}
