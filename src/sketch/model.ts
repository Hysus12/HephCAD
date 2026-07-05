// 草圖資料模型：平面 + 平面座標系 (u,v) 上的 2D 曲線。
// 純數學、不依賴 three/OCCT，主執行緒與 kernel worker 共用。

export type Vec3Tuple = [number, number, number]

export interface Vec2 {
  x: number
  y: number
}

/** 草圖平面：世界座標的原點與正交基底。 */
export interface SketchPlane {
  origin: Vec3Tuple
  xDir: Vec3Tuple
  yDir: Vec3Tuple
  normal: Vec3Tuple
}

export const GROUND_PLANE: SketchPlane = {
  origin: [0, 0, 0],
  xDir: [1, 0, 0],
  yDir: [0, 1, 0],
  normal: [0, 0, 1],
}

export interface LineCurve {
  id: number
  kind: 'line'
  a: Vec2
  b: Vec2
}

/** 三點圓弧：start → (通過 through) → end，直接對應 OCCT GC_MakeArcOfCircle。 */
export interface ArcCurve {
  id: number
  kind: 'arc'
  start: Vec2
  through: Vec2
  end: Vec2
}

export interface CircleCurve {
  id: number
  kind: 'circle'
  center: Vec2
  radius: number
}

export type SketchCurve = LineCurve | ArcCurve | CircleCurve

export interface Sketch {
  plane: SketchPlane
  curves: SketchCurve[]
}

export function uvToWorld(plane: SketchPlane, p: Vec2): Vec3Tuple {
  return [
    plane.origin[0] + plane.xDir[0] * p.x + plane.yDir[0] * p.y,
    plane.origin[1] + plane.xDir[1] * p.x + plane.yDir[1] * p.y,
    plane.origin[2] + plane.xDir[2] * p.x + plane.yDir[2] * p.y,
  ]
}

/** 世界座標投影到平面 (u,v)（假設點已在平面上或取其投影）。 */
export function worldToUv(plane: SketchPlane, w: Vec3Tuple): Vec2 {
  const dx = w[0] - plane.origin[0]
  const dy = w[1] - plane.origin[1]
  const dz = w[2] - plane.origin[2]
  return {
    x: dx * plane.xDir[0] + dy * plane.xDir[1] + dz * plane.xDir[2],
    y: dx * plane.yDir[0] + dy * plane.yDir[1] + dz * plane.yDir[2],
  }
}

export interface ArcGeometry {
  center: Vec2
  radius: number
  startAngle: number
  endAngle: number
  /** 由 start 沿此方向掃到 end 會經過 through。 */
  ccw: boolean
}

/** 三點求圓弧幾何；共線（或重合）回傳 null。 */
export function arcGeometry(arc: ArcCurve): ArcGeometry | null {
  const { start: a, through: b, end: c } = arc
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-9) return null
  const aa = a.x * a.x + a.y * a.y
  const bb = b.x * b.x + b.y * b.y
  const cc = c.x * c.x + c.y * c.y
  const center: Vec2 = {
    x: (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d,
    y: (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d,
  }
  const radius = Math.hypot(a.x - center.x, a.y - center.y)
  const startAngle = Math.atan2(a.y - center.y, a.x - center.x)
  const endAngle = Math.atan2(c.y - center.y, c.x - center.x)
  // through 的方向決定掃掠方向：外積 (b-a)×(c-a) > 0 為逆時針
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  return { center, radius, startAngle, endAngle, ccw: cross > 0 }
}

/** 曲線離散成折線頂點（渲染用）。圓/弧以每整圈 segments 段取樣。 */
export function discretizeCurve(curve: SketchCurve, segmentsPerCircle = 64): Vec2[] {
  switch (curve.kind) {
    case 'line':
      return [curve.a, curve.b]
    case 'circle': {
      const pts: Vec2[] = []
      for (let i = 0; i <= segmentsPerCircle; i++) {
        const t = (i / segmentsPerCircle) * Math.PI * 2
        pts.push({
          x: curve.center.x + curve.radius * Math.cos(t),
          y: curve.center.y + curve.radius * Math.sin(t),
        })
      }
      return pts
    }
    case 'arc': {
      const geo = arcGeometry(curve)
      if (!geo) return [curve.start, curve.end] // 退化成直線
      let sweep = geo.endAngle - geo.startAngle
      if (geo.ccw && sweep <= 0) sweep += Math.PI * 2
      if (!geo.ccw && sweep >= 0) sweep -= Math.PI * 2
      const n = Math.max(2, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * segmentsPerCircle))
      const pts: Vec2[] = []
      for (let i = 0; i <= n; i++) {
        const t = geo.startAngle + (sweep * i) / n
        pts.push({
          x: geo.center.x + geo.radius * Math.cos(t),
          y: geo.center.y + geo.radius * Math.sin(t),
        })
      }
      return pts
    }
  }
}

/** snapping 候選：端點。 */
export function curveEndpoints(curve: SketchCurve): Vec2[] {
  switch (curve.kind) {
    case 'line':
      return [curve.a, curve.b]
    case 'arc':
      return [curve.start, curve.end]
    case 'circle':
      return []
  }
}

/** snapping 候選：中點（線段）與圓心。 */
export function curveMidAndCenter(curve: SketchCurve): { midpoints: Vec2[]; centers: Vec2[] } {
  switch (curve.kind) {
    case 'line':
      return {
        midpoints: [{ x: (curve.a.x + curve.b.x) / 2, y: (curve.a.y + curve.b.y) / 2 }],
        centers: [],
      }
    case 'arc': {
      const geo = arcGeometry(curve)
      return { midpoints: [curve.through], centers: geo ? [geo.center] : [] }
    }
    case 'circle':
      return { midpoints: [], centers: [curve.center] }
  }
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
