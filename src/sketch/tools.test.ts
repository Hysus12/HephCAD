import { describe, expect, it } from 'vitest'
import { ArcTool, CircleTool, LineTool, RectTool } from './tools.ts'
import type { ArcCurve, LineCurve } from './model.ts'

describe('LineTool', () => {
  it('拖曳提交一條線', () => {
    const tool = new LineTool()
    tool.strokeStart({ x: 0, y: 0 })
    tool.strokeMove({ x: 5, y: 5 })
    const end = tool.strokeEnd({ x: 10, y: 10 })
    expect(end.commit).toHaveLength(1)
    const line = end.commit[0] as LineCurve
    expect(line.kind).toBe('line')
    expect(line.b).toEqual({ x: 10, y: 10 })
  })

  it('太短視為誤觸', () => {
    const tool = new LineTool()
    tool.strokeStart({ x: 0, y: 0 })
    expect(tool.strokeEnd({ x: 0.1, y: 0 }).commit).toHaveLength(0)
  })

  it('axisAnchor 是筆劃起點', () => {
    const tool = new LineTool()
    expect(tool.axisAnchor()).toBeNull()
    tool.strokeStart({ x: 3, y: 4 })
    expect(tool.axisAnchor()).toEqual({ x: 3, y: 4 })
  })
})

describe('RectTool', () => {
  it('對角拖曳提交四條線且閉合', () => {
    const tool = new RectTool()
    tool.strokeStart({ x: 0, y: 0 })
    const end = tool.strokeEnd({ x: 10, y: 6 })
    expect(end.commit).toHaveLength(4)
    const lines = end.commit as LineCurve[]
    // 首尾相接
    expect(lines[3].b).toEqual(lines[0].a)
    expect(lines[0].b).toEqual(lines[1].a)
  })

  it('寬或高為零不提交', () => {
    const tool = new RectTool()
    tool.strokeStart({ x: 0, y: 0 })
    expect(tool.strokeEnd({ x: 10, y: 0.1 }).commit).toHaveLength(0)
  })
})

describe('CircleTool', () => {
  it('圓心拖到半徑', () => {
    const tool = new CircleTool()
    tool.strokeStart({ x: 5, y: 5 })
    const end = tool.strokeEnd({ x: 8, y: 9 })
    expect(end.commit).toHaveLength(1)
    expect(end.commit[0]).toMatchObject({ kind: 'circle', center: { x: 5, y: 5 }, radius: 5 })
  })
})

describe('ArcTool', () => {
  it('兩段筆劃：先弦後鼓起', () => {
    const tool = new ArcTool()
    // 第一劃：弦
    tool.strokeStart({ x: -10, y: 0 })
    const chord = tool.strokeEnd({ x: 10, y: 0 })
    expect(chord.commit).toHaveLength(0)
    expect(chord.preview).toHaveLength(1) // 弦保持顯示

    // 第二劃：鼓起
    tool.strokeStart({ x: 0, y: 3 })
    tool.strokeMove({ x: 0, y: 8 })
    const end = tool.strokeEnd({ x: 0, y: 10 })
    expect(end.commit).toHaveLength(1)
    const arc = end.commit[0] as ArcCurve
    expect(arc.kind).toBe('arc')
    expect(arc.start).toEqual({ x: -10, y: 0 })
    expect(arc.end).toEqual({ x: 10, y: 0 })
    expect(arc.through).toEqual({ x: 0, y: 10 })
  })

  it('第二劃被打斷保留弦', () => {
    const tool = new ArcTool()
    tool.strokeStart({ x: 0, y: 0 })
    tool.strokeEnd({ x: 10, y: 0 })
    tool.strokeStart({ x: 5, y: 3 })
    const cancelled = tool.cancel()
    expect(cancelled.preview).toHaveLength(1) // 弦還在
    // 可以重試鼓起
    tool.strokeStart({ x: 5, y: 4 })
    const end = tool.strokeEnd({ x: 5, y: 5 })
    expect(end.commit).toHaveLength(1)
  })
})
