import { expect, test } from 'bun:test'
import { z } from 'zod'
import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { chatDatabaseOperationSchema } from '@hbar/contracts/commands/chat-database'
import type { RuntimeOwner, RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import {
  IpcPeer,
  ManagedProcess,
  RuntimeCoordinator,
  RuntimeValuePort,
  type IpcCallOptions,
  type ManagedProcessOptions,
  type RuntimeProcessService,
  type RuntimePhysicalRetirementReceipt,
} from '@hbar/runtime'
import {
  Storage,
  StableStoragePort,
  STORAGE_SCHEMA_VERSION,
  createPathLayout,
  ensurePathLayout,
  storageRpcInput,
  storageSourceDatabaseId,
  chatDatabaseActiveJournalProofSchema,
  type StorageMethods,
} from '@hbar/storage'
import { RuntimeControllerKernel } from '../apps/host/src/runtime-controller-kernel'
import { RuntimeMaintenanceRelay } from '../apps/host/src/runtime-maintenance-relay'
import { create as createMaintenance } from '../apps/host/src/runtime-maintenance-process'
import { MAINTENANCE_RUNTIME_FINGERPRINT } from '../apps/host/src/runtime-maintenance-contract'
import { runtimeMaintenanceIdleCheckpointSchema } from '../apps/host/src/runtime-background-idle'
import {
  maintenanceInspectionAckSchema,
  maintenanceInspectionManifestSchema,
} from '../apps/host/src/runtime-maintenance-inspection-contract'

function deferred() {
  let finish: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    finish = resolve
  })
  return {
    promise,
    resolve() {
      if (!finish) throw new Error('Fixture deferred not initialized')
      finish()
    },
  }
}

/** Public typed bridge to actual paired IPC; never starts a native child or claims its retirement. */
class PairedProcess extends ManagedProcess {
  readonly methods: string[] = []
  constructor(
    options: ManagedProcessOptions,
    private readonly bridge: () => IpcPeer,
    private readonly afterReply: (method: string) => Promise<void>,
  ) {
    super(options)
  }
  override async call<Output>(
    method: string,
    input: unknown,
    schema: z.ZodType<Output>,
    options: IpcCallOptions = {},
  ): Promise<Output> {
    this.methods.push(method)
    const result = await this.bridge().call(method, input, schema, options)
    await this.afterReply(method)
    return result
  }
}

