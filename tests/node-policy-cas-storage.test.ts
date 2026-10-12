import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeStateStorage } from '@hbar/storage/node-state'
import { nodeFloorSchema } from '@hbar/contracts/node'

function floor(process: boolean) {
  return nodeFloorSchema.parse({ roots: [], process })
}

test('node floor CAS is atomic across concurrent callers, durable, and legacy writes advance its revision', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hbar-node-floor-cas-'))
  const path = join(directory, 'node.sqlite')
  let first: NodeStateStorage | undefined
  let reopened: NodeStateStorage | undefined
  try {
    first = new NodeStateStorage(path)
    await first.call('ready', {})
    await first.call('floor.set', floor(true))
    const initial = await first.call('floor.snapshot', {})
    expect(initial).toEqual({ floor: floor(true), revision: 1 })
    const writers = await Promise.allSettled([
      first.call('floor.update', { floor: floor(false), expectedRevision: initial.revision }),
      first.call('floor.update', { floor: floor(false), expectedRevision: initial.revision }),
    ])
    expect(writers.filter((writer) => writer.status === 'fulfilled')).toHaveLength(1)
    expect(writers.filter((writer) => writer.status === 'rejected')).toMatchObject([
      { reason: { code: 'NODE_POLICY_CONFLICT' } },
    ])
    const current = await first.call('floor.snapshot', {})
    expect(current).toEqual({ floor: floor(false), revision: 2 })
    let conflict: unknown
    try {
      await first.call('floor.update', { floor: floor(true), expectedRevision: initial.revision })
    } catch (error) {
      conflict = error
    }
    expect(conflict).toMatchObject({ code: 'NODE_POLICY_CONFLICT' })
    expect(await first.call('floor.snapshot', {})).toEqual(current)
    await expect(
      first.call('floor.update', { floor: { ...floor(false), maxTimeoutMs: -1 }, expectedRevision: 2 }),
    ).rejects.toThrow()
    expect(await first.call('floor.snapshot', {})).toEqual(current)
    await first.call('floor.set', floor(true))
    expect(await first.call('floor.snapshot', {})).toEqual({ floor: floor(true), revision: 3 })
    let legacyConflict: unknown
    try {
      await first.call('floor.update', { floor: floor(false), expectedRevision: current.revision })
    } catch (error) {
      legacyConflict = error
    }
    expect(legacyConflict).toMatchObject({ code: 'NODE_POLICY_CONFLICT' })
    expect(await first.call('floor.snapshot', {})).toEqual({ floor: floor(true), revision: 3 })
    await first.close()
    first = undefined
    reopened = new NodeStateStorage(path)
    await reopened.call('ready', {})
    expect(await reopened.call('floor.snapshot', {})).toEqual({ floor: floor(true), revision: 3 })
  } finally {
    await first?.close()
    await reopened?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
