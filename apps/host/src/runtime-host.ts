import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { HbarError, providerSchema } from '@hbar/contracts'
import type { ExecutionOwnership, RuntimeGeneration, RuntimeOwner, RuntimeSnapshot, RuntimeUnitDescriptor, RuntimeVersion } from '@hbar/contracts/runtime'
import { Kernel, type KernelOptions, type KernelExecutionPort } from '@hbar/kernel'
import { definePlugin, provide, type GoalService, type HarnessDriver } from '@hbar/plugin-sdk'
import { ManagedProcess, RuntimeArtifactStore, RuntimeCoordinator, RuntimeManager, type RuntimeArtifact, type RuntimeBuildUnit } from '@hbar/runtime'
import { Storage, StableStoragePort, callStorageRpc, ensurePathLayout, STORAGE_RPC_FINGERPRINT, STORAGE_SCHEMA_VERSION, type PathLayout } from '@hbar/storage'
import { RuntimeDriverAdapter } from './runtime-driver-adapter'
import { DRIVER_RUNTIME_FINGERPRINT } from './runtime-driver-contract'
import { acquireHostProcessLock } from './process-lock'
import type { RuntimeSystemPort } from './system-commands'
import { RuntimeControllerAdapter } from './runtime-controller-adapter'
import { CONTROLLER_RUNTIME_FINGERPRINT, type RuntimeControllerPort } from './runtime-controller-contract'

export interface ManagedHostRuntimeOptions extends Omit<KernelOptions, 'layout' | 'lifecycle' | 'execution'> {
  readonly layout: PathLayout
  readonly sourceRoot?: string
  readonly processCommand?: readonly [string, ...string[]]
}
interface GenerationRecord {
  readonly artifact: RuntimeArtifact
  readonly process: ManagedProcess
  owner: RuntimeOwner | null
  adapter: RuntimeDriverAdapter | null
  controller: RuntimeControllerAdapter | null
}
interface InterruptedOwner {
  readonly owner: RuntimeOwner
  readonly leases: ExecutionOwnership[]
  exited: boolean
}
const kernelFingerprint = createHash('sha256').update('hbar.kernel.embedded.v1').digest('hex')
const kernelDescriptor: RuntimeUnitDescriptor = {
  id: 'kernel', kind: 'kernel', isolation: 'base', dependencies: ['storage', 'driver.pi'],
  required: true, reloadable: false, contractFingerprint: kernelFingerprint, storageSchema: STORAGE_SCHEMA_VERSION,
}
const storageDescriptor: RuntimeUnitDescriptor = {
  id: 'storage', kind: 'storage', isolation: 'process', dependencies: [], required: true, reloadable: true,
  contractFingerprint: STORAGE_RPC_FINGERPRINT, storageSchema: STORAGE_SCHEMA_VERSION,
}
const driverDescriptor: RuntimeUnitDescriptor = {
  id: 'driver.pi', kind: 'driver', isolation: 'process', dependencies: [], required: true, reloadable: true,
  contractFingerprint: DRIVER_RUNTIME_FINGERPRINT, storageSchema: STORAGE_SCHEMA_VERSION,
}
const controllerDescriptor: RuntimeUnitDescriptor = {
  id: 'controller', kind: 'controller', isolation: 'process', dependencies: [], required: true, reloadable: true,
  contractFingerprint: CONTROLLER_RUNTIME_FINGERPRINT, storageSchema: STORAGE_SCHEMA_VERSION,
}
const key = (owner: Pick<RuntimeOwner, 'unitId' | 'generation'>) => `${owner.unitId}:${owner.generation}`

