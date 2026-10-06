// 文件 = 線性操作日誌（journal）。每個 op 自包含重放所需的全部參數；
// bodyId 在首次執行時由 kernel 指派並記回 op，重放時強制沿用，
// 讓後續 op 的 hostBodyId 引用永遠有效（ADR 0002/0003）。

import type { SketchCurve, SketchPlane } from '../sketch/model.ts'
import type { ToolKind } from '../sketch/tools.ts'

export type Translation = [number, number, number]

/** 繞「通過 center、方向 axis（單位向量）」的軸旋轉 angleDeg 度（右手定則）。 */
export interface Rotation {
  axis: [number, number, number]
  center: [number, number, number]
  angleDeg: number
}

/** 擠出的布林徽章（Shapr3D）：聯集 / 新本體 / 減去 / 交集。未指定＝自動（有宿主時依方向聯集或減去，否則新本體）。 */
export type BoolMode = 'union' | 'new' | 'subtract' | 'intersect'

export const BOOL_LABELS: Record<BoolMode, string> = {
  union: '聯集',
  new: '新本體',
  subtract: '減去',
  intersect: '交集',
}

export type JournalOp =
  | {
      kind: 'createBox'
      /** 0 = 待 kernel 指派。 */
      bodyId: number
      name: string
      dx: number
      dy: number
      dz: number
      at?: Translation
    }
  | {
      kind: 'createCylinder'
      bodyId: number
      name: string
      radius: number
      height: number
      at?: Translation
    }
  | { kind: 'deleteBody'; bodyId: number }
  | {
      kind: 'extrude'
      plane: SketchPlane
      curves: SketchCurve[]
      /** 區域偵測結果中的索引（0-based），同輸入下順序確定。 */
      regionIndex: number
      height: number
      /** 有宿主：>0 fuse、<0 cut；null = 建獨立新 body。 */
      hostBodyId: number | null
      /** 獨立新 body 的 id（有宿主時為 null）。 */
      newBodyId: number | null
      name: string | null
      /** 來源草圖與區域識別（用來把已擠出的區域從草圖上隱藏；舊文件沒有）。 */
      sketchId?: number
      regionKey?: string
      /** 布林模式；未指定＝自動。 */
      boolMode?: BoolMode
      /**
       * 被布林運算的本體（首次執行時由 kernel 決定並寫回，重放時沿用）。
       * 有宿主＝[宿主]；沒有宿主＝與擠出體重疊的所有本體。
       */
      targetBodyIds?: number[]
    }
  | {
      /**
       * 獨立布林：targetId 是保留身分的那一個（先選的），toolIds 是被併入/減去/相交的。
       * keepOriginals：結果成為新本體（resultBodyId），原本體全部保留；否則結果取代 target、tool 被移除。
       */
      kind: 'boolean'
      mode: Exclude<BoolMode, 'new'>
      targetId: number
      toolIds: number[]
      keepOriginals: boolean
      /** 0 = 待 kernel 指派（keepOriginals 時才使用）。 */
      resultBodyId: number
      name: string
    }
  | {
      /**
       * 草圖是文件實體：每一筆畫線/刪線都是一個 op，所以能逐筆 undo、
       * 重開檔仍在。kernel 不需要它（擠出 op 自帶曲線），只由主執行緒推導。
       */
      kind: 'sketch'
      sketchId: number
      plane: SketchPlane
      hostBodyId: number | null
      add: SketchCurve[]
      remove: number[]
      /** 歷程標籤用。 */
      tool?: ToolKind
    }
  | {
      /** 直接建模：把 body 的平面沿法線推（<0）或拉（>0）。 */
      kind: 'pushPull'
      bodyId: number
      faceId: number
      distance: number
    }
  | {
      /**
       * 陣列（Shapr3D 的 Transform > Pattern）：count 是總數（含原本體），
       * 產生 count-1 個副本，連同原本體自動放進一個資料夾。
       */
      kind: 'pattern'
      sourceBodyId: number
      count: number
      mode: 'linear' | 'circular'
      /** 線性：單位方向與「相鄰兩個之間」的間距（mm，可為負）。 */
      direction?: [number, number, number]
      spacing?: number
      /** 圓形：旋轉軸、圓心、總角度（度）；|總角度| ≥ 360 視為整圈（等分 360/count）。 */
      axis?: [number, number, number]
      center?: [number, number, number]
      totalAngleDeg?: number
      /** 副本的 bodyId（首次執行由 kernel 指派並寫回；重放沿用）。 */
      resultBodyIds: number[]
      name: string
      folderId: number
    }
  | {
      /**
       * 項目管理的資料夾（純文件層，kernel 不需要）：
       * create 帶初始成員；move 把本體移入 folderId（null＝移回最上層）；delete 解散資料夾。
       */
      kind: 'folder'
      action: 'create' | 'rename' | 'move' | 'delete'
      folderId: number | null
      name?: string
      bodyIds?: number[]
    }
  | {
      /** 外觀（純文件層）：顏色 '#rrggbb' 與不透明度 0.05–1；沒給的欄位維持原樣。 */
      kind: 'material'
      bodyIds: number[]
      color?: string
      opacity?: number
    }
  | { kind: 'importStep'; bodyId: number; name: string; data: string }
  | { kind: 'transform'; bodyId: number; translation: Translation; rotation?: Rotation }
  | {
      kind: 'copyBody'
      sourceBodyId: number
      bodyId: number
      name: string
      translation: Translation
      rotation?: Rotation
    }
  | {
      kind: 'fillet'
      bodyId: number
      /** 該 body 當下的 edge 拓撲索引（journal 位置決定其有效性）。 */
      edgeIds: number[]
      /** 圓角半徑 / 倒角距離（mm，恆為正）。圓角與倒角由 chamfer 旗標區分。 */
      radius: number
      chamfer: boolean
      /**
       * 倒角角度（度）：斜面與「參考面」（相鄰兩面中面積較大者）的夾角，
       * 距離沿參考面量測。未指定 = 45°（兩側等距）。Shapr3D 沒有此參數，是 HephCAD 的擴充。
       */
      angleDeg?: number
    }
  | { kind: 'shell'; bodyId: number; faceIds: number[]; thickness: number }

