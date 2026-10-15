import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import { DeferredRuntimeWakeups } from '../apps/host/src/process-host-runtime'

test('transient denied admission retains exact durable continuation identity until one recovery wake claims it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-deferred-wake-'))
  const storage = new Storage(join(root, 'state.sqlite'))
  const wakeups = new DeferredRuntimeWakeups(2)
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'fixture')
    const session = await storage.call('createSession', workspace.id)
    const queued = await storage.call(
      'enqueue',
      session.id,
      'existing-continuation-request',
      { text: 'continue durable work', images: [], source: 'goal' },
      'local-fixture',
    )
    let admitted = false
    const claimed: string[] = []
    const wake = async (sessionId: string): Promise<void> => {
      const run = await storage.call('claim', sessionId)
      if (run) claimed.push(run.id)
    }
    wakeups.defer(session.id)
    wakeups.defer(session.id)
    await wakeups.flush(() => admitted, wake)
    expect(claimed).toEqual([])
    expect((await storage.call('run', queued.id)).status).toBe('queued')
    admitted = true
    await wakeups.flush(() => admitted, wake)
    await wakeups.flush(() => admitted, wake)
    expect(claimed).toEqual([queued.id])
    expect((await storage.call('snapshot', session.id)).runs.map((run) => run.id)).toEqual([queued.id])
    expect((await storage.call('runByRequest', session.id, queued.requestId))?.run.id).toBe(queued.id)
  } finally {
    wakeups.close()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('bounded deferred wakes preserve failures, fresh deferral and cancellation without bypassing admission', async () => {
  const wakeups = new DeferredRuntimeWakeups(2)
  const calls: string[] = []
  wakeups.defer('first')
  wakeups.defer('second')
  expect(() => wakeups.defer('third')).toThrow('capacity')
  const failure = new Error('recovering-owner')
  let observed: unknown
  try {
    await wakeups.flush(
      () => true,
      async () => {
        throw failure
      },
    )
  } catch (error: unknown) {
    observed = error
  }
  expect(observed).toBe(failure)
  await wakeups.flush(
    (id) => id === 'first',
    async (id) => {
      calls.push(id)
      wakeups.defer(id)
    },
  )
  expect(calls).toEqual(['first'])
  const controller = new AbortController()
  controller.abort()
  let cancelled: unknown
  try {
    await wakeups.flush(
      () => true,
      async (id) => {
        calls.push(id)
      },
      controller.signal,
    )
  } catch (error: unknown) {
    cancelled = error
  }
  expect(cancelled).toBe(controller.signal.reason)
  expect(calls).toEqual(['first'])
  await wakeups.flush(
    () => true,
    async (id) => {
      calls.push(id)
    },
  )
  expect(calls).toEqual(['first', 'second', 'first'])
  wakeups.close()
  wakeups.defer('ignored-after-close')
  await wakeups.flush(
    () => true,
    async (id) => {
      calls.push(id)
    },
  )
  expect(calls).toEqual(['first', 'second', 'first'])
})

test('in-flight wake retains capacity and original failure without losing either queued notification', async () => {
  const wakeups = new DeferredRuntimeWakeups(2)
  wakeups.defer('first')
  wakeups.defer('second')
  const failure = new Error('original delivery failure')
  let observed: unknown
  try {
    await wakeups.flush(
      () => true,
      async () => {
        expect(() => wakeups.defer('third')).toThrow('capacity')
        throw failure
      },
    )
  } catch (error: unknown) {
    observed = error
  }
  expect(observed).toBe(failure)
  expect(() => wakeups.defer('third')).toThrow('capacity')
  const delivered: string[] = []
  await wakeups.flush(
    () => true,
    async (id) => {
      delivered.push(id)
    },
  )
  expect(delivered).toEqual(['first', 'second'])
  wakeups.defer('third')
  await wakeups.flush(
    () => true,
    async (id) => {
      delivered.push(id)
    },
  )
  expect(delivered).toEqual(['first', 'second', 'third'])
})

test('overlapping flushes cannot duplicate delivery or erase a renewal while observer failures stay observational', async () => {
  const wakeups = new DeferredRuntimeWakeups(2, () => {
    throw new Error('observer failure')
  })
  wakeups.defer('first')
  wakeups.defer('second')
  let release: (() => void) | undefined
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  const delivered: string[] = []
  const first = wakeups.flush(
    () => true,
    async (id) => {
      delivered.push(id)
      if (id === 'first') await blocked
    },
  )
  expect(delivered).toEqual(['first'])
  wakeups.defer('first')
  expect(() => wakeups.defer('third')).toThrow('capacity')
  await wakeups.flush(
    () => true,
    async (id) => {
      delivered.push(id)
    },
  )
  expect(delivered).toEqual(['first', 'second'])
  if (!release) throw new Error('Expected owned delivery barrier')
  release()
  await first
  // The first flush's stale snapshot must neither replay second nor consume renewal.
  expect(delivered).toEqual(['first', 'second'])
  await wakeups.flush(
    () => true,
    async (id) => {
      delivered.push(id)
    },
  )
  expect(delivered).toEqual(['first', 'second', 'first'])
  await wakeups.flush(
    () => true,
    async (id) => {
      delivered.push(id)
    },
  )
  expect(delivered).toEqual(['first', 'second', 'first'])
  wakeups.defer('failure')
  const original = new Error('business failure')
  let observed: unknown
  try {
    await wakeups.flush(
      () => true,
      async () => {
        throw original
      },
    )
  } catch (error: unknown) {
    observed = error
  }
  expect(observed).toBe(original)
  await wakeups.flush(
    () => true,
    async (id) => {
      delivered.push(id)
    },
  )
  expect(delivered).toEqual(['first', 'second', 'first', 'failure'])
  wakeups.defer('close')
  wakeups.close()
  await wakeups.flush(
    () => true,
    async (id) => {
      delivered.push(id)
    },
  )
  expect(delivered).toEqual(['first', 'second', 'first', 'failure'])
})
