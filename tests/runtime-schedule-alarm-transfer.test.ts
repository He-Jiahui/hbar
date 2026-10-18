import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { IpcPeer, procedure } from '@hbar/runtime'
import { z } from 'zod'
import { RuntimeControllerAdapter } from '../apps/host/src/runtime-controller-adapter'
import {
  controllerScheduleInitializeSchema,
  controllerScheduleStatusSchema,
} from '../apps/host/src/runtime-controller-schedule-contract'
import { createScheduleStorage } from '../packages/storage/src/schedules'
import { readScheduleIdleCheckpoint } from '../packages/storage/src/schedule-idle-checkpoint'
import { RuntimeScheduleAlarmTransfer } from '../apps/host/src/runtime-schedule-alarm-transfer'
import {
  projectScheduleIdleManifest,
  scheduleWakeSchema,
  scheduleWakeReplySchema,
} from '../apps/host/src/runtime-schedule-idle-contract'
import type {
  RuntimeAlarmAttempt,
  RuntimeAlarmClock,
  RuntimeAlarmTimer,
} from '../apps/host/src/runtime-demand-alarm-scheduler'
import type { ScheduleWakeReply } from '../apps/host/src/runtime-schedule-idle-contract'
import { RuntimeDemandAlarmScheduler } from '../apps/host/src/runtime-demand-alarm-scheduler'
import type { DemandLease } from '@hbar/runtime'

const databaseId = 'd'.repeat(64)
const catalogRevision = 'c'.repeat(64)
const owner = { unitId: 'controller', generation: 1, incarnation: 'controller-original' }
class Clock implements RuntimeAlarmClock {
  time = 1000
  readonly tasks: { callback(): void; dueAt: number; cancelled: boolean }[] = []
  now(): number {
    return this.time
  }
  schedule(callback: () => void, delayMs: number): RuntimeAlarmTimer {
    const task = { callback, dueAt: this.time + delayMs, cancelled: false }
    this.tasks.push(task)
    return {
      cancel: () => {
        task.cancelled = true
      },
    }
  }
  advance(time: number): void {
    this.time = time
    for (const task of [...this.tasks])
      if (!task.cancelled && task.dueAt <= time) {
        task.cancelled = true
        task.callback()
      }
  }
}
function fixture() {
  const db = new Database(':memory:')
  db.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE workspaces(id TEXT PRIMARY KEY); INSERT INTO workspaces VALUES ('workspace')",
  )
  const store = createScheduleStorage(db)
  db.exec(`CREATE TABLE runs(id TEXT PRIMARY KEY,sessionId TEXT,requestId TEXT,status TEXT);
    CREATE TABLE events(seq INTEGER,runId TEXT,sessionId TEXT,type TEXT,data TEXT);
    CREATE TABLE messages(id TEXT PRIMARY KEY);
    CREATE TABLE session_search_progress(id INTEGER PRIMARY KEY,lastMessageRowid INTEGER NOT NULL);
    INSERT INTO session_search_progress VALUES(1,0);
    CREATE TABLE session_search_queue(messageId TEXT PRIMARY KEY,nextOffset INTEGER,segmentIndex INTEGER)`)
  const definition = {
    id: 'original-schedule',
    workspaceId: 'workspace',
    name: 'Schedule',
    input: 'original-input',
    modelId: 'model',
    timezone: 'UTC',
    target: { mode: 'new-session' },
    spec: { kind: 'once', at: 2000 },
    enabled: true,
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
  }
  db.query('INSERT INTO schedules VALUES(?,?,?,?,?,?)').run(
    definition.id,
    definition.workspaceId,
    JSON.stringify(definition),
    0,
    1,
    1,
  )
  const clock = new Clock()
  const read = () => projectScheduleIdleManifest(readScheduleIdleCheckpoint(db, databaseId), clock.now())
  return { db, store, clock, read }
}
function deferred<Value>() {
  let resolveValue: (value: Value) => void = () => {
    throw new Error('Deferred not initialized')
  }
  const promise = new Promise<Value>((resolve) => {
    resolveValue = resolve
  })
  return { promise, resolve: (value: Value) => resolveValue(value) }
}

