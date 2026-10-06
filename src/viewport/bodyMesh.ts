import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  type Plane,
  Vector2,
} from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import type { MeshData, TopoGroup } from '../kernel/protocol.ts'

// Shapr3D 風格的中性灰實體 + 深色輪廓線。
const BODY_COLOR = 0x9a9aa0
const EDGE_COLOR = 0x0c0c0f

/**
 * 所有 body 材質共用的剖切面陣列（同一個 array 實例，
 * Viewport 靠增刪內容切換剖面，材質不需重建）。
 */
export const sharedClippingPlanes: Plane[] = []

/** 粗線（LineMaterial）共用的畫面尺寸；Viewport 在縮放時更新。 */
export const lineResolution = new Vector2(1, 1)

/** 模型邊線粗細（CSS px）：Shapr3D 風格的明顯深色輪廓。 */
export const EDGE_WIDTH_PX = 3

/** 粗線：WebGL 原生線寬只有 1px，要用 LineSegments2。positions＝成對頂點的 xyz。 */
export function createThickLines(
  positions: ArrayLike<number>,
  color: number,
  widthPx: number,
  overlay = false,
): LineSegments2 {
  const geometry = new LineSegmentsGeometry()
  geometry.setPositions(Array.from(positions))
  const material = new LineMaterial({
    color,
    linewidth: widthPx,
    toneMapped: false,
    clippingPlanes: sharedClippingPlanes,
    depthTest: !overlay,
  })
  material.uniforms.resolution.value = lineResolution
  return new LineSegments2(geometry, material)
}

export interface BodyObject {
  bodyId: number
  group: Group
  surface: Mesh
  /** 不可見、只給射線拾取用的細線（粗線沒有可靠的 index 回報）。 */
  edges: LineSegments
  /** 實際畫出來的粗輪廓線。 */
  edgeLines: LineSegments2
  faceGroups: TopoGroup[]
  edgeGroups: TopoGroup[]
}

/** 把 kernel 回傳的 MeshData 組成 three 物件（實體面 + 邊線）。 */
export function buildBodyObject(bodyId: number, mesh: MeshData): BodyObject {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3))
  geometry.setIndex(new BufferAttribute(mesh.indices, 1))

  const surface = new Mesh(
    geometry,
    new MeshStandardMaterial({
      color: BODY_COLOR,
      metalness: 0.1,
      roughness: 0.75,
      clippingPlanes: sharedClippingPlanes,
      clipShadows: true,
      side: 2, // DoubleSide：剖切後看得到內壁
    }),
  )

  const edgeGeometry = new BufferGeometry()
  edgeGeometry.setAttribute('position', new BufferAttribute(mesh.edgePositions, 3))
  const edges = new LineSegments(
    edgeGeometry,
    new LineBasicMaterial({
      color: EDGE_COLOR,
      toneMapped: false,
      clippingPlanes: sharedClippingPlanes,
      visible: false,
    }),
  )
  const edgeLines = createThickLines(mesh.edgePositions, EDGE_COLOR, EDGE_WIDTH_PX)

  const group = new Group()
  group.name = `body-${bodyId}`
  group.add(surface, edges, edgeLines)

  return {
    bodyId,
    group,
    surface,
    edges,
    edgeLines,
    faceGroups: mesh.faceGroups,
    edgeGroups: mesh.edgeGroups,
  }
}

/** 顏色與透明度：半透明時不寫深度，才看得到裡面的本體。 */
export function applyBodyMaterial(body: BodyObject, material: { color: string; opacity: number }): void {
  const surface = body.surface.material as MeshStandardMaterial
  surface.color.set(material.color)
  surface.opacity = material.opacity
  const transparent = material.opacity < 0.999
  if (surface.transparent !== transparent) surface.needsUpdate = true
  surface.transparent = transparent
  surface.depthWrite = !transparent
}

export function disposeBodyObject(body: BodyObject): void {
  body.group.traverse((obj) => {
    if (obj instanceof Mesh || obj instanceof LineSegments) {
      obj.geometry.dispose()
      const material = obj.material
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material.dispose()
    }
  })
  body.group.removeFromParent()
}
