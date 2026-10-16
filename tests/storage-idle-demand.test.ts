// Controlled writer state-machine fixtures; no Worker, database, or native physical-exit proof.
import { expect, test } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import {
  callStorageRpc,
  StableStoragePort,
  type ManagedStorageWriter,
  type StorageMethods,
  type StoragePhysicalSettlement,
} from '@hbar/storage'
import type { RuntimeOwner } from '@hbar/contracts/runtime'

const owner: RuntimeOwner = { unitId: 'storage', generation: 1, incarnation: 'owned-fixture' }
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('fixture not initialized')
  }
  let reject: (error: Error) => void = () => {
    throw new Error('fixture not initialized')
  }
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}

test('dispatched logical write timeout fences and keeps demand until its physical reply', async () => {
  const settled = deferred<StoragePhysicalSettlement>()
  let releases = 0,
    calls = 0
  const port = new StableStoragePort(100, {
    acquire: async () => ({
      owner,
      release: () => {
        releases++
      },
    }),
  })
  const writer: ManagedStorageWriter = {
    owner,
    retire: async () => {},
    call: async () => {
      throw new Error('legacy path must not execute')
    },
    callPhysical: () => {
      calls++
      return { result: Promise.reject(new HbarError('IPC_TIMEOUT', 'owned logical timeout')), settled: settled.promise }
    },
  }
  port.install(writer)
  try {
    await expect(port.call('setSetting', 'owned-key', 'owned-value')).rejects.toBeInstanceOf(HbarError)
    expect(port.snapshot().phase).toBe('fenced')
    expect(port.writeCallsInFlight).toBe(1)
    expect(port.demandSnapshot().holds).toBe(1)
    expect(releases).toBe(0)
    expect(port.beforeIdle(owner)).toBe(false)
    await expect(port.call('setSetting', 'next-key', 'next-value')).rejects.toBeInstanceOf(HbarError)
    expect(calls).toBe(1)
    settled.resolve({ owner, kind: 'reply' })
    await settled.promise
    for (let turn = 0; turn < 12; turn++) await Promise.resolve()
    expect(releases).toBe(1)
    expect(port.writeCallsInFlight).toBe(0)
    expect(port.snapshot().phase).toBe('fenced') // physical reply does not reconcile the original write.
  } finally {
    settled.resolve({ owner, kind: 'reply' })
    await port.close()
  }
})

test('legacy writer without physical completion cannot enable idle demand', () => {
  const port = new StableStoragePort(100, { acquire: async () => ({ owner, release() {} }) })
  const writer: ManagedStorageWriter = {
    owner,
    retire: async () => {},
    call: async () => {
      throw new Error('not called')
    },
  }
  expect(() => port.install(writer)).toThrow()
  expect(port.beforeIdle(owner)).toBe(false)
})

test('synchronous adapter failure retains its exact-owner hold until explicit reconciliation', async () => {
  let releases = 0
  const port = new StableStoragePort(100, {
    acquire: async () => ({
      owner,
      release: () => {
        releases++
      },
    }),
  })
  const writer: ManagedStorageWriter = {
    owner,
    retire: async () => {},
    call: async () => {
      throw new Error('legacy path must not execute')
    },
    callPhysical: () => {
      throw new HbarError('IPC_FAILED', 'owned adapter failure')
    },
  }
  port.install(writer)
  try {
    await expect(port.call('setSetting', 'owned-key', 'owned-value')).rejects.toBeInstanceOf(HbarError)
    expect(port.snapshot().phase).toBe('fenced')
    expect(releases).toBe(0)
    expect(port.demandSnapshot().unknownPhysical).toBe(1)
    expect(port.writeCallsInFlight).toBe(1)
    port.confirmDemandOwnerReconciled({
      owner,
      physicalExitConfirmed: true,
      originalReceiptReconciliationConfirmed: true,
    })
    for (let turn = 0; turn < 12; turn++) await Promise.resolve()
    expect(releases).toBe(1)
    expect(port.writeCallsInFlight).toBe(0)
    expect(port.snapshot().phase).toBe('fenced')
  } finally {
    if (port.demandSnapshot().unknownPhysical)
      port.confirmDemandOwnerReconciled({
        owner,
        physicalExitConfirmed: true,
        originalReceiptReconciliationConfirmed: true,
      })
    await port.close()
  }
})