test('parent ACK alone schedules nothing, exact revalidation commits, due crosses real IPC without losing original occurrence identity', async () => {
  const f = fixture()
  let child!: IpcPeer
  const parent = new IpcPeer({
    owner: { unitId: 'host', generation: 1, incarnation: 'host' },
    remote: owner,
    transport: { send: (frame) => child.receive(structuredClone(frame)) },
  })
  child = new IpcPeer({
    owner,
    remote: parent.owner,
    transport: { send: (frame) => parent.receive(structuredClone(frame)) },
  })
  let releases = 0
  let wakeCalls = 0
  const occurrences: string[] = []
  child.register(
    'controller.scheduleIdleWake',
    procedure(scheduleWakeSchema, scheduleWakeReplySchema, () => {
      wakeCalls++
      const first = f.store.claim('original-schedule', 2000, f.clock.now())
      const replay = f.store.claim('original-schedule', 2000, f.clock.now())
      if (!first || !replay) throw new Error('Expected original idempotent claim')
      expect(replay).toEqual(first)
      occurrences.push(first.id)
      expect(first.idempotencyKey).toBe('schedule:original-schedule:2000')
      return { kind: 'settled', manifest: f.read() }
    }),
  )
  const transfer = new RuntimeScheduleAlarmTransfer(
    'parent-epoch',
    {
      acquire: () =>
        Promise.resolve({
          owner,
          release: () => {
            releases++
          },
        }),
      catalog: () => ({ revision: catalogRevision, databaseIds: [databaseId] }),
      wake: (_owner, ack) => parent.call('controller.scheduleIdleWake', { ack }, scheduleWakeReplySchema),
      physicalExit: () => Promise.resolve('unknown'),
    },
    f.clock,
  )
  try {
    const before = f.read()
    const ack = transfer.offer(owner, before)
    expect(transfer.peek().alarm.entries).toEqual([])
    f.clock.advance(1500)
    expect(wakeCalls).toBe(0)
    expect(() => transfer.commit({ ...owner, generation: 2 }, ack, f.read())).toThrow('SCHEDULE_TRANSFER_STALE')
    transfer.commit(owner, ack, f.read())
    expect(transfer.peek().committed?.phase).toBe('prepared')
    expect(transfer.peek().alarm.entries).toEqual([])
    transfer.activate(owner, ack)
    expect(transfer.peek().committed?.databaseRevisions[0]?.sourceRevision).toBe(
      before.snapshot.database.sourceRevision,
    )
    f.clock.advance(1999)
    expect(wakeCalls).toBe(0)
    f.clock.advance(2000)
    await transfer.whenSettled()
    expect(wakeCalls).toBe(1)
    expect(occurrences).toHaveLength(1)
    expect(releases).toBe(1)
    expect(transfer.peek().physicalOwner).toBeNull()
    expect(transfer.peek().alarm.entries[0]?.phase).toBe('handled')
    expect(f.store.activeScheduleOccurrences(100).items[0]?.id).toBe(occurrences[0])
  } finally {
    transfer.stop()
    await transfer.whenSettled()
    parent.close()
    child.close()
    f.db.close()
  }
})

