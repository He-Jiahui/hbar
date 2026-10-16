import { join, resolve } from 'node:path'
import { BACKEND_UNATTENDED_VALUE_KEY } from '@hbar/contracts/backend'
import { EXECUTION_SLOT_LIMITS } from '@hbar/contracts/execution-slots'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  HbarError,
  providerSchema,
  diagnosticEvent,
  diagnosticEventSchema,
  type DiagnosticSink,
  type WireNotification,
} from '@hbar/contracts'
import {
  runtimeWireNotificationBatchSchema,
  runtimeWireNotificationSchema,
} from '@hbar/contracts/runtime-notifications'
import { nodeExecutionTargetSchema } from '@hbar/contracts/node-execution-target'
import { nodeWorkspaceMountManifestSchema } from '@hbar/contracts/node-workspace-mount-plan'
import { workspaceFoldersSchema } from '@hbar/contracts/commands/workspace-folders'
import {
  acceptedNodeWorktreeTargetDigest,
  acceptedWorkspaceFolderDigest,
  nodeWorktreeProvisioningAuthoritySchema,
} from '@hbar/contracts/node-worktree-provisioning'
import { nodeWorktreeMethods } from '@hbar/contracts/node-worktree'
import type {
  ExecutionOwnership,
  RuntimeOwner,
  RuntimeSnapshot,
  RuntimeSourceReload,
  RuntimeVersion,
  RuntimeVersionSet,
} from '@hbar/contracts/runtime'
import type { KernelControllerPort } from '@hbar/kernel/controller'
import { createNativeSecrets, type SecretStore } from '@hbar/kernel/secrets'
import {
  RUNTIME_KERNEL_CONTROL_METHODS,
  RUNTIME_KERNEL_HOST_METHODS,
  runtimeKernelStateSchema,
  runtimeKernelRecoverySchema,
  runtimeKernelNodeIntentRecoverySchema,
  runtimeKernelNodeWorkspaceInspectionSchema,
  runtimeKernelNodeWorkspaceMountManifestSchema,
  runtimeKernelVerifyWorkspaceFoldersSchema,
  runtimeKernelNodeWorktreeSchema,
  runtimeKernelRunSchema,
  runtimeKernelMutationAdmissionSchema,
  runtimeKernelCommandCatalogSchema,
  runtimeKernelCommandDescribeSchema,
  runtimeKernelCommandPrepareSchema,
  runtimeKernelCommandExecuteSchema,
} from '@hbar/kernel/runtime-port'
import { RUNTIME_APPLICATION_CONTROLS } from '@hbar/kernel/runtime-application'
import {
  ManagedProcess,
  RuntimeArtifactStore,
  RuntimeCoordinator,
  RuntimeManager,
  RuntimeValuePort,
  procedure,
  registerRuntimeCoordinatorPort,
  RUNTIME_COORDINATION_CONTROL_METHODS,
  runtimeDomainError,
  type IpcPeer,
  type RuntimeArtifact,
  type RuntimeArtifactPackage,
  type RuntimeArtifactSet,
  type RuntimeBuildUnit,
} from '@hbar/runtime'
import { buildRuntimeArtifact, createRuntimeSourceReload, runtimeSourceRoots, watchRuntimeSources } from '@hbar/runtime'
import {
  Storage,
  StableStoragePort,
  callStorageRpc,
  createMaintenanceWorkerPreflight,
  ensurePathLayout,
  storageRpcCallSchema,
  assertStoragePreflightMethod,
  type PathLayout,
} from '@hbar/storage'
import { acquireHostProcessLock } from './process-lock'
import { RuntimeKernelFacade, type RuntimeKernelEndpoint, type RuntimeKernelState } from './runtime-kernel-facade'
import { RuntimeDriverRelay, type RuntimeDriverEndpoint } from './runtime-driver-relay'
import { runtimeControllerRequestSchema, type RuntimeControllerPort } from './runtime-controller-contract'
import { RuntimeControllerAdapter } from './runtime-controller-adapter'
import { hostRuntimeBaseBuildUnit, hostRuntimeBuildUnits } from './runtime-build'
import type { RuntimeSystemPort } from './system-commands'
import { HostCommandExecutionScopes } from './command-execution-scopes'
import { connectRuntimeCommandSource } from './runtime-command-source'
import { CommandMutationAdmission, type CommandMutationState } from './command-mutation-admission'
import { runtimePluginStateSchema, type RuntimePluginState } from '@hbar/plugin-sdk/runtime-plugin'
import { RuntimePluginRelay, type RuntimePluginEndpoint } from './runtime-plugin-relay'
import { RuntimeHumanWaits } from './runtime-human-waits'
import { RUNTIME_PLUGIN_CONTROL_METHODS } from './runtime-plugin-contract'
import { RuntimeResourceRegistry } from './runtime-resource-registry'
import { RuntimeMaintenanceRelay, type RuntimeMaintenanceEndpoint } from './runtime-maintenance-relay'
import { RUNTIME_MAINTENANCE_CONTROL_METHODS } from './runtime-maintenance-contract'
import { createRuntimeControllerServices } from './runtime-controller-services'
import { RUNTIME_COMMAND_JOB_CONTROLS } from './runtime-command-job-contract'
import { RuntimeStatusFeed } from './runtime-status-feed'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import { hostRuntimeProcessCommand } from './runtime-package'
import { recoverRuntimeStartup } from './runtime-startup'
import { recordRuntimeStartupFailure, RuntimeStartupDiagnostics } from './runtime-startup-diagnostics'
import { StorageNodeRegistryPort } from '@hbar/storage/node-registry'
import { RuntimeNodeLinkRelay } from './runtime-node-link-relay'
import { RUNTIME_NODE_LINK_CONTROLS } from './runtime-node-link-contract'
import { createRuntimeNodeIntentRecovery } from './runtime-node-intent-recovery'
import { createRuntimeNodeWorkspaceInspection } from './runtime-node-workspace-inspection'
import { SessionCommandDiscovery } from './session-command-discovery'
import { commandCatalogPageSchema, commandDescriptorSchema, type CommandRoutingPort } from '@hbar/commands'
import { sessionCommandPreparationSchema, sessionCommandToolResultSchema } from '@hbar/kernel/session-command-port'
import { SessionCommandGateway } from './session-command-gateway'
import type { SessionCommandExecution } from './session-command-execution'

export interface ProcessHostRuntimeOptions {
  readonly diagnostics?: DiagnosticSink
  readonly diagnosticFullCoverage?: boolean
  readonly layout: PathLayout
  readonly demo?: boolean
  readonly workspace?: string
  /** Conversation-only hosts reject all calls into the local execution provider. */
  readonly noLocalExec?: boolean
  /** Bound startup claims before the entry point persists its authenticated unattended setting. */
  readonly unattended?: boolean
  readonly secrets?: SecretStore
  readonly sourceRoot?: string
  readonly processCommand?: readonly [string, ...string[]]
  /** Trusted immutable build content, supplied by the packaged entry rather than a remote reload request. */
  readonly artifactPackage?: RuntimeArtifactPackage
  readonly profileModule?: string
  readonly watchSource?: boolean
  /** Source deployments may prepare versions without applying them until an explicit reload command. */
  readonly autoApplySource?: boolean
  /** Local typed catalog override for embedding/tests. Remote reload input cannot register modules. */
  readonly buildUnits?: readonly RuntimeBuildUnit[]
}
interface Generation {
  readonly artifact: RuntimeArtifact
  readonly process: ManagedProcess
  owner: RuntimeOwner | null
  peer: IpcPeer | null
  controller: RuntimeControllerAdapter | null
  application: RuntimeValuePort | null
  state: RuntimeKernelState | null
  stateSampledAt: number | null
  pluginState: RuntimePluginState | null
  refresh: Promise<void> | null
  cleanup: Array<() => void>
}
interface Interruption {
  readonly owner: RuntimeOwner
  readonly leases: ExecutionOwnership[]
  exited: boolean
}
const key = (version: Pick<RuntimeVersion, 'unitId' | 'generation'>) => `${version.unitId}:${version.generation}`

