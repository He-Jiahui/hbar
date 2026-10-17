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
  type ScheduleIdleManifest,
} from '../apps/host/src/runtime-schedule-idle-contract'

// Actual process.create/application/search/schedule code and real Storage Worker.
// Only the authenticated Host scope projection is a typed fixture. No child lifecycle
// handler, journal, schedule runner, search cursor or physical-exit receipt is replaced.
async function fixture() {
  const root = resolve(await mkdtemp(join(tmpdir(), 'hbar-controller-process-idle-')))
  if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-controller-process-idle-'))
    throw new Error('Unowned Controller fixture path')
  const storage = new Storage(join(root, 'state.sqlite'))
  let child!: IpcPeer
  const parent = new IpcPeer({
    owner: { unitId: 'host', generation: 1, incarnation: 'controller-component-host' },
    remote: { unitId: 'controller', generation: 1, incarnation: 'controller-component-child' },
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
  const calls: StorageRpcCall['method'][] = []
  const scope = runtimeControllerScopeSchema.parse({
    invocationId: 'controller-component-background',
    actorId: 'hbar:scheduler',
    host: {
      version: 'fixture',
      protocol: 1,
      instanceId: 'controller-component',
      platform: process.platform,
      addresses: [],
      activeRuns: 0,
      demo: true,
    },
    kernel: {
      instanceId: 'controller-component',
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
  let backgroundScopes = 0
  parent.register(
    'controller.background.scope',
    procedure(z.undefined(), runtimeControllerScopeSchema, () => {
      backgroundScopes++
      return scope
    }),
  )
  values.register('storage.call', (args) => {
    expect(args[0]).toBe(scope.invocationId)
    const input = storageRpcCallSchema.parse(args[1])
    calls.push(input.method)
    return storage.executeRpc(input)
  })
  let service: ReturnType<typeof create> | undefined
  const close = async () => {
    // Dispose actual search/schedule timers before closing their transport/Worker.
    // A failed close leaves the fixture on disk rather than deleting a possibly live DB.
    const errors: unknown[] = []
    try {
      await service?.dispose()
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
    if (errors.length) throw new AggregateError(errors, 'Controller component cleanup failed', { cause: errors[0] })
    await rm(root, { recursive: true, force: true })
  }
  try {
    await storage.call('ready')
    service = create({
      peer: child,
      preparing: () => false,
      configuration: {
        instanceId: 'controller-component',
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
      root,
      parent,
      storage,
      calls,
      close,
      scopeReads: () => backgroundScopes,
      async idle() {
        if (!actual.idle) throw new Error('Actual Controller must expose its idle reader')
        return actual.idle()
      },
      checkpoint: () => parent.call('controller.idleCheckpoint', undefined, runtimeControllerIdleCheckpointSchema),
      preview: () => parent.call('controller.schedule.preview', undefined, scheduleIdleManifestSchema),
    }
  } catch (error) {
    await close()
    throw error
  }
}

function acknowledgement(manifest: ScheduleIdleManifest) {
  // Synthetic parent receipt, not proof of any native retirement. Its complete
  // atomic source comes from the actual Storage RPC exercised by process.create.
  return scheduleTransferAckSchema.parse({
    epoch: 'component-parent-epoch',
    token: 'component-transfer',
    version: 1,
    databaseId: manifest.snapshot.database.id,
    sourceRevision: manifest.snapshot.database.sourceRevision,
    catalogRevision: 'c'.repeat(64),
  })
}

test('actual Controller idle-wake initialization is quiet and rejects a different epoch without reopening admission', async () => {
  const f = await fixture()
  try {
    const manifest = await f.preview()
    const ack = acknowledgement(manifest)
    const calls = f.calls.length,
      scopes = f.scopeReads()
    await expect(
      f.parent.call(
        'controller.schedule.initialize',
        { mode: 'idle-wake', ack: { ...ack, version: 'invalid' } },
        controllerScheduleStatusSchema,
      ),
    ).rejects.toThrow()
    expect(
      await f.parent.call('controller.schedule.initialize', { mode: 'idle-wake', ack }, controllerScheduleStatusSchema),
    ).toEqual({ phase: 'restored' })
    await expect(f.parent.call('controller.resume', undefined, z.undefined())).rejects.toMatchObject({
      code: 'RUNTIME_IDLE_FENCED',
    })
    await expect(
      f.parent.call('controller.schedule.wake', { ack: { ...ack, epoch: 'other-epoch' } }, scheduleWakeReplySchema),
    ).rejects.toMatchObject({ code: 'RUNTIME_IDLE_FENCED' })
    await expect(
      f.parent.call('controller.schedule.initialize', { mode: 'idle-wake', ack }, controllerScheduleStatusSchema),
    ).rejects.toMatchObject({ code: 'RUNTIME_IDLE_FENCED' })
    const state = await f.checkpoint()
    expect(state.state.search).toMatchObject({ started: false, timer: false, background: false, pendingStep: false })
    expect(state.state.schedule).toMatchObject({ paused: true, timer: false, ticking: false })
    expect(f.calls.length).toBe(calls)
    expect(f.scopeReads()).toBe(scopes)
    expect(await f.idle()).toEqual({ eligible: false, requests: 0, runs: 0, resources: 0 })
  } finally {
    await f.close()
  }
})

test('actual Controller quiesce requires exact commit ACK and only committed transfer becomes locally eligible', async () => {
  const f = await fixture()
  try {
    const before = await f.preview(),
      ack = acknowledgement(before)
    const verified = await f.parent.call('controller.schedule.quiesce', { ack }, scheduleIdleManifestSchema)
    expect(verified.snapshot.database.sourceRevision).toBe(before.snapshot.database.sourceRevision)
    expect(await f.idle()).toEqual({ eligible: false, requests: 0, runs: 0, resources: 0 })
    await expect(
      f.parent.call(
        'controller.schedule.commit',
        { ack: { ...ack, token: 'late-other-transfer' } },
        controllerScheduleStatusSchema,
      ),
    ).rejects.toMatchObject({ code: 'RUNTIME_IDLE_FENCED' })
    expect((await f.idle()).eligible).toBe(false)
    expect(await f.parent.call('controller.schedule.commit', { ack }, controllerScheduleStatusSchema)).toEqual({
      phase: 'committed',
    })
    expect(await f.idle()).toEqual({ eligible: true, requests: 0, runs: 0, resources: 0 })
    await expect(
      f.parent.call('controller.schedule.abort', { ack }, controllerScheduleStatusSchema),
    ).rejects.toMatchObject({ code: 'RUNTIME_IDLE_FENCED' })
    expect((await f.idle()).eligible).toBe(true)
    expect(f.calls).toEqual(['scheduleIdleCheckpoint', 'scheduleIdleCheckpoint'])
  } finally {
    await f.close()
  }
})

test('actual Controller known abort restores inspection timers and a late old commit cannot restore eligibility', async () => {
  const f = await fixture()
  try {
    const ack = acknowledgement(await f.preview())
    await f.parent.call('controller.schedule.quiesce', { ack }, scheduleIdleManifestSchema)
    expect(await f.parent.call('controller.schedule.abort', { ack }, controllerScheduleStatusSchema)).toEqual({
      phase: 'open',
    })
    const state = await f.checkpoint()
    expect(state.state.search).toMatchObject({ started: true, timer: true, background: false, pendingStep: false })
    expect(state.state.schedule).toMatchObject({ paused: false, timer: true, ticking: false })
    await expect(
      f.parent.call('controller.schedule.commit', { ack }, controllerScheduleStatusSchema),
    ).rejects.toMatchObject({ code: 'RUNTIME_IDLE_FENCED' })
    expect((await f.idle()).eligible).toBe(false)
    expect(f.calls).toEqual(['scheduleIdleCheckpoint', 'scheduleIdleCheckpoint', 'searchIdleCheckpoint'])
  } finally {
    await f.close()
  }
})

test('actual Controller changed-source wake only rearms timers and never advances Search or dispatches Schedule work', async () => {
  const f = await fixture()
  try {
    const ack = acknowledgement(await f.preview())
    await f.parent.call('controller.schedule.initialize', { mode: 'idle-wake', ack }, controllerScheduleStatusSchema)
    const workspace = await f.storage.call('createWorkspace', f.root, 'Component fixture')
    const session = await f.storage.call('createSession', workspace.id)
    await f.storage.call('commit', session.id, 'component-source-run', 'user', [
      { type: 'text', text: 'Durable new search source' },
    ])
    const reply = await f.parent.call('controller.schedule.wake', { ack }, scheduleWakeReplySchema)
    expect(reply.kind).toBe('changed')
    expect(reply.manifest.snapshot.search.complete).toBe(false)
    expect(reply.manifest.snapshot.database.sourceRevision).not.toBe(ack.sourceRevision)
    const state = await f.checkpoint()
    expect(state.state.search).toMatchObject({ timer: true, background: false, pendingStep: false })
    expect(state.state.schedule).toMatchObject({ timer: true, ticking: false })
    expect(f.calls).toEqual(['scheduleIdleCheckpoint', 'scheduleIdleCheckpoint', 'searchIdleCheckpoint'])
    await expect(f.parent.call('controller.schedule.wake', { ack }, scheduleWakeReplySchema)).rejects.toMatchObject({
      code: 'RUNTIME_IDLE_FENCED',
    })
    expect(f.calls).toEqual(['scheduleIdleCheckpoint', 'scheduleIdleCheckpoint', 'searchIdleCheckpoint'])
    expect((await f.idle()).eligible).toBe(false)
  } finally {
    await f.close()
  }
})