test('changed atomic revision, incomplete coverage, uncovered DB catalog and stale transfer ACK cannot arm a sleep alarm', async () => {
  const f = fixture()
  let databases = [databaseId]
  const transfer = new RuntimeScheduleAlarmTransfer(
    'parent-epoch',
    {
      acquire: () => Promise.reject(new Error('not dispatched')),
      catalog: () => ({ revision: catalogRevision, databaseIds: databases }),
      wake: () => Promise.reject(new Error('must not dispatch')),
      physicalExit: () => Promise.resolve('unknown'),
    },
    f.clock,
  )
  try {
    const old = f.read()
    const ack = transfer.offer(owner, old)
    f.store.recordCandidate('original-schedule', 1800, 1500)
    expect(() => transfer.commit(owner, ack, f.read())).toThrow('SCHEDULE_CHECKPOINT_CHANGED')
    expect(transfer.peek().alarm.entries).toEqual([])
    expect(transfer.abort(owner, { ...ack, token: 'stale' })).toBe(false)
    expect(transfer.abort(owner, ack)).toBe(true)
    databases = [databaseId, 'e'.repeat(64)]
    expect(() => transfer.offer(owner, f.read())).toThrow('SCHEDULE_DATABASE_CATALOG_INCOMPLETE')
    databases = [databaseId]
    expect(() =>
      transfer.offer(owner, { ...f.read(), snapshot: { ...f.read().snapshot, coverage: 'incomplete' } }),
    ).toThrow('SCHEDULE_CHECKPOINT_INCOMPLETE')
    const fresh = transfer.offer(owner, f.read())
    expect(fresh.version).toBeGreaterThan(ack.version)
    expect(() => transfer.commit(owner, ack, f.read())).toThrow('SCHEDULE_TRANSFER_STALE')
    expect(transfer.abort(owner, fresh)).toBe(true)
  } finally {
    transfer.stop()
    await transfer.whenSettled()
    f.db.close()
  }
})

test('unknown physical wake retains its lease across stop and cannot reconcile from logical cancellation, stale attempt or unjoined owner', async () => {
  const f = fixture()
  let releases = 0
  let joined = false
  const attempt: { value: RuntimeAlarmAttempt | null } = { value: null }
  const transfer = new RuntimeScheduleAlarmTransfer(
    'parent-epoch',
    {
      acquire: () =>
        Promise.resolve({
          owner,
          release: () => {
            releases++
          },
        }),
      catalog: () => ({ revision: catalogRevision, databaseIds: [databaseId] }),
      wake: (_owner, _ack, actualAttempt) => {
        attempt.value = actualAttempt
        return Promise.reject(new Error('RESULT_UNKNOWN'))
      },
      physicalExit: () => Promise.resolve(joined ? 'confirmed-physical-exit' : 'unknown'),
    },
    f.clock,
  )
  try {
    const ack = transfer.offer(owner, f.read())
    transfer.commit(owner, ack, f.read())
    transfer.activate(owner, ack)
    f.clock.advance(2000)
    await transfer.whenSettled()
    const actual = attempt.value
    if (!actual) throw new Error('Expected physical attempt')
    expect(transfer.peek().alarm.inFlightFenced).toBe(true)
    expect(releases).toBe(0)
    transfer.stop()
    expect(await transfer.reconcile(actual)).toBe(false)
    joined = true
    expect(await transfer.reconcile({ ...actual, attempt: actual.attempt + 1 })).toBe(false)
    expect(releases).toBe(0)
    expect(await transfer.reconcile(actual)).toBe(true)
    expect(releases).toBe(1)
    expect(await transfer.reconcile(actual)).toBe(false)
    expect(transfer.peek().alarm.entries[0]?.phase).toBe('blocked')
  } finally {
    transfer.stop()
    await transfer.whenSettled()
    f.db.close()
  }
})

