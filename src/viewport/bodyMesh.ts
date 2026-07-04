import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
} from 'three'
import type { MeshData, TopoGroup } from '../kernel/protocol.ts'

// Shapr3D 風格的中性灰實體 + 深色輪廓線。
const BODY_COLOR = 0x9a9aa0
const EDGE_COLOR = 0x2a2a2e

export interface BodyObject {
  bodyId: number
  group: Group
  surface: Mesh
  edges: LineSegments
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
    }),
  )

  const edgeGeometry = new BufferGeometry()
  edgeGeometry.setAttribute('position', new BufferAttribute(mesh.edgePositions, 3))
  const edges = new LineSegments(
    edgeGeometry,
    new LineBasicMaterial({ color: EDGE_COLOR, toneMapped: false }),
  )

  const group = new Group()
  group.name = `body-${bodyId}`
  group.add(surface, edges)

  return {
    bodyId,
    group,
    surface,
    edges,
    faceGroups: mesh.faceGroups,
    edgeGroups: mesh.edgeGroups,
  }
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