export interface JournalEntry {
  label: string
  op: JournalOp
}

/** 存進 OPFS 的文件格式。 */
export interface DocumentFile {
  version: 1
  entries: JournalEntry[]
  cursor: number
}

export function opLabel(op: JournalOp, nameOf: (bodyId: number) => string): string {
  switch (op.kind) {
    case 'createBox':
      return `建立 ${op.name}`
    case 'createCylinder':
      return `建立 ${op.name}`
    case 'deleteBody':
      return `刪除 ${nameOf(op.bodyId)}`
    case 'extrude': {
      const mm = Math.abs(op.height).toFixed(1)
      if (op.boolMode) return `擠出（${BOOL_LABELS[op.boolMode]}）${mm}mm`
      if (op.hostBodyId === null) return `擠出 ${mm}mm`
      return op.height >= 0 ? `擠出加料 ${op.height.toFixed(1)}mm` : `擠出切除 ${mm}mm`
    }
    case 'importStep':
      return `匯入 "${op.name}"`
    case 'transform':
      return `${motionLabel(op.translation, op.rotation)} ${nameOf(op.bodyId)}`
    case 'copyBody':
      return `複製 ${nameOf(op.sourceBodyId)}${
        op.rotation || op.translation.some((v) => Math.abs(v) > 1e-9)
          ? `（${motionLabel(op.translation, op.rotation)}）`
          : ''
      }`
    case 'fillet':
      if (!op.chamfer) return `圓角 ${op.radius.toFixed(1)}mm`
      return op.angleDeg !== undefined && Math.abs(op.angleDeg - 45) > 1e-6
        ? `倒角 ${op.radius.toFixed(1)}mm ∠${op.angleDeg.toFixed(0)}°`
        : `倒角 ${op.radius.toFixed(1)}mm`
    case 'shell':
      return `抽殼 ${op.thickness.toFixed(1)}mm`
    case 'sketch': {
      if (op.add.length === 0) return `刪除草圖線 ×${op.remove.length}`
      if (op.remove.length > 0) return `修改草圖尺寸`
      const names: Record<ToolKind, string> = {
        line: '直線',
        arc: '圓弧',
        rect: '矩形',
        circle: '圓',
      }
      return `草圖：${op.tool ? names[op.tool] : `${op.add.length} 條線`}`
    }
    case 'pushPull':
      return `推拉面 ${op.distance >= 0 ? '+' : ''}${op.distance.toFixed(1)}mm`
    case 'boolean':
      return `${BOOL_LABELS[op.mode]} ${nameOf(op.targetId)}`
    case 'pattern':
      return `${op.mode === 'linear' ? '線性' : '圓形'}陣列 ×${op.count}`
    case 'material':
      return op.opacity !== undefined && op.color === undefined
        ? `透明度 ${Math.round(op.opacity * 100)}%`
        : '外觀'
    case 'folder':
      return op.action === 'create'
        ? `新增資料夾 ${op.name ?? ''}`.trim()
        : op.action === 'rename'
          ? `資料夾改名 ${op.name ?? ''}`.trim()
          : op.action === 'move'
            ? op.folderId === null
              ? '移出資料夾'
              : '移入資料夾'
            : '解散資料夾'
  }
}

function motionLabel(translation: Translation, rotation?: Rotation): string {
  const moved = translation.some((v) => Math.abs(v) > 1e-9)
  if (rotation && moved) return '移動並旋轉'
  if (rotation) return `旋轉 ${rotation.angleDeg.toFixed(1)}°`
  return '移動'
}

/** 重放 ops 後每個存活 body 的名稱。 */
export function aliveBodyNames(ops: JournalOp[]): Map<number, string> {
  const names = new Map<number, string>()
  for (const op of ops) {
    switch (op.kind) {
      case 'createBox':
      case 'createCylinder':
      case 'importStep':
        names.set(op.bodyId, op.name)
        break
      case 'deleteBody':
        names.delete(op.bodyId)
        break
      case 'extrude':
        if (op.newBodyId !== null && op.newBodyId > 0) {
          names.set(op.newBodyId, op.name ?? `主體 ${op.newBodyId}`)
        }
        // 聯集到多個本體時，第一個保留、其餘被併掉
        if (op.boolMode === 'union') {
          for (const id of (op.targetBodyIds ?? []).slice(1)) names.delete(id)
        }
        break
      case 'folder':
      case 'material':
        break
      case 'pattern':
        op.resultBodyIds.forEach((id, i) => names.set(id, `${op.name} ${i + 2}`))
        break
      case 'boolean':
        if (op.keepOriginals) {
          if (op.resultBodyId > 0) names.set(op.resultBodyId, op.name)
        } else {
          for (const id of op.toolIds) names.delete(id)
        }
        break
      case 'copyBody':
        names.set(op.bodyId, op.name)
        break
      case 'transform':
      case 'fillet':
      case 'shell':
      case 'sketch':
      case 'pushPull':
        break
    }
  }
  return names
}
