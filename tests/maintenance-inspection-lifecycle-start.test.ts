import { expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IpcPeer, procedure } from '@hbar/runtime'
import {
  Storage,
  createPathLayout,
  ensurePathLayout,
  storageRpcCallSchema,
  storageSourceDatabaseId,
} from '@hbar/storage'
import { create as createMaintenance } from '../apps/host/src/runtime-maintenance-process'
import {
  maintenanceInspectionManifestSchema,
  maintenanceInspectionWakeReplySchema,
} from '../apps/host/src/runtime-maintenance-inspection-contract'

const childOwner = { unitId: 'maintenance', generation: 1, incarnation: 'lifecycle-fixture' }
const guard = { epoch: 'fixture-epoch', owner: childOwner }
const idleCheckpoint = z.object({
  state: z.object({
    scheduler: z.object({
      paused: z.boolean(),
      timer: z.boolean(),
      nextDueAt: z.number().nullable(),
      current: z.boolean(),
    }),
  }),
})

interface ReplyGate {
  hold(): void
  waitOne(): Promise<void>
  flush(): void
}
interface RecoveryReplyGate {
  hold(): void
  waitOne(): Promise<void>
  flush(): void
}
async function withProducer(
  purpose: 'startup' | 'idle-wake',
  action: (
    parent: IpcPeer,
    source: {
      databaseId: string
      catalogRevision: string
    },
    replies: ReplyGate,
    recovery: RecoveryReplyGate,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-inspection-lifecycle-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
  await ensurePathLayout(layout)
  const storage = new Storage(layout.database, layout)
  const oldWorker = process.env.HBAR_MAINTENANCE_WORKER
  let child: IpcPeer | undefined
  const parent = new IpcPeer({
    owner: { unitId: 'host', generation: 1, incarnation: 'parent-fixture' },
    remote: childOwner,
    transport: { send: (frame) => child?.receive(structuredClone(frame)) },
  })
  let held: unknown[] | null = null
  let received: (() => void) | null = null
  const replies: ReplyGate = {
    hold: () => {
      held = []
    },
    waitOne: () =>
      held?.length
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            received = resolve
          }),
    flush: () => {
      const frames = held
      held = null
      for (const frame of frames ?? []) parent.receive(frame)
    },
  }
  child = new IpcPeer({
    owner: childOwner,
    remote: parent.owner,
    transport: {
      send: (frame) => {
        if (held) {
          if (held.length >= 16) throw new Error('FIXTURE_REPLY_CAPACITY')
          held.push(structuredClone(frame))
          received?.()
          received = null
        } else parent.receive(structuredClone(frame))
      },
    },
  })
  let releaseRecovery: (() => void) | undefined
  let recoveryRead: (() => void) | undefined
  let recoveryHeld = false,
    recoveryObserved = false
  const recovery: RecoveryReplyGate = {
    hold: () => {
      recoveryHeld = true
      recoveryObserved = false
    },
    waitOne: () =>
      recoveryObserved
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            recoveryRead = resolve
          }),
    flush: () => {
      recoveryHeld = false
      releaseRecovery?.()
      releaseRecovery = undefined
    },
  }
  parent.register(
    'maintenance.storage',
    procedure(storageRpcCallSchema, z.unknown(), async (input) => {
      const result: unknown = await storage.executeRpc(input)
      // Gate the actual committed Storage reply, not a fabricated journal result or private scheduler state.
      if (input.method === 'chatDatabasePending' && recoveryHeld) {
        await new Promise<void>((resolve) => {
          releaseRecovery = resolve
          recoveryObserved = true
          recoveryRead?.()
          recoveryRead = undefined
        })
      }
      return result
    }),
  )
  const service = createMaintenance({
    peer: child,
    preparing: () => false,
    purpose,
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
    await action(
      parent,
      { databaseId: storageSourceDatabaseId(layout.database), catalogRevision: 'b'.repeat(64) },
      replies,
      recovery,
    )
  } catch (error) {
    primary = error
  } finally {
    replies.flush()
    recovery.flush()
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
    if (oldWorker === undefined) delete process.env.HBAR_MAINTENANCE_WORKER
    else process.env.HBAR_MAINTENANCE_WORKER = oldWorker
    if (!cleanup.length) {
      try {
        await rm(root, { recursive: true })
      } catch (error) {
        cleanup.push(error)
      }
    }
  }
  if (primary || cleanup.length)
    throw new AggregateError(primary ? [primary, ...cleanup] : cleanup, 'Owned lifecycle fixture failure')
}