async function withRelay(
  action: (fixture: {
    relay: RuntimeMaintenanceRelay
    parent: IpcPeer
    child: IpcPeer
    owner: RuntimeOwner
    actual: Storage
    source: { databaseId: string; catalogRevision: string }
    processMethods(): readonly string[]
    writerCalls(): number
    closeDefaultAdmission(): void
    revokeOwner(): void
    holdStorage(method: keyof StorageMethods): { entered: Promise<void>; release(): void }
    holdRestoreReply(): { entered: Promise<void>; release(): void }
  }) => Promise<void>,
  options: {
    readonly withBackground?: <Result>(operation: () => Result) => Result
    readonly storageCalled?: (method: keyof StorageMethods) => void
  } = {},
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-maintenance-relay-child-'))
  const oldWorker = process.env.HBAR_MAINTENANCE_WORKER
  let actual: Storage | undefined
  let stable: StableStoragePort | undefined
  let service: RuntimeProcessService | undefined
  let instance: PairedProcess | undefined
  let parent: IpcPeer | undefined
  let child: IpcPeer | undefined
  let values: RuntimeValuePort | undefined
  let detach: (() => void) | undefined
  let storageHold:
    | { method: keyof StorageMethods; entered: ReturnType<typeof deferred>; released: ReturnType<typeof deferred> }
    | undefined
  let restoreHold: { entered: ReturnType<typeof deferred>; released: ReturnType<typeof deferred> } | undefined
  const releaseGates: Array<() => void> = []
  let primary: unknown
  let failed = false
  const cleanup: unknown[] = []
  try {
    const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
    await ensurePathLayout(layout)
    const writer = new Storage(layout.database, layout)
    actual = writer
    await writer.call('ready')
    const storagePort = new StableStoragePort()
    stable = storagePort
    let writerCalls = 0
    storagePort.install({
      owner: { unitId: 'storage', generation: 1, incarnation: 'real-worker-port' },
      async call<K extends keyof StorageMethods>(
        method: K,
        args: Parameters<StorageMethods[K]>,
      ): Promise<ReturnType<StorageMethods[K]>> {
        writerCalls++
        options.storageCalled?.(method)
        const result = await writer.call(method, ...args)
        const gate = storageHold
        if (gate?.method === method) {
          storageHold = undefined
          gate.entered.resolve()
          await gate.released.promise
        }
        return result
      },
      retire: () => writer.close(),
    })
    const hostOwner: RuntimeOwner = { unitId: 'host', generation: 1, incarnation: 'paired-host' }
    const descriptor: RuntimeUnitDescriptor = {
      id: 'maintenance',
      kind: 'maintenance',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: MAINTENANCE_RUNTIME_FINGERPRINT,
      storageSchema: STORAGE_SCHEMA_VERSION,
    }
    const processPort = new PairedProcess(
      {
        descriptor,
        artifactId: 'a'.repeat(64),
        generation: 1,
        parent: hostOwner,
        modulePath: join(root, 'never-started-native-child.ts'),
        purpose: 'idle-wake',
      },
      () => {
        if (!parent) throw new Error('Paired parent unavailable')
        return parent
      },
      async (method) => {
        if (method !== 'maintenance.inspection.restore' || !restoreHold) return
        const gate = restoreHold
        restoreHold = undefined
        gate.entered.resolve()
        await gate.released.promise
      },
    )
    instance = processPort
    const owner = processPort.owner()
    const host = new IpcPeer({
      owner: hostOwner,
      remote: owner,
      transport: {
        send: (frame) => child?.receive(structuredClone(frame)),
      },
    })
    parent = host
    const endpoint = new IpcPeer({
      owner,
      remote: hostOwner,
      transport: {
        send: (frame) => host.receive(structuredClone(frame)),
      },
    })
    child = endpoint
    const application = new RuntimeValuePort(host, { prefix: 'kernel.application' })
    values = application
    const kernel = new RuntimeControllerKernel(application, layout, false, 'paired-kernel')
    const coordinator = new RuntimeCoordinator({
      claim: (lease) => Promise.resolve(lease),
      release: () => Promise.resolve(),
      revoke: () => Promise.resolve(),
    })
    const version = { unitId: owner.unitId, generation: owner.generation, artifactId: 'a'.repeat(64) }
    coordinator.register(owner, version, descriptor)
    coordinator.activate(owner, 'default')
    let defaultAdmissionClosed = false
    const relay = new RuntimeMaintenanceRelay({
      storage: storagePort,
      coordinator,
      kernel: kernel.api,
      layout,
      current: () => {
        if (defaultAdmissionClosed) throw new HbarError('RUNTIME_RECOVERING', 'Default admission is retiring')
        return { owner, version, process: processPort }
      },
      resolve: () => ({ owner, version, process: processPort }),
      changed: () => {},
      ...(options.withBackground ? { withBackground: options.withBackground } : {}),
    })
    detach = relay.attach(host, owner, version, 'idle-wake')
    const producer = createMaintenance({
      peer: endpoint,
      purpose: 'idle-wake',
      preparing: () => false,
      configuration: {
        dataRoot: layout.dataRoot,
        cacheRoot: layout.cacheRoot,
        pointerFile: layout.pointerFile,
        settingsRoot: layout.settings,
        sessionsRoot: layout.sessions,
        skillsRoot: layout.globalSkills,
        identityRoot: layout.identityRoot,
        workerPath: join(root, 'unused-native-maintenance-worker.js'),
      },
    })
    service = producer
    // Existing component-test boundary: activate actual services; do not call native Worker preflight prepare().
    await producer.activate('default')
    await action({
      relay,
      parent: host,
      child: endpoint,
      owner,
      actual: writer,
      source: { databaseId: storageSourceDatabaseId(layout.database), catalogRevision: 'b'.repeat(64) },
      processMethods: () => processPort.methods,
      writerCalls: () => writerCalls,
      closeDefaultAdmission() {
        defaultAdmissionClosed = true
      },
      revokeOwner() {
        coordinator.ownerExited(owner)
      },
      holdStorage(method) {
        if (storageHold) throw new Error('Storage gate already reserved')
        const gate = { method, entered: deferred(), released: deferred() }
        storageHold = gate
        releaseGates.push(() => gate.released.resolve())
        return { entered: gate.entered.promise, release: () => gate.released.resolve() }
      },
      holdRestoreReply() {
        if (restoreHold) throw new Error('Restore gate already reserved')
        const gate = { entered: deferred(), released: deferred() }
        restoreHold = gate
        releaseGates.push(() => gate.released.resolve())
        return { entered: gate.entered.promise, release: () => gate.released.resolve() }
      },
    })
  } catch (error) {
    failed = true
    primary = error
  } finally {
    for (const close of [
      ...releaseGates,
      () => service?.dispose(),
      () => {
        detach?.()
        values?.dispose()
        parent?.close()
        child?.close()
      },
      () => instance?.dispose(),
      () => stable?.close(),
      () => actual?.close(),
    ]) {
      try {
        await close()
      } catch (error) {
        cleanup.push(error)
      }
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
  if (failed && !cleanup.length) throw primary
  if (cleanup.length)
    throw new AggregateError(failed ? [primary, ...cleanup] : cleanup, 'Owned paired relay fixture failed', {
      cause: failed ? primary : cleanup[0],
    })
}

async function failure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation()
  } catch (error) {
    return error
  }
  throw new Error('Expected the public protocol to reject')
}
function invocation() {
  return {
    protocol: COMMAND_PROTOCOL_VERSION,
    requestId: 'paired-statistics',
    commandId: 'chatDatabase.statistics',
    commandVersion: 1,
    input: { scope: { kind: 'global' } },
  }
}

