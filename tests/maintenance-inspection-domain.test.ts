import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { StorageMethods, StoragePort } from '@hbar/storage'
import {
  Storage,
  createPathLayout,
  ensurePathLayout,
  createChatDatabaseFileScanner,
  readChatDatabaseActiveJournalProof,
} from '@hbar/storage'
import {
  SettingsService,
  createChatDatabaseStatisticsService,
  createChatDatabaseMaintenanceService,
  createChatDatabaseScheduler,
} from '@hbar/kernel/maintenance'

test('actual SQLite probe counts every nonterminal state and corrupt status, not pending first only', () => {
  const db = new Database(':memory:')
  try {
    db.exec('CREATE TABLE chat_database_operations(id TEXT PRIMARY KEY,dataJson TEXT NOT NULL)')
    db.exec('PRAGMA query_only=OFF')
    const put = db.query('INSERT INTO chat_database_operations VALUES(?,?)')
    for (const status of ['accepted', 'running', 'cancelRequested', 'unknown', 'completed', 'failed', 'cancelled'])
      put.run(status, JSON.stringify({ status }))
    put.run('malformed', '{')
    db.exec('PRAGMA query_only=ON')
    const proof = readChatDatabaseActiveJournalProof(db, 'a'.repeat(64))
    expect(proof.counts).toEqual({ accepted: 1, running: 1, cancelRequested: 1, unknown: 1, invalid: 1 })
    expect(proof.empty).toBe(false)
    expect(proof.firstActiveId).not.toBeNull()
    expect(readChatDatabaseActiveJournalProof(db, 'a'.repeat(64))).toEqual(proof)
  } finally {
    db.close()
  }
})

test('actual scheduler idle restore preserves cursor/deadline without start or task write', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-inspection-domain-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
  await ensurePathLayout(layout)
  const storage = new Storage(layout.database, layout)
  const settings = new SettingsService(storage)
  const statistics = createChatDatabaseStatisticsService(storage, settings, createChatDatabaseFileScanner(layout))
  const maintenance = createChatDatabaseMaintenanceService(
    storage,
    settings,
    statistics,
    {
      protection: () => null,
      removeSession: (input) => storage.call('chatDatabaseDeleteSession', input),
      deleted: async () => {},
    },
    undefined,
    undefined,
    { recover: false },
  )
  const scheduler = createChatDatabaseScheduler(storage, settings, statistics, maintenance, {
    start: false,
    now: () => 100_000,
  })
  let primary: unknown
  const cleanup: unknown[] = []
  try {
    await storage.call('ready')
    const before = await storage.call('chatDatabaseTaskRead', { kind: 'global' })
    scheduler.idleRestore({ version: 1, cursor: 'session:owned-cursor', nextCheckAt: 120_000 })
    expect(scheduler.inspectionCheckpoint()).toEqual({
      version: 1,
      cursor: 'session:owned-cursor',
      nextCheckAt: 120_000,
    })
    expect(scheduler.idleSnapshot()).toMatchObject({ paused: true, timer: false, current: false })
    expect(await storage.call('chatDatabaseTaskRead', { kind: 'global' })).toEqual(before)
    expect(await scheduler.quiesceInspection()).toEqual(scheduler.inspectionCheckpoint())
  } catch (error) {
    primary = error
  } finally {
    for (const close of [
      () => scheduler.close(),
      () => maintenance.close(),
      () => statistics.close(),
      () => storage.close(),
    ]) {
      try {
        await close()
      } catch (error) {
        cleanup.push(error)
      }
    }
    if (!cleanup.length) {
      try {
        await rm(root, { recursive: true })
      } catch (error) {
        cleanup.push(error)
      }
    }
  }
  if (primary || cleanup.length)
    throw new AggregateError(primary ? [primary, ...cleanup] : cleanup, 'Owned fixture failure')
})

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return {
    promise,
    resolve(value: T): void {
      if (!resolve) throw new Error('Deferred fixture was not initialized')
      resolve(value)
    },
  }
}

function guardError(operation: () => void): unknown {
  try {
    operation()
  } catch (error) {
    return error
  }
  throw new Error('Expected the public scheduler guard to reject')
}