for (const first of ['alarm', 'foreground'] as const)
  test(`${first} first shares one exact physical wake with foreground and alarm`, async () => {
    const f = fixture()
    const awake = { ...owner, generation: 2, incarnation: 'controller-awake' }
    const entered = deferred<void>()
    const result = deferred<ScheduleWakeReply>()
    let wakes = 0
    let releases = 0
    const transfer = new RuntimeScheduleAlarmTransfer(
      'parent-epoch',
      {
        acquire: () =>
          Promise.resolve({
            owner: awake,
            release: () => {
              releases++
            },
          }),
        catalog: () => ({ revision: catalogRevision, databaseIds: [databaseId] }),
        wake: (actualOwner, ack) => {
          expect(actualOwner).toEqual(awake)
          expect(ack.sourceRevision).toBe(f.read().snapshot.database.sourceRevision)
          wakes++
          entered.resolve()
          return result.promise
        },
        physicalExit: () => Promise.resolve('unknown'),
      },
      f.clock,
    )
    const ack = transfer.offer(owner, f.read())
    transfer.commit(owner, ack, f.read())
    transfer.activate(owner, ack)
    if (first === 'alarm') f.clock.advance(2000)
    const foreground = transfer.wakeForeground(awake, ack)
    const foregroundAgain = transfer.wakeForeground(awake, ack)
    const settled = Promise.allSettled([foreground, foregroundAgain])
    try {
      await entered.promise
      expect(wakes).toBe(1)
      expect(transfer.peek().alarm.inFlightAttempt).toBe(1)
      if (first === 'foreground') f.clock.advance(2000)
      expect(wakes).toBe(1)
      expect(releases).toBe(0)
      result.resolve({ kind: 'settled', manifest: f.read() })
      expect((await settled).map((value) => value.status)).toEqual(['fulfilled', 'fulfilled'])
      await transfer.whenSettled()
      expect(transfer.peek().committed?.phase).toBe('delivered')
      expect(transfer.peek().alarm.inFlightFenced).toBe(false)
      expect(releases).toBe(1)
      await transfer.wakeForeground(awake, ack)
      f.clock.advance(100_000)
      await transfer.whenSettled()
      expect(wakes).toBe(1)
      expect(transfer.restoreAck(owner)).toBeNull()
      await expect(transfer.wakeForeground({ ...awake, incarnation: 'other' }, ack)).rejects.toThrow(
        'SCHEDULE_WAKE_OWNER_MISMATCH',
      )
    } finally {
      result.resolve({ kind: 'settled', manifest: f.read() })
      await settled
      transfer.stop()
      await transfer.whenSettled()
      f.db.close()
    }
  })

test('foreground UNKNOWN is shared, keeps its physical lease and never restores or retries after logical or joined completion', async () => {
  const f = fixture()
  const awake = { ...owner, generation: 2, incarnation: 'controller-awake' }
  let wakes = 0
  let releases = 0
  let joined = false
  const attempt: { value: RuntimeAlarmAttempt | null } = { value: null }
  const transfer = new RuntimeScheduleAlarmTransfer(
    'parent-epoch',
    {
      acquire: () =>
        Promise.resolve({
          owner: awake,
          release: () => {
            releases++
          },
        }),
      catalog: () => ({ revision: catalogRevision, databaseIds: [databaseId] }),
      wake: (_actual, _ack, actualAttempt) => {
        wakes++
        attempt.value = actualAttempt
        return Promise.reject(new Error('RESULT_UNKNOWN'))
      },
      physicalExit: () => Promise.resolve(joined ? 'confirmed-physical-exit' : 'unknown'),
    },
    f.clock,
  )
  try {
    const ack = transfer.offer(owner, f.read())
    transfer.commit(owner, ack, f.read())
    transfer.activate(owner, ack)
    const outcomes = await Promise.allSettled([
      transfer.wakeForeground(awake, ack),
      transfer.wakeForeground(awake, ack),
    ])
    expect(outcomes.map((value) => value.status)).toEqual(['rejected', 'rejected'])
    expect(wakes).toBe(1)
    expect(releases).toBe(0)
    transfer.pause()
    expect(transfer.peek()).toMatchObject({ paused: true, alarm: { paused: true, inFlightFenced: true } })
    transfer.resume()
    transfer.pause()
    transfer.resume()
    expect(transfer.restoreAck(owner)).toBeNull()
    await expect(transfer.wakeForeground(awake, ack)).rejects.toThrow('SCHEDULE_WAKE_NOT_CONFIRMED')
    f.clock.advance(100_000)
    expect(wakes).toBe(1)
    const actual = attempt.value
    if (!actual) throw new Error('Expected exact physical attempt')
    expect(await transfer.reconcile(actual)).toBe(false)
    joined = true
    expect(await transfer.reconcile({ ...actual, attempt: actual.attempt + 1 })).toBe(false)
    expect(await transfer.reconcile(actual)).toBe(true)
    expect(releases).toBe(1)
    transfer.pause()
    transfer.resume()
    expect(transfer.restoreAck(owner)).toBeNull()
    await expect(transfer.wakeForeground(awake, ack)).rejects.toThrow('SCHEDULE_WAKE_NOT_CONFIRMED')
    expect(wakes).toBe(1)
  } finally {
    transfer.stop()
    await transfer.whenSettled()
    f.db.close()
  }
})

