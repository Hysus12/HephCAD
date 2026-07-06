import type { Mesh, Scene } from 'three'
import type { KernelClient } from '../kernel/KernelClient.ts'
import type { MeshData } from '../kernel/protocol.ts'
import type { SketchCurve, SketchPlane, Vec2 } from '../sketch/model.ts'
import { snapPoint, type SnapResult } from '../sketch/snapping.ts'
import { createTool, type SketchTool, type ToolKind } from '../sketch/tools.ts'
import { useAppStore } from '../state/appStore.ts'
import { SketchRenderer } from './SketchRenderer.ts'

/** snap 容差（螢幕 px）。 */
const SNAP_TOLERANCE_PX = 12

let nextSketchId = 1

export interface SketchSessionDeps {
  scene: Scene
  kernel: KernelClient
  invalidate: () => void
  /** 世界單位 / 螢幕 px（隨縮放變動，每次取用）。 */
  worldPerPixel: () => number
}

/** 完成草圖後留下的可擠出區域。 */
export interface CommittedRegion {
  regionId: number
  meshData: MeshData
  /** 場景中的 fill mesh，grab 命中測試與消耗移除用。 */
  object: Mesh
}

export interface CommittedSketch {
  sketchId: number
  plane: SketchPlane
  hostBodyId: number | null
  regions: CommittedRegion[]
  /** 擠出消耗一個區域後呼叫。 */
  consumeRegion: (regionId: number) => void
}

/**
 * 一次草圖編輯的完整狀態：曲線、工具、渲染、與 kernel 的區域偵測往返。
 * 筆劃事件已由 Viewport 轉成平面 uv 座標。
 */
export class SketchSession {
  readonly sketchId = nextSketchId++
  readonly plane: SketchPlane
  readonly hostBodyId: number | null
  private readonly renderer: SketchRenderer
  private readonly curves: SketchCurve[] = []
  private tool: SketchTool = createTool('line')
  private nextCurveId = 1
  private lastSnap: SnapResult | null = null
  /** 區域偵測的世代標記，丟棄過期的回應。 */
  private regionEpoch = 0
  private lastRegions: MeshData[] = []

  constructor(
    plane: SketchPlane,
    hostBodyId: number | null,
    private readonly deps: SketchSessionDeps,
  ) {
    this.plane = plane
    this.hostBodyId = hostBodyId
    this.renderer = new SketchRenderer(deps.scene, plane)
  }

  setTool(kind: ToolKind): void {
    this.tool.cancel()
    this.tool = createTool(kind)
    this.renderer.setPreview([], null, this.deps.worldPerPixel())
    this.deps.invalidate()
  }

  strokeStart(uv: Vec2): void {
    const snap = this.snap(uv)
    this.applyUpdate(this.tool.strokeStart(snap.point), snap)
  }

  strokeMove(uv: Vec2): void {
    const snap = this.snap(uv)
    this.applyUpdate(this.tool.strokeMove(snap.point), snap)
  }

  strokeEnd(uv: Vec2): void {
    const snap = this.snap(uv)
    this.applyUpdate(this.tool.strokeEnd(snap.point), null)
  }

  strokeCancel(): void {
    this.applyUpdate(this.tool.cancel(), null)
  }

  /**
   * commit=true：保留曲線與區域渲染，回傳可擠出的區域清單
   * （kernel 內的 region faces 已就位）。
   */
  async finish(commit: boolean): Promise<CommittedSketch | null> {
    this.tool.cancel()
    this.renderer.dispose(commit)
    if (!commit) {
      await this.deps.kernel.clearSketch(this.sketchId)
      this.deps.invalidate()
      return null
    }
    this.deps.invalidate()

    const meshes = this.renderer.regionMeshes()
    const regions: CommittedRegion[] = this.lastRegions.map((meshData, i) => ({
      regionId: i + 1,
      meshData,
      object: meshes[i],
    }))
    if (regions.length === 0) return null
    return {
      sketchId: this.sketchId,
      plane: this.plane,
      hostBodyId: this.hostBodyId,
      regions,
      consumeRegion: (regionId) => {
        const region = regions.find((r) => r.regionId === regionId)
        if (region) this.renderer.removeRegionMesh(region.object)
      },
    }
  }

  curveCount(): number {
    return this.curves.length
  }

  private snap(raw: Vec2): SnapResult {
    const result = snapPoint(raw, {
      curves: this.curves,
      tolerance: SNAP_TOLERANCE_PX * this.deps.worldPerPixel(),
      gridSpacing: useAppStore.getState().snapEnabled
        ? useAppStore.getState().gridSpacingMm
        : null,
      axisAnchor: this.tool.axisAnchor(),
    })
    this.lastSnap = result
    return result
  }

  private applyUpdate(
    update: { preview: SketchCurve[]; commit: SketchCurve[] },
    snap: SnapResult | null,
  ): void {
    if (update.commit.length > 0) {
      for (const c of update.commit) {
        this.curves.push({ ...c, id: this.nextCurveId++ } as SketchCurve)
      }
      this.renderer.setCurves(this.curves)
      void this.refreshRegions()
    }
    this.renderer.setPreview(update.preview, snap ?? this.lastSnap, this.deps.worldPerPixel())
    this.deps.invalidate()
  }

  private async refreshRegions(): Promise<void> {
    const epoch = ++this.regionEpoch
    try {
      const result = await this.deps.kernel.sketchRegions(
        this.sketchId,
        this.plane,
        this.curves,
      )
      if (epoch !== this.regionEpoch) return // 已有更新的偵測在跑
      this.lastRegions = result.regions.map((r) => r.mesh)
      this.renderer.setRegions(this.lastRegions)
      useAppStore.getState().setSketchRegionCount(result.regions.length)
      this.deps.invalidate()
    } catch (e) {
      console.warn('[sketch] 區域偵測失敗：', e)
    }
  }
}