test('Maintenance inspection journal callbacks preserve background context across paired IPC without renewing business demand', async () => {
  const activity = new AsyncLocalStorage<'business' | 'background'>()
  const calls: Array<{ method: keyof StorageMethods; activity: 'business' | 'background' | undefined }> = []
  await withRelay(
    async ({ relay, parent, child, owner, source, writerCalls, revokeOwner }) => {
      await activity.run('business', async () => {
        const ack = maintenanceInspectionAckSchema.parse({
          epoch: 'background-inspection-epoch',
          token: crypto.randomUUID(),
          version: 1,
          source,
        })
        const checkpoint = { version: 1 as const, cursor: null, nextCheckAt: Date.now() + 30_000 }
        await relay.initializeIdle(owner, ack, checkpoint, new AbortController().signal)
        const before = calls.length
        await parent.call('maintenance.inspection.preview', source, maintenanceInspectionManifestSchema)
        await Promise.resolve()
        expect(activity.getStore()).toBe('business')
        relay.sealInspection(owner, ack)
        await parent.call('maintenance.inspection.quiesce', ack, maintenanceInspectionManifestSchema)
        const journals = calls.slice(before).filter((call) => call.method === 'chatDatabaseActiveJournalProof')
        expect(journals).toHaveLength(2)
        expect(journals.every((call) => call.activity === 'background')).toBe(true)
        expect(activity.getStore()).toBe('business')
        expect(relay.inspectionSealed(owner, ack)).toBe(true)
        const beforeRevoked = writerCalls()
        revokeOwner()
        expect(
          await failure(() =>
            child.call(
              'maintenance.storage',
              storageRpcInput('chatDatabaseActiveJournalProof', []),
              chatDatabaseActiveJournalProofSchema,
            ),
          ),
        ).toMatchObject({ code: 'EXECUTION_OWNER_REVOKED' })
        expect(writerCalls()).toBe(beforeRevoked)
        expect(activity.getStore()).toBe('business')
      })
      expect(activity.getStore()).toBeUndefined()
    },
    {
      withBackground: (operation) => activity.run('background', operation),
      storageCalled: (method) => calls.push({ method, activity: activity.getStore() }),
    },
  )
}, 20_000)