async function controlledScheduler(
  operation: (fixture: {
    scheduler: ReturnType<typeof createChatDatabaseScheduler>
    entered: Promise<number>
    release(): void
    calls(): number
    scopeCalls(): number
  }) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-inspection-boundary-'))
  const entered = deferred<number>()
  const held = deferred<void>()
  let storage: Storage | undefined
  let statistics: ReturnType<typeof createChatDatabaseStatisticsService> | undefined
  let maintenance: ReturnType<typeof createChatDatabaseMaintenanceService> | undefined
  let scheduler: ReturnType<typeof createChatDatabaseScheduler> | undefined
  let primary: unknown
  let failed = false
  const cleanup: unknown[] = []
  try {
    const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
    await ensurePathLayout(layout)
    const actual = new Storage(layout.database, layout)
    storage = actual
    await actual.call('ready')
    let calls = 0
    let scopeCalls = 0
    const port: StoragePort = {
      async call<K extends keyof StorageMethods>(
        method: K,
        ...args: Parameters<StorageMethods[K]>
      ): Promise<ReturnType<StorageMethods[K]>> {
        calls++
        const dispatchedAt = Date.now()
        const hold = method === 'chatDatabaseTaskScopes' && ++scopeCalls === 1
        const result = await actual.call(method, ...args)
        if (hold) {
          entered.resolve(dispatchedAt)
          await held.promise
        }
        return result
      },
      close: () => actual.close(),
    }
    const settings = new SettingsService(port)
    const actualStatistics = createChatDatabaseStatisticsService(port, settings, createChatDatabaseFileScanner(layout))
    statistics = actualStatistics
    const actualMaintenance = createChatDatabaseMaintenanceService(
      port,
      settings,
      actualStatistics,
      {
        protection: () => null,
        removeSession: (input) => actual.call('chatDatabaseDeleteSession', input),
        deleted: async () => {},
      },
      undefined,
      undefined,
      { recover: false },
    )
    maintenance = actualMaintenance
    const actualScheduler = createChatDatabaseScheduler(port, settings, actualStatistics, actualMaintenance, {
      start: false,
    })
    scheduler = actualScheduler
    await operation({
      scheduler: actualScheduler,
      entered: entered.promise,
      release: () => held.resolve(undefined),
      calls: () => calls,
      scopeCalls: () => scopeCalls,
    })
  } catch (error) {
    failed = true
    primary = error
  } finally {
    held.resolve(undefined)
    for (const close of [
      () => scheduler?.close(),
      () => maintenance?.close(),
      () => statistics?.close(),
      () => storage?.close(),
    ]) {
      try {
        await close()
      } catch (error) {
        cleanup.push(error)
      }
    }
    if (!cleanup.length) {
      try {
        await rm(root, { recursive: true })
      } catch (error) {
        cleanup.push(error)
      }
    }
  }
  if (failed && !cleanup.length) throw primary
  if (cleanup.length)
    throw new AggregateError(failed ? [primary, ...cleanup] : cleanup, 'Owned scheduler boundary fixture failed', {
      cause: failed ? primary : cleanup[0],
    })
}

test('quiesce synchronously fences new checks and waits for the admitted real SQLite read', async () => {
  await controlledScheduler(async ({ scheduler, entered, release, calls, scopeCalls }) => {
    const admitted = scheduler.check()
    await entered
    expect(scopeCalls()).toBe(1)
    expect(scheduler.check()).toBe(admitted)
    expect(scheduler.idleSnapshot()).toMatchObject({ current: true, paused: false })
    expect(guardError(() => scheduler.idleRestore({ version: 1, cursor: null, nextCheckAt: null }))).toMatchObject({
      code: 'BUSY',
    })
    const quiescing = scheduler.quiesceInspection()
    expect(scheduler.quiesceInspection()).toBe(quiescing)
    expect(scheduler.idleSnapshot()).toMatchObject({ current: true, paused: true, timer: false })
    let settled = false
    const observed = quiescing.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    const before = calls()
    await scheduler.check()
    await Promise.resolve()
    expect(calls()).toBe(before)
    expect(settled).toBe(false)
    release()
    await admitted
    const checkpoint = await quiescing
    await observed
    expect(settled).toBe(true)
    expect(scheduler.inspectionCheckpoint()).toEqual(checkpoint)
    expect(scheduler.idleSnapshot()).toMatchObject({ current: false, paused: true, timer: false })
    const drained = calls()
    scheduler.start()
    await scheduler.check()
    expect(calls()).toBe(drained)
    await scheduler.close()
    expect(guardError(() => scheduler.idleRestore(checkpoint))).toMatchObject({ code: 'BUSY' })
    expect(guardError(() => scheduler.armInspection())).toMatchObject({ code: 'BUSY' })
    let closed: unknown
    try {
      await scheduler.quiesceInspection()
    } catch (error) {
      closed = error
    }
    expect(closed).toMatchObject({ code: 'DISPOSED' })
    await scheduler.check()
    expect(calls()).toBe(drained)
  })
}, 20_000)

test('restored inspection metadata is pure and the exact future slot admits a real check without startup replay', async () => {
  await controlledScheduler(async ({ scheduler, entered, release, calls, scopeCalls }) => {
    const checkpoint = { version: 1 as const, cursor: 'session:owned-cursor', nextCheckAt: Date.now() + 100 }
    scheduler.idleRestore(checkpoint)
    const before = calls()
    for (let read = 0; read < 32; read++) {
      expect(scheduler.inspectionCheckpoint()).toEqual(checkpoint)
      expect(scheduler.idleSnapshot()).toMatchObject({
        paused: true,
        timer: false,
        current: false,
        nextDueAt: checkpoint.nextCheckAt,
      })
    }
    expect(calls()).toBe(before)
    scheduler.armInspection()
    expect(calls()).toBe(before)
    expect(scheduler.inspectionCheckpoint()).toEqual(checkpoint)
    expect(guardError(() => scheduler.armInspection())).toMatchObject({ code: 'BUSY' })
    expect(guardError(() => scheduler.idleRestore(checkpoint))).toMatchObject({ code: 'BUSY' })
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      const dispatchedAt = await Promise.race([
        entered,
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => reject(new Error('Restored inspection did not reach its real Storage read')), 300)
        }),
      ])
      expect(dispatchedAt).toBeGreaterThanOrEqual(checkpoint.nextCheckAt)
      expect(scopeCalls()).toBe(1)
      expect(scheduler.idleSnapshot()).toMatchObject({ current: true, paused: false, timer: true })
      const quiescing = scheduler.quiesceInspection()
      release()
      const restored = await quiescing
      const nextCheckAt = restored.nextCheckAt
      if (nextCheckAt === null) throw new Error('Actual inspection did not retain its next slot')
      expect(nextCheckAt).toBeGreaterThanOrEqual(checkpoint.nextCheckAt + 60_000)
      expect(scheduler.idleSnapshot()).toMatchObject({ current: false, paused: true, timer: false })
    } finally {
      if (deadline !== undefined) clearTimeout(deadline)
    }
  })
}, 20_000)
