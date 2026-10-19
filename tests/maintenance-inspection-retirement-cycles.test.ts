// Real alarm-transfer implementation; synthetic physical proof ports.
import { expect, test } from 'bun:test'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import type { RuntimePhysicalRetirementReceipt } from '@hbar/runtime'
import {
  RuntimeMaintenanceAlarmTransfer,
  type MaintenanceCleanExitProof,
} from '../apps/host/src/runtime-maintenance-alarm-transfer'
import type { MaintenanceInspectionManifest } from '../apps/host/src/runtime-maintenance-inspection-contract'
import type {
  RuntimeAlarmAttempt,
  RuntimeAlarmClock,
  RuntimeAlarmTimer,
} from '../apps/host/src/runtime-demand-alarm-scheduler'

class Clock implements RuntimeAlarmClock {
  time = 1_000
  private pending: { callback(): void; due: number } | null = null
  now(): number {
    return this.time
  }
  schedule(callback: () => void, delay: number): RuntimeAlarmTimer {
    const job = { callback, due: this.time + delay }
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
    if (job && job.due <= time) {
      this.pending = null
      job.callback()
    }
  }
}
const owner = (generation: number): RuntimeOwner => ({
  unitId: 'maintenance',
  generation,
  incarnation: `cycle-${generation}`,
})
const physical = (value: RuntimeOwner): RuntimePhysicalRetirementReceipt => ({
  owner: value,
  childPid: 1,
  exitCode: 0,
  nativeJoined: true,
  onExitCompleted: true,
  forced: false,
  cleanDisposeAck: true,
})
const clean = (value: RuntimeOwner): MaintenanceCleanExitProof => ({ ...physical(value), ownerCleanupComplete: true })
const manifest = (deadline: number): MaintenanceInspectionManifest => ({
  version: 1,
  coverage: 'periodic-inspection',
  source: { databaseId: 'a'.repeat(64), catalogRevision: 'b'.repeat(64) },
  checkpoint: { version: 1, cursor: 'real-domain-checkpoint-fixture', nextCheckAt: deadline },
  journal: {
    version: 1,
    coverage: 'complete-single-database',
    databaseId: 'a'.repeat(64),
    empty: true,
    firstActiveId: null,
    counts: { accepted: 0, running: 0, cancelRequested: 0, unknown: 0, invalid: 0 },
  },
})

test('forty sequential sleep/wake obligations replace one alarm record and release every known physical hold', async () => {
  const clock = new Clock()
  let fresh = owner(2),
    calls = 0,
    releases = 0,
    sealed = false
  const transfer = new RuntimeMaintenanceAlarmTransfer(
    'epoch',
    {
      catalog: () => ({ revision: 'b'.repeat(64), databaseIds: ['a'.repeat(64)] }),
      seal: () => {
        sealed = true
      },
      sealed: () => sealed,
      unsealKnownAbort: () => {
        sealed = false
      },
      physicalExit: async (previous) => clean(previous),
      acquire: async () => ({
        owner: fresh,
        release: () => {
          releases++
        },
      }),
      initializeIdle: async (value, ack, checkpoint) => {
        calls++
        return { owner: value, ack, checkpoint, timerArmed: true }
      },
    },
    clock,
  )
  try {
    for (let i = 0; i < 40; i++) {
      fresh = owner(i + 2)
      const input = manifest(2_000 + i * 100)
      const ack = transfer.offer(owner(i + 1), input)
      transfer.commit(owner(i + 1), ack, input)
      transfer.activate({ owner: owner(i + 1), ack })
      clock.advance(input.checkpoint.nextCheckAt ?? 0)
      await transfer.whenSettled()
      expect(transfer.peek().alarm.entries).toHaveLength(1)
      expect(transfer.peek().alarm.inFlight).toBeNull()
      expect(transfer.peek().physicalOwner).toBeNull()
      expect(transfer.peek().committed?.phase).toBe('delivered')
      expect(calls).toBe(i + 1)
      expect(releases).toBe(i + 1)
    }
  } finally {
    transfer.stop()
    await transfer.whenSettled()
  }
})