test('scheduler pause preserves exact queued identity/attempts, fences runNow and stale timers, and resume rearms the original entry', async () => {
  const clock = new Clock()
  let wakes = 0
  const scheduler = new RuntimeDemandAlarmScheduler(
    'parent-epoch',
    {
      due: () => {
        wakes++
        return Promise.resolve({ kind: 'handled' })
      },
    },
    clock,
    { maxKeys: 1 },
  )
  const alarm = {
    key: 'controller:schedule',
    id: 'original-ack',
    version: 1,
    epoch: 'parent-epoch',
    unitId: 'controller',
    dueAt: 2000,
  }
  try {
    scheduler.upsert(alarm)
    const oldTimer = clock.tasks[0]
    if (!oldTimer) throw new Error('Expected original timer')
    scheduler.pause()
    const paused = scheduler.peek()
    expect(paused).toMatchObject({ paused: true, stopped: false })
    expect(paused.entries[0]).toMatchObject({ alarm, attempts: 0, phase: 'queued', nextAttemptAt: 2000 })
    expect(scheduler.runNow(alarm)).toEqual({ kind: 'paused' })
    clock.advance(3000)
    oldTimer.callback()
    expect(wakes).toBe(0)
    expect(scheduler.peek().entries).toEqual(paused.entries)
    scheduler.resume()
    expect(scheduler.peek().paused).toBe(false)
    clock.advance(3001)
    await scheduler.whenSettled()
    expect(wakes).toBe(1)
    expect(scheduler.peek().entries[0]).toMatchObject({ alarm, attempts: 1, phase: 'handled' })
    scheduler.pause()
    scheduler.resume()
    clock.advance(100_000)
    expect(wakes).toBe(1)
  } finally {
    scheduler.stop()
    await scheduler.whenSettled()
  }
})

test('close-window pause before the deferred due body prevents acquire and foreground wake until an explicit resume', async () => {
  const f = fixture()
  let acquires = 0
  let wakes = 0
  const transfer = new RuntimeScheduleAlarmTransfer(
    'parent-epoch',
    {
      acquire: () => {
        acquires++
        return Promise.resolve({ owner, release() {} })
      },
      catalog: () => ({ revision: catalogRevision, databaseIds: [databaseId] }),
      wake: () => {
        wakes++
        return Promise.resolve({ kind: 'settled', manifest: f.read() })
      },
      physicalExit: () => Promise.resolve('unknown'),
    },
    f.clock,
  )
  const ack = transfer.offer(owner, f.read())
  transfer.commit(owner, ack, f.read())
  transfer.activate(owner, ack)
  const foreground = Promise.allSettled([transfer.wakeForeground(owner, ack)])
  // runNow has accepted the same attempt, but its due body has not entered acquire yet.
  transfer.pause()
  try {
    expect((await foreground)[0]?.status).toBe('rejected')
    expect(acquires).toBe(0)
    expect(wakes).toBe(0)
    expect(transfer.peek()).toMatchObject({ paused: true, alarm: { paused: true } })
    await expect(transfer.wakeForeground(owner, ack)).rejects.toThrow('SCHEDULE_ALARMS_PAUSED')
    f.clock.advance(100_000)
    expect(acquires).toBe(0)
    transfer.resume()
    f.clock.advance(100_001)
    await transfer.whenSettled()
    expect(acquires).toBe(1)
    expect(wakes).toBe(1)
    expect(transfer.peek().alarm.entries[0]?.attempts).toBe(2)
  } finally {
    transfer.stop()
    await foreground
    await transfer.whenSettled()
    f.db.close()
  }
})