test('only no-checkpoint busy can reopen an idle seal; unknown never clears the writer', () => {
  const port = new StableStoragePort(100, { acquire: async () => ({ owner, release() {} }) })
  const writer: ManagedStorageWriter = {
    owner,
    retire: async () => {},
    call: async () => {
      throw new Error('not called')
    },
    callPhysical: () => {
      throw new Error('not called')
    },
  }
  port.install(writer)
  expect(port.beforeIdle(owner)).toBe(true)
  port.afterIdle(owner, { status: 'busy', checkpointed: false })
  expect(port.snapshot().phase).toBe('serving')
  expect(port.beforeIdle(owner)).toBe(true)
  port.afterIdle(owner, { status: 'unknown' })
  expect(port.snapshot().phase).toBe('fenced')
  expect(port.snapshot().owner).toEqual(owner)
})

// These controlled public-RPC writer fixtures prove promise/ref/cache behavior, not DB or native exit.
function scriptedWriter() {
  const calls: {
    method: string
    result: ReturnType<typeof deferred<unknown>>
    physical: ReturnType<typeof deferred<StoragePhysicalSettlement>>
  }[] = []
  let arrived = deferred<void>()
  const writer: ManagedStorageWriter = {
    owner,
    retire: () => Promise.resolve(),
    call: () => Promise.reject(new Error('legacy path must not execute')),
    callPhysical: <K extends keyof StorageMethods>(method: K, args: Parameters<StorageMethods[K]>) => {
      const result = deferred<unknown>()
      const physical = deferred<StoragePhysicalSettlement>()
      calls.push({ method, result, physical })
      arrived.resolve()
      arrived = deferred<void>()
      return { result: callStorageRpc({ execute: () => result.promise }, method, args), settled: physical.promise }
    },
  }
  const next = async (index: number) => {
    // Each awaited notification is emitted by an actual writer dispatch, not elapsed wall time.
    while (calls.length <= index) await arrived.promise
    const call = calls[index]
    if (!call) throw new Error('Expected writer dispatch is missing')
    return call
  }
  return { writer, calls, next }
}
async function microtasks(): Promise<void> {
  for (let turn = 0; turn < 16; turn++) await Promise.resolve()
}

test('a successful logical result waits for its exact physical reply and releases its demand exactly once', async () => {
  const f = scriptedWriter()
  let releases = 0,
    completed = false
  const released = deferred<void>()
  const port = new StableStoragePort(1_000, {
    acquire: () =>
      Promise.resolve({
        owner,
        release: () => {
          releases++
          released.resolve()
        },
      }),
  })
  port.install(f.writer)
  const result = port.call('getSetting', 'owned-key').then((value) => {
    completed = true
    return value
  })
  const call = await f.next(0)
  try {
    call.result.resolve('owned-result')
    await microtasks()
    expect(completed).toBe(false)
    expect(releases).toBe(0)
    expect(port.demandSnapshot().holds).toBe(1)
    expect(port.snapshot().inFlight).toBe(1)
    call.physical.resolve({ owner, kind: 'reply' })
    expect(await result).toBe('owned-result')
    await released.promise
    expect(releases).toBe(1)
    expect(port.demandSnapshot().holds).toBe(0)
    expect(f.calls).toHaveLength(1)
  } finally {
    call.result.resolve('owned-result')
    call.physical.resolve({ owner, kind: 'reply' })
    await result
    await port.close()
  }
  expect(releases).toBe(1)
})