test('native retirement releases an unknown physical lease without owner cleanup and never reopens restore admission', async () => {
  const clock = new Clock(),
    input = manifest(2_000),
    previous = owner(1),
    fresh = owner(2)
  let calls = 0,
    releases = 0,
    cleanupReads = 0
  const transfer = new RuntimeMaintenanceAlarmTransfer(
    'epoch',
    {
      catalog: () => ({ revision: input.source.catalogRevision, databaseIds: [input.source.databaseId] }),
      seal: () => {},
      sealed: () => true,
      unsealKnownAbort: () => {},
      physicalExit: async (value) => {
        cleanupReads++
        return clean(value)
      },
      acquire: async () => ({
        owner: fresh,
        release: () => {
          releases++
        },
      }),
      initializeIdle: async () => {
        calls++
        throw new Error('SYNTHETIC_UNKNOWN_REPLY')
      },
    },
    clock,
  )
  try {
    const ack = transfer.offer(previous, input)
    transfer.commit(previous, ack, input)
    transfer.activate({ owner: previous, ack })
    clock.advance(2_000)
    await transfer.whenSettled()
    const snapshot = transfer.peek().alarm
    if (!snapshot.inFlight || snapshot.inFlightAttempt === null) throw new Error('Expected exact unknown attempt')
    const attempt = {
      key: snapshot.inFlight.key,
      id: snapshot.inFlight.id,
      version: snapshot.inFlight.version,
      epoch: snapshot.inFlight.epoch,
      attempt: snapshot.inFlightAttempt,
    } satisfies RuntimeAlarmAttempt
    expect(snapshot.inFlightFenced).toBe(true)
    expect(releases).toBe(0)
    expect(transfer.pendingPhysicalAttempt()).toEqual(attempt)
    expect(transfer.physicalExitConfirmed(physical(owner(3)))).toBe(false)
    // Contains no ownerCleanupComplete field: this path cannot wait on Manager cleanup.
    expect(
      transfer.physicalExitConfirmed({ ...physical(fresh), forced: true, cleanDisposeAck: false, exitCode: 1 }),
    ).toBe(true)
    expect(releases).toBe(1)
    expect(transfer.pendingPhysicalAttempt()).toEqual(attempt)
    expect(transfer.peek().physicalOwner).toBeNull()
    expect(await transfer.reconcile(attempt)).toBe(true)
    expect(transfer.pendingPhysicalAttempt()).toBeNull()
    expect(cleanupReads).toBe(1) // Only old-owner pre-restore proof, never post-exit cleanup.
    expect(transfer.peek().alarm.entries[0]?.phase).toBe('blocked')
    expect(transfer.restoreAck(previous, clean(previous))).toBeNull()
    await expect(transfer.wakeForeground(fresh, ack)).rejects.toBeDefined()
    expect(() => transfer.offer(fresh, input)).toThrow()
    expect(calls).toBe(1)
    expect(transfer.physicalExitConfirmed(physical(fresh))).toBe(false)
    expect(releases).toBe(1)
  } finally {
    transfer.stop()
    await transfer.whenSettled()
  }
})

test('known restore reply survives native retirement before the reply without a second physical release', async () => {
  const clock = new Clock(),
    input = manifest(2_000),
    previous = owner(1),
    fresh = owner(2)
  let releases = 0
  let transfer: RuntimeMaintenanceAlarmTransfer
  transfer = new RuntimeMaintenanceAlarmTransfer(
    'epoch',
    {
      catalog: () => ({ revision: input.source.catalogRevision, databaseIds: [input.source.databaseId] }),
      seal: () => {},
      sealed: () => true,
      unsealKnownAbort: () => {},
      physicalExit: async (value) => clean(value),
      acquire: async () => ({
        owner: fresh,
        release: () => {
          releases++
        },
      }),
      initializeIdle: async (value, ack, checkpoint) => {
        expect(transfer.physicalExitConfirmed(physical(value))).toBe(true)
        const pending = transfer.pendingPhysicalAttempt()
        if (!pending) throw new Error('Missing exact native-settled attempt')
        // Before the known reply settles, there is no UNKNOWN fence to clear.
        expect(await transfer.reconcile(pending)).toBe(false)
        return { owner: value, ack, checkpoint, timerArmed: true }
      },
    },
    clock,
  )
  try {
    const ack = transfer.offer(previous, input)
    transfer.commit(previous, ack, input)
    transfer.activate({ owner: previous, ack })
    clock.advance(2_000)
    await transfer.whenSettled()
    expect(releases).toBe(1)
    expect(transfer.pendingPhysicalAttempt()).toBeNull()
    expect(transfer.peek().committed?.phase).toBe('delivered')
    expect(transfer.peek().alarm.inFlightFenced).toBe(false)
    expect(transfer.peek().alarm.entries[0]?.phase).toBe('handled')
  } finally {
    transfer.stop()
    await transfer.whenSettled()
  }
})
