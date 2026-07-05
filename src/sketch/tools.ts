// 繪圖工具狀態機。輸入是已 snap 過的筆劃事件（uv 座標），
// 輸出 preview 曲線與 commit 曲線。純邏輯、可單元測試。

import type { ArcCurve, SketchCurve, Vec2 } from './model.ts'
import { distance } from './model.ts'

export type ToolKind = 'line' | 'rect' | 'circle' | 'arc'

export interface StrokeUpdate {
  /** 進行中的預覽曲線（每次事件全量重建）。 */
  preview: SketchCurve[]
  /** 本次事件確定提交的曲線（id 由呼叫端填）。 */
  commit: SketchCurve[]
}

export interface SketchTool {
  readonly kind: ToolKind
  /** 筆劃起點要用哪個錨點做水平/垂直對齊（null = 不對齊）。 */
  axisAnchor(): Vec2 | null
  strokeStart(p: Vec2): StrokeUpdate
  strokeMove(p: Vec2): StrokeUpdate
  strokeEnd(p: Vec2): StrokeUpdate
  /** 手勢被打斷（如第二指加入）。 */
  cancel(): StrokeUpdate
}

/** 小於此長度（世界單位）的筆劃視為誤觸，不提交。 */
const MIN_STROKE = 0.5

const EMPTY: StrokeUpdate = { preview: [], commit: [] }

/** Omit 不會對 union 分配，手動 distribute。 */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never

function curve(c: WithoutId<SketchCurve>): SketchCurve {
  return { ...c, id: 0 } as SketchCurve
}

export class LineTool implements SketchTool {
  readonly kind = 'line'
  private start: Vec2 | null = null
  private current: Vec2 | null = null

  axisAnchor(): Vec2 | null {
    return this.start
  }

  strokeStart(p: Vec2): StrokeUpdate {
    this.start = p
    this.current = p
    return EMPTY
  }

  strokeMove(p: Vec2): StrokeUpdate {
    if (!this.start) return EMPTY
    this.current = p
    return { preview: [this.previewLine()], commit: [] }
  }

  strokeEnd(p: Vec2): StrokeUpdate {
    if (!this.start) return EMPTY
    const start = this.start
    this.start = null
    this.current = null
    if (distance(start, p) < MIN_STROKE) return EMPTY
    return { preview: [], commit: [curve({ kind: 'line', a: start, b: p })] }
  }

  cancel(): StrokeUpdate {
    this.start = null
    this.current = null
    return EMPTY
  }

  private previewLine(): SketchCurve {
    return curve({ kind: 'line', a: this.start!, b: this.current! })
  }
}

export class RectTool implements SketchTool {
  readonly kind = 'rect'
  private corner: Vec2 | null = null

  axisAnchor(): Vec2 | null {
    return null // 矩形本身就是正交的，不需要軸對齊
  }

  strokeStart(p: Vec2): StrokeUpdate {
    this.corner = p
    return EMPTY
  }

  strokeMove(p: Vec2): StrokeUpdate {
    if (!this.corner) return EMPTY
    return { preview: rectLines(this.corner, p), commit: [] }
  }

  strokeEnd(p: Vec2): StrokeUpdate {
    if (!this.corner) return EMPTY
    const corner = this.corner
    this.corner = null
    if (Math.abs(p.x - corner.x) < MIN_STROKE || Math.abs(p.y - corner.y) < MIN_STROKE) {
      return EMPTY
    }
    return { preview: [], commit: rectLines(corner, p) }
  }

  cancel(): StrokeUpdate {
    this.corner = null
    return EMPTY
  }
}

function rectLines(a: Vec2, b: Vec2): SketchCurve[] {
  const p1 = a
  const p2 = { x: b.x, y: a.y }
  const p3 = b
  const p4 = { x: a.x, y: b.y }
  return [
    curve({ kind: 'line', a: p1, b: p2 }),
    curve({ kind: 'line', a: p2, b: p3 }),
    curve({ kind: 'line', a: p3, b: p4 }),
    curve({ kind: 'line', a: p4, b: p1 }),
  ]
}

export class CircleTool implements SketchTool {
  readonly kind = 'circle'
  private center: Vec2 | null = null

