import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { IpcPeer, RuntimeValuePort, procedure } from '@hbar/runtime'
import { Storage, storageRpcCallSchema, type StorageRpcCall } from '@hbar/storage'
import { create } from '../apps/host/src/runtime-controller-process'
import { runtimeControllerScopeSchema } from '../apps/host/src/runtime-controller-contract'
import { runtimeControllerIdleCheckpointSchema } from '../apps/host/src/runtime-background-idle'
import { controllerScheduleStatusSchema } from '../apps/host/src/runtime-controller-schedule-contract'
import {
  scheduleIdleManifestSchema,
  scheduleTransferAckSchema,
  scheduleWakeReplySchema,
} from '../apps/host/src/runtime-schedule-idle-contract'

function receipt() {
  let resolve: () => void = () => {
    throw new Error('Fixture receipt not initialized')
  }
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve: () => resolve() }
}

// No child lifecycle handler is replaced. The only supplied Host boundaries are a
// validated background scope and Storage.executeRpc backed by its actual Worker.
async function fixture() {
  const root = resolve(await mkdtemp(join(tmpdir(), 'hbar-controller-resume-')))
  if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-controller-resume-'))
    throw new Error('Unowned Controller resume fixture path')
  const storage = new Storage(join(root, 'state.sqlite'))
  let child!: IpcPeer
  const parent = new IpcPeer({
    owner: { unitId: 'host', generation: 1, incarnation: 'resume-component-host' },
    remote: { unitId: 'controller', generation: 1, incarnation: 'resume-component-child' },
    transport: {
      send: (frame) => {
        queueMicrotask(() => child.receive(structuredClone(frame)))
      },
    },
  })
  child = new IpcPeer({
    owner: parent.remote,
    remote: parent.owner,
    transport: {
      send: (frame) => {
        queueMicrotask(() => parent.receive(structuredClone(frame)))
      },
    },
  })
  const values = new RuntimeValuePort(parent, { prefix: 'controller.application' })
  const scope = runtimeControllerScopeSchema.parse({
    invocationId: 'resume-component-background',
    actorId: 'hbar:scheduler',
    host: {
      version: 'fixture',
      protocol: 1,
      instanceId: 'resume-component',
      platform: process.platform,
      addresses: [],
      activeRuns: 0,
      demo: true,
    },
    kernel: {
      instanceId: 'resume-component',
      permission: 'allow',
      recovered: 0,
      driverIsolation: 'managed',
      active: [],
      tools: [],
      plugins: [],
      protectedRoots: [],
      idle: true,
      userInputs: [],
      protection: [],
      modes: [],
    },
    streams: [],
  })
  parent.register(
    'controller.background.scope',
    procedure(z.undefined(), runtimeControllerScopeSchema, () => scope),
  )
  const calls: StorageRpcCall['method'][] = []
  const searchReceipts = [receipt(), receipt()]
  let completedSearchSteps = 0
  values.register('storage.call', async (args) => {
    expect(args[0]).toBe(scope.invocationId)
    const input = storageRpcCallSchema.parse(args[1])
    calls.push(input.method)
    const result = await storage.executeRpc(input)
    if (input.method === 'searchIndexStep') {
      completedSearchSteps++
      searchReceipts[completedSearchSteps - 1]?.resolve()
    }
    return result
  })
  let service: ReturnType<typeof create> | undefined
  let disposal: Promise<void> | null = null
  const disposeController = () => {
    if (!disposal) disposal = service ? service.dispose() : Promise.resolve()
    return disposal
  }
  const close = async () => {
    const errors: unknown[] = []
    try {
      await disposeController()
    } catch (error) {
      errors.push(error)
    } finally {
      values.dispose()
      parent.close()
      child.close()
    }
    try {
      await storage.close()
    } catch (error) {
      errors.push(error)
    }
    if (errors.length) throw new AggregateError(errors, 'Controller resume cleanup failed', { cause: errors[0] })
    await rm(root, { recursive: true, force: true })
  }
  try {
    await storage.call('ready')
    service = create({
      peer: child,
      preparing: () => false,
      configuration: {
        instanceId: 'resume-component',
        demo: true,
        noLocalExec: true,
        dataRoot: join(root, 'data'),
        cacheRoot: join(root, 'cache'),
        pointerFile: join(root, 'pointer.json'),
        settingsRoot: join(root, 'settings'),
        sessionsRoot: join(root, 'sessions'),
        skillsRoot: join(root, 'skills'),
        identityRoot: join(root, 'identity'),
      },
    })
    await service.activate('default')
    const actual = service
    return {
      parent,
      calls,
      close,
      disposeController,
      async idle() {
        if (!actual.idle) throw new Error('Actual Controller idle reader missing')
        return actual.idle()
      },
      checkpoint: () => parent.call('controller.idleCheckpoint', undefined, runtimeControllerIdleCheckpointSchema),
      preview: () => parent.call('controller.schedule.preview', undefined, scheduleIdleManifestSchema),
      waitForSearchStep(index: number) {
        const accepted = searchReceipts[index - 1]
        if (!accepted) throw new Error('Only the two expected real search steps may be awaited')
        return accepted.promise
      },
    }
  } catch (error) {
    await close()
    throw error
  }
}

