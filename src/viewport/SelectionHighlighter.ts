import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Scene,
} from 'three'
import type { SelectionItem } from '../state/appStore.ts'
import type { BodyObject } from './bodyMesh.ts'

const FACE_COLOR = 0x4a8df0
const EDGE_COLOR = 0x7ab4ff

/**
 * 把選取項渲染成 overlay：face/body 用共享 position 的半透明 Mesh，
 * edge 用 drawRange 的 LineSegments。與本體幾何零拷貝（position 共享）。
 */
export class SelectionHighlighter {
  private readonly overlays = new Group()

  constructor(scene: Scene) {
    this.overlays.name = 'selection-overlays'
    scene.add(this.overlays)
  }

  /** 重新套用整組選取（selection 量小，全清重建最簡單也夠快）。 */
  apply(selection: SelectionItem[], bodies: Map<number, BodyObject>): void {
    this.clear()
    for (const item of selection) {
      const body = bodies.get(item.bodyId)
      if (!body || !body.group.visible) continue

      if (item.kind === 'face' || item.kind === 'body') {
        this.addFaceOverlay(body, item)
      } else {
        this.addEdgeOverlay(body, item)
      }
    }
  }

  clear(): void {
    for (const child of [...this.overlays.children]) {
      const obj = child as Mesh | LineSegments
      // position attribute 與本體共享，dispose geometry 只釋放 overlay 自己的 index
      obj.geometry.dispose()
      const material = obj.material as { dispose(): void }
      material.dispose()
      obj.removeFromParent()
    }
  }

  private addFaceOverlay(body: BodyObject, item: SelectionItem): void {
    const sourceIndex = body.surface.geometry.getIndex()
    if (!sourceIndex) return
    let indexArray = sourceIndex.array as Uint32Array
    if (item.kind === 'face') {
      const g = body.faceGroups.find((fg) => fg.topoId === item.topoId)
      if (!g) return
      indexArray = indexArray.slice(g.start, g.start + g.count)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', body.surface.geometry.getAttribute('position'))
    geometry.setIndex(new BufferAttribute(indexArray, 1))
    const overlay = new Mesh(
      geometry,
      new MeshBasicMaterial({
        color: FACE_COLOR,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    )
    overlay.renderOrder = 10
    this.overlays.add(overlay)
  }

  private addEdgeOverlay(body: BodyObject, item: SelectionItem): void {
    const g = body.edgeGroups.find((eg) => eg.topoId === item.topoId)
    if (!g) return
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', body.edges.geometry.getAttribute('position'))
    geometry.setDrawRange(g.start, g.count)
    const overlay = new LineSegments(
      geometry,
      new LineBasicMaterial({ color: EDGE_COLOR, toneMapped: false, depthTest: false }),
    )
    overlay.renderOrder = 11
    this.overlays.add(overlay)
  }
}