test('normal boot start/start and stop/start/start preserve the original scheduler deadline', async () => {
  await withProducer('startup', async (parent) => {
    await parent.call('maintenance.resume', { recover: false }, z.undefined())
    await parent.call('maintenance.inspection.resume', guard, z.undefined())
    await parent.call('maintenance.inspection.resume', guard, z.undefined())
    const before = await parent.call('maintenance.idleCheckpoint', undefined, idleCheckpoint)
    await parent.call('maintenance.inspection.pause', guard, z.undefined())
    const paused = await parent.call('maintenance.idleCheckpoint', undefined, idleCheckpoint)
    expect(paused.state.scheduler.paused).toBe(true)
    expect(paused.state.scheduler.timer).toBe(false)
    await Promise.all([
      parent.call('maintenance.inspection.resume', guard, z.undefined()),
      parent.call('maintenance.inspection.resume', guard, z.undefined()),
    ])
    const after = await parent.call('maintenance.idleCheckpoint', undefined, idleCheckpoint)
    expect(after.state.scheduler.nextDueAt).toBe(before.state.scheduler.nextDueAt)
    expect(after.state.scheduler.timer).toBe(true)
    await parent.call('maintenance.inspection.resume', guard, z.undefined())
    await expect(
      parent.call('maintenance.inspection.resume', { ...guard, epoch: 'stale' }, z.undefined()),
    ).rejects.toBeDefined()
  })
})

test('late start ACK cannot rearm after a newer stop already paused the actual child scheduler', async () => {
  await withProducer('startup', async (parent, _source, replies) => {
    await parent.call('maintenance.resume', { recover: false }, z.undefined())
    await parent.call('maintenance.inspection.pause', guard, z.undefined())
    replies.hold()
    const start = parent.call('maintenance.inspection.resume', guard, z.undefined())
    await replies.waitOne() // Real child executed start; only its IPC reply is delayed.
    const stop = parent.call('maintenance.inspection.pause', guard, z.undefined())
    replies.flush()
    await Promise.all([start, stop])
    const paused = await parent.call('maintenance.idleCheckpoint', undefined, idleCheckpoint)
    expect(paused.state.scheduler.paused).toBe(true)
    expect(paused.state.scheduler.timer).toBe(false)
    await parent.call('maintenance.inspection.resume', guard, z.undefined())
    await parent.call('maintenance.inspection.resume', guard, z.undefined())
    expect((await parent.call('maintenance.idleCheckpoint', undefined, idleCheckpoint)).state.scheduler.timer).toBe(
      true,
    )
  })
})

test('acknowledged idle restore start/start is idempotent; committed transfer never reopens', async () => {
  await withProducer('idle-wake', async (parent, source) => {
    const checkpoint = { version: 1, cursor: null, nextCheckAt: Date.now() + 60_000 }
    const ack = { epoch: guard.epoch, token: crypto.randomUUID(), version: 1, source }
    await parent.call('maintenance.inspection.restore', { ack, checkpoint }, maintenanceInspectionWakeReplySchema)
    await parent.call('maintenance.inspection.resume', guard, z.undefined())
    await parent.call('maintenance.inspection.resume', guard, z.undefined())
    const active = await parent.call('maintenance.idleCheckpoint', undefined, idleCheckpoint)
    expect(active.state.scheduler.timer).toBe(true)
    expect(active.state.scheduler.nextDueAt).toBe(checkpoint.nextCheckAt)
    await parent.call('maintenance.inspection.preview', source, maintenanceInspectionManifestSchema)
    const nextAck = { ...ack, token: crypto.randomUUID(), version: 2 }
    await parent.call('maintenance.inspection.quiesce', nextAck, maintenanceInspectionManifestSchema)
    await parent.call('maintenance.inspection.commit', nextAck, z.unknown())
    await expect(parent.call('maintenance.inspection.resume', guard, z.undefined())).rejects.toBeDefined()
  })
})

test('a later stop supersedes a resume awaiting quiescence, leaving the timer paused until a new start', async () => {
  await withProducer('startup', async (parent) => {
    await parent.call('maintenance.resume', { recover: false }, z.undefined())
    // Paired IpcPeer invokes handlers against the actual child; no direct scheduler state mutation.
    const pause = parent.call('maintenance.inspection.pause', guard, z.undefined())
    const resume = parent.call('maintenance.inspection.resume', guard, z.undefined())
    const stop = parent.call('maintenance.inspection.pause', guard, z.undefined())
    const outcomes = await Promise.allSettled([pause, resume, stop])
    expect(outcomes[0]?.status).toBe('fulfilled')
    expect(outcomes[2]?.status).toBe('fulfilled')
    expect(outcomes[1]?.status).toBe('rejected')
    const paused = await parent.call('maintenance.idleCheckpoint', undefined, idleCheckpoint)
    expect(paused.state.scheduler.paused).toBe(true)
    expect(paused.state.scheduler.timer).toBe(false)
    await parent.call('maintenance.inspection.resume', guard, z.undefined())
    const started = await parent.call('maintenance.idleCheckpoint', undefined, idleCheckpoint)
    expect(started.state.scheduler.timer).toBe(true)
  })
})

