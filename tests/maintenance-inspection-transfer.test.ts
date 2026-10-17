// Native proof ports are fixture inputs, never physical-exit evidence.
import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { IpcPeer, procedure } from '@hbar/runtime'
import { z } from 'zod'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  Storage,
  createPathLayout,
  ensurePathLayout,
  storageRpcCallSchema,
  storageSourceDatabaseId,
} from '@hbar/storage'
import { create as createMaintenance } from '../apps/host/src/runtime-maintenance-process'
import {
  RuntimeMaintenanceAlarmTransfer,
  type MaintenanceCleanExitProof,
} from '../apps/host/src/runtime-maintenance-alarm-transfer'
import {
  maintenanceInspectionManifestSchema,
  maintenanceInspectionCommitSchema,
  maintenanceInspectionWakeReplySchema,
  type MaintenanceInspectionManifest,
} from '../apps/host/src/runtime-maintenance-inspection-contract'
import type { RuntimeAlarmClock, RuntimeAlarmTimer } from '../apps/host/src/runtime-demand-alarm-scheduler'

const oldOwner = { unitId: 'maintenance', generation: 1, incarnation: 'old-maintenance' }
const newOwner = { unitId: 'maintenance', generation: 2, incarnation: 'new-maintenance' }
class Clock implements RuntimeAlarmClock {
  time = 1_000
  readonly jobs: { callback(): void; dueAt: number; cancelled: boolean }[] = []
  now(): number {
    return this.time
  }
  schedule(callback: () => void, delayMs: number): RuntimeAlarmTimer {
    const job = { callback, dueAt: this.time + delayMs, cancelled: false }
    this.jobs.push(job)
    return {
      cancel: () => {
        job.cancelled = true
      },
    }
  }
  advance(time: number): void {
    this.time = time
    for (const job of [...this.jobs])
      if (!job.cancelled && job.dueAt <= time) {
        job.cancelled = true
        job.callback()
      }
  }
}
function manifest(): MaintenanceInspectionManifest {
  return {
    version: 1,
    coverage: 'periodic-inspection',
    source: { databaseId: 'a'.repeat(64), catalogRevision: 'b'.repeat(64) },
    checkpoint: { version: 1, cursor: 'session:cursor', nextCheckAt: 2_000 },
    journal: {
      version: 1,
      databaseId: 'a'.repeat(64),
      coverage: 'complete-single-database',
      counts: { accepted: 0, running: 0, cancelRequested: 0, unknown: 0, invalid: 0 },
      firstActiveId: null,
      empty: true,
    },
  }
}
const proof = (owner = oldOwner): MaintenanceCleanExitProof => ({
  owner,
  childPid: 1,
  exitCode: 0,
  nativeJoined: true,
  onExitCompleted: true,
  ownerCleanupComplete: true,
  forced: false,
  cleanDisposeAck: true,
})

test('parent offer does not arm; committed due and foreground share one physical IPC restore even when paused after send', async () => {
  const clock = new Clock(),
    input = manifest()
  let sealed = false,
    releases = 0,
    calls = 0
  let finish: (() => void) | undefined
  let markStarted: (() => void) | undefined
  const started = new Promise<void>((resolve) => {
    markStarted = resolve
  })
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  let child: IpcPeer | undefined
  const parent = new IpcPeer({
    owner: { unitId: 'host', generation: 1, incarnation: 'host' },
    remote: newOwner,
    transport: { send: (frame) => child?.receive(structuredClone(frame)) },
  })
  child = new IpcPeer({
    owner: newOwner,
    remote: parent.owner,
    transport: { send: (frame) => parent.receive(structuredClone(frame)) },
  })
  child.register(
    'fixture.restore',
    procedure(z.unknown(), maintenanceInspectionWakeReplySchema, async () => {
      calls++
      markStarted?.()
      await gate
      return { ack, owner: newOwner, checkpoint: input.checkpoint, timerArmed: true }
    }),
  )
  const transfer = new RuntimeMaintenanceAlarmTransfer(
    'epoch',
    {
      catalog: () => ({ revision: input.source.catalogRevision, databaseIds: [input.source.databaseId] }),
      seal: () => {
        sealed = true
      },
      sealed: () => sealed,
      unsealKnownAbort: () => {
        sealed = false
      },
      acquire: async () => ({
        owner: newOwner,
        release: () => {
          releases++
        },
      }),
      physicalExit: async () => proof(),
      initializeIdle: (_owner, value) =>
        parent.call('fixture.restore', { ack: value }, maintenanceInspectionWakeReplySchema),
    },
    clock,
  )
  const ack = transfer.offer(oldOwner, input)
  let foreground: Promise<void> | undefined
  let primary: unknown
  const cleanup: unknown[] = []
  try {
    expect(transfer.peek().alarm.entries).toHaveLength(0)
    transfer.commit(oldOwner, ack, input)
    expect(transfer.peek().alarm.entries).toHaveLength(0)
    transfer.activate({ owner: oldOwner, ack })
    clock.advance(2_000)
    await started
    foreground = transfer.wakeForeground(newOwner, ack)
    transfer.pause()
    finish?.()
    await transfer.whenSettled()
    await foreground
    expect(calls).toBe(1)
    expect(releases).toBe(1)
    expect(transfer.peek().committed?.phase).toBe('delivered')
    expect(transfer.peek().physicalOwner).toBeNull()
  } catch (error) {
    primary = error
  } finally {
    finish?.()
    transfer.stop()
    try {
      await transfer.whenSettled()
    } catch (error) {
      cleanup.push(error)
    }
    try {
      await foreground
    } catch (error) {
      cleanup.push(error)
    }
    parent.close()
    child.close()
  }
  if (primary || cleanup.length)
    throw new AggregateError(primary ? [primary, ...cleanup] : cleanup, 'Owned IPC fixture failure')
})