test('captured Maintenance seals its real inspection after default admission closes and still rejects revoked ownership', async () => {
  await withRelay(async ({ relay, parent, owner, source, writerCalls, closeDefaultAdmission, revokeOwner }) => {
    const ack = maintenanceInspectionAckSchema.parse({
      epoch: 'retiring-owner-epoch',
      token: crypto.randomUUID(),
      version: 1,
      source,
    })
    const checkpoint = { version: 1 as const, cursor: null, nextCheckAt: Date.now() + 30_000 }
    await relay.initializeIdle(owner, ack, checkpoint, new AbortController().signal)
    const preview = await parent.call('maintenance.inspection.preview', source, maintenanceInspectionManifestSchema)
    expect(preview.journal.empty).toBe(true)
    closeDefaultAdmission()
    const beforeSeal = writerCalls()
    relay.sealInspection(owner, ack)
    expect(relay.inspectionSealed(owner, ack)).toBe(true)
    expect(writerCalls()).toBe(beforeSeal)
    const prepared = await parent.call('maintenance.inspection.quiesce', ack, maintenanceInspectionManifestSchema)
    expect(prepared.checkpoint).toEqual(checkpoint)
    expect(relay.inspectionSealed(owner, ack)).toBe(true)
    expect(() => relay.sealInspection({ ...owner, incarnation: 'another-owner' }, ack)).toThrow()
    revokeOwner()
    expect(() => relay.sealInspection(owner, ack)).toThrow()
  })
}, 20_000)