test('a replayed idle restore ACK cannot attest an armed timer after a public stop', async () => {
  await withProducer('idle-wake', async (parent, source) => {
    const checkpoint = { version: 1, cursor: null, nextCheckAt: Date.now() + 60_000 }
    const ack = { epoch: guard.epoch, token: crypto.randomUUID(), version: 1, source }
    await parent.call('maintenance.inspection.restore', { ack, checkpoint }, maintenanceInspectionWakeReplySchema)
    await parent.call('maintenance.inspection.pause', guard, z.undefined())
    await expect(
      parent.call('maintenance.inspection.restore', { ack, checkpoint }, maintenanceInspectionWakeReplySchema),
    ).rejects.toBeDefined()
    const stopped = await parent.call('maintenance.idleCheckpoint', undefined, idleCheckpoint)
    expect(stopped.state.scheduler.paused).toBe(true)
    expect(stopped.state.scheduler.timer).toBe(false)
  })
})

test('a committed next transfer rejects an earlier restore memo without reopening the scheduler', async () => {
  await withProducer('idle-wake', async (parent, source) => {
    const checkpoint = { version: 1, cursor: null, nextCheckAt: Date.now() + 60_000 }
    const ack = { epoch: guard.epoch, token: crypto.randomUUID(), version: 1, source }
    await parent.call('maintenance.inspection.restore', { ack, checkpoint }, maintenanceInspectionWakeReplySchema)
    await parent.call('maintenance.inspection.preview', source, maintenanceInspectionManifestSchema)
    const nextAck = { ...ack, token: crypto.randomUUID(), version: 2 }
    await parent.call('maintenance.inspection.quiesce', nextAck, maintenanceInspectionManifestSchema)
    await parent.call('maintenance.inspection.commit', nextAck, z.unknown())
    await expect(
      parent.call('maintenance.inspection.restore', { ack, checkpoint }, maintenanceInspectionWakeReplySchema),
    ).rejects.toBeDefined()
    const transferred = await parent.call('maintenance.idleCheckpoint', undefined, idleCheckpoint)
    expect(transferred.state.scheduler.paused).toBe(true)
    expect(transferred.state.scheduler.timer).toBe(false)
  })
})

test('stop during the actual recovery Storage reply prevents late ordinary resume from rearming', async () => {
  await withProducer('startup', async (parent, _source, _replies, recovery) => {
    recovery.hold()
    const resume = parent.call('maintenance.resume', { recover: true }, z.undefined())
    const outcome = resume.then(
      () => 'fulfilled',
      () => 'rejected',
    )
    await recovery.waitOne()
    await parent.call('maintenance.inspection.pause', guard, z.undefined())
    const stopped = await parent.call('maintenance.idleCheckpoint', undefined, idleCheckpoint)
    expect(stopped.state.scheduler.paused).toBe(true)
    expect(stopped.state.scheduler.timer).toBe(false)
    recovery.flush()
    await outcome // Already accepted recovery may settle, but it must not override the newer stop.
    const after = await parent.call('maintenance.idleCheckpoint', undefined, idleCheckpoint)
    expect(after.state.scheduler.paused).toBe(true)
    expect(after.state.scheduler.timer).toBe(false)
  })
})

test('an active exact restore replay remains idempotent and changed checkpoint cannot consume its ACK', async () => {
  await withProducer('idle-wake', async (parent, source) => {
    const checkpoint = { version: 1, cursor: null, nextCheckAt: Date.now() + 60_000 }
    const ack = { epoch: guard.epoch, token: crypto.randomUUID(), version: 1, source }
    const first = await parent.call(
      'maintenance.inspection.restore',
      { ack, checkpoint },
      maintenanceInspectionWakeReplySchema,
    )
    const before = await parent.call('maintenance.idleCheckpoint', undefined, idleCheckpoint)
    const repeated = await parent.call(
      'maintenance.inspection.restore',
      { ack, checkpoint },
      maintenanceInspectionWakeReplySchema,
    )
    expect(repeated).toEqual(first)
    expect(repeated.owner).toEqual(childOwner)
    expect(repeated.timerArmed).toBe(true)
    await expect(
      parent.call(
        'maintenance.inspection.restore',
        {
          ack,
          checkpoint: { ...checkpoint, nextCheckAt: checkpoint.nextCheckAt + 1 },
        },
        maintenanceInspectionWakeReplySchema,
      ),
    ).rejects.toBeDefined()
    const afterRejected = await parent.call('maintenance.idleCheckpoint', undefined, idleCheckpoint)
    expect(afterRejected.state.scheduler).toEqual(before.state.scheduler)
    expect(afterRejected.state.scheduler.timer).toBe(true)
    expect(afterRejected.state.scheduler.paused).toBe(false)
    expect(
      await parent.call('maintenance.inspection.restore', { ack, checkpoint }, maintenanceInspectionWakeReplySchema),
    ).toEqual(first)
  })
})
