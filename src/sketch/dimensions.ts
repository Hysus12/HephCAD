// 繪圖中的即時尺寸與「點尺寸輸入精確值」。純函式，可測試。

import { arcGeometry, distance, type SketchCurve, type Vec2 } from './model.ts'
import type { ToolKind } from './tools.ts'

export interface CurveDimension {
  text: string
  /** 可編輯時代表的數值（直線長度、圓半徑）。 */
  value: number
  editable: boolean
  /** 標籤錨點（平面 uv）。 */
  anchor: Vec2
}

export function formatMm(value: number): string {
  return `${value.toFixed(1)} mm`
}

/** 預覽/剛完成的曲線要顯示的尺寸。矩形顯示寬×高（v1 不提供編輯）。 */
export function describeCurves(curves: SketchCurve[], tool: ToolKind): CurveDimension | null {
  if (curves.length === 0) return null
  if (tool === 'rect' && curves.length === 4 && curves.every((c) => c.kind === 'line')) {
    const [bottom, right] = curves as Extract<SketchCurve, { kind: 'line' }>[]
    const w = distance(bottom.a, bottom.b)
    const h = distance(right.a, right.b)
    return { text: `${w.toFixed(1)} × ${h.toFixed(1)} mm`, value: w, editable: false, anchor: right.b }
  }
  const c = curves[curves.length - 1]
  switch (c.kind) {
    case 'line': {
      const len = distance(c.a, c.b)
      return { text: formatMm(len), value: len, editable: true, anchor: c.b }
    }
    case 'circle':
      return {
        text: `R ${formatMm(c.radius)}`,
        value: c.radius,
        editable: true,
        anchor: { x: c.center.x + c.radius, y: c.center.y },
      }
    case 'arc': {
      const geo = arcGeometry(c)
      if (!geo) return { text: formatMm(distance(c.start, c.end)), value: 0, editable: false, anchor: c.end }
      return { text: `R ${formatMm(geo.radius)}`, value: geo.radius, editable: false, anchor: c.through }
    }
  }
}

/** 依輸入的數值改曲線：直線保持起點與方向改長度、圓保持圓心改半徑。 */
export function resizeCurve(curve: SketchCurve, value: number): SketchCurve | null {
  if (!(value > 0)) return null
  switch (curve.kind) {
    case 'line': {
      const len = distance(curve.a, curve.b)
      if (len < 1e-9) return null
      const k = value / len
      return {
        ...curve,
        b: { x: curve.a.x + (curve.b.x - curve.a.x) * k, y: curve.a.y + (curve.b.y - curve.a.y) * k },
      }
    }
    case 'circle':
      return { ...curve, radius: value }
    case 'arc':
      return null
  }
}