/** Stable composition root. Executable Kernel/driver/controller implementations live exclusively in their child processes. */
export class ProcessHostRuntime implements RuntimeSystemPort {
  readonly commandScopes = new HostCommandExecutionScopes()
  assertCommandSource(source: ExecutionOwnership): void {
    if (this.closing) throw new HbarError('RUNTIME_STOPPED', 'The Host is closing')
    this.coordinator.assertExecution(source)
  }
  retainHostCommand(jobId: string): () => void {
    if (this.closing) throw new HbarError('RUNTIME_STOPPED', 'The Host is closing')
    const resource = this.commandScopes.retainHost(this.coordinator, this.instanceId, `host.command.job:${jobId}`)
    return () => this.coordinator.releaseHostResource(this.instanceId, resource.id)
  }
  private readonly commandDiscovery = new SessionCommandDiscovery()
  readonly storage = new StableStoragePort()
  private commandExecution: SessionCommandExecution | undefined
  private readonly commandGateway = new SessionCommandGateway({
    storage: this.storage,
    discovery: this.commandDiscovery,
    execution: () => this.commandExecution,
    assertSource: (source) => this.assertCommandSource(source),
  })
  attachSessionCommandExecution(service: SessionCommandExecution): () => void {
    if (this.commandExecution && this.commandExecution !== service)
      throw new HbarError('COMMAND_EXECUTION_ATTACHED', 'The Host already has a session command execution service')
    this.commandExecution = service
    return () => {
      if (this.commandExecution === service) this.commandExecution = undefined
    }
  }
  attachCommandRouting(port: CommandRoutingPort): () => void {
    return this.commandDiscovery.attach(port)
  }
  private readonly processTree = createRuntimeProcessTreePort()
  private commandMutationState: CommandMutationState | null = null
  private readonly commandMutationAdmission = new CommandMutationAdmission(
    this.storage,
    (item, runId) => this.commandMutationState?.isKnownPending(item, runId) ?? false,
  )
  attachCommandMutationState(state: CommandMutationState): () => void {
    this.commandMutationState = state
    return () => {
      if (this.commandMutationState === state) this.commandMutationState = null
    }
  }
  readonly artifacts: RuntimeArtifactStore
  readonly coordinator: RuntimeCoordinator
  readonly manager: RuntimeManager
  readonly buildUnits: readonly RuntimeBuildUnit[]
  readonly facade: RuntimeKernelFacade
  readonly maintenance: RuntimeMaintenanceRelay
  readonly controller: RuntimeControllerPort
  readonly nodeLink: RuntimeNodeLinkRelay
  private readonly nodeIntentRecovery: ReturnType<typeof createRuntimeNodeIntentRecovery>
  private readonly nodeWorkspaceInspection: ReturnType<typeof createRuntimeNodeWorkspaceInspection>
  private controllerStarted = false
  private readonly statusFeed: RuntimeStatusFeed
  private readonly disposeStatus: () => void
  private async dispatchController(
    payload: string,
    invoke: Parameters<RuntimeControllerPort['dispatch']>[1],
    authorize?: Parameters<RuntimeControllerPort['dispatch']>[2],
  ): Promise<string> {
    let record: Generation | undefined
    try {
      record = this.currentGeneration('controller')
    } catch {
      /* Independent status reads remain available. */
    }
    if (!record?.controller || record.process.snapshot().phase !== 'serving') {
      if (payload.length > 1_048_576)
        throw new HbarError('INVALID_REQUEST', 'Runtime status request exceeds its input bound')
      const request = runtimeControllerRequestSchema.parse(JSON.parse(payload))
      const command =
        request.method === 'command.execute' ? z.object({ commandId: z.string() }).safeParse(request.params) : null
      if (!command?.success || !['system.runtime.get', 'system.runtime.reload.get'].includes(command.data.commandId))
        throw new HbarError('RUNTIME_RECOVERING', 'The Controller is recovering')
      return JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: await invoke(request, AbortSignal.timeout(5_000)),
      })
    }
    let captured: RuntimeKernelEndpoint | undefined
    try {
      captured = this.currentKernel()
    } catch {
      /* Runtime status remains callable during a Kernel outage. */
    }
    const endpoint = captured
    const adapter = record.controller
    const dispatch = () => adapter.dispatch(payload, invoke, authorize)
    return endpoint ? this.facade.pin(endpoint, dispatch) : dispatch()
  }
  private readonly baseOwner: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: crypto.randomUUID() }
  private readonly generations = new Map<string, Generation>()
  private readonly owners = new Set<string>()
  private readonly leases = new Map<string, ExecutionOwnership>()
  private readonly pendingClaims = new Map<string, { readonly draft: ExecutionOwnership; failed: boolean }>()
  private readonly interrupted = new Map<string, Interruption>()
  private readonly stopped = new Set<string>()
  private readonly resumed = new Set<string>()
  private readonly relay: RuntimeDriverRelay
  private readonly humanWaits: RuntimeHumanWaits
  private readonly pluginRelay: RuntimePluginRelay
  private readonly resources: RuntimeResourceRegistry
  private readonly pluginConfigs = new Map<string, Record<string, unknown>>()
  private readonly pluginPreparingCatalog = new Set<string>()
  private readonly secrets: SecretStore
  private readonly sweep: ReturnType<typeof setInterval>
  private transitions: Promise<void> = Promise.resolve()
  private closing = false
  private closeTask: Promise<void> | undefined
  private initializing = true
  private maintaining = false
  private scheduled = false
  private settingsSchedulingRefresh: Promise<void> | undefined
  private settingsSchedulingRequested = false
  private unattendedStartupPending = false
  private reasonCode: string | null = null
  private storageFailure: { owner: RuntimeOwner; unknown: boolean } | null = null
  private readonly pendingRevocations: Array<{ owner: RuntimeOwner; ids: string[]; cause?: RuntimeOwner }> = []
  private readonly sourceAbort = new AbortController()
  private disposeSource = () => {}
  private sourceBaseline: RuntimeArtifact | null = null
  private sourceState: RuntimeSourceReload | undefined
  private sourceTask: Promise<void> | undefined
  private startupTask: Promise<void> | undefined
  private initialArtifacts: RuntimeArtifactSet | undefined
  private startupStorage: Storage | undefined
  private startupProbe: ReturnType<typeof createMaintenanceWorkerPreflight> | undefined
  private migrated = false
  private configurationLoaded = false
  private startupRecovered = false
  private startupAttempts = 0
  private startupNextAttemptAt: number | null = null
  private readonly startupDiagnostics: RuntimeStartupDiagnostics

  private constructor(
    private readonly options: ProcessHostRuntimeOptions,
    readonly instanceId = crypto.randomUUID(),
  ) {
    this.startupDiagnostics = new RuntimeStartupDiagnostics(options.diagnostics, process.pid)
    this.secrets = options.secrets ?? createNativeSecrets(options.layout.identityRoot)
    this.artifacts = new RuntimeArtifactStore(
      join(options.layout.cacheRoot, 'runtime-artifacts'),
      options.sourceRoot ?? resolve(import.meta.dir, '../../..'),
    )
    this.buildUnits =
      options.buildUnits ?? hostRuntimeBuildUnits(options.profileModule ? { profileModule: options.profileModule } : {})
    this.unattendedStartupPending = options.unattended === true
    this.coordinator = new RuntimeCoordinator(
      {
        claim: async (draft) => {
          this.pendingClaims.set(draft.runId, { draft, failed: false })
          this.leases.set(draft.runId, draft)
          const lease = await this.storage.call('runtimeExecutionClaim', draft)
          if (lease) this.leases.set(lease.runId, lease)
          else {
            this.pendingClaims.delete(draft.runId)
            this.leases.delete(draft.runId)
          }
          return lease
        },
        release: (lease) => this.storage.call('runtimeExecutionRelease', lease),
        revoke: async (owner, ids, cause) => {
          // Controller/Maintenance faults without Run claims need no database projection write.
          if (!ids.length) return
          if (this.storageFailure) {
            this.pendingRevocations.push({ owner, ids: [...ids], ...(cause ? { cause } : {}) })
            return
          }
          await this.storage.call('runtimeExecutionRevoke', owner, ids, cause)
        },
      },
      {
        capacityReady: () => {
          if (this.closing) return
          this.schedule()
        },
      },
    )
    this.humanWaits = new RuntimeHumanWaits({
      coordinator: this.coordinator,
      decisions: {
        question: (sessionId, requestId) => this.storage.call('userInputRead', { sessionId, requestId }),
        approval: (id) => this.storage.call('approval', id),
      },
    })
    this.relay = new RuntimeDriverRelay({
      coordinator: this.coordinator,
      humanWaits: this.humanWaits,
      resolve: (version) => this.driver(version),
    })
    this.resources = new RuntimeResourceRegistry(this.coordinator, this.storage)
    this.pluginRelay = new RuntimePluginRelay({
      storage: this.storage,
      coordinator: this.coordinator,
      humanWaits: this.humanWaits,
      current: () => this.pluginEndpoints(),
      resolve: (id, execution, sessionId) => this.pluginEndpoint(id, execution, sessionId),
      nodeLink: () => this.nodeLink,
    })
    this.facade = new RuntimeKernelFacade({
      commandScopes: this.commandScopes,
      instanceId,
      layout: options.layout,
      demo: options.demo ?? false,
      noLocalExec: options.noLocalExec ?? false,
      nodeWorkspaceInspection: {
        verifyWorkspaceFolders: (nodeId, folders, signal) => {
          const verify = this.nodeWorkspaceInspection.verifyWorkspaceFolders
          if (!verify)
            throw new HbarError('NODE_LINK_UNAVAILABLE', 'Remote folder verification is unavailable in this Host')
          return verify(nodeId, folders, signal)
        },
      },
      storage: this.storage,
      coordinator: this.coordinator,
      current: () => this.currentKernel(),
      endpoints: () => this.endpoints(),
      resolve: (target, method, args, captured) => this.resolveKernel(target, method, args, captured),
      maintain: (action) => this.maintain(action),
      cancel: (runId) => this.cancelRun(runId),
      configurePlugin: (...args) => this.configurePlugin(...args),
      resourceSessions: () => this.resources.sessions(),
      settingsChanged: () => this.refreshSettingsScheduling(),
    })
    this.nodeLink = new RuntimeNodeLinkRelay({
      current: () => {
        const record = this.currentGeneration('node-link')
        if (!record.peer || !record.owner || record.process.snapshot().phase !== 'serving')
          throw new HbarError('NODE_LINK_UNAVAILABLE', 'Node link owner is preparing or recovering')
        return { owner: record.owner, peer: record.peer }
      },
      authorized: (owner) => !this.closing && this.coordinator.role(owner) === 'default',
      state: new StorageNodeRegistryPort(this.storage),
      observations: {
        node: (nodeId) => this.storage.call('node', nodeId),
        list: (nodeId, after, limit) =>
          this.storage.call('nodeSessionsPage', { nodeId, limit, ...(after ? { after } : {}) }),
        session: (id) => this.storage.call('findSession', id),
        workspace: (id) => this.storage.call('findWorkspace', id),
        snapshot: (id, before, limit) => this.kernel.snapshot(id, before, limit),
        events: (id, after, limit) => this.storage.call('events', id, after, limit),
      },
    })
    this.nodeIntentRecovery = createRuntimeNodeIntentRecovery({
      storage: this.storage,
      node: this.nodeLink,
      settle: async (identity, result) => {
        await this.storage.call('nodeExecutionIntentSettle', { identity, result })
      },
    })
    this.nodeWorkspaceInspection = createRuntimeNodeWorkspaceInspection({
      storage: {
        findSession: (id) => this.storage.call('findSession', id),
        run: (id) => this.storage.call('run', id),
        findWorkspace: (id) => this.storage.call('findWorkspace', id),
        node: (id) => this.storage.call('node', id),
        nodeRunWorktree: (runId) => this.storage.call('nodeRunWorktree', runId),
        nodeRunWorktreeAdmission: (runId) => this.storage.call('nodeRunWorktreeAdmission', runId),
        workspaceFolders: (workspaceId) => this.storage.call('workspaceFolders', workspaceId),
      },
      nodeCapabilities: {
        read: (id, signal) => this.nodeLink.call(id, 'node.capabilities', {}, signal),
        canonicalize: async (id, rootId, expectedRoot, signal) => {
          const result = await this.nodeLink.call(id, 'fs.canonicalize', { rootId, expectedRoot, paths: ['.'] }, signal)
          if (result.root !== expectedRoot || result.paths[0] !== expectedRoot)
            throw new HbarError('NODE_ROOT_CHANGED', 'Workspace node root changed its canonical path')
          return expectedRoot
        },
        readWorktree: (id, target, signal) => this.nodeLink.call(id, 'worktree.get', target, signal),
      },
    })
    this.maintenance = new RuntimeMaintenanceRelay({
      commandScopes: this.commandScopes,
      layout: options.layout,
      storage: this.storage,
      coordinator: this.coordinator,
      kernel: this.kernel,
      current: () => this.maintenanceEndpoint(this.manager.defaultOwner('maintenance')),
      resolve: (owner) => this.maintenanceEndpoint(owner),
      changed: () => this.schedule(),
    })
    this.manager = new RuntimeManager({
      instanceId,
      artifacts: this.artifacts,
      references: (owner) => {
        const refs = this.owners.has(owner.incarnation)
          ? this.coordinator.references(owner)
          : { runs: 0, resources: 0, tools: 0 }
        const retained = [...this.leases.values()].filter((lease) =>
          [lease.versions.kernel, lease.versions.driver, ...lease.versions.plugins, ...lease.versions.hooks].some(
            (version) => version.unitId === owner.unitId && version.generation === owner.generation,
          ),
        ).length
        return { ...refs, runs: Math.max(refs.runs, retained) }
      },
      create: (artifact, generation, changed) => this.createGeneration(artifact, generation, changed),
      beforeActivate: async (owner, _artifact, signal) => {
        if (owner.unitId === 'storage' && this.storage.snapshot().owner) {
          await this.maintenance.waitForWriter(signal)
        }
      },
      afterDispose: (owner) => {
        if (this.owners.has(owner.incarnation)) {
          this.coordinator.disposeOwner(owner)
          this.owners.delete(owner.incarnation)
        }
        this.generations.delete(key(owner))
      },
    })
    for (const unit of this.buildUnits) this.manager.register(unit.descriptor)
    this.statusFeed = new RuntimeStatusFeed(() => this.readSnapshot())
    this.disposeStatus = this.manager.subscribe((delta) => this.statusFeed.accept(delta))
    const self = this
    this.controller = {
      dispatch: (payload, invoke, authorize) => this.dispatchController(payload, invoke, authorize),
      get application() {
        return createRuntimeControllerServices({
          catalog: () => {
            const record = self.manager
              .snapshot()
              .units.find((unit) => unit.descriptor.id === 'controller')
              ?.generations.find((g) => g.role === 'default')
            const catalog =
              record && record.phase === 'serving' ? self.controllerAdapter().list() : { revision: 0, items: [] }
            return { ...catalog, items: catalog.items.filter((item) => !item.metadata.id.startsWith('chatDatabase.')) }
          },
          call: (service, method, args, options) => self.controllerAdapter().service(service, method, args, options),
          tracked: (value, actorId, expectation, options) =>
            self.controllerAdapter().trackCommand(value, actorId, expectation, options),
          start: async () => {
            self.controllerStarted = true
            if (!self.initializing) await self.controllerAdapter().resume()
          },
          stop: async () => {
            self.controllerStarted = false
            try {
              await self.controllerAdapter().pause()
            } catch (error) {
              if (runtimeDomainError(error)?.code !== 'RUNTIME_RECOVERING') throw error
            }
          },
        })
      },
    }
    this.sweep = setInterval(() => {
      this.schedule()
      this.statusFeed.refresh()
    }, 1_000)
    this.sweep.unref()
  }
  get kernel(): KernelControllerPort {
    return this.facade.api
  }
  private controllerAdapter(): RuntimeControllerAdapter {
    const record = this.currentGeneration('controller')
    if (!record.controller || record.process.snapshot().phase !== 'serving')
      throw new HbarError('RUNTIME_RECOVERING', 'The Controller command owner is recovering')
    return record.controller
  }
  private controllerProjection(): RuntimeKernelState {
    try {
      return this.facade.projection()
    } catch (error) {
      if (runtimeDomainError(error)?.code !== 'RUNTIME_RECOVERING') throw error
      const previous = [...this.generations.values()]
        .filter((record) => record.artifact.unitId === 'kernel')
        .findLast((record) => record.state)?.state
      if (!previous) throw error
      // Read-only descriptions remain available for operation queries and stable cancellation.
      // Executable calls still verify the live owner in RuntimeKernelFacade and the coordinator.
      return runtimeKernelStateSchema.parse({
        ...previous,
        idle: false,
        active: [...this.leases.values()].map((lease) => ({ sessionId: lease.sessionId, runId: lease.runId })),
      })
    }
  }
  authenticationAvailable(): boolean {
    return this.storage.snapshot().phase === 'serving' && !this.storageFailure
  }
  /** Return the stable facade before migration/build/preparation so the listener can bind immediately. */
  static async open(options: ProcessHostRuntimeOptions): Promise<ProcessHostRuntime> {
    if (
      options.profileModule &&
      options.artifactPackage &&
      !options.artifactPackage.units.some(
        (unit) => unit.artifact.unitId === 'kernel' && unit.artifact.files.some((file) => file.name === 'profile.js'),
      )
    )
      throw new HbarError(
        'RUNTIME_RESTART_REQUIRED',
        'The legacy profile must be included in its prepared artifact package',
      )
    await ensurePathLayout(options.layout)
    const runtime = new ProcessHostRuntime(options)
    runtime.startupTask = recoverRuntimeStartup({
      signal: runtime.sourceAbort.signal,
      start: () => runtime.initialize(),
      failed: (error, nextAttemptAt) => {
        runtime.initializing = true
        runtime.startupAttempts++
        runtime.startupNextAttemptAt = nextAttemptAt
        runtime.reasonCode = runtimeDomainError(error)?.code ?? 'RUNTIME_START_FAILED'
        recordRuntimeStartupFailure(runtime.startupDiagnostics, error, runtime.startupAttempts)
        runtime.statusFeed.refresh()
        console.error(
          `[hbar runtime] startup preparation failed (${runtime.reasonCode}); next attempt ${nextAttemptAt}`,
        )
      },
    })
    void runtime.startupTask.catch(() => {})
    return runtime
  }
  static async create(options: ProcessHostRuntimeOptions): Promise<ProcessHostRuntime> {
    const runtime = await ProcessHostRuntime.open(options)
    try {
      await runtime.ready()
      return runtime
    } catch (error) {
      await runtime.close()
      throw error
    }
  }
  async ready(timeoutMs = 120_000): Promise<void> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000)
      throw new HbarError('INVALID_INPUT', 'Startup readiness needs a bounded deadline')
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.startupTask,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new HbarError(
                  'RUNTIME_START_TIMEOUT',
                  'Required runtime units are still preparing; the stable Host remains available',
                ),
              ),
            timeoutMs,
          )
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
    if (this.closing) throw new HbarError('RUNTIME_STOPPING', 'The stable Host stopped during startup')
  }
  async authenticationReady(): Promise<void> {
    while (!this.authenticationAvailable()) {
      this.sourceAbort.signal.throwIfAborted()
      await Bun.sleep(20)
    }
  }
  private async initialize(): Promise<void> {
    const options = this.options
    this.sourceAbort.signal.throwIfAborted()
    this.startupDiagnostics.beginAttempt()
    this.startupNextAttemptAt = null
    this.setStartupPhase('artifact.prepare')
    try {
      if (!this.initialArtifacts || (options.watchSource && !this.sourceBaseline))
        this.initialArtifacts = options.artifactPackage
          ? await this.artifacts.installPackage(options.artifactPackage, options.artifactPackage.id)
          : this.artifacts.registerSet(await this.buildInitial())
      const prepared = this.initialArtifacts
      this.completeStartupPhase()
      if (!this.migrated) {
        this.setStartupPhase('storage.migration')
        const release = await acquireHostProcessLock(`${options.layout.database}.runtime-writer.lock`)
        try {
          const artifact = prepared.artifacts.find((unit) => unit.unitId === 'maintenance')
          if (!artifact)
            throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Startup needs the registered read-only integrity Worker')
          const probe = createMaintenanceWorkerPreflight(
            options.layout,
            join(this.artifacts.root, artifact.id, 'maintenance-worker.js'),
            { allowMigration: true },
          )
          this.startupProbe = probe
          try {
            await probe.ready
          } finally {
            await probe.close()
            this.startupProbe = undefined
          }
          this.sourceAbort.signal.throwIfAborted()
          const installation = new Storage(options.layout.database, options.layout)
          this.startupStorage = installation
          try {
            await installation.call('ready')
          } finally {
            await installation.close()
            this.startupStorage = undefined
          }
          this.migrated = true
        } finally {
          await release()
        }
        this.completeStartupPhase()
      }
      for (const id of ['storage', 'driver.pi', 'controller']) await this.initializeUnit(prepared, id)
      if (this.buildUnits.some((unit) => unit.descriptor.id === 'node-link'))
        await this.initializeUnit(prepared, 'node-link')
      if (!this.configurationLoaded) {
        this.setStartupPhase('configuration.load')
        const stored = await this.storage.call('plugins')
        const owners: Record<string, string> = {
          'execution.local': 'plugin.local',
          'tools.workspace': 'plugin.local',
          'plan.codex': 'plugin.plan',
          'budget.codex': 'plugin.budget',
          'goal.codex': 'plugin.goal',
          'git.codex': 'plugin.git',
          'agent.codex': 'plugin.agent',
          'workflow.focus': 'plugin.workflow',
          'browser-use.codex': 'plugin.browser',
          'computer-use.codex': 'plugin.computer',
        }
        for (const entry of stored)
          if (!entry.projectId && owners[entry.id]) this.pluginConfigs.set(owners[entry.id] ?? '', entry.config)
        this.configurationLoaded = true
        this.completeStartupPhase()
      }
      if (options.watchSource && !this.sourceBaseline) {
        this.setStartupPhase('source.watch')
        await this.watchSource()
        this.completeStartupPhase()
      }
      for (const unit of this.buildUnits.filter((unit) => unit.descriptor.kind === 'plugin'))
        await this.initializeUnit(prepared, unit.descriptor.id)
      await this.initializeUnit(prepared, 'kernel')
      if (this.buildUnits.some((unit) => unit.descriptor.id === 'maintenance'))
        await this.initializeUnit(prepared, 'maintenance')
      if (options.workspace) {
        this.setStartupPhase('workspace.create')
        await this.kernel.createWorkspace(options.workspace)
        this.completeStartupPhase()
      }
      if (options.demo) {
        this.setStartupPhase('demo.configure')
        await this.storage.call(
          'saveProvider',
          providerSchema.parse({
            id: 'local-fixture',
            name: 'Local fixture',
            protocol: 'mock',
            baseUrl: 'http://127.0.0.1',
            model: 'fixture',
            imageInput: true,
            reasoning: true,
          }),
        )
        this.completeStartupPhase()
      }
      if (!this.startupRecovered) {
        this.setStartupPhase('startup.recover')
        await this.recoverStartup()
        this.startupRecovered = true
        this.completeStartupPhase()
      }
      this.setStartupPhase('runtime.resume')
      this.initializing = false
      if (this.buildUnits.some((unit) => unit.descriptor.id === 'maintenance')) await this.maintenance.reconcile()
      await this.resume()
      await this.kernel.plugins.get('goal').resumeOnStartup()
      if (this.controllerStarted) await this.controllerAdapter().resume()
      this.reasonCode = null
      this.startupNextAttemptAt = null
      this.completeStartupPhase()
      this.statusFeed.refresh()
    } catch (error) {
      this.initializing = true
      throw error
    }
  }
  private async initializeUnit(prepared: RuntimeArtifactSet, id: string): Promise<void> {
    this.setStartupPhase(`unit.${id}`)
    this.sourceAbort.signal.throwIfAborted()
    const unit = this.manager.snapshot().units.find((unit) => unit.descriptor.id === id)
    const defaults = unit?.generations.filter((generation) => generation.role === 'default') ?? []
    if (defaults.some((generation) => generation.phase === 'serving')) {
      this.completeStartupPhase()
      return
    }
    const latest = this.initialArtifacts ?? prepared
    const desired = latest.artifacts.find((artifact) => artifact.unitId === id)
    const pending = unit?.queuedArtifactId || unit?.generations.some((generation) => generation.role === 'candidate')
    const replaceFailedSource =
      this.options.watchSource &&
      desired &&
      defaults.length &&
      defaults.every((generation) => generation.artifactId !== desired.id)
    const operation =
      pending || (defaults.length && !replaceFailedSource)
        ? undefined
        : this.manager.reload(latest.id, [id], !defaults.length)
    await this.waitReady([id], operation?.operationId)
    this.completeStartupPhase()
  }
  private setStartupPhase(phase: string): void {
    this.startupDiagnostics.begin(phase)
  }
  private completeStartupPhase(): void {
    this.startupDiagnostics.succeeded(this.startupAttempts)
  }
  snapshot(): RuntimeSnapshot {
    return this.statusFeed.snapshot()
  }
  /** Local diagnostic sampler; Kernel delivery counters are read-only snapshots from the last state refresh. */
  transportDiagnostics() {
    return [...this.generations.values()].flatMap((record) =>
      record.peer
        ? [
            {
              unitId: record.artifact.unitId,
              generation: record.process.snapshot().generation,
              pid: record.process.snapshot().pid,
              ...record.peer.snapshot(),
              ...(record.artifact.unitId === 'kernel'
                ? {
                    notificationDelivery: record.state?.notificationDelivery ?? null,
                    notificationDeliverySampledAt: record.stateSampledAt,
                  }
                : {}),
            },
          ]
        : [],
    )
  }
  subscribe(listener: Parameters<RuntimeStatusFeed['subscribe']>[0]) {
    return this.statusFeed.subscribe(listener)
  }
  watch(cursor?: number) {
    return this.statusFeed.watch(cursor)
  }
  private readSnapshot(): RuntimeSnapshot {
    const state = this.manager.snapshot()
    let source = this.sourceState
    if (source?.phase === 'applying' && source.operationId) {
      try {
        const operation = this.manager.getReload(source.operationId)
        const phase =
          operation.phase === 'completed' || operation.phase === 'cancelled'
            ? 'idle'
            : operation.phase === 'failed'
              ? 'failed'
              : operation.phase === 'restart_required'
                ? 'restart_required'
                : 'applying'
        source = { ...source, phase, reasonCode: operation.units.find((unit) => unit.reasonCode)?.reasonCode ?? null }
      } catch {
        source = { ...source, phase: 'idle' }
      }
    }
    const storage = this.storage.snapshot()
    const ready =
      !this.initializing &&
      !this.closing &&
      state.ready &&
      this.executionReady() &&
      storage.phase === 'serving' &&
      !this.storageFailure
    return {
      ...state,
      ...(source ? { sourceReload: { ...source, unitIds: [...source.unitIds] } } : {}),
      ready,
      admission: {
        phase: this.closing
          ? 'stopped'
          : this.initializing
            ? 'initializing'
            : storage.phase === 'handover'
              ? 'handover'
              : ready
                ? 'serving'
                : 'recovering',
        reasonCode: ready
          ? null
          : (storage.reasonCode ??
            this.reasonCode ??
            state.units.flatMap((unit) => unit.generations).find((g) => g.role === 'default' && g.reasonCode)
              ?.reasonCode ??
            null),
        storage,
        ...(this.initializing
          ? { startup: { attempts: this.startupAttempts, nextAttemptAt: this.startupNextAttemptAt } }
          : {}),
      },
    }
  }
  reload(artifactSetId: string, unitIds: readonly string[]) {
    if (!this.migrated)
      throw new HbarError(
        'RUNTIME_RECOVERING',
        'Read-only integrity validation and initial migration must finish before applying a runtime version',
      )
    return this.manager.reload(artifactSetId, unitIds)
  }
  getReload(id: string) {
    return this.manager.getReload(id)
  }
  cancelReload(id: string) {
    return this.manager.cancelReload(id)
  }
  async settled(): Promise<void> {
    await this.transitions
  }
  private async configurePlugin(id: string, enabled: boolean, config?: Record<string, unknown>, projectId?: string) {
    z.string().min(1).max(160).parse(id)
    z.boolean().parse(enabled)
    if (projectId)
      throw new HbarError(
        'RUNTIME_RESTART_REQUIRED',
        'Project plugin configuration requires a compatible owned lifecycle',
      )
    return this.maintain(async () => {
      const endpoint = this.pluginEndpoints().find((value) =>
        value.state.manifests.some((manifest) => manifest.id === id),
      )
      if (!endpoint)
        throw new HbarError(
          'RUNTIME_RESTART_REQUIRED',
          'Custom plugin configuration requires an owned compatible lifecycle',
        )
      const manifest = endpoint.state.manifests.find((value) => value.id === id)!
      if (endpoint.state.manifests.at(-1)?.id !== id)
        throw new HbarError(
          'RUNTIME_RESTART_REQUIRED',
          'This shared plugin group has no independent configuration lifecycle',
        )
      if (!enabled)
        throw new HbarError(
          manifest.required ? 'REQUIRED_PLUGIN' : 'RUNTIME_RESTART_REQUIRED',
          'Removing a plugin capability requires an explicit restart',
        )
      if (!config) return this.kernel.plugins.list()
      const original = this.currentGeneration(endpoint.owner.unitId).artifact
      const artifact = await this.artifacts.configurePlugin(original.id, config)
      const set = this.artifacts.registerSet([artifact])
      const operation = this.reload(set.id, [endpoint.owner.unitId])
      await this.manager.reconcile()
      await this.settled()
      const result = this.getReload(operation.operationId)
      if (!['completed', 'draining'].includes(result.phase)) {
        if (result.cancellable) this.cancelReload(operation.operationId)
        throw new HbarError(
          result.units.find((unit) => unit.reasonCode)?.reasonCode ?? 'RUNTIME_CONFIGURATION_FAILED',
          'The plugin configuration did not become a serving version',
        )
      }
      const current = this.pluginEndpoint(endpoint.owner.unitId)
      this.pluginConfigs.set(endpoint.owner.unitId, current.state.config)
      await this.storage.call('setPlugin', id, true, current.state.config)
      for (const kernel of this.endpoints())
        await kernel.process.call('kernel.plugins.refresh', undefined, z.undefined())
      await this.refreshKernels()
      this.facade.api.changed('plugins')
      return this.currentKernel().state.plugins
    })
  }
  async waitForIdle(timeoutMs = 120_000): Promise<void> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000)
      throw new HbarError('INVALID_INPUT', 'Idle wait needs a bounded deadline')
    const deadline = Date.now() + timeoutMs
    while (true) {
      await this.refreshKernels()
      const active = await this.storage.call('runtimeActiveRuns', '')
      const queued = await this.storage.call('queuedSessions')
      if (
        !active.length &&
        !queued.length &&
        !this.leases.size &&
        !this.scheduled &&
        !this.settingsSchedulingRefresh &&
        this.coordinator.snapshot().sessions === 0 &&
        !this.interrupted.size &&
        this.endpoints().every((endpoint) => endpoint.state.idle)
      )
        return
      if (Date.now() >= deadline) throw new HbarError('RUNTIME_WAIT_TIMEOUT', 'Runtime execution has not settled')
      await Bun.sleep(20)
    }
  }
  close(): Promise<void> {
    if (!this.closeTask && this.coordinator.hostReferences(this.instanceId))
      return Promise.reject(
        new HbarError(
          'HOST_COMMANDS_ACTIVE',
          'Stable Host commands require settlement and saved acknowledgment before closing',
        ),
      )
    this.closeTask ??= this.dispose()
    return this.closeTask
  }
  private async dispose(): Promise<void> {
    this.closing = true
    this.commandDiscovery.close()
    this.maintenance.dispose()
    this.disposeStatus()
    this.statusFeed.close()
    this.disposeSource()
    this.sourceAbort.abort()
    await this.settingsSchedulingRefresh
    await Promise.allSettled([this.startupProbe?.close(), this.startupStorage?.close()])
    await this.sourceTask
    clearInterval(this.sweep)
    for (const record of this.generations.values())
      if (record.artifact.unitId === 'kernel') await record.process.dispose()
    await this.storage.close()
    await this.manager.close()
    await this.startupTask?.catch(() => {})
    await this.transitions
    this.facade.dispose()
  }
  private async buildInitial(): Promise<RuntimeArtifact[]> {
    const artifacts: RuntimeArtifact[] = []
    for (let offset = 0; offset < this.buildUnits.length; offset += 2) {
      const batch = await Promise.allSettled(
        this.buildUnits
          .slice(offset, offset + 2)
          .map((unit) => buildRuntimeArtifact(this.artifacts, unit, this.sourceAbort.signal)),
      )
      for (const result of batch) {
        if (result.status === 'rejected') throw result.reason
        artifacts.push(result.value)
      }
    }
    return artifacts
  }
  private async watchSource(): Promise<void> {
    if (this.options.artifactPackage)
      throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Packaged runtime source watching is unavailable')
    this.sourceBaseline = await buildRuntimeArtifact(
      this.artifacts,
      hostRuntimeBaseBuildUnit(),
      this.sourceAbort.signal,
    )
    this.sourceState = {
      revision: 0,
      phase: 'idle',
      unitIds: [],
      operationId: null,
      artifactSetId: null,
      reasonCode: null,
      updatedAt: Date.now(),
    }
    const reload = createRuntimeSourceReload({
      reload: (paths) => {
        const task = this.applySourceChanges(paths).finally(() => {
          if (this.sourceTask === task) this.sourceTask = undefined
        })
        this.sourceTask = task
        return task
      },
      onError: (error) => this.sourceFailed(error),
    })
    const stopWatch = watchRuntimeSources(
      await runtimeSourceRoots(this.artifacts.sourceRoot),
      reload.changed,
      (error) => this.sourceFailed(error),
    )
    this.disposeSource = () => {
      stopWatch()
      reload.dispose()
    }
  }
  private sourceFailed(error: unknown): void {
    if (this.closing) return
    this.sourceState = {
      revision: (this.sourceState?.revision ?? 0) + 1,
      phase: 'failed',
      unitIds: this.sourceState?.unitIds ?? [],
      operationId: null,
      artifactSetId: null,
      reasonCode: runtimeDomainError(error)?.code ?? 'RUNTIME_BUILD_FAILED',
      updatedAt: Date.now(),
    }
    console.error(`[hbar runtime] source update failed (${this.sourceState.reasonCode})`)
  }
  /** Local development input, never a network command or arbitrary artifact path. */
  async applySourceChanges(paths: readonly string[]): Promise<void> {
    const references = this.manager.artifactReferences()
    this.artifacts.compactMetadata({
      artifactIds: [
        ...references.artifactIds,
        ...(this.initialArtifacts?.artifacts.map((artifact) => artifact.id) ?? []),
        ...(this.sourceBaseline ? [this.sourceBaseline.id] : []),
      ],
      setIds: [
        ...references.setIds,
        ...(this.initialArtifacts ? [this.initialArtifacts.id] : []),
        ...(this.sourceState?.artifactSetId ? [this.sourceState.artifactSetId] : []),
      ],
    })
    const snapshot = this.manager.snapshot()
    const artifacts = this.buildUnits.map((unit) => {
      const current = snapshot.units
        .find((value) => value.descriptor.id === unit.descriptor.id)
        ?.generations.find((generation) => generation.role === 'default')
      const artifact =
        (current ? this.generations.get(key(current))?.artifact : undefined) ??
        this.initialArtifacts?.artifacts.find((artifact) => artifact.unitId === unit.descriptor.id)
      if (!artifact)
        throw new HbarError('RUNTIME_PREPARING', 'Source ownership is waiting for its initial artifact graph')
      return artifact
    })
    const changed = paths.includes('') ? artifacts.flatMap((artifact) => artifact.inputs) : [...paths]
    const affected = this.artifacts.affected(changed, [
      ...artifacts,
      ...(this.sourceBaseline ? [this.sourceBaseline] : []),
    ])
    const nativeSource = changed.some(
      (path) => /\.(?:rs|c|cpp|h|hpp|toml|node|dll|so|dylib|wasm)$/i.test(path) || /(?:^|[\\/])Cargo\.lock$/.test(path),
    )
    if (nativeSource && !affected.includes('base')) affected.push('base')
    if (!affected.length) return
    const revision = (this.sourceState?.revision ?? 0) + 1
    const state: RuntimeSourceReload = {
      revision,
      phase: affected.includes('base') || nativeSource ? 'restart_required' : 'building',
      unitIds: affected,
      operationId: null,
      artifactSetId: null,
      reasonCode: affected.includes('base') || nativeSource ? 'RUNTIME_RESTART_REQUIRED' : null,
      updatedAt: Date.now(),
    }
    this.sourceState = state
    if (state.phase === 'restart_required') {
      console.error('[hbar runtime] stable or native source changed; explicit restart required')
      return
    }
    const built: RuntimeArtifact[] = []
    try {
      for (let offset = 0; offset < affected.length; offset += 2) {
        const batch = affected
          .slice(offset, offset + 2)
          .map((id) => this.buildUnits.find((unit) => unit.descriptor.id === id))
        const result = await Promise.allSettled(
          batch.map((unit) => {
            if (!unit) throw new HbarError('RUNTIME_UNIT_NOT_FOUND', 'Changed source has no registered build unit')
            return buildRuntimeArtifact(this.artifacts, unit, this.sourceAbort.signal)
          }),
        )
        for (const item of result) {
          if (item.status === 'rejected') throw item.reason
          built.push(item.value)
        }
      }
      const set = this.artifacts.registerSet(built)
      this.sourceAbort.signal.throwIfAborted()
      if (this.options.autoApplySource === false) {
        this.sourceState = { ...state, phase: 'prepared', artifactSetId: set.id, updatedAt: Date.now() }
        return
      }
      if (this.initializing && this.initialArtifacts)
        this.initialArtifacts = this.artifacts.registerSet(
          this.initialArtifacts.artifacts.map(
            (artifact) => built.find((replacement) => replacement.unitId === artifact.unitId) ?? artifact,
          ),
        )
      const operation = this.reload(set.id, affected)
      this.sourceState = {
        ...state,
        phase: 'applying',
        artifactSetId: set.id,
        operationId: operation.operationId,
        updatedAt: Date.now(),
      }
      console.log(`[hbar runtime] source update ${operation.operationId}: ${affected.join(', ')}`)
    } catch (error) {
      this.sourceFailed(error)
    }
  }
  private async waitReady(ids: readonly string[], operationId?: string): Promise<void> {
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      this.sourceAbort.signal.throwIfAborted()
      await this.manager.reconcile()
      await this.settled()
      if (
        ids.every((id) =>
          this.manager
            .snapshot()
            .units.find((unit) => unit.descriptor.id === id)
            ?.generations.some((g) => g.role === 'default' && g.phase === 'serving'),
        )
      )
        return
      const operation = operationId ? this.manager.getReload(operationId) : null
      if (operation && ['failed', 'restart_required', 'cancelled'].includes(operation.phase))
        throw new HbarError(
          operation.units.find((unit) => unit.reasonCode)?.reasonCode ?? 'RUNTIME_START_FAILED',
          `Managed activation failed: ${operation.units.map((unit) => `${unit.unitId}:${unit.reasonCode ?? unit.phase}`).join(', ')}`,
        )
      if (
        !operationId &&
        ids.some((id) => {
          const unit = this.manager.snapshot().units.find((unit) => unit.descriptor.id === id)
          return (
            unit &&
            !unit.queuedArtifactId &&
            !unit.generations.some((g) => g.role === 'default' || g.role === 'candidate')
          )
        })
      )
        throw new HbarError('RUNTIME_START_FAILED', 'The pending cold-start candidate ended without a serving owner')
      await Bun.sleep(20)
    }
    throw new HbarError('RUNTIME_START_TIMEOUT', 'Managed runtime activation exceeded its deadline')
  }
  private currentGeneration(unitId: string): Generation {
    const record = this.generations.get(key(this.manager.defaultOwner(unitId)))
    if (!record) throw new HbarError('RUNTIME_RECOVERING', 'The requested runtime default is unavailable')
    if (record.process.snapshot().phase === 'ready') {
      const previous = [...this.generations.values()].find(
        (value) => value.artifact.unitId === unitId && value !== record && value.process.snapshot().phase === 'serving',
      )
      if (previous) return previous
    }
    return record
  }
  private endpoint(record: Generation): RuntimeKernelEndpoint | null {
    if (!record.owner || !record.application || !record.state) return null
    return { owner: record.owner, process: record.process, application: record.application, state: record.state }
  }
  private currentKernel(): RuntimeKernelEndpoint {
    const endpoint = this.endpoint(this.currentGeneration('kernel'))
    if (!endpoint) throw new HbarError('RUNTIME_RECOVERING', 'The Kernel projection is being restored')
    return endpoint
  }
  private endpoints(): RuntimeKernelEndpoint[] {
    return [...this.generations.values()].flatMap((record) =>
      record.artifact.unitId === 'kernel' ? [this.endpoint(record)].filter((value) => value !== null) : [],
    )
  }
  private driver(version = this.manager.currentVersion('driver.pi')): RuntimeDriverEndpoint {
    const record = this.generations.get(key(version))
    if (
      !record?.owner ||
      !record.peer ||
      record.artifact.id !== version.artifactId ||
      !['serving', 'draining'].includes(record.process.snapshot().phase)
    )
      throw new HbarError('RUNTIME_RECOVERING', 'The bound driver is recovering')
    return { owner: record.owner, peer: record.peer, version }
  }
  private bindings(owner: RuntimeOwner, sessionId: string): RuntimeVersionSet {
    const record = this.generations.get(key(owner))
    if (!record || record.owner?.incarnation !== owner.incarnation)
      throw new HbarError('RUNTIME_OWNER_REVOKED', 'The claiming Kernel incarnation expired')
    const kernel = { unitId: owner.unitId, generation: owner.generation, artifactId: record.artifact.id }
    const plugins = this.pluginEndpoints().map(
      (endpoint) => this.resources.version(endpoint.owner.unitId, sessionId) ?? endpoint.version,
    )
    return {
      kernel,
      driver: record.state?.driverIsolation === 'legacy' ? kernel : this.manager.currentVersion('driver.pi'),
      plugins,
      hooks: plugins.filter((version) => {
        const state = this.generations.get(key(version))?.pluginState
        if (!state) throw new HbarError('RUNTIME_RECOVERING', 'The retained plugin Hook metadata is unavailable')
        return state.hooks.length > 0
      }),
    }
  }
  private pluginEndpoints(): RuntimePluginEndpoint[] {
    return this.buildUnits
      .filter((unit) => unit.descriptor.kind === 'plugin')
      .flatMap((unit) => {
        try {
          return [this.pluginEndpoint(unit.descriptor.id)]
        } catch {
          return []
        }
      })
  }
  private pluginEndpoint(unitId: string, execution?: ExecutionOwnership, sessionId?: string): RuntimePluginEndpoint {
    const version =
      execution?.versions.plugins.find((version) => version.unitId === unitId) ??
      (sessionId ? this.resources.version(unitId, sessionId) : undefined) ??
      this.manager.currentVersion(unitId)
    const record = this.generations.get(key(version))
    if (
      !record?.owner ||
      !record.application ||
      !record.pluginState ||
      record.artifact.id !== version.artifactId ||
      !['serving', 'draining'].includes(record.process.snapshot().phase)
    )
      throw new HbarError('RUNTIME_RECOVERING', 'The bound plugin is recovering')
    if (
      execution &&
      !execution.versions.plugins.some((item) => item.unitId === unitId && item.generation === version.generation)
    )
      throw new HbarError('RUNTIME_VERSION_MISMATCH', 'The plugin is absent from this execution binding')
    return { owner: record.owner, application: record.application, state: record.pluginState, version }
  }
  private executionReady(): boolean {
    const kernel = this.generations.get(key(this.manager.defaultOwner('kernel')))
    return (
      kernel?.state?.driverIsolation === 'legacy'
        ? ['storage', 'kernel']
        : [
            'storage',
            'driver.pi',
            'kernel',
            ...this.buildUnits.filter((unit) => unit.descriptor.kind === 'plugin').map((unit) => unit.descriptor.id),
          ]
    ).every((id) =>
      this.manager
        .snapshot()
        .units.find((unit) => unit.descriptor.id === id)
        ?.generations.some((g) => g.role === 'default' && g.phase === 'serving'),
    )
  }
  private canAdmit(sessionId: string): boolean {
    return (
      !this.closing &&
      !this.initializing &&
      !this.maintaining &&
      !this.maintenance.isWriting() &&
      this.executionReady() &&
      this.storage.snapshot().phase === 'serving' &&
      !this.storageFailure &&
      !this.pluginPreparingCatalog.size &&
      ![...this.interrupted.values()].some((failure) =>
        failure.leases.some((lease) => lease.sessionId === sessionId),
      ) &&
      ![...this.leases.values()].some(
        (lease) => lease.sessionId === sessionId && !this.coordinator.execution(lease.runId),
      )
    )
  }
  private createGeneration(artifact: RuntimeArtifact, generation: number, changed: () => void): ManagedProcess {
    const layout = this.options.layout
    const paths = {
      dataRoot: layout.dataRoot,
      cacheRoot: layout.cacheRoot,
      pointerFile: layout.pointerFile,
      settingsRoot: layout.settings,
      sessionsRoot: layout.sessions,
      skillsRoot: layout.globalSkills,
      identityRoot: layout.identityRoot,
    }
    const configuration =
      artifact.unitId === 'storage'
        ? {
            ...paths,
            database: layout.database,
            workerPath: join(this.artifacts.root, artifact.id, 'worker.js'),
            diagnosticsEnabled: Boolean(this.options.diagnostics),
            diagnosticsFullCoverage: this.options.diagnosticFullCoverage ?? false,
          }
        : artifact.unitId === 'maintenance'
          ? { ...paths, workerPath: join(this.artifacts.root, artifact.id, 'maintenance-worker.js') }
          : artifact.unitId === 'controller'
            ? {
                ...paths,
                instanceId: this.instanceId,
                demo: this.options.demo ?? false,
                noLocalExec: this.options.noLocalExec ?? false,
              }
            : artifact.unitId === 'kernel'
              ? {
                  ...paths,
                  instanceId: this.instanceId,
                  demo: this.options.demo ?? false,
                  noLocalExec: this.options.noLocalExec ?? false,
                  isolatedPlugins: this.buildUnits.some((unit) => unit.descriptor.kind === 'plugin'),
                  diagnosticsEnabled: Boolean(this.options.diagnostics),
                  diagnosticsFullCoverage: this.options.diagnosticFullCoverage ?? false,
                  ...(this.options.profileModule
                    ? { profileModule: join(this.artifacts.root, artifact.id, 'profile.js') }
                    : {}),
                }
              : artifact.descriptor.kind === 'plugin'
                ? {
                    dataRoot: layout.dataRoot,
                    cacheRoot: layout.cacheRoot,
                    noLocalExec: this.options.noLocalExec ?? false,
                    config: artifact.pluginConfiguration ?? this.pluginConfigs.get(artifact.unitId) ?? {},
                  }
                : {}
    let record: Generation
    const managed = new ManagedProcess({
      descriptor: artifact.descriptor,
      artifactId: artifact.id,
      generation,
      purpose:
        this.initializing &&
        !this.manager
          .snapshot()
          .units.find((unit) => unit.descriptor.id === artifact.unitId)
          ?.generations.some((g) => g.role === 'default')
          ? 'startup'
          : 'candidate',
      modulePath: join(this.artifacts.root, artifact.id, artifact.entry),
      parent: this.baseOwner,
      configuration,
      verifyModule: async (signal) => {
        await this.artifacts.get(artifact.id)
        signal.throwIfAborted()
      },
      controlMethods: [
        ...RUNTIME_KERNEL_CONTROL_METHODS,
        ...RUNTIME_KERNEL_HOST_METHODS,
        ...RUNTIME_COORDINATION_CONTROL_METHODS,
        ...RUNTIME_PLUGIN_CONTROL_METHODS,
        ...RUNTIME_MAINTENANCE_CONTROL_METHODS,
        ...RUNTIME_NODE_LINK_CONTROLS,
        ...RUNTIME_COMMAND_JOB_CONTROLS,
        'kernel.plugins.callback',
        'kernel.plugins.control',
        'controller.control',
        'controller.invoke',
        'controller.authorize',
        'controller.application.control',
        'controller.application.callback',
        'controller.background.scope',
        'controller.resume',
        'controller.pause',
      ],
      command: this.options.processCommand ?? hostRuntimeProcessCommand(),
      processTree: this.processTree,
      onPeer: (peer, owner) => {
        record.owner = owner
        record.peer = peer
        record.cleanup.push(
          peer.onEvent('runtime.diagnostic', diagnosticEventSchema, (event) => {
            try {
              this.options.diagnostics?.emit({ ...event, instanceId: this.instanceId })
            } catch {
              /* A journal observer never owns runtime recovery. */
            }
          }),
        )
        this.coordinator.register(
          owner,
          { unitId: artifact.unitId, generation, artifactId: artifact.id },
          artifact.descriptor,
        )
        this.owners.add(owner.incarnation)
        if (artifact.unitId === 'driver.pi') record.cleanup.push(this.relay.attachDriver(peer))
        if (artifact.unitId === 'node-link') record.cleanup.push(this.nodeLink.attach(peer, owner))
        if (artifact.unitId === 'controller')
          record.controller = new RuntimeControllerAdapter(peer, {
            commandScopes: this.commandScopes,
            kernel: this.kernel,
            maintenance: this.maintenance,
            nodeLink: this.nodeLink,
            projection: () => this.controllerProjection(),
            background: () => this.coordinator.role(owner) === 'default',
            admitsApplications: () => ['default', 'draining'].includes(this.coordinator.role(owner)),
            fresh: (event) => this.facade.replay({ method: 'notifications.created', params: event }),
            retainCommand: (jobId) => {
              const resource = this.commandScopes.retain(this.coordinator, owner, `command.job:${jobId}`)
              if (!resource) throw new HbarError('BUSY', 'The command job already retains its owner')
              return () => this.coordinator.releaseResource(owner, resource.id)
            },
          })
        if (artifact.unitId === 'maintenance')
          record.cleanup.push(
            this.maintenance.attach(peer, owner, { unitId: artifact.unitId, generation, artifactId: artifact.id }),
          )
        if (artifact.descriptor.kind === 'plugin') {
          const connection = this.pluginRelay.attachPlugin(peer, owner)
          record.application = connection.application
          record.cleanup.push(connection.dispose)
          record.cleanup.push(
            this.resources.attach(connection.application, owner, {
              unitId: artifact.unitId,
              generation,
              artifactId: artifact.id,
            }),
          )
        }
        if (artifact.unitId === 'kernel') this.attachKernel(record, peer, owner)
      },
      onActivating: async (owner, role, signal) => {
        if (artifact.unitId === 'storage' && this.storageFailure?.unknown)
          throw new HbarError(
            'STORAGE_RESULT_UNKNOWN',
            'Unconfirmed writes require reconciliation before opening a replacement writer',
          )
        if (artifact.unitId === 'storage' && this.maintenance.isWriting())
          throw new HbarError(
            'STORAGE_MAINTENANCE_ACTIVE',
            'The maintenance writer must finish verification before storage activation',
          )
        if (
          artifact.unitId === 'storage' &&
          this.storage.snapshot().phase === 'serving' &&
          this.storage.snapshot().owner?.incarnation !== owner.incarnation
        )
          await this.storage.beginHandover()
        signal.throwIfAborted()
        this.coordinator.activate(owner, role)
        if (artifact.descriptor.kind === 'plugin' && role === 'default')
          this.pluginPreparingCatalog.add(artifact.unitId)
      },
      onActivated: async (owner, _role, signal) => {
        if (!record.peer || record.owner?.incarnation !== owner.incarnation)
          throw new HbarError('RUNTIME_OWNER_REVOKED', 'Description readiness belongs to an expired owner')
        if (artifact.unitId === 'kernel') {
          record.state = await record.peer.call('kernel.state', undefined, runtimeKernelStateSchema, {
            signal,
            timeoutMs: 120_000,
          })
          record.stateSampledAt = Date.now()
        }
        if (artifact.descriptor.kind === 'plugin')
          record.pluginState = await record.peer.call('plugin.state', undefined, runtimePluginStateSchema, {
            signal,
            timeoutMs: 120_000,
          })
        if (artifact.unitId === 'controller') await record.controller?.refreshCatalog()
        signal.throwIfAborted()
      },
      onState: (state) => {
        changed()
        if (state.phase === 'serving' || state.phase === 'draining')
          this.transition(async () => {
            if (artifact.unitId === 'controller' && state.role === 'default') {
              await record.controller?.refreshCatalog()
              if (this.controllerStarted && !this.initializing) await record.controller?.resume()
            }
            if (
              this.closing ||
              record.owner?.incarnation !== state.incarnation ||
              !['serving', 'draining'].includes(record.process.snapshot().phase)
            )
              return
            if (artifact.unitId === 'storage' && state.role === 'default') await this.installStorage(record)
            if (artifact.unitId === 'kernel') await this.refresh(record)
            if (artifact.descriptor.kind === 'plugin') {
              record.pluginState = await record.process.call('plugin.state', undefined, runtimePluginStateSchema)
              if (!this.initializing)
                for (const endpoint of this.endpoints()) {
                  try {
                    await endpoint.process.call('kernel.plugins.refresh', undefined, z.undefined())
                  } catch (error) {
                    if (['serving', 'draining'].includes(endpoint.process.snapshot().phase)) throw error
                  }
                }
              this.pluginPreparingCatalog.delete(artifact.unitId)
            }
            if ((artifact.unitId === 'storage' || artifact.unitId === 'driver.pi') && state.role === 'default')
              this.resumed.clear()
            this.schedule()
          })
      },
      onFault: (owner, reason, childPid) => {
        this.emitProcessLifecycleDiagnostic({
          component: 'host',
          level: 'error',
          event: 'host.runtime_process_fault',
          phase: `generation.${owner.generation}`,
          contextId: owner.unitId,
          requestId: owner.incarnation,
          instanceId: this.instanceId,
          processId: process.pid,
          childPid,
          errorCode: reason,
          outcome: 'failure',
        })
        return this.fault(owner, reason)
      },
      onExit: async (owner, exit) => {
        this.emitProcessLifecycleDiagnostic({
          component: 'host',
          level: exit.deliberate ? 'info' : 'error',
          event: 'host.runtime_process_exit',
          phase: `generation.${owner.generation}`,
          contextId: owner.unitId,
          requestId: owner.incarnation,
          instanceId: this.instanceId,
          processId: process.pid,
          childPid: exit.childPid,
          exitCode: exit.exitCode,
          ...(exit.reasonCode ? { errorCode: exit.reasonCode } : {}),
          restartExpected: exit.restartExpected,
          outcome: exit.deliberate ? 'success' : 'failure',
        })
        if (artifact.unitId === 'node-link') this.nodeLink.exited(owner)
        if (artifact.unitId === 'kernel') {
          this.relay.kernelExited(owner)
          this.humanWaits.exited(owner)
          for (const lease of this.leases.values())
            if (lease.owner.incarnation === owner.incarnation) this.stopped.add(lease.runId)
        }
        if (artifact.unitId === 'driver.pi') this.relay.driverExited(owner)
        if (artifact.descriptor.kind === 'plugin') this.pluginRelay.exited(owner)
        this.maintenance.exited(owner)
        this.resources.exited(owner)
        for (const cleanup of record.cleanup.splice(0)) cleanup()
        record.controller?.dispose()
        record.controller = null
        record.application?.dispose()
        record.application = null
        record.peer = null
        this.coordinator.ownerExited(owner)
        this.resumed.delete(owner.incarnation)
        const interruption = this.interrupted.get(owner.incarnation)
        if (interruption) interruption.exited = true
        else if (this.owners.has(owner.incarnation)) {
          this.coordinator.disposeOwner(owner)
          this.owners.delete(owner.incarnation)
        }
        this.schedule()
      },
    })
    record = {
      artifact,
      process: managed,
      owner: null,
      peer: null,
      controller: null,
      application: null,
      state: null,
      stateSampledAt: null,
      pluginState: null,
      refresh: null,
      cleanup: [],
    }
    this.generations.set(`${artifact.unitId}:${generation}`, record)
    return managed
  }
  private attachKernel(record: Generation, peer: IpcPeer, owner: RuntimeOwner): void {
    record.cleanup.push(
      peer.register(
        'kernel.preflight.read',
        procedure(storageRpcCallSchema, z.unknown(), (input) => {
          this.coordinator.assertCanRead(owner)
          if (input.authority)
            throw new HbarError('RUNTIME_PREPARING', 'Candidate reads cannot carry execution authority')
          assertStoragePreflightMethod(input.method)
          return this.storage.executeRpc(input)
        }),
      ),
    )
    record.application = new RuntimeValuePort(peer, {
      prefix: 'kernel.application',
      controlMethods: RUNTIME_APPLICATION_CONTROLS,
      callbackSettlement: 'physical',
    })
    const assertCommandCaller = (input: { sessionId: string; runId: string }) => {
      const lease = this.leases.get(input.runId)
      if (!lease || lease.sessionId !== input.sessionId)
        throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Command access requires this Session Run claim')
      this.coordinator.assertCanWrite(owner, lease)
      return lease
    }
    record.cleanup.push(
      peer.register(
        'kernel.commands.prepare',
        procedure(runtimeKernelCommandPrepareSchema, sessionCommandPreparationSchema, async (input, call) => {
          const source = assertCommandCaller(input)
          const result = await this.commandGateway.prepare(source, input.callId, input.call, call.signal)
          assertCommandCaller(input)
          return result
        }),
      ),
      peer.register(
        'kernel.commands.execute',
        procedure(runtimeKernelCommandExecuteSchema, sessionCommandToolResultSchema, async (input, call) => {
          const source = assertCommandCaller(input)
          const connection = input.source
            ? connectRuntimeCommandSource(
                peer,
                input.source,
                source,
                input.callId,
                call.signal,
                input.preparation.admission.timeoutMs,
              )
            : undefined
          try {
            return await this.commandGateway.execute(
              source,
              input.callId,
              input.preparation,
              call.signal,
              connection?.application,
            )
          } finally {
            await connection?.close()
          }
        }),
      ),
      peer.register(
        'kernel.commands.admitMutation',
        procedure(runtimeKernelMutationAdmissionSchema, z.undefined(), async (input, call) => {
          assertCommandCaller(input)
          await this.commandMutationAdmission.assertAllowed({
            sessionId: input.sessionId,
            runId: input.runId,
            signal: call.signal,
          })
          assertCommandCaller(input)
        }),
      ),
      peer.register(
        'kernel.commands.list',
        procedure(runtimeKernelCommandCatalogSchema, commandCatalogPageSchema, async (input, call) => {
          assertCommandCaller(input)
          const result = await this.commandDiscovery.list(input.query, call.signal)
          assertCommandCaller(input)
          return result
        }),
      ),
      peer.register(
        'kernel.commands.describe',
        procedure(runtimeKernelCommandDescribeSchema, commandDescriptorSchema, async (input, call) => {
          assertCommandCaller(input)
          const result = await this.commandDiscovery.describe(input.commandId, call.signal)
          assertCommandCaller(input)
          return result
        }),
      ),
    )
    record.cleanup.push(
      this.relay.attachKernel(peer),
      this.pluginRelay.attachKernel(peer, owner),
      this.humanWaits.attachKernel(peer, owner),
      registerRuntimeCoordinatorPort(peer, this.coordinator, {
        owner,
        bindings: (caller, sessionId) => this.bindings(caller, sessionId),
        canAdmit: (sessionId) => this.canAdmit(sessionId),
        admitted: (lease) => {
          this.pendingClaims.delete(lease.runId)
          this.leases.set(lease.runId, lease)
          this.schedule()
        },
        claimFailed: (_owner, _sessionId, runId) => {
          const pending = this.pendingClaims.get(runId)
          if (pending) {
            pending.failed = true
            this.stopped.add(runId)
            this.schedule()
          }
        },
        released: (lease) => {
          this.humanWaits.release(lease)
          return this.handoff(lease)
        },
        stopped: (_owner, runId) => {
          this.stopped.add(runId)
          this.schedule()
        },
        releaseFailed: () => {
          this.reasonCode = 'EXECUTION_RECONCILIATION_REQUIRED'
          this.schedule()
        },
      }),
    )
    record.cleanup.push(
      peer.register(
        'kernel.storage',
        procedure(storageRpcCallSchema, z.unknown(), (input) => {
          if (input.authority && input.authority.owner.incarnation !== owner.incarnation)
            throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Kernel storage authority belongs to another executor')
          this.coordinator.assertCanWrite(owner, input.authority)
          return this.storage.executeRpc(input)
        }),
      ),
      peer.register(
        'kernel.nodeIntentRecovery.reconcileRun',
        procedure(runtimeKernelRunSchema, runtimeKernelNodeIntentRecoverySchema, async (input, call) => {
          const assertHostAuthority = () => {
            const current = this.manager.defaultOwner('kernel')
            if (this.closing || current.incarnation !== owner.incarnation || this.coordinator.role(owner) !== 'default')
              throw new HbarError('RUNTIME_OWNER_REVOKED', 'Node recovery requires the current default Kernel owner')
            this.coordinator.assertCanWrite(owner)
          }
          assertHostAuthority()
          return this.nodeIntentRecovery.reconcileRun(
            input.runId,
            AbortSignal.any([call.signal, AbortSignal.timeout(60_000)]),
            assertHostAuthority,
          )
        }),
      ),
    )
    const id = z.string().min(1).max(160)
    const receiveNotification = (event: WireNotification) => {
      this.facade.receive(owner, event)
      this.scheduleRefresh(record)
    }
    const receiveNotificationBatch = (events: readonly WireNotification[]) => {
      for (const event of events) this.facade.receive(owner, event)
      this.scheduleRefresh(record)
    }
    record.cleanup.push(
      peer.register(
        'kernel.nodeWorkspaceInspection.captureExecutionTarget',
        procedure(runtimeKernelNodeWorkspaceInspectionSchema, nodeExecutionTargetSchema, async (input, call) => {
          const assertCurrentOwner = () => {
            if (
              this.closing ||
              this.manager.defaultOwner('kernel').incarnation !== owner.incarnation ||
              this.coordinator.role(owner) !== 'default'
            )
              throw new HbarError('RUNTIME_OWNER_REVOKED', 'Node inspection requires the current default Kernel owner')
            this.coordinator.assertCanWrite(owner)
          }
          assertCurrentOwner()
          const target = await this.nodeWorkspaceInspection.captureExecutionTarget(
            input,
            AbortSignal.any([call.signal, AbortSignal.timeout(15_000)]),
          )
          assertCurrentOwner()
          return target
        }),
      ),
      peer.register(
        'kernel.nodeWorkspaceInspection.resolveWorkspaceMountManifest',
        procedure(
          runtimeKernelNodeWorkspaceMountManifestSchema,
          nodeWorkspaceMountManifestSchema,
          async (input, call) => {
            const assertCurrentOwner = () => {
              if (
                this.closing ||
                this.manager.defaultOwner('kernel').incarnation !== owner.incarnation ||
                this.coordinator.role(owner) !== 'default'
              )
                throw new HbarError(
                  'RUNTIME_OWNER_REVOKED',
                  'Node inspection requires the current default Kernel owner',
                )
              this.coordinator.assertCanWrite(owner)
            }
            assertCurrentOwner()
            const inspection = this.nodeWorkspaceInspection
            if (!inspection.resolveWorkspaceMountManifest)
              throw new HbarError(
                'NODE_WORKSPACE_INSPECTION_UNAVAILABLE',
                'Workspace mount verification is unavailable for this runtime',
              )
            const manifest = await inspection.resolveWorkspaceMountManifest(
              input.request,
              input.folders,
              input.primary,
              AbortSignal.any([call.signal, AbortSignal.timeout(60_000)]),
            )
            assertCurrentOwner()
            return manifest
          },
        ),
      ),
      peer.register(
        'kernel.nodeWorkspaceInspection.verifyWorkspaceFolders',
        procedure(runtimeKernelVerifyWorkspaceFoldersSchema, workspaceFoldersSchema, async (input, call) => {
          const assertCurrentOwner = () => {
            if (
              this.closing ||
              this.manager.defaultOwner('kernel').incarnation !== owner.incarnation ||
              this.coordinator.role(owner) !== 'default'
            )
              throw new HbarError('RUNTIME_OWNER_REVOKED', 'Node inspection requires the current default Kernel owner')
            this.coordinator.assertCanWrite(owner)
          }
          assertCurrentOwner()
          const inspection = this.nodeWorkspaceInspection
          if (!inspection.verifyWorkspaceFolders)
            throw new HbarError(
              'NODE_WORKSPACE_INSPECTION_UNAVAILABLE',
              'Workspace folder verification is unavailable for this runtime',
            )
          const folders = await inspection.verifyWorkspaceFolders(
            input.nodeId,
            input.folders,
            AbortSignal.any([call.signal, AbortSignal.timeout(60_000)]),
          )
          assertCurrentOwner()
          return folders
        }),
      ),
      peer.register(
        'kernel.nodeWorktree.call',
        procedure(runtimeKernelNodeWorktreeSchema, z.unknown(), async (input, call) => {
          const assertCurrentOwner = () => {
            if (
              this.closing ||
              this.manager.defaultOwner('kernel').incarnation !== owner.incarnation ||
              this.coordinator.role(owner) !== 'default'
            )
              throw new HbarError(
                'RUNTIME_OWNER_REVOKED',
                'Node worktree allocation requires the current default Kernel owner',
              )
            this.coordinator.assertCanWrite(owner)
          }
          assertCurrentOwner()
          const node = await this.storage.call('node', input.nodeId)
          if (!node || node.nodeId !== input.nodeId || node.revokedAt !== null)
            throw new HbarError('NODE_REVOKED', 'The worktree node is no longer trusted by this Host')
          const request = nodeWorktreeMethods[input.method].input.parse(input.input) as {
            provisioning: unknown
            rootId: string
            expectedRoot: string
            branch: string
            startPoint?: string
            createBranch?: boolean
            operationId?: string
          }
          const provisioning = nodeWorktreeProvisioningAuthoritySchema.parse(request.provisioning)
          const admission = await this.storage.call('nodeRunWorktreeAdmission', provisioning.runId)
          if (
            !admission ||
            admission.runId !== provisioning.runId ||
            admission.sessionId !== provisioning.sessionId ||
            admission.workspaceId !== provisioning.workspaceId ||
            admission.originalWorkspaceLocation.nodeId !== provisioning.nodeId ||
            admission.originalWorkspaceLocation.nodeId !== input.nodeId ||
            admission.originalWorkspaceLocation.rootId !== request.rootId ||
            admission.originalWorkspaceLocation.nodePath !== request.expectedRoot ||
            admission.launchTarget.expectedRevision !== provisioning.targetRevision ||
            JSON.stringify(admission.launchTarget.selection) !== JSON.stringify(provisioning.selection) ||
            !admission.workspaceFoldersSnapshot ||
            admission.workspaceFoldersSnapshot.revision !== provisioning.workspaceFolderRevision ||
            acceptedWorkspaceFolderDigest(admission.workspaceFoldersSnapshot) !== provisioning.workspaceFolderDigest ||
            acceptedNodeWorktreeTargetDigest({
              workspaceId: admission.workspaceId,
              sessionId: admission.sessionId,
              targetRevision: admission.launchTarget.expectedRevision,
              selection: admission.launchTarget.selection,
              workspaceFolderRevision: admission.workspaceFoldersSnapshot.revision,
              workspaceFolderDigest: provisioning.workspaceFolderDigest,
            }) !== provisioning.acceptedTargetDigest
          )
            throw new HbarError('WORKSPACE_SCOPE', 'Worktree provisioning differs from the accepted Run target')
          if (input.method === 'worktree.create' && request.operationId !== `${provisioning.runId}:worktree-create`)
            throw new HbarError('WORKSPACE_SCOPE', 'Worktree create operation ID differs from the accepted Run')
          if (input.method === 'worktree.get' && request.operationId !== `${provisioning.runId}:worktree-get`)
            throw new HbarError('WORKSPACE_SCOPE', 'Worktree get operation ID differs from the accepted Run')
          if (input.method === 'worktree.remove')
            throw new HbarError(
              'NODE_WORKTREE_REMOVE_UNAVAILABLE',
              'Managed worktree removal requires the explicit launch-target lifecycle command',
            )
          const selection = admission.launchTarget.selection
          const expectedBranch =
            selection.mode === 'shared-current'
              ? null
              : selection.mode === 'shared-branch'
                ? selection.branch.ref.slice('refs/heads/'.length)
                : selection.branch.kind === 'derived'
                  ? `hbar/session-launch/${createHash('sha256').update(`${provisioning.sessionId}\0${provisioning.targetRevision}`).digest('hex')}`
                  : selection.branch.name
          const expectedStartPoint =
            selection.mode === 'isolated-worktree'
              ? selection.branch.kind === 'new'
                ? selection.branch.startPoint
                : selection.branch.kind === 'derived'
                  ? selection.branch.baseRef.slice('refs/heads/'.length)
                  : undefined
              : undefined
          const expectedCreateBranch =
            selection.mode === 'isolated-worktree' &&
            (selection.branch.kind === 'new' || selection.branch.kind === 'derived')
          if (
            selection.mode === 'shared-current' ||
            expectedBranch !== request.branch ||
            request.startPoint !== expectedStartPoint ||
            request.createBranch !== expectedCreateBranch
          )
            throw new HbarError('WORKSPACE_SCOPE', 'Worktree branch differs from the accepted launch selection')
          const signal = AbortSignal.any([
            call.signal,
            AbortSignal.timeout(input.method === 'worktree.create' ? 150_000 : 20_000),
          ])
          let result: unknown
          if (input.method === 'worktree.create') {
            const create = nodeWorktreeMethods['worktree.create'].input.parse(input.input)
            result = await this.nodeLink.call(input.nodeId, 'worktree.create', create, signal)
          } else {
            const get = nodeWorktreeMethods['worktree.get'].input.parse(input.input)
            result = await this.nodeLink.call(input.nodeId, 'worktree.get', get, signal)
          }
          assertCurrentOwner()
          return result
        }),
      ),
      peer.register(
        'kernel.secret.get',
        procedure(z.strictObject({ id }), z.string().nullable(), (input) => {
          this.coordinator.assertCanWrite(owner)
          return this.secrets.get(input.id)
        }),
      ),
      peer.register(
        'kernel.secret.set',
        procedure(z.strictObject({ id, value: z.string().max(1_048_576) }), z.undefined(), (input) => {
          this.coordinator.assertCanWrite(owner)
          return this.secrets.set(input.id, input.value)
        }),
      ),
      peer.register(
        'kernel.secret.delete',
        procedure(z.strictObject({ id }), z.undefined(), (input) => {
          this.coordinator.assertCanWrite(owner)
          return this.secrets.delete(input.id)
        }),
      ),
      peer.onEvent('kernel.notification', runtimeWireNotificationSchema, receiveNotification),
      peer.onEvent('kernel.notifications.batch', runtimeWireNotificationBatchSchema, receiveNotificationBatch),
    )
  }
  private emitProcessLifecycleDiagnostic(input: Parameters<typeof diagnosticEvent>[0]): void {
    try {
      this.options.diagnostics?.emit(diagnosticEvent(input))
    } catch {
      // Lifecycle diagnostics are observational and never own process retirement.
    }
  }

  private transition(operation: () => Promise<void>): void {
    this.transitions = this.transitions.then(operation).catch((error) => {
      this.reasonCode = runtimeDomainError(error)?.code ?? 'RUNTIME_RECONCILIATION_FAILED'
      console.error(`[hbar runtime] transition failed (${this.reasonCode})`)
    })
  }
  private schedule(): void {
    if (this.scheduled || this.closing || this.initializing) return
    this.scheduled = true
    this.transition(async () => {
      try {
        await this.reconcile()
      } finally {
        this.scheduled = false
      }
    })
  }
  private scheduleRefresh(record: Generation): void {
    if (record.refresh || this.closing) return
    void this.refresh(record).catch(() => {
      /* The owner fault path reconciles any unavailable projection. */
    })
  }
  private refresh(record: Generation): Promise<void> {
    if (record.refresh) return record.refresh
    const owner = record.owner
    record.refresh = record.process
      .call('kernel.state', undefined, runtimeKernelStateSchema)
      .then((state) => {
        if (record.owner?.incarnation === owner?.incarnation) {
          record.state = state
          record.stateSampledAt = Date.now()
        }
      })
      .finally(() => {
        record.refresh = null
      })
    return record.refresh
  }
  private async refreshKernels(): Promise<void> {
    for (const record of this.generations.values())
      if (record.artifact.unitId === 'kernel' && ['serving', 'draining'].includes(record.process.snapshot().phase)) {
        try {
          await this.refresh(record)
        } catch (error) {
          if (['serving', 'draining'].includes(record.process.snapshot().phase)) throw error
        }
      }
  }
  private async installStorage(record: Generation): Promise<void> {
    if (!record.owner || this.storage.snapshot().owner?.incarnation === record.owner.incarnation) return
    if (this.storageFailure) {
      if (this.storageFailure.unknown)
        throw new HbarError('STORAGE_RESULT_UNKNOWN', 'The old writer has unresolved in-flight outcomes')
      const previous = this.storageFailure.owner
      if (!this.interrupted.get(previous.incarnation)?.exited)
        throw new HbarError('STORAGE_EXIT_UNCONFIRMED', 'The old writer has not exited')
      for (const revoke of this.pendingRevocations)
        await record.process.call(
          'storage.call',
          { method: 'runtimeExecutionRevoke', args: [revoke.owner, revoke.ids, revoke.cause] },
          z.unknown(),
        )
      this.pendingRevocations.length = 0
      this.storage.reconcileExited(previous)
      this.storageFailure = null
    }
    this.storage.install({
      owner: record.owner,
      retire: () => record.process.dispose(),
      suspend: (operationId) => record.process.call('storage.suspend', { operationId }, z.undefined()),
      resume: (operationId) => record.process.call('storage.resume', { operationId }, z.undefined()),
      call: (method, args, authority, diagnostic) =>
        callStorageRpc(
          {
            execute: (input) =>
              record.process.call('storage.call', { ...input, ...(diagnostic ? { diagnostic } : {}) }, z.unknown()),
          },
          method,
          args,
          authority,
        ),
    })
  }
  private async fault(owner: RuntimeOwner, reason: string): Promise<void> {
    if (owner.unitId === 'node-link') this.nodeLink.exited(owner)
    if (this.closing || this.coordinator.role(owner) === 'candidate') return
    if (owner.unitId !== 'controller') this.resumed.clear()
    const dependencies = [...this.leases.values()].filter(
      (lease) =>
        owner.unitId === 'storage' ||
        [lease.versions.kernel, lease.versions.driver, ...lease.versions.plugins, ...lease.versions.hooks].some(
          (version) => version.unitId === owner.unitId && version.generation === owner.generation,
        ),
    )
    const affected = [
      ...new Map(
        [...dependencies, ...this.coordinator.executionsForOwner(owner)].map((lease) => [lease.runId, lease]),
      ).values(),
    ]
    this.interrupted.set(owner.incarnation, { owner, leases: affected, exited: false })
    if (owner.unitId === 'storage') {
      this.storageFailure = { owner, unknown: this.storage.writeCallsInFlight > 0 }
      this.storage.fence(reason)
    }
    const revoked = this.coordinator.revoke(owner)
    for (const endpoint of this.endpoints()) {
      const ids = affected
        .filter((lease) => lease.owner.incarnation === endpoint.owner.incarnation)
        .map((lease) => lease.runId)
      if (ids.length && endpoint.owner.incarnation !== owner.incarnation)
        void endpoint.process.call('kernel.fence', { runIds: ids }, z.undefined()).catch(() => {})
    }
    await revoked
    this.schedule()
  }
  private async reconcile(): Promise<void> {
    if (this.initializing || this.closing) return
    if (!this.closing && this.buildUnits.some((unit) => unit.descriptor.id === 'maintenance')) {
      try {
        await this.maintenance.reconcile()
      } catch (error) {
        if (['serving', 'draining'].includes(this.currentGeneration('maintenance').process.snapshot().phase))
          throw error
      }
    }
    if (this.closing || !this.executionReady() || this.storage.snapshot().phase !== 'serving') return
    const kernel = this.currentKernel()
    for (const pending of [...this.pendingClaims.values()]) {
      if (
        !pending.failed ||
        [...this.interrupted.values()].some((failure) =>
          failure.leases.some((lease) => lease.runId === pending.draft.runId),
        )
      )
        continue
      await this.reconcileClaim(pending.draft, kernel)
    }
    for (const lease of this.leases.values())
      if (
        !this.coordinator.execution(lease.runId) &&
        !this.pendingClaims.has(lease.runId) &&
        ![...this.interrupted.values()].some((failure) => failure.leases.some((value) => value.runId === lease.runId))
      )
        await this.handoff(lease)
    for (const [incarnation, failure] of this.interrupted) {
      if (!failure.exited) continue
      for (const lease of [...failure.leases]) {
        const pending = this.pendingClaims.get(lease.runId)
        if (pending && !pending.failed) continue
        if (!this.stopped.has(lease.runId) || this.relay.hasRun(lease.runId)) continue
        try {
          this.coordinator.reconciled(lease.sessionId)
        } catch (error) {
          if (
            runtimeDomainError(error)?.code === 'EXECUTION_RESOURCES_ACTIVE' ||
            runtimeDomainError(error)?.code === 'EXECUTION_OWNER_ALIVE'
          )
            continue
          throw error
        }
        // Keep the pending identity until recovery and durable delivery complete, so a failed receipt can safely be retried.
        if (pending) await this.reconcileClaim(pending.draft, kernel)
        else {
          await kernel.process.call('kernel.recover', { runIds: [lease.runId] }, runtimeKernelRecoverySchema, {
            timeoutMs: 120_000,
          })
          await this.replay(lease.sessionId)
          this.leases.delete(lease.runId)
          this.stopped.delete(lease.runId)
          await this.wake(lease.sessionId)
        }
        const index = failure.leases.findIndex((value) => value.runId === lease.runId)
        if (index >= 0) failure.leases.splice(index, 1)
        await this.wake(lease.sessionId)
      }
      if (!failure.leases.length) {
        if (this.owners.has(incarnation)) {
          const references = this.coordinator.references(failure.owner)
          if (references.runs || references.tools || references.resources) continue
          this.coordinator.disposeOwner(failure.owner)
          this.owners.delete(incarnation)
        }
        this.interrupted.delete(incarnation)
      }
    }
    await this.refreshKernels()
    await this.resume()
    await this.flushCapacityWakeups()
  }
  private async reconcileClaim(draft: ExecutionOwnership, kernel: RuntimeKernelEndpoint): Promise<void> {
    const receipt = await this.storage.call('runtimeExecutionRead', draft.runId)
    if (
      receipt &&
      (receipt.lease.leaseId !== draft.leaseId ||
        receipt.lease.owner.incarnation !== draft.owner.incarnation ||
        JSON.stringify(receipt.lease.versions) !== JSON.stringify(draft.versions))
    )
      throw new HbarError(
        'EXECUTION_PROJECTION_INVALID',
        'A failed claim receipt does not match its captured owner and versions',
      )
    if (receipt?.state === 'active')
      await this.storage.call('runtimeExecutionRevoke', receipt.lease.owner, [draft.runId])
    this.coordinator.reconciled(draft.sessionId)
    const run = await this.storage.call('run', draft.runId)
    if (run.status !== 'queued')
      await kernel.process.call('kernel.recover', { runIds: [draft.runId] }, runtimeKernelRecoverySchema, {
        timeoutMs: 120_000,
      })
    await this.replay(draft.sessionId)
    this.leases.delete(draft.runId)
    this.pendingClaims.delete(draft.runId)
    this.stopped.delete(draft.runId)
    await this.wake(draft.sessionId)
  }
  private async resume(): Promise<void> {
    if (this.closing || this.initializing || !this.executionReady() || this.storage.snapshot().phase !== 'serving')
      return
    const kernel = this.currentKernel()
    if (this.resumed.has(kernel.owner.incarnation)) return
    await this.refreshExecutionCapacity()
    await kernel.process.call('kernel.resume', undefined, z.undefined(), { timeoutMs: 120_000 })
    this.resumed.add(kernel.owner.incarnation)
  }
  private async refreshExecutionCapacity(): Promise<void> {
    const layers = await this.storage.call('settingsLayers', ['settings:global'])
    const unattended =
      layers.find((layer) => layer.id === 'settings:global')?.values[BACKEND_UNATTENDED_VALUE_KEY] === true
    if (unattended) this.unattendedStartupPending = false
    this.coordinator.setExecutionCapacity(
      unattended || this.unattendedStartupPending ? EXECUTION_SLOT_LIMITS.capacity : EXECUTION_SLOT_LIMITS.executions,
    )
  }
  private async flushCapacityWakeups(): Promise<void> {
    for (const { sessionId, runId } of this.coordinator.capacityReadyQueue()) {
      if (this.closing) return
      try {
        if (!this.canAdmit(sessionId)) continue
        const next = await this.storage.call('nextQueuedRun', sessionId)
        if (next?.id !== runId) {
          this.coordinator.releaseQueuedSession(sessionId, runId)
          if (!next) continue
        }
        // Wake only asks the Kernel to inspect its durable queue. Repeating a lost hint does not replay a Run.
        await this.wake(sessionId)
      } catch (error) {
        // The coordinator retains the reservation for the existing one-second reconciliation sweep.
        console.error(
          '[hbar runtime] capacity wake deferred',
          runtimeDomainError(error)?.code ?? 'CAPACITY_WAKE_FAILED',
        )
        return
      }
    }
  }
  private refreshSettingsScheduling(): void {
    this.settingsSchedulingRequested = true
    if (this.settingsSchedulingRefresh || this.closing || this.initializing) return
    this.settingsSchedulingRefresh = (async () => {
      while (this.settingsSchedulingRequested && !this.closing) {
        this.settingsSchedulingRequested = false
        if (!this.executionReady() || this.storage.snapshot().phase !== 'serving') return
        await this.refreshExecutionCapacity()
        await this.currentKernel().process.call('kernel.resume', undefined, z.undefined(), { timeoutMs: 120_000 })
      }
    })()
      .catch((error: unknown) => {
        console.error(
          '[hbar] Settings scheduling refresh failed',
          runtimeDomainError(error)?.code ?? 'AUTONOMY_REFRESH_FAILED',
        )
      })
      .finally(() => {
        this.settingsSchedulingRefresh = undefined
      })
  }
  private async wake(sessionId: string): Promise<void> {
    if (!this.canAdmit(sessionId)) {
      return
    }
    await this.currentKernel().process.call('kernel.wake', { sessionId }, z.undefined())
  }
  private async handoff(lease: ExecutionOwnership): Promise<void> {
    await this.replay(lease.sessionId)
    const current = this.currentKernel()
    if (
      current.owner.incarnation !== lease.owner.incarnation ||
      lease.versions.plugins.some(
        (version) => this.manager.currentVersion(version.unitId).generation !== version.generation,
      )
    )
      await current.process.call('kernel.session.refresh', { sessionId: lease.sessionId }, z.undefined(), {
        timeoutMs: 120_000,
      })
    this.leases.delete(lease.runId)
    this.schedule()
    await this.wake(lease.sessionId)
  }
  private async resolveKernel(
    target: string,
    method: string,
    args: readonly unknown[],
    captured?: RuntimeKernelEndpoint,
  ): Promise<RuntimeKernelEndpoint> {
    let runId: string | undefined, sessionId: string | undefined
    if (target === 'kernel' && method === 'cancel' && typeof args[0] === 'string') runId = args[0]
    if (['goal', 'plan', 'mode', 'budget', 'workflow', 'agent'].includes(target) && typeof args[0] === 'string')
      sessionId = args[0]
    if (
      ['goal', 'plan', 'mode', 'budget', 'workflow', 'agent'].includes(target) &&
      args[0] &&
      typeof args[0] === 'object'
    ) {
      const input = z
        .object({ sessionId: z.string().optional(), parentSessionId: z.string().optional() })
        .safeParse(args[0])
      if (input.success) sessionId = input.data.sessionId ?? input.data.parentSessionId
    }
    if (
      target === 'kernel' &&
      ['submit', 'compact', 'snapshot', 'getContextUsage', 'automationGet', 'automationSet', 'updateSession'].includes(
        method,
      ) &&
      typeof args[0] === 'string'
    )
      sessionId = args[0]
    if (target === 'kernel' && method === 'resolveApproval' && typeof args[0] === 'string')
      runId = (await this.storage.call('approval', args[0])).runId
    if (target === 'kernel' && method === 'resolvePlanExit' && typeof args[0] === 'object' && args[0] !== null) {
      const input = z.object({ sessionId: z.string() }).safeParse(args[0])
      if (input.success) sessionId = input.data.sessionId
    }
    if (target === 'kernel' && method === 'resolveUserInput' && typeof args[0] === 'string') {
      const request = this.kernel.pendingUserInput(args[0])
      if (request) runId = request.runId
    }
    const lease = runId
      ? this.coordinator.execution(runId)
      : sessionId
        ? this.coordinator.executionForSession(sessionId)
        : null
    if (lease) {
      const endpoint = this.endpoints().find((value) => value.owner.incarnation === lease.owner.incarnation)
      if (!endpoint) throw new HbarError('RUNTIME_RECOVERING', 'The execution owner is recovering')
      return endpoint
    }
    return captured ?? this.currentKernel()
  }
  private async cancelRun(runId: string): Promise<void> {
    const result = await this.storage.call('runtimeRecoveryCancel', runId)
    for (const event of result.events) this.facade.replay({ method: 'session.event', params: event })
    const lease = this.coordinator.execution(result.run.id)
    if (!lease && result.run.status === 'cancelled')
      this.coordinator.releaseQueuedSession(result.run.sessionId, result.run.id)
    const endpoint = lease
      ? this.endpoints().find((value) => value.owner.incarnation === lease.owner.incarnation)
      : result.run.status === 'failed' && result.events.some((event) => event.type === 'run.cancelRequested')
        ? this.currentKernel()
        : null
    if (endpoint && ['serving', 'draining'].includes(endpoint.process.snapshot().phase)) {
      try {
        await endpoint.process.call('kernel.cancel', { runId: result.run.id, persisted: true }, z.undefined())
      } catch (error) {
        if (
          !['IPC_DISCONNECTED', 'RUNTIME_RECOVERING', 'RUNTIME_OWNER_REVOKED'].includes(
            runtimeDomainError(error)?.code ?? '',
          )
        )
          throw error
      }
    }
    this.schedule()
  }
  private async replay(sessionId: string): Promise<void> {
    let cursor = this.facade.cursor(sessionId)
    for (let page = 0; page < 4_096; page++) {
      const events = await this.storage.call('events', sessionId, cursor, 256)
      if (!events.length) return
      for (const event of events) this.facade.replay({ method: 'session.event', params: event })
      cursor = events.at(-1)!.seq
      if (events.length < 256) return
    }
    throw new HbarError('RUNTIME_REPLAY_LIMIT', 'Recovery replay exceeded its bounded journal window')
  }
  private async recoverStartup(): Promise<void> {
    let cursor = '',
      recovered = 0
    while (true) {
      const leases = await this.storage.call('runtimeUnreleasedExecutions', cursor)
      if (!leases.length) break
      for (const lease of leases) await this.storage.call('runtimeExecutionRevoke', lease.owner, [lease.runId])
      cursor = leases.at(-1)!.leaseId
    }
    cursor = ''
    while (true) {
      const runs = await this.storage.call('runtimeActiveRuns', cursor)
      if (!runs.length) break
      await this.currentKernel().process.call(
        'kernel.recover',
        { runIds: runs.map((run) => run.id) },
        runtimeKernelRecoverySchema,
        { timeoutMs: 120_000 },
      )
      recovered += runs.length
      cursor = runs.at(-1)!.id
    }
    this.facade.setRecovered(recovered)
  }
  private async maintain<Result>(action: () => Promise<Result>): Promise<Result> {
    this.kernel.assertIdle()
    if (this.maintaining) throw new HbarError('BUSY', 'Database maintenance is already active')
    this.maintaining = true
    try {
      return await action()
    } finally {
      this.maintaining = false
      this.schedule()
    }
  }
  private maintenanceEndpoint(owner: RuntimeOwner): RuntimeMaintenanceEndpoint {
    const record = this.generations.get(key(owner))
    if (
      !record?.owner ||
      record.owner.incarnation !== owner.incarnation ||
      !['serving', 'draining'].includes(record.process.snapshot().phase)
    )
      throw new HbarError('RUNTIME_RECOVERING', 'The Maintenance owner is recovering')
    return {
      owner,
      process: record.process,
      version: { unitId: owner.unitId, generation: owner.generation, artifactId: record.artifact.id },
    }
  }
}
