// Actual transfer and scheduler; proof ports below are synthetic state-machine inputs.
import { expect, test } from 'bun:test'
import {
  RuntimeMaintenanceAlarmTransfer,
  type MaintenanceCleanExitProof,
} from '../apps/host/src/runtime-maintenance-alarm-transfer'
import type {
  MaintenanceInspectionManifest,
  MaintenanceInspectionWakeReply,
} from '../apps/host/src/runtime-maintenance-inspection-contract'
import type { RuntimeAlarmClock, RuntimeAlarmTimer } from '../apps/host/src/runtime-demand-alarm-scheduler'

class Clock implements RuntimeAlarmClock {
  time = 1_000
  private pending: { callback(): void; dueAt: number } | null = null
  now(): number {
    return this.time
  }
  schedule(callback: () => void, delay: number): RuntimeAlarmTimer {
    const job = { callback, dueAt: this.time + delay }
    this.pending = job
    return {
      cancel: () => {
        if (this.pending === job) this.pending = null
      },
    }
  }
  advance(time: number): void {
    this.time = time
    const job = this.pending
    if (job && job.dueAt <= time) {
      this.pending = null
      job.callback()
    }
  }
}
const oldOwner = { unitId: 'maintenance', generation: 1, incarnation: 'old-boundary' }
const newOwner = { unitId: 'maintenance', generation: 2, incarnation: 'new-boundary' }
const input: MaintenanceInspectionManifest = {
  version: 1,
  coverage: 'periodic-inspection',
  source: { databaseId: 'a'.repeat(64), catalogRevision: 'b'.repeat(64) },
  checkpoint: { version: 1, cursor: null, nextCheckAt: 2_000 },
  journal: {
    version: 1,
    databaseId: 'a'.repeat(64),
    coverage: 'complete-single-database',
    empty: true,
    counts: { accepted: 0, running: 0, cancelRequested: 0, unknown: 0, invalid: 0 },
    firstActiveId: null,
  },
}
const proof: MaintenanceCleanExitProof = {
  owner: oldOwner,
  childPid: 1,
  exitCode: 0,
  nativeJoined: true,
  onExitCompleted: true,
  ownerCleanupComplete: true,
  forced: false,
  cleanDisposeAck: true,
}

function fixture(options: { failFirstRead?: boolean; gate?: Promise<void>; started?: () => void } = {}) {
  const clock = new Clock()
  const catalog = { revision: input.source.catalogRevision, databaseIds: [input.source.databaseId] }
  const counts = { reads: 0, acquires: 0, initializes: 0, releases: 0 }
  const transfer = new RuntimeMaintenanceAlarmTransfer(
    'boundary-epoch',
    {
      catalog: () => catalog,
      seal: () => {},
      sealed: () => true,
      unsealKnownAbort: () => {},
      physicalExit: async () => {
        counts.reads++
        if (options.failFirstRead && counts.reads === 1) throw new Error('SYNTHETIC_READ_FAILURE_BEFORE_DISPATCH')
        return proof
      },
      acquire: async () => {
        counts.acquires++
        return {
          owner: newOwner,
          release: () => {
            counts.releases++
          },
        }
      },
      initializeIdle: async (owner, ack, checkpoint): Promise<MaintenanceInspectionWakeReply> => {
        counts.initializes++
        options.started?.()
        await options.gate
        return { owner, ack, checkpoint, timerArmed: true }
      },
    },
    clock,
  )
  const ack = transfer.offer(oldOwner, input)
  transfer.commit(oldOwner, ack, input)
  transfer.activate({ owner: oldOwner, ack })
  return { clock, catalog, counts, transfer, ack }
}

test('a failed pre-dispatch proof read retries at the actual scheduler backoff without retaining a phantom physical flight', async () => {
  const f = fixture({ failFirstRead: true })
  try {
    f.clock.advance(2_000)
    await f.transfer.whenSettled()
    expect(f.counts).toEqual({ reads: 1, acquires: 0, initializes: 0, releases: 0 })
    expect(f.transfer.peek().physicalOwner).toBeNull()
    expect(f.transfer.pendingPhysicalAttempt()).toBeNull()
    expect(f.transfer.peek().alarm.inFlight).toBeNull()
    expect(f.transfer.peek().alarm.inFlightFenced).toBe(false)
    expect(f.transfer.peek().alarm.entries[0]).toMatchObject({ phase: 'queued', attempts: 1, nextAttemptAt: 3_000 })
    // Scheduler default first backoff is 1000ms, not a test override or an eager retry.
    f.clock.advance(2_999)
    await f.transfer.whenSettled()
    expect(f.counts.reads).toBe(1)
    f.clock.advance(3_000)
    await f.transfer.whenSettled()
    expect(f.counts).toEqual({ reads: 2, acquires: 1, initializes: 1, releases: 1 })
    expect(f.transfer.peek().committed?.phase).toBe('delivered')
    f.clock.advance(60_000)
    await f.transfer.whenSettled()
    expect(f.counts.initializes).toBe(1)
  } finally {
    f.transfer.stop()
    await f.transfer.whenSettled()
  }
})

for (const changed of ['revision', 'databaseIds'] as const) {
  test(`delivered ACK admits the same catalog but rejects a changed ${changed} without replay`, async () => {
    const f = fixture()
    try {
      f.clock.advance(2_000)
      await f.transfer.whenSettled()
      await f.transfer.wakeForeground(newOwner, f.ack)
      await f.transfer.wakeForeground(newOwner, f.ack)
      expect(f.counts).toEqual({ reads: 1, acquires: 1, initializes: 1, releases: 1 })
      if (changed === 'revision') f.catalog.revision = 'c'.repeat(64)
      else f.catalog.databaseIds = [input.source.databaseId, 'd'.repeat(64)]
      await expect(f.transfer.wakeForeground(newOwner, f.ack)).rejects.toBeDefined()
      expect(f.counts).toEqual({ reads: 1, acquires: 1, initializes: 1, releases: 1 })
      expect(f.transfer.peek().committed?.phase).toBe('delivered')
      expect(f.transfer.peek().alarm.inFlightFenced).toBe(false)
    } finally {
      f.transfer.stop()
      await f.transfer.whenSettled()
    }
  })
}

test('a known reply already dispatched settles normally after pause and catalog change', async () => {
  let finish: (() => void) | undefined, markStarted: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const started = new Promise<void>((resolve) => {
    markStarted = resolve
  })
  const f = fixture({
    gate,
    started: () => {
      markStarted?.()
    },
  })
  try {
    f.clock.advance(2_000)
    await started
    f.transfer.pause()
    f.catalog.revision = 'c'.repeat(64)
    finish?.()
    await f.transfer.whenSettled()
    expect(f.counts).toEqual({ reads: 1, acquires: 1, initializes: 1, releases: 1 })
    expect(f.transfer.peek().committed?.phase).toBe('delivered')
    expect(f.transfer.peek().alarm.inFlightFenced).toBe(false)
    expect(f.transfer.peek().physicalOwner).toBeNull()
    expect(f.transfer.pendingPhysicalAttempt()).toBeNull()
  } finally {
    finish?.()
    f.transfer.stop()
    await f.transfer.whenSettled()
  }
})