/** Composition root for the stable writer and version-bound driver. The embedded Kernel is explicitly restart-only. */
export class ManagedHostRuntime implements RuntimeSystemPort {
  readonly storage = new StableStoragePort()
  readonly artifacts: RuntimeArtifactStore
  readonly coordinator: RuntimeCoordinator
  readonly manager: RuntimeManager
  readonly buildUnits: readonly RuntimeBuildUnit[]
  readonly controller: RuntimeControllerPort = { dispatch: (payload, invoke) => {
    const version = this.manager.currentVersion('controller')
    const generation = this.generations.get(key(version))
    if (!generation?.controller || generation.process.snapshot().phase !== 'serving')
      return Promise.reject(new HbarError('RUNTIME_RECOVERING', 'The Controller is recovering'))
    return generation.controller.dispatch(payload, invoke)
  } }
  private kernelValue: Kernel | undefined
  private readonly kernelOwner: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: crypto.randomUUID() }
  private readonly baseOwner: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: crypto.randomUUID() }
  private readonly kernelVersion: RuntimeVersion = { unitId: 'kernel', generation: 1, artifactId: kernelFingerprint }
  private readonly generations = new Map<string, GenerationRecord>()
  private readonly registeredOwners = new Set<string>()
  private readonly leases = new Map<string, ExecutionOwnership>()
  private readonly interrupted = new Map<string, InterruptedOwner>()
  private readonly stoppedRuns = new Set<string>()
  private transitions: Promise<void> = Promise.resolve()
  private closing = false
  private closingTask: Promise<void> | undefined
  private ready = false
  private transitionError: string | null = null
  private recoveringStorage: { owner: RuntimeOwner; unknown: boolean } | null = null
  private readonly pendingStorageRevocations: Array<{ owner: RuntimeOwner; ids: string[] }> = []

  private constructor(private readonly options: ManagedHostRuntimeOptions, readonly instanceId = crypto.randomUUID()) {
    this.artifacts = new RuntimeArtifactStore(join(options.layout.cacheRoot, 'runtime-artifacts'), options.sourceRoot ?? resolve(import.meta.dir, '../../..'))
    this.buildUnits = [
      { descriptor: storageDescriptor, entrypoint: 'apps/host/src/runtime-storage-process.ts', workers: ['packages/storage/src/worker.ts'] },
      { descriptor: driverDescriptor, entrypoint: 'apps/host/src/runtime-driver-process.ts' },
      { descriptor: controllerDescriptor, entrypoint: 'apps/host/src/runtime-controller-process.ts' },
    ]
    this.coordinator = new RuntimeCoordinator({
      claim: draft => this.storage.call('runtimeExecutionClaim', draft),
      release: lease => this.storage.call('runtimeExecutionRelease', lease),
      revoke: async (owner, ids) => {
        if (this.recoveringStorage) {
          // Admission is already fenced; persistence is completed by the verified replacement writer before reopening it.
          this.pendingStorageRevocations.push({ owner, ids: [...ids] })
          return
        }
        await this.storage.call('runtimeExecutionRevoke', owner, ids)
      },
    })
    this.coordinator.register(this.kernelOwner, this.kernelVersion, kernelDescriptor)
    this.coordinator.activate(this.kernelOwner)
    this.manager = new RuntimeManager({
      instanceId, artifacts: this.artifacts,
      references: owner => this.registeredOwners.has(owner.incarnation) ? this.coordinator.references(owner) : { runs: 0, resources: 0, tools: 0 },
      create: (artifact, generation, changed) => this.createGeneration(artifact, generation, changed),
      beforeActivate: async owner => {
        if (owner.unitId === 'storage' && this.storage.snapshot().owner) {
          this.ready = false
          this.kernelValue?.beginDrain()
          await this.storage.beginHandover()
        }
      },
      afterDispose: owner => {
        if (this.registeredOwners.has(owner.incarnation)) {
          this.coordinator.disposeOwner(owner)
          this.registeredOwners.delete(owner.incarnation)
        }
        this.generations.delete(key(owner))
      },
    })
    for (const unit of this.buildUnits) this.manager.register(unit.descriptor)
  }

  get kernel(): Kernel {
    if (!this.kernelValue) throw new HbarError('RUNTIME_PREPARING', 'The managed Kernel has not activated')
    return this.kernelValue
  }
  static async create(options: ManagedHostRuntimeOptions): Promise<ManagedHostRuntime> {
    if (options.profile?.createStorage || options.profile?.replacements?.['driver.pi'])
      throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Custom storage and driver implementations need a declared process lifecycle adapter')
    await ensurePathLayout(options.layout)
    // This is the initial installation/restart boundary, before any candidate or listener accepts work.
    const release = await acquireHostProcessLock(`${options.layout.database}.runtime-writer.lock`)
    const installation = new Storage(options.layout.database, options.layout)
    try { await installation.call('ready') } finally { try { await installation.close() } finally { await release() } }
    const runtime = new ManagedHostRuntime(options)
    try {
      const built: RuntimeArtifact[] = []
      for (const unit of runtime.buildUnits) built.push(await runtime.artifacts.build(unit))
      const set = runtime.artifacts.registerSet(built)
      const operation = runtime.manager.reload(set.id, runtime.buildUnits.map(unit => unit.descriptor.id), true)
      const deadline = Date.now() + 120_000
      while (!runtime.manager.snapshot().ready && Date.now() < deadline) {
        await runtime.manager.reconcile()
        await runtime.settled()
        if (['failed', 'cancelled', 'restart_required'].includes(runtime.manager.getReload(operation.operationId).phase)) break
        if (!runtime.manager.snapshot().ready) await Bun.sleep(20)
      }
      if (!runtime.manager.snapshot().ready || runtime.storage.snapshot().phase !== 'serving')
        throw new HbarError('RUNTIME_START_FAILED', `Required managed runtime units did not become ready: ${runtime.manager.getReload(operation.operationId).units.map(unit => `${unit.unitId}:${unit.phase}:${unit.reasonCode ?? ''}`).join(', ')}`)
      const driver: HarnessDriver = {
        supportsCanonicalSteering: true, supportsSteeringAdmissionClosure: true,
        run: input => runtime.driverForRun(input.run.id).run(input),
        summarize: (request, apiKey, signal) => runtime.driverForRun(request.context?.runId).summarize(request, apiKey, signal),
      }
      const adapter = definePlugin({
        manifest: { id: 'driver.pi', name: 'Pi harness', version: '1.0.0', apiVersion: '^1.0.0', scope: 'host', required: true,
          description: 'Managed Pi agent loop and multi-provider streaming', provides: { driver: '1.0.0' }, permissions: ['network'] },
        apply: context => provide(context, 'driver', driver),
      })
      runtime.kernelValue = await Kernel.create({ ...options, instanceId: runtime.instanceId, lifecycle: 'managed', execution: runtime.execution(),
        profile: { ...options.profile, createStorage: async () => runtime.storage, replacements: { ...options.profile?.replacements, 'driver.pi': adapter } },
      })
      // Connection identity is stable across all business generations.
      if (options.workspace) await runtime.kernel.createWorkspace(options.workspace)
      if (options.demo) await runtime.storage.call('saveProvider', providerSchema.parse({ id: 'local-fixture', name: 'Local fixture',
        protocol: 'mock', baseUrl: 'http://127.0.0.1', model: 'fixture', imageInput: true, reasoning: true }))
      await runtime.recoverStartup()
      runtime.ready = true
      await runtime.kernel.activate()
      await runtime.kernel.plugins.get<GoalService>('goal').resumeOnStartup()
      return runtime
    } catch (error) { await runtime.close(); throw error }
  }
  snapshot(): RuntimeSnapshot {
    const state = this.manager.snapshot()
    const generation: RuntimeGeneration = { ...this.kernelOwner, artifactId: this.kernelVersion.artifactId,
      role: 'default', phase: this.ready ? 'serving' : 'recovering', pid: process.pid,
      references: { runs: this.leases.size, resources: 0, requests: 0 }, lastHeartbeatAt: Date.now(), failures: 0,
      nextAttemptAt: null, reasonCode: this.transitionError,
    }
    return { ...state, instanceId: this.instanceId, ready: this.ready && state.ready && this.storage.snapshot().phase === 'serving',
      units: [{ descriptor: kernelDescriptor, generations: [generation], queuedArtifactId: null }, ...state.units] }
  }
  reload(artifactSetId: string, unitIds: readonly string[]) { return this.manager.reload(artifactSetId, unitIds) }
  getReload(id: string) { return this.manager.getReload(id) }
  cancelReload(id: string) { return this.manager.cancelReload(id) }
  async settled(): Promise<void> { await this.transitions }
  close(): Promise<void> {
    this.closingTask ??= this.closeRuntime()
    return this.closingTask
  }
  private async closeRuntime(): Promise<void> {
    this.closing = true
    this.ready = false
    await this.kernelValue?.close()
    await this.storage.close()
    await this.manager.close()
    await this.transitions
  }

  private createGeneration(artifact: RuntimeArtifact, generation: number, changed: () => void): ManagedProcess {
    const configuration = artifact.unitId === 'storage' ? {
      database: this.options.layout.database, dataRoot: this.options.layout.dataRoot, cacheRoot: this.options.layout.cacheRoot,
      pointerFile: this.options.layout.pointerFile, settingsRoot: this.options.layout.settings, sessionsRoot: this.options.layout.sessions,
      skillsRoot: this.options.layout.globalSkills, identityRoot: this.options.layout.identityRoot,
      workerPath: join(this.artifacts.root, artifact.id, 'worker.js'),
    } : {}
    let record: GenerationRecord
    const managed = new ManagedProcess({ descriptor: artifact.descriptor, artifactId: artifact.id, generation,
      modulePath: join(this.artifacts.root, artifact.id, artifact.entry), parent: this.baseOwner, configuration,
      verifyModule: async signal => { await this.artifacts.get(artifact.id); signal.throwIfAborted() },
      controlMethods: ['controller.control', 'controller.invoke'],
      ...(this.options.processCommand ? { command: this.options.processCommand } : {}),
      onPeer: (peer, owner) => {
        this.coordinator.register(owner, { unitId: artifact.unitId, generation, artifactId: artifact.id }, artifact.descriptor)
        this.registeredOwners.add(owner.incarnation)
        record.owner = owner
        if (artifact.unitId === 'driver.pi') record.adapter = new RuntimeDriverAdapter(peer, runId => this.leases.get(runId))
        if (artifact.unitId === 'controller') record.controller = new RuntimeControllerAdapter(peer)
      },
      onState: state => {
        changed()
        if (state.phase === 'serving' || state.phase === 'draining') this.transition(async () => {
          if (record.owner?.incarnation !== state.incarnation || this.closing) return
          if (state.role === 'default' && this.coordinator.role(record.owner) === 'candidate') this.coordinator.activate(record.owner)
          if (artifact.unitId === 'storage' && state.role === 'default') await this.installStorage(record)
          await this.restoreExecution()
        })
      },
      onFault: (owner, reason) => this.fault(owner, reason),
      onExit: async owner => {
        if (artifact.unitId === 'driver.pi') { record.adapter?.dispose(new HbarError('EXECUTION_OWNER_REVOKED', 'Driver process exited')); record.adapter = null }
        if (artifact.unitId === 'controller') { record.controller?.dispose(); record.controller = null }
        this.coordinator.ownerExited(owner)
        const interruption = this.interrupted.get(owner.incarnation)
        if (interruption) interruption.exited = true
        if (!interruption && this.registeredOwners.has(owner.incarnation)) {
          this.coordinator.disposeOwner(owner)
          this.registeredOwners.delete(owner.incarnation)
        }
      },
    })
    record = { artifact, process: managed, owner: null, adapter: null, controller: null }
    this.generations.set(`${artifact.unitId}:${generation}`, record)
    return managed
  }
  private transition(operation: () => Promise<void>): void {
    this.transitions = this.transitions.then(operation).catch(error => {
      this.transitionError = error instanceof HbarError ? error.code : 'RUNTIME_RECONCILIATION_FAILED'
      this.ready = false
      this.kernelValue?.beginDrain()
      console.error(`[hbar runtime] transition failed: ${this.transitionError}`)
    })
  }
  private async installStorage(record: GenerationRecord): Promise<void> {
    if (!record.owner || this.storage.snapshot().owner?.incarnation === record.owner.incarnation) return
    if (this.recoveringStorage) {
      if (this.recoveringStorage.unknown) throw new HbarError('STORAGE_RESULT_UNKNOWN', 'A failed writer has unresolved in-flight outcomes')
      const previous = this.recoveringStorage.owner
      if (!this.interrupted.get(previous.incarnation)?.exited) throw new HbarError('STORAGE_EXIT_UNCONFIRMED', 'The old writer has not exited')
      // The candidate verified integrity and the old OS lease is released. Revoke durable execution before re-admission.
      for (const revoke of this.pendingStorageRevocations)
        await record.process.call('storage.call', { method: 'runtimeExecutionRevoke', args: [revoke.owner, revoke.ids] }, z.unknown())
      this.pendingStorageRevocations.length = 0
      this.storage.reconcileExited(previous)
      this.recoveringStorage = null
    }
    this.storage.install({ owner: record.owner, retire: () => record.process.dispose(),
      call: (method, args, authority) => callStorageRpc({ execute: input => record.process.call('storage.call', input, z.unknown()) }, method, args, authority),
    })
  }
  private execution(): KernelExecutionPort {
    return {
      canIdle: async sessionId => this.ready && this.executionReady() && this.coordinator.canIdle(this.kernelOwner, sessionId),
      claim: async sessionId => {
        if (!this.ready || !this.executionReady()) return null
        const run = await this.storage.call('nextQueuedRun', sessionId)
        if (!run) return null
        const lease = await this.coordinator.claim(this.kernelOwner, sessionId, run.id, {
          kernel: this.kernelVersion, driver: this.manager.currentVersion('driver.pi'), plugins: [], hooks: [],
        })
        if (!lease) return null
        this.leases.set(run.id, lease)
        return { run: await this.storage.call('run', run.id), lease }
      },
      call: (lease, method, ...args) => { this.coordinator.assertCanWrite(this.kernelOwner, lease); return this.storage.callOwned(lease, method, ...args) },
      reserveTool: async (lease, callId) => this.coordinator.reserveTool(lease, callId, this.kernelOwner),
      releaseTool: async id => { this.coordinator.releaseTool(this.kernelOwner, id) },
      release: async lease => { await this.coordinator.requestRelease(lease, () => { this.leases.delete(lease.runId); this.kernelValue?.wake(lease.sessionId) }) },
      interrupted: async lease => {
        this.coordinator.acknowledgeRunStopped(this.kernelOwner, lease.runId)
        this.stoppedRuns.add(lease.runId)
        this.transition(() => this.restoreExecution())
      },
    }
  }
  private driverForRun(runId?: string): RuntimeDriverAdapter {
    const version = (runId ? this.leases.get(runId)?.versions.driver : undefined) ?? this.manager.currentVersion('driver.pi')
    const record = this.generations.get(key(version))
    if (!record?.adapter || !['serving', 'draining'].includes(record.process.snapshot().phase))
      throw new HbarError('RUNTIME_RECOVERING', 'The bound driver version is recovering')
    return record.adapter
  }
  private async fault(owner: RuntimeOwner, reason: string): Promise<void> {
    if (this.closing || this.coordinator.role(owner) === 'candidate') return
    if (owner.unitId === 'controller') { await this.coordinator.revoke(owner); return }
    this.ready = false
    this.kernelValue?.beginDrain()
    if (owner.unitId === 'storage') {
      this.recoveringStorage = { owner, unknown: this.storage.snapshot().inFlight > 0 }
      this.storage.fence(reason)
    }
    const revocation = this.coordinator.revoke(owner)
    const affected = [...this.leases.values()].filter(lease => owner.unitId === 'storage' || [lease.versions.driver, ...lease.versions.plugins].some(
      version => version.unitId === owner.unitId && version.generation === owner.generation))
    this.interrupted.set(owner.incarnation, { owner, leases: affected, exited: false })
    this.kernelValue?.fenceRuns(affected.map(lease => lease.runId))
    await revocation
  }
  private async restoreExecution(): Promise<void> {
    if (!this.kernelValue || this.closing || !this.executionReady() || this.storage.snapshot().phase !== 'serving') return
    for (const [incarnation, failure] of this.interrupted) {
      if (!failure.exited || failure.leases.some(lease => !this.stoppedRuns.has(lease.runId))) continue
      for (const lease of failure.leases) {
        this.coordinator.reconciled(lease.sessionId)
        this.leases.delete(lease.runId)
        this.stoppedRuns.delete(lease.runId)
      }
      await this.kernel.recoverRuns(failure.leases.map(lease => lease.runId))
      this.interrupted.delete(incarnation)
      if (this.registeredOwners.has(incarnation)) { this.coordinator.disposeOwner(failure.owner); this.registeredOwners.delete(incarnation) }
    }
    if ([...this.interrupted.values()].some(failure => failure.leases.length)) return
    this.ready = true
    this.transitionError = null
    await this.kernel.activate()
  }
  private executionReady(): boolean {
    return this.manager.snapshot().units.filter(unit => unit.descriptor.kind === 'storage' || unit.descriptor.kind === 'driver')
      .every(unit => unit.generations.some(generation => generation.role === 'default' && generation.phase === 'serving'))
  }
  private async recoverStartup(): Promise<void> {
    let recovered = 0
    let cursor = ''
    // A terminal result may have committed before its release receipt was lost. Revoke that stale authority too.
    while (true) {
      const leases = await this.storage.call('runtimeUnreleasedExecutions', cursor)
      if (!leases.length) break
      for (const lease of leases) await this.storage.call('runtimeExecutionRevoke', lease.owner, [lease.runId])
      cursor = leases.at(-1)!.leaseId
    }
    cursor = ''
    while (true) {
      const active = await this.storage.call('runtimeActiveRuns', cursor)
      if (!active.length) break
      await this.kernel.recoverRuns(active.map(run => run.id))
      recovered += active.length
      cursor = active.at(-1)!.id
    }
    this.kernel.recovered = recovered
  }
}