test('actual Maintenance producer uses paired IPC and real Storage, quiesces its scheduler and rejects new command admission', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-maintenance-transfer-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
  await ensurePathLayout(layout)
  const storage = new Storage(layout.database, layout)
  const previousWorker = process.env.HBAR_MAINTENANCE_WORKER
  let child: IpcPeer | undefined
  const parent = new IpcPeer({
    owner: { unitId: 'host', generation: 1, incarnation: 'host' },
    remote: oldOwner,
    transport: { send: (frame) => child?.receive(structuredClone(frame)) },
  })
  child = new IpcPeer({
    owner: oldOwner,
    remote: parent.owner,
    transport: { send: (frame) => parent.receive(structuredClone(frame)) },
  })
  let acceptedWhileSealed = 0,
    sealed = false
  parent.register(
    'maintenance.storage',
    procedure(storageRpcCallSchema, z.unknown(), (input) => {
      if (sealed && input.method === 'chatDatabaseOperationAccept') {
        acceptedWhileSealed++
        throw new Error('sealed')
      }
      return storage.executeRpc(input)
    }),
  )
  const service = createMaintenance({
    peer: child,
    preparing: () => false,
    purpose: 'startup',
    configuration: {
      dataRoot: layout.dataRoot,
      cacheRoot: layout.cacheRoot,
      pointerFile: layout.pointerFile,
      settingsRoot: layout.settings,
      sessionsRoot: layout.sessions,
      skillsRoot: layout.globalSkills,
      identityRoot: layout.identityRoot,
      workerPath: join(root, 'not-used-worker.js'),
    },
  })
  let primary: unknown
  const cleanup: unknown[] = []
  try {
    await storage.call('ready')
    await service.activate('default')
    await parent.call('maintenance.resume', { recover: false }, z.undefined())
    const source = { databaseId: storageSourceDatabaseId(layout.database), catalogRevision: 'b'.repeat(64) }
    let offered: MaintenanceInspectionManifest | undefined
    for (let i = 0; i < 50 && !offered; i++) {
      try {
        offered = await parent.call('maintenance.inspection.preview', source, maintenanceInspectionManifestSchema)
      } catch {
        await new Promise<void>((resolve) => setTimeout(resolve, 5))
      }
    }
    if (!offered) throw new Error('Producer did not reach a quiet inspection preview')
    const lifecycle = { epoch: 'fixture-epoch', owner: oldOwner }
    await parent.call('maintenance.inspection.pause', lifecycle, z.undefined())
    await expect(
      parent.call('maintenance.inspection.preview', source, maintenanceInspectionManifestSchema),
    ).rejects.toBeDefined()
    await expect(
      parent.call('maintenance.inspection.resume', { ...lifecycle, epoch: 'stale-epoch' }, z.undefined()),
    ).rejects.toBeDefined()
    await expect(
      parent.call('maintenance.inspection.resume', { ...lifecycle, owner: newOwner }, z.undefined()),
    ).rejects.toBeDefined()
    await parent.call('maintenance.inspection.resume', lifecycle, z.undefined())
    const resumed = await parent.call('maintenance.inspection.preview', source, maintenanceInspectionManifestSchema)
    expect(resumed.checkpoint).toEqual(offered.checkpoint)
    const ack = { epoch: 'fixture-epoch', token: crypto.randomUUID(), version: 1, source }
    sealed = true // Exact parent gate port; full RuntimeMaintenanceRelay fixture is an additional requirement.
    const final = await parent.call('maintenance.inspection.quiesce', ack, maintenanceInspectionManifestSchema)
    expect(final.journal.empty).toBe(true)
    expect(final.checkpoint.nextCheckAt).not.toBeNull()
    const committed = await parent.call('maintenance.inspection.commit', ack, maintenanceInspectionCommitSchema)
    expect(committed.owner).toEqual(oldOwner)
    if (!service.idle) throw new Error('Maintenance did not expose its idle port')
    expect((await service.idle()).eligible).toBe(true)
    await expect(parent.call('maintenance.inspection.pause', lifecycle, z.undefined())).rejects.toBeDefined()
    await expect(parent.call('maintenance.inspection.resume', lifecycle, z.undefined())).rejects.toBeDefined()
    await expect(parent.call('maintenance.resume', { recover: true }, z.undefined())).rejects.toBeDefined()
    expect(acceptedWhileSealed).toBe(0)
    // Actual DB integrity reader is independent of transfer proof; it does not emulate a receipt.
    const db = new Database(layout.database, { readonly: true })
    try {
      expect(db.query('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' })
    } finally {
      db.close()
    }
  } catch (error) {
    primary = error
  } finally {
    try {
      await service.dispose()
    } catch (error) {
      cleanup.push(error)
    }
    parent.close()
    child.close()
    try {
      await storage.close()
    } catch (error) {
      cleanup.push(error)
    }
    if (previousWorker === undefined) delete process.env.HBAR_MAINTENANCE_WORKER
    else process.env.HBAR_MAINTENANCE_WORKER = previousWorker
    if (!cleanup.length) {
      try {
        await rm(root, { recursive: true })
      } catch (error) {
        cleanup.push(error)
      }
    }
  }
  if (primary || cleanup.length)
    throw new AggregateError(primary ? [primary, ...cleanup] : cleanup, 'Owned transfer fixture failure')
})
