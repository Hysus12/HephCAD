import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore, selectionKey } from './appStore.ts'

describe('appStore selection', () => {
  beforeEach(() => {
    useAppStore.setState({ selection: [], bodies: [] })
  })

  it('toggleSelection 累加與取消', () => {
    const store = useAppStore.getState()
    const face = { bodyId: 1, kind: 'face' as const, topoId: 3 }
    const edge = { bodyId: 1, kind: 'edge' as const, topoId: 5 }

    store.toggleSelection(face)
    store.toggleSelection(edge)
    expect(useAppStore.getState().selection).toHaveLength(2)

    store.toggleSelection(face)
    const remaining = useAppStore.getState().selection
    expect(remaining).toHaveLength(1)
    expect(selectionKey(remaining[0])).toBe('1:edge:5')
  })

  it('removeBody 一併清掉該 body 的選取', () => {
    useAppStore.setState({
      bodies: [
        { bodyId: 1, name: 'a', visible: true },
        { bodyId: 2, name: 'b', visible: true },
      ],
      selection: [
        { bodyId: 1, kind: 'face', topoId: 1 },
        { bodyId: 2, kind: 'body', topoId: 0 },
      ],
    })
    useAppStore.getState().removeBody(1)
    const s = useAppStore.getState()
    expect(s.bodies.map((b) => b.bodyId)).toEqual([2])
    expect(s.selection).toEqual([{ bodyId: 2, kind: 'body', topoId: 0 }])
  })

  it('setBodyVisible 切換單一 body', () => {
    useAppStore.setState({ bodies: [{ bodyId: 1, name: 'a', visible: true }] })
    useAppStore.getState().setBodyVisible(1, false)
    expect(useAppStore.getState().bodies[0].visible).toBe(false)
  })
})