test('actual idle-wake child restores one deadline through Relay and seals business and accept before the real writer', async () => {
  await withRelay(async ({ relay, parent, child, owner, actual, source, processMethods, writerCalls, holdStorage }) => {
    await relay.reconcile()
    expect(processMethods()).toEqual([])
    expect(writerCalls()).toBe(0)
    const ack = maintenanceInspectionAckSchema.parse({
      epoch: 'paired-epoch',
      token: crypto.randomUUID(),
      version: 1,
      source,
    })
    const checkpoint = { version: 1 as const, cursor: null, nextCheckAt: Date.now() + 30_000 }
    const reply = await relay.initializeIdle(owner, ack, checkpoint, new AbortController().signal)
    expect(reply).toEqual({ owner, ack, checkpoint, timerArmed: true })
    const read = () => parent.call('maintenance.idleCheckpoint', undefined, runtimeMaintenanceIdleCheckpointSchema)
    expect((await read()).state.scheduler).toMatchObject({
      paused: false,
      timer: true,
      nextDueAt: checkpoint.nextCheckAt,
    })
    const guard = { epoch: ack.epoch, owner }
    await relay.pauseInspection(owner, guard)
    expect((await read()).state.scheduler).toMatchObject({
      paused: true,
      timer: false,
      nextDueAt: checkpoint.nextCheckAt,
    })
    await relay.resumeInitializedInspection(owner, guard)
    await relay.resumeInitializedInspection(owner, guard)
    expect((await read()).state.scheduler).toMatchObject({
      paused: false,
      timer: true,
      nextDueAt: checkpoint.nextCheckAt,
    })
    await relay.reconcile()
    expect(processMethods().filter((method) => method === 'maintenance.resume')).toHaveLength(0)
    await parent.call('maintenance.inspection.preview', source, maintenanceInspectionManifestSchema)
    relay.sealInspection(owner, ack)
    expect(relay.inspectionSealed(owner, ack)).toBe(true)
    const gate = holdStorage('chatDatabaseActiveJournalProof')
    const pending = child.call(
      'maintenance.storage',
      storageRpcInput('chatDatabaseActiveJournalProof', []),
      chatDatabaseActiveJournalProofSchema,
    )
    try {
      await gate.entered
      expect(relay.inspectionSealed(owner, ack)).toBe(false)
    } finally {
      gate.release()
    }
    expect((await pending).empty).toBe(true)
    expect(relay.inspectionSealed(owner, ack)).toBe(true)
    const prepared = await parent.call('maintenance.inspection.quiesce', ack, maintenanceInspectionManifestSchema)
    expect(prepared.checkpoint).toEqual(checkpoint)
    const before = writerCalls()
    expect(await failure(() => relay.dispatch(invocation(), 'fixture'))).toMatchObject({
      code: 'MAINTENANCE_INSPECTION_FENCED',
    })
    expect(
      await failure(() =>
        parent.call('maintenance.dispatch', { invocation: invocation(), actorId: 'fixture' }, z.unknown()),
      ),
    ).toMatchObject({ code: 'MAINTENANCE_INSPECTION_FENCED' })
    const operation = chatDatabaseOperationSchema.parse({
      schemaVersion: 1,
      operationId: crypto.randomUUID(),
      type: 'preview',
      kind: 'sessions',
      scope: { kind: 'global' },
      trigger: 'manual',
      status: 'accepted',
      stage: 'pending',
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      previewId: null,
      expiresAt: null,
      policyRevisions: {},
      candidateCount: 0,
      totalCount: 0,
      processedCount: 0,
      deletedCount: 0,
      estimatedBytes: 0,
      reclaimedBytes: 0,
      reusableDatabaseBytes: 0,
      remainingBytes: null,
      targetBytes: null,
      skipped: [],
      cancellationRequested: false,
      error: null,
    })
    const accept = storageRpcInput('chatDatabaseOperationAccept', [
      {
        actorId: 'fixture',
        idempotencyKey: 'sealed-accept',
        request: 'sealed-request',
        operation,
      },
    ])
    expect(await failure(() => child.call('maintenance.storage', accept, z.unknown()))).toMatchObject({ code: 'BUSY' })
    expect(writerCalls()).toBe(before)
    expect(await actual.call('chatDatabaseOperationReceipt', 'fixture', 'sealed-accept')).toBeNull()
  })
}, 20_000)

test('known actual restore reply survives exact retirement before Relay sees it without restoring retired owner qualification', async () => {
  await withRelay(async ({ relay, owner, source, processMethods, holdRestoreReply }) => {
    const ack = maintenanceInspectionAckSchema.parse({
      epoch: 'paired-epoch',
      token: crypto.randomUUID(),
      version: 1,
      source,
    })
    const checkpoint = { version: 1 as const, cursor: null, nextCheckAt: Date.now() + 30_000 }
    const gate = holdRestoreReply()
    const pending = relay.initializeIdle(owner, ack, checkpoint, new AbortController().signal)
    try {
      await gate.entered
      // Synthetic trusted receipt only. No native child was launched or claimed to have exited.
      const proof: RuntimePhysicalRetirementReceipt = {
        owner,
        childPid: 1,
        exitCode: 0,
        nativeJoined: true,
        onExitCompleted: true,
        forced: false,
        cleanDisposeAck: true,
      }
      relay.physicalExitConfirmed(proof)
    } finally {
      gate.release()
    }
    expect(await pending).toEqual({ owner, ack, checkpoint, timerArmed: true })
    const before = processMethods().length
    expect(
      await failure(() => relay.initializeIdle(owner, ack, checkpoint, new AbortController().signal)),
    ).toMatchObject({ code: 'MAINTENANCE_INSPECTION_UNKNOWN' })
    expect(await failure(() => relay.pauseInspection(owner, { epoch: ack.epoch, owner }))).toMatchObject({
      code: 'EXECUTION_OWNER_REVOKED',
    })
    expect(processMethods()).toHaveLength(before)
  })
}, 20_000)
