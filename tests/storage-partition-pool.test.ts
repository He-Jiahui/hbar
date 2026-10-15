import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PartitionPool } from '../packages/storage/src/partition-pool'
import {
  createPartitionLayout,
  partitionDatabasePath,
  type PartitionOwner,
} from '../packages/storage/src/partition-layout'
import type { StorageReply } from '../packages/storage/src/types'

function result(reply: StorageReply): unknown {
  if (!reply.ok) throw new Error(reply.code)
  return reply.result
}
async function expectConnectionCapacity(pending: Promise<void>): Promise<void> {
  // Await the actual Worker reply outside Bun's async rejection matcher so
  // matcher scheduling cannot stand in for the cross-thread delivery under test.
  let rejection: unknown
  try {
    await pending
  } catch (error: unknown) {
    rejection = error
  }
  expect(rejection instanceof Error).toBe(true)
  if (!(rejection instanceof Error)) throw new Error('Expected the actual Worker capacity rejection')
  expect(rejection.message).toBe('PARTITION_POOL_CONNECTION_CAPACITY')
}
async function fixture(
  run: (pool: PartitionPool, layout: ReturnType<typeof createPartitionLayout>, generation: string) => Promise<void>,
  options: {
    workers?: number
    maxPending?: number
    maxPendingBytes?: number
    maxOwnerPending?: number
    diagnosticsEnabled?: boolean
    diagnosticsFullCoverage?: boolean
    maxConnectionsPerWorker?: number
  } = {},
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-partition-pool-'))
  const layout = createPartitionLayout(root)
  const generation = crypto.randomUUID()
  const pool = new PartitionPool({ layout, generation, ...options })
  try {
    await run(pool, layout, generation)
  } finally {
    await pool.close()
    expect(pool.lifecycle().exited).toBe(pool.lifecycle().started)
    await rm(root, { recursive: true, force: true })
  }
}
const owner = (): PartitionOwner => ({ kind: 'project', projectPartitionId: crypto.randomUUID() })

test('real independent Workers respond while another SQLite connection waits, preserving owner FIFO', async () => {
  await fixture(async (pool, layout, generation) => {
    const first = owner()
    let second = owner()
    while (pool.workerIndex(second) === pool.workerIndex(first)) second = owner()
    result(await pool.call(first, { id: 1, method: 'setSetting', args: ['value', 'initial'] }))
    result(await pool.call(second, { id: 1, method: 'setSetting', args: ['value', 'other'] }))
    const lock = new Database(partitionDatabasePath(layout, generation, first), { strict: true })
    lock.exec('BEGIN IMMEDIATE')
    let completed = false
    const blocked = pool.call(first, { id: 2, method: 'setSetting', args: ['value', 'after'] }).then((reply) => {
      completed = true
      return reply
    })
    const release = setTimeout(() => lock.exec('ROLLBACK'), 1000)
    try {
      expect(result(await pool.call(second, { id: 2, method: 'getSetting', args: ['value'] }))).toBe('other')
      expect(completed).toBe(false)
      result(await blocked)
      const writes = [0, 1, 2].map((number) =>
        pool.call(first, { id: 10 + number, method: 'setSetting', args: ['value', String(number)] }),
      )
      const read = pool.call(first, { id: 20, method: 'getSetting', args: ['value'] })
      await Promise.all(writes)
      expect(result(await read)).toBe('2')
    } finally {
      clearTimeout(release)
      if (!completed) lock.exec('ROLLBACK')
      await blocked
      lock.close()
    }
  })
}, 10000)