  axisAnchor(): Vec2 | null {
    return null
  }

  strokeStart(p: Vec2): StrokeUpdate {
    this.center = p
    return EMPTY
  }

  strokeMove(p: Vec2): StrokeUpdate {
    if (!this.center) return EMPTY
    return {
      preview: [curve({ kind: 'circle', center: this.center, radius: distance(this.center, p) })],
      commit: [],
    }
  }

  strokeEnd(p: Vec2): StrokeUpdate {
    if (!this.center) return EMPTY
    const center = this.center
    this.center = null
    const radius = distance(center, p)
    if (radius < MIN_STROKE) return EMPTY
    return { preview: [], commit: [curve({ kind: 'circle', center, radius })] }
  }

  cancel(): StrokeUpdate {
    this.center = null
    return EMPTY
  }
}

/**
 * 圓弧：兩段筆劃。第一劃拉出弦（start→end），第二劃調整弧的鼓起
 * （through 跟著手指），放開即提交。
 */
export class ArcTool implements SketchTool {
  readonly kind = 'arc'
  private phase: 'chord' | 'bulge' = 'chord'
  private chordStart: Vec2 | null = null
  private chordEnd: Vec2 | null = null
  private through: Vec2 | null = null

  axisAnchor(): Vec2 | null {
    return this.phase === 'chord' ? this.chordStart : null
  }

  strokeStart(p: Vec2): StrokeUpdate {
    if (this.phase === 'chord') {
      this.chordStart = p
      this.chordEnd = p
      return EMPTY
    }
    this.through = p
    return { preview: this.previewArc(), commit: [] }
  }

  strokeMove(p: Vec2): StrokeUpdate {
    if (this.phase === 'chord') {
      if (!this.chordStart) return EMPTY
      this.chordEnd = p
      return {
        preview: [curve({ kind: 'line', a: this.chordStart, b: p })],
        commit: [],
      }
    }
    this.through = p
    return { preview: this.previewArc(), commit: [] }
  }

  strokeEnd(p: Vec2): StrokeUpdate {
    if (this.phase === 'chord') {
      if (!this.chordStart) return EMPTY
      if (distance(this.chordStart, p) < MIN_STROKE) {
        this.chordStart = null
        this.chordEnd = null
        return EMPTY
      }
      this.chordEnd = p
      this.phase = 'bulge'
      // 弦保持顯示，等第二劃
      return {
        preview: [curve({ kind: 'line', a: this.chordStart, b: this.chordEnd })],
        commit: [],
      }
    }

    this.through = p
    const arc = this.buildArc()
    this.reset()
    return arc ? { preview: [], commit: [arc] } : EMPTY
  }

  cancel(): StrokeUpdate {
    // 第二劃被打斷時保留弦，讓使用者能重試鼓起
    if (this.phase === 'bulge' && this.chordStart && this.chordEnd) {
      this.through = null
      return {
        preview: [curve({ kind: 'line', a: this.chordStart, b: this.chordEnd })],
        commit: [],
      }
    }
    this.reset()
    return EMPTY
  }

  private previewArc(): SketchCurve[] {
    const arc = this.buildArc()
    if (arc) return [arc]
    if (this.chordStart && this.chordEnd) {
      return [curve({ kind: 'line', a: this.chordStart, b: this.chordEnd })]
    }
    return []
  }

  private buildArc(): ArcCurve | null {
    if (!this.chordStart || !this.chordEnd || !this.through) return null
    // through 太貼近弦會退化成直線
    const chordLen = distance(this.chordStart, this.chordEnd)
    if (chordLen < MIN_STROKE) return null
    return {
      id: 0,
      kind: 'arc',
      start: this.chordStart,
      through: this.through,
      end: this.chordEnd,
    }
  }

  private reset(): void {
    this.phase = 'chord'
    this.chordStart = null
    this.chordEnd = null
    this.through = null
  }
}

export function createTool(kind: ToolKind): SketchTool {
  switch (kind) {
    case 'line':
      return new LineTool()
    case 'rect':
      return new RectTool()
    case 'circle':
      return new CircleTool()
    case 'arc':
      return new ArcTool()
  }
}