test('actual unchanged-source Controller wake executes real Schedule and Search reads once and rejects replay', async () => {
  const f = await fixture()
  try {
    const before = await f.preview()
    expect(before.snapshot.definitions).toEqual([])
    expect(before.snapshot.activeOccurrences).toEqual([])
    expect(before.snapshot.search.complete).toBe(true)
    // Typed synthetic parent receipt only; no native or full Host retirement proof.
    const ack = scheduleTransferAckSchema.parse({
      epoch: 'resume-parent-epoch',
      token: 'unchanged-source-transfer',
      version: 1,
      databaseId: before.snapshot.database.id,
      sourceRevision: before.snapshot.database.sourceRevision,
      catalogRevision: 'c'.repeat(64),
    })
    await f.parent.call('controller.schedule.initialize', { mode: 'idle-wake', ack }, controllerScheduleStatusSchema)
    const reply = await f.parent.call('controller.schedule.wake', { ack }, scheduleWakeReplySchema)
    expect(reply.kind).toBe('settled')
    expect(reply.manifest.snapshot.database.sourceRevision).toBe(ack.sourceRevision)
    expect(reply.manifest.snapshot.search.complete).toBe(true)
    expect(f.calls).toEqual([
      'scheduleIdleCheckpoint',
      'scheduleIdleCheckpoint',
      'activeScheduleOccurrences',
      'enabledSchedules',
      'searchIdleCheckpoint',
      'searchIdleCheckpoint',
      'scheduleIdleCheckpoint',
    ])
    const state = await f.checkpoint()
    expect(state.state.search).toMatchObject({ started: true, timer: true, background: false, pendingStep: false })
    expect(state.state.schedule).toMatchObject({ paused: false, timer: true, ticking: false })
    const acceptedCalls = f.calls.length
    await expect(f.parent.call('controller.schedule.wake', { ack }, scheduleWakeReplySchema)).rejects.toMatchObject({
      code: 'RUNTIME_IDLE_FENCED',
    })
    expect(f.calls.length).toBe(acceptedCalls)
    await f.parent.call('controller.pause', undefined, z.undefined())
    const paused = await f.checkpoint()
    expect(paused.state.search).toMatchObject({ started: false, timer: false, background: false, pendingStep: false })
    expect(paused.state.schedule).toMatchObject({ paused: true, timer: false, ticking: false })
    expect(await f.idle()).toEqual({ eligible: false, requests: 0, runs: 0, resources: 0 })
  } finally {
    await f.close()
  }
})

test('actual normal Controller resume runs real Search timers, pauses reversibly and disposes resumed resources', async () => {
  const f = await fixture()
  try {
    expect(
      await f.parent.call('controller.schedule.initialize', { mode: 'normal' }, controllerScheduleStatusSchema),
    ).toEqual({ phase: 'open' })
    expect(f.calls).toEqual([])
    await f.parent.call('controller.resume', undefined, z.undefined())
    // Wait on an actual completed SQLite Worker searchIndexStep, never a sleep or fake timer.
    await f.waitForSearchStep(1)
    const first = await f.checkpoint()
    expect(first.state.search).toMatchObject({ started: true, disposed: false })
    expect(first.state.schedule).toMatchObject({ paused: false, timer: true, ticking: false })
    expect((await f.idle()).resources).toBeGreaterThanOrEqual(2)
    await f.parent.call('controller.pause', undefined, z.undefined())
    const paused = await f.checkpoint()
    expect(paused.state.search).toMatchObject({ started: false, timer: false, background: false, pendingStep: false })
    expect(paused.state.schedule).toMatchObject({ paused: true, timer: false, ticking: false })
    expect(await f.idle()).toEqual({ eligible: false, requests: 0, runs: 0, resources: 0 })
    await f.parent.call('controller.resume', undefined, z.undefined())
    await f.waitForSearchStep(2)
    const resumed = await f.checkpoint()
    expect(resumed.state.search).toMatchObject({ started: true, disposed: false })
    expect(resumed.state.schedule).toMatchObject({ paused: false, timer: true, ticking: false })
    await f.disposeController()
    const disposed = await f.checkpoint()
    expect(disposed.state.search).toMatchObject({ disposed: true, timer: false, background: false, pendingStep: false })
    expect(disposed.state.schedule).toMatchObject({ stopped: true, timer: false, ticking: false })
    expect(await f.idle()).toEqual({ eligible: false, requests: 0, runs: 0, resources: 0 })
    expect(f.calls.filter((method) => method === 'searchIndexStep')).toHaveLength(2)
    expect(f.calls.filter((method) => method === 'activeScheduleOccurrences')).toHaveLength(2)
    expect(f.calls.filter((method) => method === 'enabledSchedules')).toHaveLength(2)
  } finally {
    await f.close()
  }
})
