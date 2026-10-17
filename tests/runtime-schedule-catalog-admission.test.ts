import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createScheduleStorage } from '../packages/storage/src/schedules'
import { readScheduleIdleCheckpoint } from '../packages/storage/src/schedule-idle-checkpoint'
import { RuntimeScheduleAlarmTransfer } from '../apps/host/src/runtime-schedule-alarm-transfer'
import { projectScheduleIdleManifest, type ScheduleWakeReply } from '../apps/host/src/runtime-schedule-idle-contract'
import type { RuntimeAlarmClock, RuntimeAlarmTimer } from '../apps/host/src/runtime-demand-alarm-scheduler'
import type { DemandLease } from '@hbar/runtime'
class Clock implements RuntimeAlarmClock {
  time = 1000
  now() {
    return this.time
  }
  schedule(_callback: () => void, _delay: number): RuntimeAlarmTimer {
    return { cancel() {} }
  }
}
function deferred<Value>() {
  let resolve: (value: Value) => void = () => {
    throw new Error('Uninitialized deferred')
  }
  const promise = new Promise<Value>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function failure(operation: Promise<void>) {
  try {
    await operation
    return false
  } catch {
    return true
  }
}
const oldOwner = { unitId: 'controller', generation: 1, incarnation: 'catalog-old' },
  awake = { unitId: 'controller', generation: 2, incarnation: 'catalog-new' }
const databaseId = 'd'.repeat(64),
  revision = 'a'.repeat(64)
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
  const clock = new Clock(),
    manifest = projectScheduleIdleManifest(readScheduleIdleCheckpoint(db, databaseId), clock.now())
  return { db, clock, manifest }
}
for (const change of ['revision', 'databases'] as const) {
  test(`queued foreground rejects stale ${change} before any new lease or wake`, async () => {
    const f = fixture()
    let catalog = { revision, databaseIds: [databaseId] },
      acquired = 0,
      wakes = 0,
      released = 0
    const transfer = new RuntimeScheduleAlarmTransfer(
      'epoch',
      {
        catalog: () => catalog,
        acquire: () => {
          acquired++
          return Promise.resolve({
            owner: awake,
            release() {
              released++
            },
          })
        },
        wake: () => {
          wakes++
          return Promise.resolve({ kind: 'settled', manifest: f.manifest })
        },
        physicalExit: () => Promise.resolve('unknown'),
      },
      f.clock,
    )
    try {
      const ack = transfer.offer(oldOwner, f.manifest)
      transfer.commit(oldOwner, ack, f.manifest)
      transfer.activate(oldOwner, ack)
      catalog =
        change === 'revision'
          ? { revision: 'b'.repeat(64), databaseIds: [databaseId] }
          : { revision, databaseIds: ['e'.repeat(64)] }
      expect(await failure(transfer.wakeForeground(awake, ack))).toBe(true)
      expect(acquired).toBe(0)
      expect(wakes).toBe(0)
      expect(released).toBe(0)
      expect(transfer.restoreAck(oldOwner)).toBeNull()
    } finally {
      transfer.stop()
      await transfer.whenSettled()
      f.db.close()
    }
  })
  test(`delivered foreground rejects stale ${change} rather than falsely confirming a new admission`, async () => {
    const f = fixture()
    let catalog = { revision, databaseIds: [databaseId] },
      acquired = 0,
      wakes = 0,
      released = 0
    const transfer = new RuntimeScheduleAlarmTransfer(
      'epoch',
      {
        catalog: () => catalog,
        acquire: () => {
          acquired++
          return Promise.resolve({
            owner: awake,
            release() {
              released++
            },
          })
        },
        wake: () => {
          wakes++
          return Promise.resolve({ kind: 'settled', manifest: f.manifest })
        },
        physicalExit: () => Promise.resolve('unknown'),
      },
      f.clock,
    )
    try {
      const ack = transfer.offer(oldOwner, f.manifest)
      transfer.commit(oldOwner, ack, f.manifest)
      transfer.activate(oldOwner, ack)
      await transfer.wakeForeground(awake, ack)
      expect(transfer.peek().committed?.phase).toBe('delivered')
      catalog =
        change === 'revision'
          ? { revision: 'b'.repeat(64), databaseIds: [databaseId] }
          : { revision, databaseIds: ['e'.repeat(64)] }
      expect(await failure(transfer.wakeForeground(awake, ack))).toBe(true)
      expect(acquired).toBe(1)
      expect(wakes).toBe(1)
      expect(released).toBe(1)
    } finally {
      transfer.stop()
      await transfer.whenSettled()
      f.db.close()
    }
  })
}
test('catalog changing while acquisition awaits blocks undispatched wake and releases its exact lease', async () => {
  const f = fixture(),
    lease = deferred<DemandLease>(),
    entered = deferred<void>()
  let catalog = { revision, databaseIds: [databaseId] },
    acquired = 0,
    wakes = 0,
    released = 0
  const transfer = new RuntimeScheduleAlarmTransfer(
    'epoch',
    {
      catalog: () => catalog,
      acquire: () => {
        acquired++
        entered.resolve()
        return lease.promise
      },
      wake: () => {
        wakes++
        return Promise.resolve({ kind: 'settled', manifest: f.manifest })
      },
      physicalExit: () => Promise.resolve('unknown'),
    },
    f.clock,
  )
  let pending: Promise<boolean> | undefined
  try {
    const ack = transfer.offer(oldOwner, f.manifest)
    transfer.commit(oldOwner, ack, f.manifest)
    transfer.activate(oldOwner, ack)
    pending = failure(transfer.wakeForeground(awake, ack))
    await entered.promise
    catalog = { revision: 'b'.repeat(64), databaseIds: [databaseId] }
    lease.resolve({
      owner: awake,
      release() {
        released++
      },
    })
    expect(await pending).toBe(true)
    expect(acquired).toBe(1)
    expect(wakes).toBe(0)
    expect(released).toBe(1)
  } finally {
    lease.resolve({
      owner: awake,
      release() {
        released++
      },
    })
    if (pending) await pending
    transfer.stop()
    await transfer.whenSettled()
    f.db.close()
  }
})
test('catalog change after actual dispatch preserves its known late reply and once-only settlement', async () => {
  const f = fixture(),
    reply = deferred<ScheduleWakeReply>(),
    entered = deferred<void>()
  let catalog = { revision, databaseIds: [databaseId] },
    acquired = 0,
    wakes = 0,
    released = 0
  const transfer = new RuntimeScheduleAlarmTransfer(
    'epoch',
    {
      catalog: () => catalog,
      acquire: () => {
        acquired++
        return Promise.resolve({
          owner: awake,
          release() {
            released++
          },
        })
      },
      wake: (_owner, ack) => {
        expect(ack.databaseId).toBe(databaseId)
        wakes++
        entered.resolve()
        return reply.promise
      },
      physicalExit: () => Promise.resolve('unknown'),
    },
    f.clock,
  )
  let pending: Promise<boolean> | undefined
  try {
    const ack = transfer.offer(oldOwner, f.manifest)
    transfer.commit(oldOwner, ack, f.manifest)
    transfer.activate(oldOwner, ack)
    pending = failure(transfer.wakeForeground(awake, ack))
    await entered.promise
    catalog = { revision: 'b'.repeat(64), databaseIds: [databaseId] }
    reply.resolve({ kind: 'settled', manifest: f.manifest })
    expect(await pending).toBe(false)
    expect(transfer.peek().committed?.phase).toBe('delivered')
    expect(transfer.peek().alarm.inFlightFenced).toBe(false)
    expect(acquired).toBe(1)
    expect(wakes).toBe(1)
    expect(released).toBe(1)
  } finally {
    reply.resolve({ kind: 'settled', manifest: f.manifest })
    if (pending) await pending
    transfer.stop()
    await transfer.whenSettled()
    f.db.close()
  }
})
