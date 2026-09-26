import { expect, test } from 'bun:test'
import type { Session } from '@hbar/contracts/directory'
import { createSessionProjectionFence } from '../packages/app-runtime/src/session-projection-fence'

const session = (id: string, seq = 1, workspaceId = 'w'): Session => ({
  id,
  seq,
  updatedAt: seq,
  workspaceId,
  title: id,
  archived: false,
  parentId: null,
  createdAt: 1,
})
function fixture(initial: readonly Session[] = []) {
  let callback: ((facts: readonly Session[]) => void) | undefined
  let stopped = 0
  const fence = createSessionProjectionFence('w', initial, (listener) => {
    callback = listener
    return () => {
      callback = undefined
      stopped++
    }
  })
  return { fence, observe: (facts: readonly Session[]) => callback?.(facts), stopped: () => stopped }
}
test('a projection fence seeds canonical versions, observes newer accepted facts and ignores foreign or older versions', () => {
  const f = fixture([session('a', 2)])
  try {
    f.observe([session('a', 3), session('a', 1), session('outside', 20, 'another')])
    expect(f.fence.filter([session('a', 2), session('a', 3), session('new')]).map((item) => item.id)).toEqual([
      'a',
      'new',
    ])
    expect(f.fence.filter([session('outside', 1)]).map((item) => item.id)).toEqual(['outside'])
    expect(f.fence.filter([session('a', 100, 'another')])).toEqual([])
    expect(f.fence.filter([{ ...session('a', 3), updatedAt: 2 }])).toEqual([])
  } finally {
    f.fence.dispose()
  }
})
test('the 1001st distinct version fails closed for the whole projection; a new read can start cleanly', () => {
  const initial = Array.from({ length: 1000 }, (_, index) => session(`id-${index}`))
  const f = fixture(initial)
  try {
    f.observe([session('id-0', 3)])
    expect(f.fence.overflow).toBe(false)
    expect(f.fence.filter([session('id-0', 3)])).toHaveLength(1)
    f.observe([session('new')])
    expect(f.fence.overflow).toBe(true)
    expect(f.fence.filter([session('id-0', 4), session('new')])).toEqual([])
    const next = fixture([session('new')])
    try {
      expect(next.fence.filter([session('new')])).toHaveLength(1)
    } finally {
      next.fence.dispose()
    }
  } finally {
    f.fence.dispose()
  }
})
test('dispose releases the subscription once and every late projection is non-authoritative', () => {
  const f = fixture()
  f.fence.dispose()
  f.fence.dispose()
  f.observe([session('a', 30)])
  expect(f.stopped()).toBe(1)
  expect(f.fence.filter([session('a')])).toEqual([])
})