test('bounded queue count/owner quota and queued abort never execute cancelled writes', async () => {
  await fixture(
    async (pool, layout, generation) => {
      const target = owner()
      result(await pool.call(target, { id: 1, method: 'setSetting', args: ['value', 'before'] }))
      const lock = new Database(partitionDatabasePath(layout, generation, target), { strict: true })
      lock.exec('BEGIN IMMEDIATE')
      const blocked = pool.call(target, { id: 2, method: 'setSetting', args: ['value', 'accepted'] })
      const controller = new AbortController()
      const queued = pool.call(
        target,
        { id: 3, method: 'setSetting', args: ['value', 'cancelled'] },
        { signal: controller.signal },
      )
      const cancelled = queued.then(
        () => false,
        (error: unknown) => error instanceof Error && error.message === 'PARTITION_POOL_CANCELLED',
      )
      try {
        await expect(pool.pin(target)).rejects.toThrow('PARTITION_POOL_QUEUE_CAPACITY')
        controller.abort()
        expect(await cancelled).toBe(true)
      } finally {
        lock.exec('ROLLBACK')
        await blocked
        lock.close()
      }
      expect(result(await pool.call(target, { id: 4, method: 'getSetting', args: ['value'] }))).toBe('accepted')
    },
    { workers: 1, maxPending: 2, maxOwnerPending: 2 },
  )
  await fixture(
    async (pool) => {
      await expect(
        pool.call(owner(), { id: 1, method: 'setSetting', args: ['large', 'x'.repeat(2048)] }),
      ).rejects.toThrow('PARTITION_POOL_QUEUE_CAPACITY')
      expect(pool.lifecycle().started).toBe(0)
    },
    { maxPendingBytes: 1024 },
  )
}, 10000)

test('pins prevent LRU eviction; unpinned connections reopen without data loss and close awaits actual exit', async () => {
  await fixture(
    async (pool) => {
      const first = owner(),
        second = owner()
      expect(pool.lifecycle().started).toBe(0)
      await pool.pin(first)
      result(await pool.call(first, { id: 1, method: 'setSetting', args: ['persistent', 'yes'] }))
      await expectConnectionCapacity(pool.pin(second))
      await pool.unpin(first)
      await pool.pin(second)
      await pool.unpin(second)
      expect(result(await pool.call(first, { id: 2, method: 'getSetting', args: ['persistent'] }))).toBe('yes')
      expect((await pool.stats()).connections).toBe(1)
      await pool.close()
      expect(pool.lifecycle()).toEqual({ started: 1, exited: 1 })
      await expect(pool.call(first, { id: 3, method: 'getSetting', args: ['persistent'] })).rejects.toThrow(
        'PARTITION_POOL_CLOSED',
      )
    },
    { workers: 1, maxConnectionsPerWorker: 1 },
  )
})

test('dispatched writes do not fake cancellation and timeout rejects only after real Worker exit', async () => {
  await fixture(
    async (pool, layout, generation) => {
      const target = owner()
      result(await pool.call(target, { id: 1, method: 'setSetting', args: ['value', 'before'] }))
      const lock = new Database(partitionDatabasePath(layout, generation, target), { strict: true })
      lock.exec('BEGIN IMMEDIATE')
      const controller = new AbortController()
      const write = pool.call(
        target,
        { id: 2, method: 'setSetting', args: ['value', 'committed'] },
        { signal: controller.signal },
      )
      controller.abort()
      lock.exec('ROLLBACK')
      lock.close()
      expect(result(await write)).toBeUndefined()
      expect(result(await pool.call(target, { id: 3, method: 'getSetting', args: ['value'] }))).toBe('committed')
      const timeoutLock = new Database(partitionDatabasePath(layout, generation, target), { strict: true })
      timeoutLock.exec('BEGIN IMMEDIATE')
      const pending = pool.call(target, { id: 4, method: 'setSetting', args: ['value', 'unknown'] }, { timeoutMs: 50 })
      const observed = pending.then(
        () => false,
        (error: unknown) => {
          expect(pool.lifecycle().exited).toBe(pool.lifecycle().started)
          return error instanceof Error && error.message === 'STORAGE_RESULT_UNKNOWN'
        },
      )
      const release = setTimeout(() => timeoutLock.exec('ROLLBACK'), 200)
      try {
        expect(await observed).toBe(true)
      } finally {
        clearTimeout(release)
        try {
          timeoutLock.exec('ROLLBACK')
        } catch {
          /* transaction already released */
        }
        timeoutLock.close()
      }
      await pool.close()
    },
    { workers: 1 },
  )
}, 10000)

