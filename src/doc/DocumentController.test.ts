import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentController } from './DocumentController.ts'
import type { JournalOp } from './journal.ts'
import type { KernelClient } from '../kernel/KernelClient.ts'
import type { ApplyOpResult } from '../kernel/protocol.ts'
import { useAppStore } from '../state/appStore.ts'

// 假 kernel：applyOp 依序指派 bodyId，replayJournal 回傳存活 body 清單
function makeFakeKernel() {
  let nextId = 1
  const emptyMesh = () => ({
    positions: new Float32Array(),
    normals: new Float32Array(),
    indices: new Uint32Array(),
    faceGroups: [],
    edgePositions: new Float32Array(),
    edgeGroups: [],
  })
  const applyOp = vi.fn(async (jop: JournalOp): Promise<ApplyOpResult> => {
    if (jop.kind === 'deleteBody') return { op: jop, updated: [], removed: [jop.bodyId] }
    if (jop.kind === 'createBox' || jop.kind === 'createCylinder' || jop.kind === 'importStep') {
      const bodyId = jop.bodyId > 0 ? jop.bodyId : nextId++
      if (bodyId >= nextId) nextId = bodyId + 1
      return {
        op: { ...jop, bodyId },
        updated: [{ bodyId, mesh: emptyMesh() }],
        removed: [],
      }
    }
    throw new Error('unsupported in fake')
  })
  const replayJournal = vi.fn(async (ops: JournalOp[]) => {
    const alive = new Set<number>()
    for (const op of ops) {
      if (op.kind === 'createBox' || op.kind === 'createCylinder') alive.add(op.bodyId)
      if (op.kind === 'deleteBody') alive.delete(op.bodyId)
    }
    return { bodies: [...alive].map((bodyId) => ({ bodyId, mesh: emptyMesh() })) }
  })
  return { applyOp, replayJournal } as unknown as KernelClient & {
    applyOp: typeof applyOp
    replayJournal: typeof replayJournal
  }
}

function boxDraft(name = '方塊'): JournalOp {
  return { kind: 'createBox', bodyId: 0, name, dx: 1, dy: 1, dz: 1 }
}

describe('DocumentController', () => {
  let kernel: ReturnType<typeof makeFakeKernel>
  let controller: DocumentController

  beforeEach(() => {
    useAppStore.setState({
      bodies: [],
      selection: [],
      journalLabels: [],
      journalCursor: 0,
    })
    kernel = makeFakeKernel()
    controller = new DocumentController({ kernel: () => kernel, viewport: () => null })
  })

  it('apply 記錄 journal 並推進游標', async () => {
    await controller.apply(boxDraft())
    await controller.apply(boxDraft())
    const s = useAppStore.getState()
    expect(s.journalLabels).toHaveLength(2)
    expect(s.journalCursor).toBe(2)
    expect(s.bodies.map((b) => b.bodyId)).toEqual([1, 2])
  })

  it('undo 全量重放、redo 重執行單筆', async () => {
    await controller.apply(boxDraft())
    await controller.apply(boxDraft())
    await controller.undo()
    let s = useAppStore.getState()
    expect(s.journalCursor).toBe(1)
    expect(s.bodies.map((b) => b.bodyId)).toEqual([1])
    expect(kernel.replayJournal).toHaveBeenCalledTimes(1)

    await controller.redo()
    s = useAppStore.getState()
    expect(s.journalCursor).toBe(2)
    expect(s.bodies.map((b) => b.bodyId)).toEqual([1, 2])
    // redo 用已記錄的 bodyId 重執行，不是重放
    const lastApply = kernel.applyOp.mock.calls.at(-1)![0]
    expect(lastApply.kind === 'createBox' && lastApply.bodyId).toBe(2)
  })

  it('undo 後 apply 截斷 redo 尾巴', async () => {
    await controller.apply(boxDraft('a'))
    await controller.apply(boxDraft('b'))
    await controller.undo()
    await controller.apply(boxDraft('c'))
    const s = useAppStore.getState()
    expect(s.journalLabels).toEqual(['建立 a', '建立 c'])
    expect(s.journalCursor).toBe(2)
    expect(controller.canRedo()).toBe(false)
  })

  it('deleteBody 可 undo 恢復', async () => {
    await controller.apply(boxDraft())
    await controller.apply({ kind: 'deleteBody', bodyId: 1 })
    expect(useAppStore.getState().bodies).toHaveLength(0)
    await controller.undo()
    expect(useAppStore.getState().bodies.map((b) => b.bodyId)).toEqual([1])
  })

  it('游標邊界：空文件 undo / 滿游標 redo 都是 no-op', async () => {
    await controller.undo()
    await controller.redo()
    expect(useAppStore.getState().journalCursor).toBe(0)
    await controller.apply(boxDraft())
    await controller.redo()
    expect(useAppStore.getState().journalCursor).toBe(1)
  })
})
