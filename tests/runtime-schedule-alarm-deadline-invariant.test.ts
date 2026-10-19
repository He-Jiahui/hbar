import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createScheduleStorage } from '../packages/storage/src/schedules'
import { readScheduleIdleCheckpoint } from '../packages/storage/src/schedule-idle-checkpoint'
import { RuntimeScheduleAlarmTransfer } from '../apps/host/src/runtime-schedule-alarm-transfer'
import {
  projectScheduleIdleManifest,
  scheduleIdleManifestSchema,
  type ScheduleWakeReply,
} from '../apps/host/src/runtime-schedule-idle-contract'
import type {
  RuntimeAlarmAttempt,
  RuntimeAlarmClock,
  RuntimeAlarmTimer,
} from '../apps/host/src/runtime-demand-alarm-scheduler'

class Clock implements RuntimeAlarmClock {
  time = 1000
  readonly timers: { callback(): void; at: number; cancelled: boolean }[] = []
  now(): number {
    return this.time
  }
  schedule(callback: () => void, delayMs: number): RuntimeAlarmTimer {
    const timer = { callback, at: this.time + delayMs, cancelled: false }
    this.timers.push(timer)
    return {
      cancel: () => {
        timer.cancelled = true
      },
    }
  }
  advance(time: number): void {
    this.time = time
    for (const timer of [...this.timers])
      if (!timer.cancelled && timer.at <= time) {
        timer.cancelled = true
        timer.callback()
      }
  }
}
function deferred<Value>() {
  let complete: (value: Value) => void = () => {
    throw new Error('Deferred not initialized')
  }
  const promise = new Promise<Value>((resolve) => {
    complete = resolve
  })
  return { promise, resolve: (value: Value) => complete(value) }
}
const databaseId = 'd'.repeat(64)
const oldOwner = { unitId: 'controller', generation: 1, incarnation: 'original-controller' }
const newOwner = { unitId: 'controller', generation: 2, incarnation: 'restored-controller' }
function fixture() {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE workspaces(id TEXT PRIMARY KEY)')
  createScheduleStorage(db)
  db.exec(`CREATE TABLE runs(id TEXT PRIMARY KEY,sessionId TEXT,requestId TEXT,status TEXT);
    CREATE TABLE events(seq INTEGER,runId TEXT,sessionId TEXT,type TEXT,data TEXT);
    CREATE TABLE messages(id TEXT PRIMARY KEY);
    CREATE TABLE session_search_progress(id INTEGER PRIMARY KEY,lastMessageRowid INTEGER NOT NULL);
    INSERT INTO session_search_progress VALUES(1,0);
    CREATE TABLE session_search_queue(messageId TEXT PRIMARY KEY,nextOffset INTEGER,segmentIndex INTEGER)`)
  const clock = new Clock()
  const manifest = projectScheduleIdleManifest(readScheduleIdleCheckpoint(db, databaseId), clock.now())
  return { db, clock, manifest }
}

test('public offer rejects null complete manifest before any reservation, timer, acquisition or wake', async () => {
  const f = fixture()
  let acquired = 0
  let wakes = 0
  const transfer = new RuntimeScheduleAlarmTransfer(
    'parent-epoch',
    {
      acquire: () => {
        acquired++
        return Promise.resolve({ owner: newOwner, release() {} })
      },
      catalog: () => ({ revision: 'c'.repeat(64), databaseIds: [databaseId] }),
      wake: () => {
        wakes++
        return Promise.resolve({ kind: 'settled', manifest: f.manifest })
      },
      physicalExit: () => Promise.resolve('unknown'),
    },
    f.clock,
  )
  try {
    expect(f.manifest.snapshot.coverage).toBe('complete')
    expect(f.manifest.snapshot.definitions).toEqual([])
    expect(f.manifest.nextSearchCheckAt).toBe(61000)
    expect(f.manifest.nextDueAt).toBe(61000)
    expect(() => transfer.offer(oldOwner, { ...f.manifest, nextDueAt: null })).toThrow()
    expect(transfer.peek()).toMatchObject({ offered: null, committed: null, physicalOwner: null })
    expect(transfer.peek().alarm.entries).toEqual([])
    expect(transfer.restoreAck(oldOwner)).toBeNull()
    expect(f.clock.timers).toHaveLength(0)
    f.clock.advance(1000000)
    await transfer.whenSettled()
    expect(acquired).toBe(0)
    expect(wakes).toBe(0)
  } finally {
    transfer.stop()
    await transfer.whenSettled()
    f.db.close()
  }
})