test('close-window pause while acquire is pending releases only the undispatched lease and preserves its exact safe retry', async () => {
  const f = fixture()
  const awake = { ...owner, generation: 2, incarnation: 'controller-awake' }
  const acquired = deferred<DemandLease>()
  const entered = deferred<void>()
  let acquires = 0
  let releases = 0
  let wakes = 0
  const lease = (): DemandLease => ({
    owner: awake,
    release: () => {
      releases++
    },
  })
  const transfer = new RuntimeScheduleAlarmTransfer(
    'parent-epoch',
    {
      acquire: () => {
        acquires++
        entered.resolve()
        return acquires === 1 ? acquired.promise : Promise.resolve(lease())
      },
      catalog: () => ({ revision: catalogRevision, databaseIds: [databaseId] }),
      wake: () => {
        wakes++
        return Promise.resolve({ kind: 'settled', manifest: f.read() })
      },
      physicalExit: () => Promise.resolve('unknown'),
    },
    f.clock,
  )
  const ack = transfer.offer(owner, f.read())
  transfer.commit(owner, ack, f.read())
  transfer.activate(owner, ack)
  const foreground = Promise.allSettled([transfer.wakeForeground(awake, ack)])
  try {
    await entered.promise
    transfer.pause()
    acquired.resolve(lease())
    expect((await foreground)[0]?.status).toBe('rejected')
    expect(wakes).toBe(0)
    expect(releases).toBe(1)
    expect(transfer.peek().physicalOwner).toBeNull()
    expect(transfer.peek().alarm.entries[0]).toMatchObject({ attempts: 1, phase: 'queued' })
    f.clock.advance(100_000)
    expect(acquires).toBe(1)
    transfer.resume()
    f.clock.advance(100_001)
    await transfer.whenSettled()
    expect(acquires).toBe(2)
    expect(wakes).toBe(1)
    expect(releases).toBe(2)
    expect(transfer.peek().alarm.entries[0]).toMatchObject({ attempts: 2, phase: 'handled' })
  } finally {
    acquired.resolve(lease())
    await foreground
    transfer.stop()
    await transfer.whenSettled()
    f.db.close()
  }
})

test('pause after accepted physical wake neither aborts its signal nor releases the lease early; real completion remains delivered', async () => {
  const f = fixture()
  const entered = deferred<void>()
  const result = deferred<ScheduleWakeReply>()
  const accepted: { signal: AbortSignal | null } = { signal: null }
  let releases = 0
  let wakes = 0
  const transfer = new RuntimeScheduleAlarmTransfer(
    'parent-epoch',
    {
      acquire: () =>
        Promise.resolve({
          owner,
          release: () => {
            releases++
          },
        }),
      catalog: () => ({ revision: catalogRevision, databaseIds: [databaseId] }),
      wake: (_owner, _ack, _attempt, signal) => {
        accepted.signal = signal
        wakes++
        entered.resolve()
        return result.promise
      },
      physicalExit: () => Promise.resolve('unknown'),
    },
    f.clock,
  )
  const ack = transfer.offer(owner, f.read())
  transfer.commit(owner, ack, f.read())
  transfer.activate(owner, ack)
  const foreground = Promise.allSettled([transfer.wakeForeground(owner, ack)])
  try {
    await entered.promise
    transfer.pause()
    expect(accepted.signal?.aborted).toBe(false)
    expect(releases).toBe(0)
    expect(transfer.peek()).toMatchObject({ paused: true, alarm: { inFlightFenced: false } })
    await expect(transfer.wakeForeground(owner, ack)).rejects.toThrow('SCHEDULE_ALARMS_PAUSED')
    result.resolve({ kind: 'settled', manifest: f.read() })
    expect((await foreground)[0]?.status).toBe('fulfilled')
    expect(releases).toBe(1)
    expect(transfer.peek().committed?.phase).toBe('delivered')
    expect(transfer.peek().alarm.inFlightFenced).toBe(false)
    // Pure confirmation of known delivery remains readable during a pause; no second RPC.
    await transfer.wakeForeground(owner, ack)
    transfer.resume()
    f.clock.advance(100_000)
    await transfer.whenSettled()
    expect(wakes).toBe(1)
  } finally {
    result.resolve({ kind: 'settled', manifest: f.read() })
    await foreground
    transfer.stop()
    await transfer.whenSettled()
    f.db.close()
  }
})