test('bounded correlated diagnostics survive connection failure without exposing payloads or breaking cleanup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-partition-diagnostics-'))
  const pool = new PartitionPool({
    layout: createPartitionLayout(root),
    generation: crypto.randomUUID(),
    workers: 1,
    maxConnectionsPerWorker: 1,
    diagnosticsEnabled: true,
    diagnosticsFullCoverage: true,
    diagnostics: {
      emit: () => {
        throw new Error('fixture sink failure')
      },
    },
  })
  const first = owner(),
    second = owner()
  const secret = 'private-diagnostic-canary-never-log'
  try {
    await pool.pin(first)
    result(await pool.call(first, { id: 7, method: 'setSetting', args: ['private-key', secret] }))
    await expectConnectionCapacity(pool.pin(second))
    await pool.unpin(first)
    result(await pool.call(second, { id: 8, method: 'setSetting', args: ['another', secret] }))
    await pool.close()
    const diagnostics = pool.drainDiagnostics()
    expect(diagnostics.length).toBeLessThanOrEqual(128)
    expect(diagnostics.some((event) => event.event === 'sqlite.pool_connection_opened')).toBe(true)
    expect(diagnostics.some((event) => event.event === 'sqlite.pool_connection_evicted')).toBe(true)
    expect(diagnostics.some((event) => event.event === 'sqlite.pool_request_failed')).toBe(true)
    expect(diagnostics.some((event) => event.event === 'sqlite.pool_worker_exited')).toBe(true)
    expect(
      diagnostics
        .filter((event) => event.method === 'setSetting')
        .every((event) => typeof event.storageRequestId === 'number' && typeof event.instanceId === 'string'),
    ).toBe(true)
    expect(JSON.stringify(diagnostics)).not.toContain(secret)
    expect(JSON.stringify(diagnostics)).not.toContain(root)
    expect(pool.diagnosticsSnapshot().dropped).toBeGreaterThan(0)
    expect(pool.lifecycle()).toEqual({ started: 1, exited: 1 })
  } finally {
    await pool.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('queued deadline expires without executing its write and releases owner/count/bytes admission before lock recovery', async () => {
  await fixture(
    async (pool, layout, generation) => {
      const target = owner()
      result(await pool.call(target, { id: 1, method: 'setSetting', args: ['value', 'before'] }))
      const lock = new Database(partitionDatabasePath(layout, generation, target), { strict: true })
      lock.exec('BEGIN IMMEDIATE')
      let released = false
      const release = setTimeout(() => {
        lock.exec('ROLLBACK')
        released = true
      }, 1000)
      const blocked = pool.call(target, { id: 2, method: 'setSetting', args: ['value', 'authoritative'] })
      const timedOut = pool.call(
        target,
        { id: 3, method: 'setSetting', args: ['value', 'must-not-execute'] },
        { timeoutMs: 25 },
      )
      try {
        let rejection: unknown
        try {
          await timedOut
        } catch (error: unknown) {
          rejection = error
        }
        expect(rejection instanceof Error).toBe(true)
        if (!(rejection instanceof Error)) throw new Error('Expected queued deadline rejection')
        expect(rejection.message).toBe('PARTITION_POOL_QUEUE_TIMEOUT')
        expect(released).toBe(false)
        // maxPending/maxOwnerPending=2: this must fit BEFORE the first write
        // finishes, proving the expired request released both queue quotas.
        // The final stats also require complete byte-budget reclamation.
        const read = pool.call(target, { id: 4, method: 'getSetting', args: ['value'] })
        result(await blocked)
        expect(result(await read)).toBe('authoritative')
        expect(result(await pool.call(target, { id: 5, method: 'getSetting', args: ['value'] }))).toBe('authoritative')
        expect((await pool.stats()).pendingBytes).toBe(0)
        expect(pool.lifecycle()).toEqual({ started: 1, exited: 0 })
        const diagnostic = pool.drainDiagnostics().find((event) => event.event === 'sqlite.pool_queue_timeout')
        expect(diagnostic?.method).toBe('setSetting')
        expect(typeof diagnostic?.storageRequestId).toBe('number')
        expect(typeof diagnostic?.instanceId).toBe('string')
      } finally {
        clearTimeout(release)
        if (!released) lock.exec('ROLLBACK')
        await blocked
        lock.close()
      }
    },
    {
      workers: 1,
      maxPending: 2,
      maxOwnerPending: 2,
      maxPendingBytes: 1024,
      diagnosticsEnabled: true,
      diagnosticsFullCoverage: true,
    },
  )
}, 10000)
