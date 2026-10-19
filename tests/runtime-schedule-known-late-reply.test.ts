import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import type { RuntimePhysicalRetirementReceipt } from '@hbar/runtime'
import { createScheduleStorage } from '../packages/storage/src/schedules'
import { readScheduleIdleCheckpoint } from '../packages/storage/src/schedule-idle-checkpoint'
import { RuntimeScheduleAlarmTransfer } from '../apps/host/src/runtime-schedule-alarm-transfer'
import { projectScheduleIdleManifest } from '../apps/host/src/runtime-schedule-idle-contract'
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

function scenario() {
  const f = fixture()
  const entered = deferred<void>()
  const result = deferred<'reply' | 'reject'>()
  let calls = 0
  let releases = 0
  let cleanupReads = 0
  let catalogRevision = 'c'.repeat(64)
  let attempt: RuntimeAlarmAttempt | undefined
  const transfer = new RuntimeScheduleAlarmTransfer(
    'parent-epoch',
    {
      acquire: () =>
        Promise.resolve({
          owner: newOwner,
          release: () => {
            releases++
          },
        }),
      catalog: () => ({ revision: catalogRevision, databaseIds: [databaseId] }),
      wake: async (owner, _ack, acceptedAttempt) => {
        expect(owner).toEqual(newOwner)
        calls++
        attempt = acceptedAttempt
        entered.resolve()
        if ((await result.promise) === 'reject') throw new Error('Wake outcome unavailable')
        return { kind: 'settled', manifest: f.manifest }
      },
      // Simulate owner cleanup which cannot complete while this transfer retains its demand lease.
      physicalExit: () => {
        cleanupReads++
        return Promise.resolve('unknown')
      },
    },
    f.clock,
  )
  const ack = transfer.offer(oldOwner, f.manifest)
  transfer.commit(oldOwner, ack, f.manifest)
  transfer.activate(oldOwner, ack)
  const physical: RuntimePhysicalRetirementReceipt = {
    owner: newOwner,
    childPid: 123,
    exitCode: 76,
    nativeJoined: true,
    onExitCompleted: true,
    forced: true,
    cleanDisposeAck: false,
  }
  return {
    ...f,
    transfer,
    entered,
    result,
    ack,
    physical,
    counts: () => ({ calls, releases, cleanupReads }),
    changeCatalog: () => {
      catalogRevision = 'e'.repeat(64)
    },
    attempt: () => {
      if (!attempt) throw new Error('Physical attempt not dispatched')
      return attempt
    },
  }
}

for (const catalogChanged of [false, true]) {
  test(`trusted physical exit does not reclassify a dispatched known successful late reply (catalog changed=${catalogChanged})`, async () => {
    const f = scenario()
    // The receipt is synthetic trusted-hook input, not proof of an actual native process exit.
    const foreground = f.transfer.wakeForeground(newOwner, f.ack)
    const outcome = foreground.then(
      () => 'resolved',
      () => 'rejected',
    )
    try {
      await f.entered.promise
      expect(f.counts()).toEqual({ calls: 1, releases: 0, cleanupReads: 0 })
      expect(f.transfer.physicalExitConfirmed(f.physical)).toBe(true)
      expect(f.transfer.physicalExitConfirmed(f.physical)).toBe(false)
      expect(f.counts()).toEqual({ calls: 1, releases: 1, cleanupReads: 0 })
      expect(f.transfer.restoreAck(oldOwner)).toBeNull()
      if (catalogChanged) f.changeCatalog()
      f.result.resolve('reply') // exact dispatched call returns a schema-valid settled reply
      expect(await outcome).toBe('resolved')
      await f.transfer.whenSettled()
      expect(f.transfer.peek().alarm.inFlightFenced).toBe(false)
      expect(f.transfer.peek().physicalOwner).toBeNull()
      expect(f.transfer.restoreAck(oldOwner)).toBeNull()
      expect(f.transfer.restoreAck(newOwner)).toBeNull()
      expect(f.transfer.physicalExitConfirmed(f.physical)).toBe(false)
      f.transfer.pause()
      f.transfer.resume()
      f.clock.advance(1_000_000)
      await f.transfer.whenSettled()
      expect(f.counts()).toEqual({ calls: 1, releases: 1, cleanupReads: 0 })
      expect(f.transfer.restoreAck(oldOwner)).toBeNull()
    } finally {
      f.result.resolve('reply')
      await outcome
      f.transfer.stop()
      await f.transfer.whenSettled()
      f.db.close()
    }
  })
}