test('empty schedules retain the actual Search deadline, allow exact restore and share one foreground physical attempt', async () => {
  const f = fixture()
  const entered = deferred<void>()
  const result = deferred<ScheduleWakeReply>()
  let acquired = 0
  let wakes = 0
  let released = 0
  const attempts: RuntimeAlarmAttempt[] = []
  const transfer = new RuntimeScheduleAlarmTransfer(
    'parent-epoch',
    {
      acquire: () => {
        acquired++
        return Promise.resolve({
          owner: newOwner,
          release: () => {
            released++
          },
        })
      },
      catalog: () => ({ revision: 'c'.repeat(64), databaseIds: [databaseId] }),
      wake: (owner, ack, attempt) => {
        expect(owner).toEqual(newOwner)
        expect(ack.databaseId).toBe(databaseId)
        wakes++
        attempts.push(attempt)
        entered.resolve()
        return result.promise
      },
      physicalExit: () => Promise.resolve('unknown'),
    },
    f.clock,
  )
  const accepted: Promise<void>[] = []
  try {
    const ack = transfer.offer(oldOwner, f.manifest)
    transfer.commit(oldOwner, ack, f.manifest)
    transfer.activate(oldOwner, ack)
    expect(transfer.restoreAck(oldOwner)).toEqual(ack)
    expect(transfer.restoreAck(newOwner)).toBeNull()
    expect(transfer.peek().alarm.entries[0]).toMatchObject({ phase: 'queued', attempts: 0, nextAttemptAt: 61000 })
    expect(f.clock.timers.filter((value) => !value.cancelled)).toHaveLength(1)
    f.clock.advance(60999)
    expect(wakes).toBe(0)
    for (let index = 0; index < 30; index++) {
      const pending = transfer.wakeForeground(newOwner, ack)
      void pending.catch(() => undefined)
      accepted.push(pending)
    }
    await entered.promise
    expect(acquired).toBe(1)
    expect(wakes).toBe(1)
    expect(transfer.restoreAck(oldOwner)).toBeNull()
    result.resolve({ kind: 'settled', manifest: f.manifest })
    await Promise.all(accepted)
    expect(attempts).toEqual([
      { key: 'controller:schedule', id: ack.token, version: ack.version, epoch: ack.epoch, attempt: 1 },
    ])
    expect(released).toBe(1)
    expect(transfer.peek().committed?.phase).toBe('delivered')
    expect(transfer.peek().alarm.entries[0]?.phase).toBe('handled')
    f.clock.advance(61000)
    await transfer.whenSettled()
    expect(wakes).toBe(1)
    expect(acquired).toBe(1)
  } finally {
    result.resolve({ kind: 'settled', manifest: f.manifest })
    await Promise.allSettled(accepted)
    transfer.stop()
    await transfer.whenSettled()
    f.db.close()
  }
})

test('unchanged-source revalidation cannot postpone the originally offered absolute Search alarm deadline', async () => {
  const f = fixture()
  let acquired = 0
  let wakes = 0
  const transfer = new RuntimeScheduleAlarmTransfer(
    'parent-epoch',
    {
      acquire: () => {
        acquired++
        return Promise.resolve({ owner: newOwner, release() {} })
      },
      catalog: () => ({ revision: 'c'.repeat(64), databaseIds: [databaseId] }),
      wake: () => {
        wakes++
        return Promise.resolve({ kind: 'settled', manifest: f.manifest })
      },
      physicalExit: () => Promise.resolve('unknown'),
    },
    f.clock,
  )
  try {
    const earliestSearchDeadline = f.manifest.nextSearchCheckAt
    expect(f.manifest.observedAt).toBe(1000)
    expect(earliestSearchDeadline).toBe(61000)
    const ack = transfer.offer(oldOwner, f.manifest)
    // Move only the explicit clock's read time; never fire any due callback.
    f.clock.time = 2000
    const verified = projectScheduleIdleManifest(readScheduleIdleCheckpoint(f.db, databaseId), f.clock.now())
    expect(verified.snapshot.database.sourceRevision).toBe(ack.sourceRevision)
    expect(verified.snapshot.search.sourceRevision).toBe(f.manifest.snapshot.search.sourceRevision)
    expect(verified.nextSearchCheckAt).toBe(62000)
    // The current public schema ties this projection to its observation time.
    // The parent must preserve its earlier deadline separately, not forge a DTO.
    expect(
      scheduleIdleManifestSchema.safeParse({ ...verified, nextSearchCheckAt: earliestSearchDeadline }).success,
    ).toBe(false)
    transfer.commit(oldOwner, ack, verified)
    transfer.activate(oldOwner, ack)
    expect(transfer.peek().committed?.nextDueAt).toBe(earliestSearchDeadline)
    expect(transfer.peek().alarm.entries[0]).toMatchObject({
      phase: 'queued',
      attempts: 0,
      nextAttemptAt: earliestSearchDeadline,
      alarm: { dueAt: earliestSearchDeadline, id: ack.token, version: ack.version, epoch: ack.epoch },
    })
    expect(f.manifest.nextSearchCheckAt).toBe(earliestSearchDeadline)
    expect(f.clock.timers.filter((value) => !value.cancelled).map((value) => value.at)).toEqual([
      earliestSearchDeadline,
    ])
    expect(acquired).toBe(0)
    expect(wakes).toBe(0)
  } finally {
    transfer.stop()
    await transfer.whenSettled()
    f.db.close()
  }
})