test('a wake lease arriving after the admission deadline is released without dispatching', async () => {
  const wake = deferred<{ owner: RuntimeOwner; release(): void }>()
  const released = deferred<void>()
  const f = scriptedWriter()
  let releases = 0
  const port = new StableStoragePort(10, { acquire: () => wake.promise })
  port.install(f.writer)
  try {
    const failure = await port.call('getSetting', 'owned-key').catch((error: unknown) => error)
    expect(failure).toMatchObject({ code: 'STORAGE_DEMAND_TIMEOUT' })
    expect(port.demandSnapshot().acquiring).toBe(1)
    wake.resolve({
      owner,
      release: () => {
        releases++
        released.resolve()
      },
    })
    await released.promise
    expect(releases).toBe(1)
    expect(f.calls).toHaveLength(0)
    expect(port.demandSnapshot()).toMatchObject({ acquiring: 0, acquiringBytes: 0, holds: 0 })
  } finally {
    wake.resolve({
      owner,
      release: () => {
        releases++
        released.resolve()
      },
    })
    await port.close()
  }
  expect(releases).toBe(1)
})

test('a demand lease for another exact owner is released before any RPC can dispatch', async () => {
  const f = scriptedWriter()
  let releases = 0
  const port = new StableStoragePort(1_000, {
    acquire: () =>
      Promise.resolve({
        owner: { ...owner, incarnation: 'different-incarnation' },
        release: () => {
          releases++
        },
      }),
  })
  port.install(f.writer)
  try {
    const failure = await port.call('getSetting', 'owned-key').catch((error: unknown) => error)
    expect(failure).toMatchObject({ code: 'STORAGE_DEMAND_OWNER_CHANGED' })
    expect(f.calls).toHaveLength(0)
    expect(releases).toBe(1)
    expect(port.demandSnapshot().holds).toBe(0)
    expect(port.snapshot()).toMatchObject({ phase: 'serving', owner, inFlight: 0 })
  } finally {
    await port.close()
  }
  expect(releases).toBe(1)
})

test('shallow snapshots never wake; a late queue read cannot undo a concurrent write invalidation', async () => {
  const f = scriptedWriter()
  let acquires = 0,
    releases = 0
  const port = new StableStoragePort(1_000, {
    acquire: () => {
      acquires++
      return Promise.resolve({
        owner,
        release: () => {
          releases++
        },
      })
    },
  })
  port.install(f.writer)
  const pending: Promise<unknown>[] = []
  const failures: unknown[] = []
  try {
    expect(port.snapshot().queuedSessionCount).toBeNull()
    port.snapshot()
    port.demandSnapshot()
    expect(acquires).toBe(0)
    expect(f.calls).toHaveLength(0)
    const oldRead = port.call('queuedSessions')
    pending.push(oldRead)
    const old = await f.next(0)
    const write = port.call('setSetting', 'owned-key', 'owned-value')
    pending.push(write)
    const mutation = await f.next(1)
    mutation.result.resolve(undefined)
    mutation.physical.resolve({ owner, kind: 'reply' })
    await write
    await microtasks()
    old.result.resolve(['stale-session'])
    old.physical.resolve({ owner, kind: 'reply' })
    expect(await oldRead).toEqual(['stale-session'])
    expect(port.snapshot().queuedSessionCount).toBeNull()
    const freshRead = port.call('queuedSessions')
    pending.push(freshRead)
    const fresh = await f.next(2)
    fresh.result.resolve(['actual-one', 'actual-two'])
    fresh.physical.resolve({ owner, kind: 'reply' })
    expect(await freshRead).toEqual(['actual-one', 'actual-two'])
    await microtasks()
    expect(port.snapshot().queuedSessionCount).toBe(2)
    const before = acquires
    port.snapshot()
    port.demandSnapshot()
    port.snapshot()
    expect(acquires).toBe(before)
    expect(f.calls.map((call) => call.method)).toEqual(['queuedSessions', 'setSetting', 'queuedSessions'])
    expect(releases).toBe(3)
  } catch (error) {
    failures.push(error)
  }
  for (const call of f.calls) {
    call.result.resolve(undefined)
    call.physical.resolve({ owner, kind: 'reply' })
  }
  for (const result of pending)
    try {
      await result
    } catch (error) {
      failures.push(error)
    }
  try {
    await port.close()
  } catch (error) {
    failures.push(error)
  }
  if (failures.length)
    throw new AggregateError(failures, 'Controlled Stable calls or assertions failed', { cause: failures[0] })
})