test('due alarm keeps its original restoration checkpoint readable while acquiring the successor', async () => {
  const f = fixture()
  const acquiring = deferred<DemandLease>()
  const awake = { ...owner, generation: 2, incarnation: 'controller-due-successor' }
  let releases = 0
  let wakes = 0
  const transfer = new RuntimeScheduleAlarmTransfer(
    'parent-epoch',
    {
      acquire: () => acquiring.promise,
      catalog: () => ({ revision: catalogRevision, databaseIds: [databaseId] }),
      wake: () => {
        wakes++
        return Promise.resolve({ kind: 'settled', manifest: f.read() })
      },
      physicalExit: () => Promise.resolve('unknown'),
    },
    f.clock,
  )
  try {
    const manifest = f.read()
    const ack = transfer.offer(owner, manifest)
    transfer.commit(owner, ack, manifest)
    transfer.activate(owner, ack)
    f.clock.advance(2000)
    await Promise.resolve()
    expect(transfer.peek().alarm.inFlight).not.toBeNull()
    expect(transfer.peek().physicalOwner).toBeNull()
    expect(transfer.restoreAck(owner)).toEqual(ack)
    expect(transfer.restoreManifest(owner, ack)).toEqual(manifest)
    expect(transfer.restoreAck(awake)).toBeNull()
    expect(wakes).toBe(0)
    acquiring.resolve({ owner: awake, release: () => releases++ })
    await transfer.whenSettled()
    expect(wakes).toBe(1)
    expect(releases).toBe(1)
    expect(transfer.peek().committed?.phase).toBe('delivered')
    expect(transfer.restoreAck(owner)).toBeNull()
  } finally {
    acquiring.resolve({ owner: awake, release: () => releases++ })
    transfer.stop()
    await transfer.whenSettled()
    f.db.close()
  }
})

test('pure restore ACK requires armed exact old owner and live catalog, and wrong foreground identity dispatches nothing', async () => {
  const f = fixture()
  const awake = { ...owner, generation: 2, incarnation: 'controller-awake' }
  let revision = catalogRevision
  let wakes = 0
  const transfer = new RuntimeScheduleAlarmTransfer(
    'parent-epoch',
    {
      acquire: () => Promise.resolve({ owner: awake, release() {} }),
      catalog: () => ({ revision, databaseIds: [databaseId] }),
      wake: () => {
        wakes++
        return Promise.resolve({ kind: 'settled', manifest: f.read() })
      },
      physicalExit: () => Promise.resolve('unknown'),
    },
    f.clock,
  )
  try {
    const ack = transfer.offer(owner, f.read())
    expect(transfer.restoreAck(owner)).toBeNull()
    transfer.commit(owner, ack, f.read())
    expect(transfer.restoreAck(owner)).toBeNull()
    transfer.activate(owner, ack)
    const timers = f.clock.tasks.length
    expect(transfer.restoreAck(owner)).toEqual(ack)
    expect(transfer.restoreAck(awake)).toBeNull()
    expect(f.clock.tasks).toHaveLength(timers)
    revision = 'e'.repeat(64)
    expect(transfer.restoreAck(owner)).toBeNull()
    revision = catalogRevision
    await expect(transfer.wakeForeground(awake, { ...ack, token: 'stale' })).rejects.toThrow('SCHEDULE_TRANSFER_STALE')
    await expect(transfer.wakeForeground(owner, ack)).rejects.toThrow('SCHEDULE_WAKE_NOT_CONFIRMED')
    expect(wakes).toBe(0)
    await transfer.wakeForeground(awake, ack)
    expect(wakes).toBe(1)
  } finally {
    transfer.stop()
    await transfer.whenSettled()
    f.db.close()
  }
})

for (const fails of [false, true])
  test(`actual adapter resume/wake initialization singleflight, failure=${String(fails)}`, async () => {
    const f = fixture()
    let child!: IpcPeer
    const parent = new IpcPeer({
      owner: { unitId: 'host', generation: 1, incarnation: 'host' },
      remote: owner,
      transport: { send: (frame) => child.receive(structuredClone(frame)) },
    })
    child = new IpcPeer({
      owner,
      remote: parent.owner,
      transport: { send: (frame) => parent.receive(structuredClone(frame)) },
    })
    const initialized = deferred<void>()
    const release = deferred<void>()
    let initializations = 0
    let resumes = 0
    let wakes = 0
    child.register(
      'controller.schedule.initialize',
      procedure(controllerScheduleInitializeSchema, controllerScheduleStatusSchema, async () => {
        initializations++
        initialized.resolve()
        await release.promise
        if (fails) throw new Error('initialization reply unavailable')
        return { phase: 'open' }
      }),
    )
    child.register(
      'controller.resume',
      procedure(z.undefined(), z.undefined(), () => {
        resumes++
      }),
    )
    child.register(
      'controller.schedule.wake',
      procedure(scheduleWakeSchema, scheduleWakeReplySchema, () => {
        wakes++
        return { kind: 'settled', manifest: f.read() }
      }),
    )
    const adapter = new RuntimeControllerAdapter(parent)
    const transfer = new RuntimeScheduleAlarmTransfer(
      'parent-epoch',
      {
        acquire: () => Promise.reject(new Error('not used')),
        catalog: () => ({ revision: catalogRevision, databaseIds: [databaseId] }),
        wake: () => Promise.reject(new Error('not used')),
        physicalExit: () => Promise.resolve('unknown'),
      },
      f.clock,
    )
    const ack = transfer.offer(owner, f.read())
    const outcomes = Promise.allSettled([adapter.resume(), adapter.wakeSchedule(ack)])
    try {
      await initialized.promise
      expect(adapter.scheduleIdleSnapshot()).toEqual({ initialized: false, fenced: true })
      expect(initializations).toBe(1)
      expect(wakes).toBe(0)
      release.resolve()
      expect((await outcomes).map((value) => value.status)).toEqual(
        fails ? ['rejected', 'rejected'] : ['fulfilled', 'fulfilled'],
      )
      expect(adapter.scheduleIdleSnapshot()).toEqual({ initialized: !fails, fenced: fails })
      if (fails) {
        await expect(adapter.resume()).rejects.toThrow()
        await expect(adapter.wakeSchedule(ack)).rejects.toThrow()
        await expect(adapter.dispatch('{}', () => Promise.resolve(null))).rejects.toMatchObject({
          code: 'RUNTIME_IDLE_FENCED',
        })
        expect(resumes).toBe(0)
        expect(wakes).toBe(0)
      } else {
        expect(resumes).toBe(1)
        expect(wakes).toBe(1)
      }
      expect(initializations).toBe(1)
    } finally {
      release.resolve()
      await outcomes
      adapter.dispose()
      parent.close()
      child.close()
      transfer.stop()
      await transfer.whenSettled()
      f.db.close()
    }
  })

test('scheduler rejects control-character identities before timer allocation or due execution and preserves permitted boundaries', () => {
  const clock = new Clock()
  let invoked = 0
  const scheduler = new RuntimeDemandAlarmScheduler(
    'epoch',
    {
      due: () => {
        invoked++
        return Promise.resolve({ kind: 'handled' })
      },
    },
    clock,
  )
  const alarm = { key: 'key', id: 'id', epoch: 'epoch', unitId: 'kernel', version: 1, dueAt: 2000 }
  try {
    for (const codepoint of [0, 1, 9, 10, 13, 30, 31]) {
      for (const field of ['key', 'id', 'epoch', 'unitId'] as const) {
        expect(() =>
          scheduler.upsert({ ...alarm, [field]: 'prefix' + String.fromCharCode(codepoint) + 'suffix' }),
        ).toThrow(RangeError)
        expect(scheduler.peek().entries).toHaveLength(0)
        expect(clock.tasks).toHaveLength(0)
        expect(invoked).toBe(0)
      }
    }
    expect(
      () =>
        new RuntimeDemandAlarmScheduler(
          'prefix' + String.fromCharCode(31),
          {
            due: () => Promise.resolve({ kind: 'handled' }),
          },
          clock,
        ),
    ).toThrow(RangeError)
    expect(scheduler.upsert({ ...alarm, key: ' ' + String.fromCharCode(127) })).toBe('accepted')
    expect(clock.tasks).toHaveLength(1)
    expect(invoked).toBe(0)
    expect(scheduler.peek().entries).toHaveLength(1)
  } finally {
    scheduler.stop()
  }
})
