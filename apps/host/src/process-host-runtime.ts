import { AsyncLocalStorage } from 'node:async_hooks'
import {
  RuntimeRecoveryResponsibility,
  withRuntimeClaimAdmission,
  type RecoveryDispatch,
  type RecoveryDispatchStart,
} from './runtime-recovery-responsibility'
import { createDemandCommandTicket } from './runtime-demand-command-ticket'
import { RuntimeSettingsSchedulingHint } from './runtime-settings-scheduling-hint'
import { HostRetirementConsumption } from './runtime-retirement-consumption'
import { IdleCheckpointDiagnostic } from './runtime-idle-checkpoint-diagnostics'
import { commitRuntimeWorkflowRecovery } from './runtime-workflow-recovery'
import { workflowRecoveryPageSchema } from '@hbar/plugin-sdk/workflow-recovery'
import { join, resolve } from 'node:path'
import { BACKEND_UNATTENDED_VALUE_KEY } from '@hbar/contracts/backend'
import { EXECUTION_SLOT_LIMITS } from '@hbar/contracts/execution-slots'
import { delegatedInputWakeSchema } from '@hbar/contracts/delegated-user-input'
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
import { runtimeOwnerSchema } from '@hbar/contracts/runtime'
import {
  SESSION_WAKE_CONTROL_METHODS,
  sessionWakeManifestSchema,
  sessionWakeStatusSchema,
  sessionWakeDeliveryResultSchema,
  type SessionWakeAck,
} from '@hbar/contracts/session-wake'
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
  runtimeKernelCommandClientsSchema,
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
  type RuntimePhysicalRetirementReceipt,
  type RuntimeIdleCheckpoint,
  type RuntimeProcessContext,
} from '@hbar/runtime'
import { createRuntimeSourceReload, runtimeSourceRoots, watchRuntimeSources } from '@hbar/runtime'
import { HostRuntimeCompiler, type HostRuntimeCompilerOptions } from './runtime-compiler'
import {
  Storage,
  StableStoragePort,
  callStorageRpc,
  storageRpcInput,
  createMaintenanceWorkerPreflight,
  ensurePathLayout,
  storageRpcCallSchema,
  assertStoragePreflightMethod,
  type PathLayout,
  type StoragePort,
  type StorageMethods,
  type StoragePhysicalCall,
  type StoragePhysicalSettlement,
  type StorageDemandLease,
  type StorageHibernateCheckpoint,
  storageActivatedCatalogSchema,
  type StorageActivatedCatalog,
} from '@hbar/storage'
import { acquireHostProcessLock } from './process-lock'
import { RuntimeKernelFacade, type RuntimeKernelEndpoint, type RuntimeKernelState } from './runtime-kernel-facade'
import { RuntimeDriverRelay, type RuntimeDriverEndpoint, type RuntimeDriverDemand } from './runtime-driver-relay'
import {
  HostRuntimeDemand,
  type HostRuntimeDemandPort,
  type HostRuntimeDemandHold,
  type HostRuntimeDeferredDriver,
} from './runtime-host-demand'
import { dormantDriverBootstrapReady } from './runtime-dormant-driver-bootstrap'
import { runtimeControllerRequestSchema, type RuntimeControllerPort } from './runtime-controller-contract'
import { RuntimeControllerAdapter } from './runtime-controller-adapter'
import { controllerScheduleControlMethods } from './runtime-controller-schedule-contract'
import { RuntimeScheduleAlarmTransfer } from './runtime-schedule-alarm-transfer'
import type { ScheduleTransferAck, ScheduleWakeReply } from './runtime-schedule-idle-contract'
import { RuntimeSessionWakeTransfer } from './runtime-session-wake-transfer'
import type { RuntimeAlarmAttempt, RuntimeAlarmSnapshot } from './runtime-demand-alarm-scheduler'
import { hostRuntimeBaseBuildUnit, hostRuntimeBuildUnits } from './runtime-build'
import type { RuntimeSystemPort } from './system-commands'
import { HostCommandExecutionScopes } from './command-execution-scopes'
import { connectRuntimeCommandSource } from './runtime-command-source'
import { CommandMutationAdmission, type CommandMutationState } from './command-mutation-admission'
import { runtimePluginStateSchema, type RuntimePluginState } from '@hbar/plugin-sdk/runtime-plugin'
import { RuntimePluginRelay, type RuntimePluginEndpoint } from './runtime-plugin-relay'
import { RuntimeHumanWaits } from './runtime-human-waits'
import { RUNTIME_DRIVER_MODEL_ACTIVITY_METHODS } from '@hbar/plugin-sdk/runtime-driver'
import { RuntimePluginCatalogCache } from './runtime-plugin-catalog-cache'
import { readRuntimePluginQuiescence, type RuntimePluginQuiescenceSource } from './runtime-plugin-quiescence'
import { kernelPluginQuiescenceSchema } from '@hbar/kernel/runtime-idle'
import { RUNTIME_PLUGIN_CONTROL_METHODS } from './runtime-plugin-contract'
import { RuntimeResourceRegistry } from './runtime-resource-registry'
import { RuntimeMaintenanceRelay, type RuntimeMaintenanceEndpoint } from './runtime-maintenance-relay'
import { RUNTIME_MAINTENANCE_CONTROL_METHODS } from './runtime-maintenance-contract'
import { RuntimeMaintenanceAlarmTransfer, type MaintenanceCleanExitProof } from './runtime-maintenance-alarm-transfer'
import {
  maintenanceInspectionManifestSchema,
  maintenanceInspectionCommitSchema,
  sameMaintenanceAck,
  type MaintenanceInspectionAck,
  type MaintenanceInspectionManifest,
  type MaintenanceInspectionWakeReply,
} from './runtime-maintenance-inspection-contract'
import { createRuntimeControllerServices, type RuntimeControllerServicesOptions } from './runtime-controller-services'
import { RUNTIME_COMMAND_JOB_CONTROLS } from './runtime-command-job-contract'
import { RuntimeStatusFeed } from './runtime-status-feed'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import { hostRuntimeProcessCommand, hostRuntimeBuildProcessCommand } from './runtime-package'
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
import { clientCommandDirectorySchema } from '@hbar/contracts/client-commands'
import type { SessionCommandExecution } from './session-command-execution'

/** Installation owns a temporary Worker only; serving Storage retains its normal 30s RPC budget. */
export const STARTUP_STORAGE_READY_TIMEOUT_MS = 120_000

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
  /** Trusted entry-point settings must commit before any Kernel can resume durable work. */
  readonly prepareInitialExecution?: (storage: StoragePort) => Promise<void>
  readonly secrets?: SecretStore
  readonly sourceRoot?: string
  readonly processCommand?: readonly [string, ...string[]]
  /** Local composition only. Complete source, emitted JS or compiled command; no failure fallback. */
  readonly compiler?: HostRuntimeCompilerOptions
  /** Trusted immutable build content, supplied by the packaged entry rather than a remote reload request. */
  readonly artifactPackage?: RuntimeArtifactPackage
  readonly profileModule?: string
  readonly watchSource?: boolean
  /** Source deployments may prepare versions without applying them until an explicit reload command. */
  readonly autoApplySource?: boolean
  /** Monotonic time without business demand before an eligible child is retired; default 30 seconds. */
  readonly idleTimeoutMs?: number
  /** Local typed catalog override for embedding/tests. Remote reload input cannot register modules. */
  readonly buildUnits?: readonly RuntimeBuildUnit[]
}
interface Generation {
  readonly artifact: RuntimeArtifact
  readonly process: ManagedProcess
  scheduleRestoreAck: ScheduleTransferAck | null
  maintenanceRestoreAck: MaintenanceInspectionAck | null
  maintenanceRestoreCheckpoint: MaintenanceInspectionManifest['checkpoint'] | null
  controllerRestoreReply: ScheduleWakeReply | null
  maintenanceRestoreReply: MaintenanceInspectionWakeReply | null
  deadlineRestorationAcknowledged: boolean
  sessionWakeRestoreAck: SessionWakeAck | null
  sessionWakeRestore: Promise<void> | null
  preparation: NonNullable<RuntimeProcessContext['purpose']> | null
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

/** Bounded remembered scheduling notifications, never Run submissions or execution authority. */
export class DeferredRuntimeWakeups {
  private readonly sessions = new Map<
    string,
    { readonly since: number; failed: boolean; delivering: boolean; renewed: boolean }
  >()
  private closed = false
  constructor(
    private readonly maximum = 4096,
    private readonly observe?: (
      phase: 'defer' | 'flush' | 'failed' | 'capacity' | 'close',
      sessionId: string | undefined,
      pending: number,
      durationMs: number,
    ) => void,
  ) {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 4096)
      throw new RangeError('Invalid deferred wake capacity')
  }
  defer(sessionId: string): void {
    if (this.closed) return
    if (!sessionId || sessionId.length > 160) throw new HbarError('INVALID_INPUT', 'Invalid deferred Session identity')
    const existing = this.sessions.get(sessionId)
    if (existing) {
      if (existing.delivering) existing.renewed = true
      return
    }
    if (this.sessions.size >= this.maximum) {
      this.report('capacity', sessionId, this.sessions.size, 0)
      throw new HbarError('EXECUTION_CAPACITY', 'Deferred scheduling notification capacity is exhausted')
    }
    this.sessions.set(sessionId, { since: performance.now(), failed: false, delivering: false, renewed: false })
    this.report('defer', sessionId, this.sessions.size, 0)
  }
  async flush(
    canAdmit: (sessionId: string) => boolean,
    wake: (sessionId: string) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    // One bounded snapshot per externally triggered reconciliation; denied entries do not spin.
    for (const [sessionId, notification] of [...this.sessions]) {
      signal?.throwIfAborted()
      if (this.closed) return
      if (this.sessions.get(sessionId) !== notification || notification.delivering || !canAdmit(sessionId)) continue
      // In-flight delivery retains its slot; another flush cannot deliver it twice.
      notification.delivering = true
      notification.renewed = false
      try {
        await wake(sessionId)
        if (this.sessions.get(sessionId) === notification) {
          this.sessions.delete(sessionId)
          if (notification.renewed && !this.closed)
            this.sessions.set(sessionId, { since: performance.now(), failed: false, delivering: false, renewed: false })
        }
        this.report('flush', sessionId, this.sessions.size, performance.now() - notification.since)
      } catch (error: unknown) {
        notification.delivering = false
        if (!notification.failed) {
          notification.failed = true
          this.report('failed', sessionId, this.sessions.size, performance.now() - notification.since)
        }
        throw error
      }
    }
  }
  private report(
    phase: 'defer' | 'flush' | 'failed' | 'capacity' | 'close',
    sessionId: string | undefined,
    pending: number,
    durationMs: number,
  ): void {
    try {
      this.observe?.(phase, sessionId, pending, durationMs)
    } catch {
      // Observational failures never change queue admission or delivery outcomes.
    }
  }
  close(): void {
    if (this.closed) return
    this.closed = true
    const pending = this.sessions.size
    this.sessions.clear()
    if (pending) this.report('close', undefined, pending, 0)
  }
}
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
  readonly storage = new StableStoragePort(5_000, { acquire: () => this.acquireStorageDemand() })
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
  private readonly compiler: HostRuntimeCompiler
  /** Pure compiler diagnostics: reading does not build, reconcile or wake a runtime unit. */
  compilerSnapshot(): ReturnType<HostRuntimeCompiler['snapshot']> {
    return this.compiler.snapshot()
  }
  /** Retains the same compiler owner after a failed shutdown or source build. */
  async reconcileCompiler(): Promise<ReturnType<HostRuntimeCompiler['snapshot']>> {
    return await this.compiler.reconcile()
  }
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
  private readonly demand: HostRuntimeDemand
  private readonly scheduleAlarms: RuntimeScheduleAlarmTransfer
  private readonly maintenanceAlarms: RuntimeMaintenanceAlarmTransfer
  private readonly sessionWakeAlarms: RuntimeSessionWakeTransfer
  private sessionWakePhysicalReceipt: RuntimePhysicalRetirementReceipt | null = null
  private readonly sessionWakeCheckpointDemands = new Map<
    string,
    {
      readonly owner: RuntimeOwner
      readonly hold: HostRuntimeDemandHold | undefined
      readonly proofPin: { release(): void }
      readonly queueProofHold: { release(): void } | undefined
    }
  >()
  private readonly deadlineReconciles = new Map<string, Promise<void>>()
  private sessionWakeIdleTransfer: {
    readonly owner: RuntimeOwner
    readonly ack: SessionWakeAck
    process: ManagedProcess | null
    physical: RuntimePhysicalRetirementReceipt | null
  } | null = null
  private maintenanceIdleTransfer: {
    readonly owner: RuntimeOwner
    readonly ack: MaintenanceInspectionAck
    process: ManagedProcess | null
    physical: RuntimePhysicalRetirementReceipt | null
  } | null = null
  private storageCatalog: StorageActivatedCatalog | null = null
  private controllerIdleTransfer: {
    readonly owner: RuntimeOwner
    readonly ack: ScheduleTransferAck
    process: ManagedProcess | null
    physical: RuntimePhysicalRetirementReceipt | null
  } | null = null
  private readonly storagePhysical = new Set<{
    readonly owner: RuntimeOwner
    readonly settle: (kind: StoragePhysicalSettlement['kind']) => void
  }>()
  private readonly storageUnknownDemands = new Set<HostRuntimeDemandHold>()
  private readonly releaseStorageOwner = new AsyncLocalStorage<RuntimeOwner>()
  private storageIdleCheckpoint: {
    readonly owner: RuntimeOwner
    readonly checkpoint: StorageHibernateCheckpoint
    readonly process: ManagedProcess
  } | null = null
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
  private controllerBackgroundEpoch = 0
  private readonly controllerResumes = new Map<string, Promise<void>>()
  private readonly maintenanceResumes = new Map<string, Promise<void>>()
  private controllerPause: Promise<void> = Promise.resolve()
  private readonly statusFeed: RuntimeStatusFeed
  private readonly disposeStatus: () => void
  private async dispatchController(
    payload: string,
    invoke: Parameters<RuntimeControllerPort['dispatch']>[1],
    authorize?: Parameters<RuntimeControllerPort['dispatch']>[2],
  ): Promise<string> {
    if (this.initializing) throw new HbarError('RUNTIME_RECOVERING', 'Runtime business owners are still preparing')
    return this.demand.withUnits(['controller', 'kernel'], this.sourceAbort.signal, async (owners) => {
      this.assertDemandOwners(owners)
      await this.restoreControllerSchedule(owners, this.sourceAbort.signal)
      this.assertDemandOwners(owners)
      return this.dispatchControllerOwned(payload, invoke, authorize)
    })
  }
  private async dispatchControllerOwned(
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
  private readonly claimDemandHolds = new Map<string, HostRuntimeDemandHold[]>()
  private readonly retirementConsumption = new HostRetirementConsumption()
  private readonly summaryDemandHolds = new Map<string, Set<HostRuntimeDemandHold>>()
  private kernelMetadata: RuntimeKernelState | undefined
  private controllerCatalog: ReturnType<RuntimeControllerAdapter['list']> | undefined
  private readonly recoveryResponsibility = new RuntimeRecoveryResponsibility(
    () => this.schedule(),
    4096,
    (failure) =>
      this.emitProcessLifecycleDiagnostic({
        component: 'host',
        level: 'warn',
        event: 'host.runtime_recovery_notification_deferred',
        phase: failure.physicalPending ? 'retained.physical-pending' : 'retained.physical-settled',
        contextId: failure.sessionId,
        requestId: failure.runId,
        ...(failure.owner ? { attemptId: failure.owner.incarnation } : {}),
        errorCode: failure.errorCode,
        outcome: failure.physicalPending ? 'unknown' : 'skipped',
        instanceId: this.instanceId,
        processId: process.pid,
      }),
  )
  private readonly interrupted = new Map<string, Interruption>()
  private readonly stopped = new Set<string>()
  private readonly resumed = new Set<string>()
  private readonly deferredWakeups = new DeferredRuntimeWakeups(4096, (phase, sessionId, pending, durationMs) => {
    this.emitProcessLifecycleDiagnostic({
      component: 'host',
      level: phase === 'failed' || phase === 'capacity' ? 'warn' : 'debug',
      event: `host.deferred_wake.${phase}`,
      phase,
      ...(sessionId ? { sessionId } : {}),
      instanceId: this.instanceId,
      processId: process.pid,
      pending,
      durationMs,
      errorCode:
        phase === 'defer'
          ? 'ADMISSION_DENIED'
          : phase === 'failed'
            ? 'WAKE_DELIVERY_FAILED'
            : phase === 'capacity'
              ? 'EXECUTION_CAPACITY'
              : phase === 'close'
                ? 'HOST_CLOSING'
                : 'ADMISSION_RESTORED',
    })
  })
  private readonly relay: RuntimeDriverRelay
  private readonly humanWaits: RuntimeHumanWaits
  private readonly pluginRelay: RuntimePluginRelay
  private readonly pluginCatalog: RuntimePluginCatalogCache
  private readonly resources: RuntimeResourceRegistry
  private readonly pluginConfigs = new Map<string, Record<string, unknown>>()
  private readonly pluginPreparingCatalog = new Set<string>()
  private readonly secrets: SecretStore
  private readonly sweep: ReturnType<typeof setInterval>
  private transitions: Promise<void> = Promise.resolve()
  private closing = false
  private closeTask: Promise<void> | undefined
  private workflowRecoveryAdmission = true
  private initializing = true
  private maintaining = false
  private scheduled = false
  private readonly settingsScheduling = new RuntimeSettingsSchedulingHint<RuntimeOwner>((left, right) =>
    this.sameStorageOwner(left, right),
  )
  private unattendedStartupPending = false
  private initialExecutionPrepared = false
  private reasonCode: string | null = null
  private storageFailure: { owner: RuntimeOwner; unknown: boolean } | null = null
  private readonly pendingRevocations: Array<{ owner: RuntimeOwner; ids: string[]; cause?: RuntimeOwner }> = []
  private readonly sourceAbort = new AbortController()
  private disposeSource = () => {}
  private sourceBaseline: RuntimeArtifact | null = null
  private sourceState: RuntimeSourceReload | undefined
  private sourceTask: Promise<void> | undefined
  private startupTask: Promise<void> | undefined
  private initialKernelResumeCompleted = false
  private deferredInitialDriver: HostRuntimeDeferredDriver | undefined
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
    this.compiler = new HostRuntimeCompiler(
      options.compiler ??
        (process.platform === 'win32' && !options.artifactPackage
          ? { mode: 'process', processTree: this.processTree, command: hostRuntimeBuildProcessCommand() }
          : { mode: 'worker' }),
    )
    this.secrets = options.secrets ?? createNativeSecrets(options.layout.identityRoot)
    this.artifacts = new RuntimeArtifactStore(
      join(options.layout.cacheRoot, 'runtime-artifacts'),
      options.sourceRoot ?? resolve(import.meta.dir, '../../..'),
    )
    this.buildUnits =
      options.buildUnits ?? hostRuntimeBuildUnits(options.profileModule ? { profileModule: options.profileModule } : {})
    this.unattendedStartupPending = options.unattended === true
    this.pluginCatalog = new RuntimePluginCatalogCache(
      this.buildUnits.filter((unit) => unit.descriptor.kind === 'plugin').map((unit) => unit.descriptor.id),
    )
    this.coordinator = new RuntimeCoordinator(
      {
        claim: async (draft) => {
          this.recoveryResponsibility.begin(draft)
          this.pendingClaims.set(draft.runId, { draft, failed: false })
          this.leases.set(draft.runId, draft)
          const lease = await this.storage.call('runtimeExecutionClaim', draft)
          if (lease) {
            this.recoveryResponsibility.acknowledgeClaim(draft, lease)
            this.pendingClaims.set(lease.runId, { draft: lease, failed: false })
            this.leases.set(lease.runId, lease)
          } else {
            this.recoveryResponsibility.claimEmpty(draft.runId)
            this.pendingClaims.delete(draft.runId)
            this.leases.delete(draft.runId)
          }
          return lease
        },
        release: (lease) => this.releaseExecutionProjection(lease),
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
      capacity: {
        suspend: (execution, calls) => {
          const current = this.coordinator.execution(execution.runId)
          if (
            !current ||
            current.leaseId !== execution.leaseId ||
            !this.canAdmit(execution.sessionId) ||
            this.coordinator.role(execution.owner) === 'fenced' ||
            !this.relay.modelQuiescent(execution)
          )
            return
          this.coordinator.suspendWaitingExecution(execution, calls)
        },
        resume: (execution) => this.coordinator.resumeExecutionCapacity(execution),
        stopped: async (execution) => {
          const current = this.coordinator.execution(execution.runId)
          return (
            !current ||
            current.leaseId !== execution.leaseId ||
            this.coordinator.role(execution.owner) === 'fenced' ||
            (await this.storage.call('cancelRequested', execution.runId))
          )
        },
      },
    })
    this.relay = new RuntimeDriverRelay({
      coordinator: this.coordinator,
      humanWaits: this.humanWaits,
      activityChanged: (execution) => this.humanWaits.refresh(execution),
      resolve: (version) => this.driver(version),
      demand: this.driverDemand(),
      onDiagnostic: (event) => this.emitProcessLifecycleDiagnostic({ ...event, instanceId: this.instanceId }),
    })
    this.resources = new RuntimeResourceRegistry(this.coordinator, this.storage)
    this.pluginRelay = new RuntimePluginRelay({
      storage: this.storage,
      coordinator: this.coordinator,
      humanWaits: this.humanWaits,
      demand: { acquire: (ids, signal) => this.demand.acquire(ids, signal) },
      catalog: () => this.pluginCatalog.snapshot(),
      retainedVersion: (unitId, sessionId) => this.resources.version(unitId, sessionId),
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
      withCall: (target, method, args, captured, operation) =>
        this.withKernelCall(target, method, args, captured, operation),
      metadata: () => {
        const state = this.kernelMetadata
        if (!state) throw new HbarError('RUNTIME_RECOVERING', 'Kernel metadata has not been published')
        return state
      },
      maintain: (action) => this.maintain(action),
      cancel: (runId) => this.cancelRun(runId),
      configurePlugin: (...args) => this.configurePlugin(...args),
      resourceSessions: () => this.resources.sessions(),
      settingsChanged: () => this.refreshSettingsScheduling(),
    })
    this.nodeLink = new RuntimeNodeLinkRelay({
      demand: { acquire: (ids, signal) => this.demand.acquire(ids, signal) },
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
      demand: { acquire: (unitIds, signal) => this.demand.acquire(unitIds, signal) },
      beforeDispatch: (owner, signal) => this.restoreMaintenanceInspection(owner, signal),
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
      create: (artifact, generation, changed, purpose) => this.createGeneration(artifact, generation, changed, purpose),
      beforeActivate: async (owner, _artifact, signal) => {
        if (owner.unitId === 'storage' && this.storage.snapshot().owner) {
          await this.maintenance.waitForWriter(signal)
        }
      },
      beforeIdle: async (owner, generation, signal) => {
        if (['storage', 'controller', 'maintenance', 'kernel'].includes(owner.unitId))
          this.emitProcessLifecycleDiagnostic({
            component: 'host',
            level: 'debug',
            event: 'host.runtime_idle_checkpoint_start',
            phase: `generation.${owner.generation}`,
            contextId: owner.unitId,
            requestId: owner.incarnation,
            instanceId: this.instanceId,
            processId: process.pid,
          })
        if (owner.unitId === 'maintenance') {
          const record = this.generations.get(key(owner))
          if (!record || record.process !== generation) return { status: 'busy', owner }
          return this.checkpointMaintenanceInspection(owner, record, signal)
        }
        if (owner.unitId === 'kernel') {
          const record = this.generations.get(key(owner))
          if (!record || record.process !== generation) return { status: 'busy', owner }
          return this.checkpointSessionWakes(owner, record, signal)
        }
        if (owner.unitId === 'controller') {
          const record = this.generations.get(key(owner))
          if (
            !this.controllerStarted ||
            signal.aborted ||
            !record?.controller ||
            record.process !== generation ||
            !record.owner ||
            !this.sameStorageOwner(record.owner, owner)
          )
            return { status: 'busy', owner }
          const controller = record.controller
          try {
            const ack = await controller.transferSchedule(owner, this.scheduleAlarms)
            if (
              signal.aborted ||
              !record.owner ||
              !this.sameStorageOwner(record.owner, owner) ||
              this.scheduleAlarms.restoreAck(owner)?.token !== ack.token
            )
              return { status: 'unknown', owner }
            this.controllerIdleTransfer = { owner: { ...owner }, ack, process: record.process, physical: null }
            return { status: 'prepared', owner }
          } catch {
            // A preview/offer failure cannot have paused the child. Once quiescence
            // was attempted, only the adapter's exact known-open state can reopen it.
            const sameOpenOwner =
              record.owner &&
              this.sameStorageOwner(record.owner, owner) &&
              record.controller === controller &&
              !controller.scheduleIdleSnapshot().fenced
            return { status: sameOpenOwner ? 'busy' : 'unknown', owner }
          }
        }
        if (owner.unitId !== 'storage') return { status: 'noop', owner }
        if (this.storageIdleCheckpoint) return { status: 'unknown', owner }
        if (signal.aborted || !this.storage.beforeIdle(owner)) return { status: 'busy', owner }
        const record = this.generations.get(`${owner.unitId}:${owner.generation}`)
        if (!record || record.process !== generation || !record.owner || !this.sameStorageOwner(record.owner, owner)) {
          this.storage.afterIdle(owner, { status: 'unknown' })
          return { status: 'unknown', owner }
        }
        const operationId = crypto.randomUUID()
        const checkpointSchema = z.strictObject({
          operationId: z.string().min(1).max(160),
          owner: runtimeOwnerSchema,
          databaseCloseAcknowledged: z.literal(true),
          workerExitConfirmed: z.literal(true),
          writerLeaseReleased: z.literal(true),
          queuedSessionCount: z.literal(0),
        })
        try {
          const checkpoint = await generation.call('storage.hibernate', { operationId, owner }, checkpointSchema, {
            signal,
          })
          if (
            signal.aborted ||
            checkpoint.operationId !== operationId ||
            !this.sameStorageOwner(checkpoint.owner, owner)
          )
            throw new HbarError('STORAGE_IDLE_OUTCOME_UNKNOWN', 'Storage checkpoint identity changed')
          this.storageIdleCheckpoint = { owner: { ...owner }, checkpoint, process: record.process }
          return { status: 'prepared', owner }
        } catch (error) {
          // These two typed remote branches prove no database close was attempted.
          const code = runtimeDomainError(error)?.code
          if (!signal.aborted && (code === 'STORAGE_IDLE_BUSY' || code === 'STORAGE_IDLE_QUEUE_NOT_EMPTY')) {
            this.storage.afterIdle(owner, { status: 'busy', checkpointed: false })
            if (this.storage.snapshot().phase === 'serving') return { status: 'busy', owner }
          }
          this.storage.afterIdle(owner, { status: 'unknown' })
          return { status: 'unknown', owner }
        }
      },
      afterIdle: (owner, status) => {
        this.emitProcessLifecycleDiagnostic({
          component: 'host',
          level: status === 'confirmed-physical-exit' ? 'info' : 'error',
          event: 'host.runtime_idle_physical_checkpoint',
          phase: status,
          contextId: owner.unitId,
          requestId: owner.incarnation,
          instanceId: this.instanceId,
          processId: process.pid,
          outcome: status === 'confirmed-physical-exit' ? 'success' : 'unknown',
        })
        if (owner.unitId === 'kernel') {
          const held = this.sessionWakeIdleTransfer
          if (!held) return // A truly empty checkpoint used the ordinary final probe.
          const physical = held.process?.retirementReceipt(owner)
          const ack = this.sessionWakeAlarms.restoreAck(owner)
          if (
            status !== 'confirmed-physical-exit' ||
            !this.sameStorageOwner(held.owner, owner) ||
            !this.cleanIdlePhysicalReceipt(owner, physical) ||
            ack?.token !== held.ack.token
          )
            throw new HbarError('SESSION_WAKE_UNKNOWN', 'Kernel deadline retirement is unconfirmed')
          held.physical = physical
          held.process = null
          return
        }
        if (owner.unitId === 'maintenance') {
          const held = this.maintenanceIdleTransfer
          const physical = held?.process?.retirementReceipt(owner)
          const committed = this.maintenanceAlarms.peek().committed
          if (
            status !== 'confirmed-physical-exit' ||
            !held ||
            !this.sameStorageOwner(held.owner, owner) ||
            !this.cleanIdlePhysicalReceipt(owner, physical) ||
            committed?.phase !== 'armed' ||
            !sameMaintenanceAck(committed.ack, held.ack)
          )
            throw new HbarError(
              'MAINTENANCE_INSPECTION_UNKNOWN',
              'Maintenance retirement lacks its exact transfer proof',
            )
          held.physical = physical
          held.process = null
          return
        }
        if (owner.unitId === 'controller') {
          const held = this.controllerIdleTransfer
          const physical = held?.process?.retirementReceipt(owner)
          if (
            status !== 'confirmed-physical-exit' ||
            !held ||
            !this.sameStorageOwner(held.owner, owner) ||
            !this.cleanIdlePhysicalReceipt(owner, physical) ||
            this.scheduleAlarms.restoreAck(owner)?.token !== held.ack.token
          )
            throw new HbarError('CONTROLLER_IDLE_OUTCOME_UNKNOWN', 'Controller schedule retirement is unconfirmed')
          // Preserve exact physical proof independently of the Manager receipt's
          // bounded acknowledgement lifecycle. No mutable PID-list inference.
          held.physical = physical
          held.process = null
          return
        }
        if (owner.unitId !== 'storage') return
        if (status !== 'confirmed-physical-exit') {
          this.storage.fence('STORAGE_IDLE_OUTCOME_UNKNOWN')
          return
        }
        // afterDispose may already have deleted Host's generation map. Use the exact
        // beforeIdle capture, never look up a replacement or infer proof from absence.
        const held = this.storageIdleCheckpoint
        const physical = held?.process.retirementReceipt(owner)
        if (!held || !this.sameStorageOwner(held.owner, owner) || !this.cleanIdlePhysicalReceipt(owner, physical)) {
          this.storage.fence('STORAGE_IDLE_OUTCOME_UNKNOWN')
          throw new HbarError('STORAGE_IDLE_OUTCOME_UNKNOWN', 'Storage retirement is not confirmed')
        }
        this.storage.afterIdle(owner, {
          status,
          checkpoint: held.checkpoint,
          exitCode: 0,
          disposalAcknowledged: true,
          nativeJoined: true,
        })
        const snapshot = this.storage.snapshot()
        if (snapshot.phase !== 'waiting' || snapshot.owner !== null) {
          this.storage.fence('STORAGE_IDLE_OUTCOME_UNKNOWN')
          throw new HbarError('STORAGE_IDLE_OUTCOME_UNKNOWN', 'Storage did not release its exact idle writer')
        }
        this.storageIdleCheckpoint = null
      },
      canConsumeRetirement: (owner) => this.canConsumeRetirementReceipt(owner),
      afterDispose: (owner) => {
        if (this.owners.has(owner.incarnation)) {
          this.coordinator.disposeOwner(owner)
          this.owners.delete(owner.incarnation)
        }
        const record = this.generations.get(key(owner))
        if (record?.owner && this.sameStorageOwner(record.owner, owner)) this.generations.delete(key(owner))
      },
    })
    for (const unit of this.buildUnits) this.manager.register(unit.descriptor)
    // Root composes adoptServing after startup recovery; this constructor creates no process.
    this.demand = new HostRuntimeDemand({
      manager: this.manager,
      units: this.buildUnits.map((unit) => unit.descriptor),
      // Leave a quiet interval before the 60-second Search inspection deadline.
      // That inspection is transferred to the parent while the child sleeps.
      idleTimeoutMs: options.idleTimeoutMs ?? 30_000,
    })
    this.scheduleAlarms = new RuntimeScheduleAlarmTransfer(this.baseOwner.incarnation, {
      acquire: async (signal) => {
        if (this.closing || !this.controllerStarted)
          throw new HbarError('CONTROLLER_BACKGROUND_STOPPED', 'Controller background admission is paused')
        const hold = await this.demand.acquire(['controller', 'kernel'], signal, 'background')
        if (signal.aborted || this.closing || !this.controllerStarted) {
          hold.release()
          throw new HbarError('CONTROLLER_BACKGROUND_STOPPED', 'Controller background admission stopped before wake')
        }
        const owner = hold.owners.find((candidate) => candidate.unitId === 'controller')
        if (!owner) {
          hold.release()
          throw new HbarError('RUNTIME_OWNER_MISMATCH', 'Controller alarm has no admitted owner')
        }
        return { owner, release: () => hold.release() }
      },
      catalog: () => {
        if (!this.storageCatalog || this.storageFailure)
          throw new HbarError('SCHEDULE_DATABASE_CATALOG_UNAVAILABLE', 'Activated Storage metadata is unavailable')
        return { revision: this.storageCatalog.revision, databaseIds: [...this.storageCatalog.databaseIds] }
      },
      wake: (owner, ack, _attempt, signal) =>
        this.demand.withBackground(async () => {
          signal.throwIfAborted()
          if (this.closing || !this.controllerStarted)
            throw new HbarError('CONTROLLER_BACKGROUND_STOPPED', 'Controller background admission is paused')
          this.assertDemandOwners([owner])
          const record = this.generations.get(key(owner))
          if (!record?.controller || !record.owner || !this.sameStorageOwner(record.owner, owner))
            throw new HbarError('RUNTIME_OWNER_REVOKED', 'Controller schedule wake owner changed')
          const reply = await record.controller.wakeSchedule(ack, signal)
          return reply
        }),
      physicalExit: async (owner) => {
        const retired = this.manager.retirement(owner)
        return retired.status === 'retired' &&
          retired.ownerCleanupCompleted &&
          this.sameStorageOwner(retired.physical.owner, owner) &&
          retired.physical.nativeJoined &&
          retired.physical.onExitCompleted
          ? 'confirmed-physical-exit'
          : 'unknown'
      },
    })
    // Application start, rather than construction or a metadata read, owns the
    // reversible background gate. Terminal runtime close separately calls stop().
    this.scheduleAlarms.pause()
    this.maintenanceAlarms = new RuntimeMaintenanceAlarmTransfer(this.baseOwner.incarnation, {
      catalog: () => {
        if (!this.storageCatalog || this.storageFailure)
          throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Activated maintenance source metadata is unavailable')
        return { revision: this.storageCatalog.revision, databaseIds: [...this.storageCatalog.databaseIds] }
      },
      seal: (owner, ack) => this.maintenance.sealInspection(owner, ack),
      sealed: (owner, ack) => this.maintenance.inspectionSealed(owner, ack),
      unsealKnownAbort: (owner, ack) => this.maintenance.abortInspection(owner, ack),
      acquire: async (signal) => {
        if (this.closing || !this.controllerStarted)
          throw new HbarError('MAINTENANCE_BACKGROUND_STOPPED', 'Maintenance background admission is paused')
        const hold = await this.demand.acquire(['maintenance'], signal, 'background')
        if (signal.aborted || this.closing || !this.controllerStarted) {
          hold.release()
          throw new HbarError('MAINTENANCE_BACKGROUND_STOPPED', 'Maintenance stopped before idle restoration')
        }
        const owner = hold.owners.find((candidate) => candidate.unitId === 'maintenance')
        if (!owner) {
          hold.release()
          throw new HbarError('RUNTIME_OWNER_MISMATCH', 'Maintenance demand returned no selected owner')
        }
        return { owner, release: () => hold.release() }
      },
      initializeIdle: (owner, ack, checkpoint, _attempt, signal) =>
        this.demand.withBackground(async () => {
          signal.throwIfAborted()
          if (this.closing || !this.controllerStarted)
            throw new HbarError('MAINTENANCE_BACKGROUND_STOPPED', 'Maintenance background admission is paused')
          this.assertDemandOwners([owner])
          const reply = await this.maintenance.initializeIdle(owner, ack, checkpoint, signal)
          return reply
        }),
      physicalExit: async (owner) => this.maintenanceCleanExit(owner),
    })
    this.maintenanceAlarms.pause()
    this.sessionWakeAlarms = new RuntimeSessionWakeTransfer({
      clock: {
        now: () => Date.now(),
        schedule: (callback, delayMs) => {
          const timer = setTimeout(callback, delayMs)
          return { cancel: () => clearTimeout(timer) }
        },
      },
      acquire: async (signal) => {
        if (this.closing || !this.controllerStarted)
          throw new HbarError('SESSION_WAKE_STOPPED', 'Goal deadline admission is paused')
        const hold = await this.demand.acquire(['kernel'], signal, 'background')
        const owner = hold.owners.find((candidate) => candidate.unitId === 'kernel')
        if (!owner) {
          hold.release()
          throw new HbarError('RUNTIME_OWNER_MISMATCH', 'Goal deadline demand returned no Kernel owner')
        }
        return { owner, release: () => hold.release() }
      },
      notify: (hold, ack, entry, signal) =>
        this.demand.withBackground(async () => {
          if (signal.aborted || this.closing || !this.controllerStarted) return 'not-dispatched' as const
          this.assertDemandOwners([hold.owner])
          const record = this.generations.get(key(hold.owner))
          if (
            !record?.owner ||
            !this.sameStorageOwner(record.owner, hold.owner) ||
            record.sessionWakeRestoreAck?.token !== ack.token
          )
            throw new HbarError('SESSION_WAKE_UNKNOWN', 'Goal deadline belongs to another Kernel restoration')
          await this.restoreSessionWakeRecord(record, signal)
          if (signal.aborted || this.closing || !this.controllerStarted) return 'not-dispatched' as const
          this.assertDemandOwners([hold.owner])
          const reply = await record.process.call(
            'kernel.sessionWakes.deliver',
            { token: ack.token, entry },
            sessionWakeDeliveryResultSchema,
            { signal },
          )
          // The exact peer's validated reply settles this notification even if
          // ownership changes immediately afterwards. Only later dispatch is gated.
          return reply.status
        }),
      physicalRetirement: (owner) => {
        const cached = this.sessionWakePhysicalReceipt
        if (cached && this.sameStorageOwner(cached.owner, owner)) return { ...cached, owner: { ...cached.owner } }
        return this.generations.get(key(owner))?.process.retirementReceipt(owner) ?? null
      },
      fault: (owner, _error) =>
        this.emitProcessLifecycleDiagnostic({
          component: 'host',
          level: 'error',
          event: 'host.runtime_idle_deadline_unknown',
          phase: `generation.${owner.generation}`,
          contextId: owner.unitId,
          requestId: owner.incarnation,
          instanceId: this.instanceId,
          processId: process.pid,
          outcome: 'unknown',
        }),
    })
    this.sessionWakeAlarms.pause()
    this.statusFeed = new RuntimeStatusFeed(() => this.readSnapshot())
    this.disposeStatus = this.manager.subscribe((delta) => {
      this.releaseEmptyKernelCheckpointWhenActive()
      this.statusFeed.accept(delta)
    })
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
              record && record.phase === 'serving' ? self.controllerAdapter().list() : self.controllerCatalog
            if (!catalog) throw new HbarError('RUNTIME_RECOVERING', 'Controller catalog has not been published')
            return { ...catalog, items: catalog.items.filter((item) => !item.metadata.id.startsWith('chatDatabase.')) }
          },
          call: <Result>(
            ...[service, method, args, options]: Parameters<RuntimeControllerServicesOptions['call']>
          ): Promise<Result> => {
            if (self.initializing)
              return Promise.reject(new HbarError('RUNTIME_RECOVERING', 'Runtime business owners are still preparing'))
            return self.demand.withUnits(['controller', 'kernel'], self.sourceAbort.signal, async (owners) => {
              self.assertDemandOwners(owners)
              await self.restoreControllerSchedule(owners, self.sourceAbort.signal)
              self.assertDemandOwners(owners)
              const kernel = owners.find((owner) => owner.unitId === 'kernel')
              if (!kernel) throw new HbarError('RUNTIME_OWNER_REVOKED', 'Controller demand lacks its Kernel')
              const result = await self.controllerAdapter().service<Result>(service, method, args, options)
              try {
                await self.consumeSettingsScheduling(kernel, self.sourceAbort.signal)
              } catch (error) {
                // The service result is already known. Keep its success; the hint/owner fence retains refresh failure.
                console.error(
                  '[hbar] Settings scheduling refresh failed',
                  runtimeDomainError(error)?.code ?? 'AUTONOMY_REFRESH_FAILED',
                )
              }
              return result
            })
          },
          tracked: (value, actorId, expectation, options) => {
            const scope = AsyncLocalStorage.snapshot()
            const signal = AbortSignal.any([
              self.sourceAbort.signal,
              AbortSignal.timeout(120_000),
              ...(options?.signal ? [options.signal] : []),
            ])
            return createDemandCommandTicket({
              signal,
              acquire: (admission) => {
                if (self.initializing)
                  return Promise.reject(
                    new HbarError('RUNTIME_RECOVERING', 'Runtime business owners are still preparing'),
                  )
                return self.demand.acquire(['controller', 'kernel'], admission)
              },
              restore: async (hold) => {
                self.assertDemandOwners(hold.owners)
                // Foreground cancellation cannot cancel another waiter's accepted shared restore.
                await self.restoreControllerSchedule(hold.owners, self.sourceAbort.signal)
                self.assertDemandOwners(hold.owners)
                const kernel = hold.owners.find((owner) => owner.unitId === 'kernel')
                if (!kernel) throw new HbarError('RUNTIME_OWNER_REVOKED', 'Tracked demand lacks its Kernel')
                await self.consumeSettingsScheduling(kernel, self.sourceAbort.signal)
              },
              start: (hold) =>
                scope(() => {
                  self.assertDemandOwners(hold.owners)
                  return self.controllerAdapter().trackCommand(value, actorId, expectation, options)
                }),
            })
          },
          start: async () => {
            if (!self.controllerStarted) self.controllerBackgroundEpoch++
            self.controllerStarted = true
            const epoch = self.controllerBackgroundEpoch
            await self.controllerPause
            if (!self.controllerStarted || epoch !== self.controllerBackgroundEpoch) return
            self.scheduleAlarms.resume()
            self.maintenanceAlarms.resume()
            self.sessionWakeAlarms.resume()
            if (!self.initializing)
              await self.demand.withUnits(['controller', 'kernel'], self.sourceAbort.signal, async (owners) => {
                if (!self.controllerStarted || epoch !== self.controllerBackgroundEpoch) return
                self.assertDemandOwners(owners)
                await self.restoreControllerSchedule(owners, self.sourceAbort.signal)
                if (!self.controllerStarted || epoch !== self.controllerBackgroundEpoch) return
                self.assertDemandOwners(owners)
                await self.resumeControllerBackground(self.currentGeneration('controller'), epoch)
                await self.resumeServingMaintenance(epoch)
              })
          },
          stop: async () => {
            if (!self.controllerStarted) return self.controllerPause
            self.controllerStarted = false
            const epoch = ++self.controllerBackgroundEpoch
            self.scheduleAlarms.pause()
            self.maintenanceAlarms.pause()
            self.sessionWakeAlarms.pause()
            // Capture before publishing this pause. A resume admitted later waits
            // for it; an earlier resume waits only for the previous pause, so the
            // two ordered sets cannot form a Promise dependency cycle.
            const previous = self.controllerPause
            const resumes = [...self.controllerResumes.values()]
            const maintenanceResumes = [...self.maintenanceResumes.values()]
            const operation = Promise.resolve().then(async () => {
              await previous
              await self.scheduleAlarms.whenSettled()
              await self.maintenanceAlarms.whenSettled()
              await self.sessionWakeAlarms.whenSettled()
              await Promise.allSettled(resumes)
              await Promise.allSettled(maintenanceResumes)
              // A later explicit start owns the new epoch. It will wait for this
              // pause before resuming, rather than overlap child lifecycle RPCs.
              if (self.controllerStarted || epoch !== self.controllerBackgroundEpoch) return
              await self.pauseServingMaintenance()
              try {
                const adapter = self.controllerAdapter()
                // Transferred timers are already quiesced; UNKNOWN stays fenced.
                if (!adapter.scheduleIdleSnapshot().fenced) await adapter.pause()
              } catch (error) {
                if (runtimeDomainError(error)?.code !== 'RUNTIME_RECOVERING') throw error
              }
            })
            self.controllerPause = operation
            return operation
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
  private resumeControllerBackground(record: Generation, epoch = this.controllerBackgroundEpoch): Promise<void> {
    const owner = record.owner
    const adapter = record.controller
    if (!owner || !adapter) return Promise.resolve()
    const admitted = (): boolean =>
      !this.closing &&
      !this.initializing &&
      this.controllerStarted &&
      epoch === this.controllerBackgroundEpoch &&
      record.controller === adapter &&
      record.owner !== null &&
      this.sameStorageOwner(record.owner, owner) &&
      this.coordinator.role(owner) === 'default'
    if (!admitted()) return Promise.resolve()
    const resumeKey = `${epoch}:${owner.incarnation}`
    const existing = this.controllerResumes.get(resumeKey)
    if (existing) return existing
    if (this.controllerResumes.size >= 3)
      return Promise.reject(new HbarError('CONTROLLER_CAPACITY', 'Controller background transitions are full'))
    const previousPause = this.controllerPause
    const operation: Promise<void> = Promise.resolve()
      .then(async () => {
        await previousPause
        if (admitted()) await adapter.resume(admitted)
      })
      .finally(() => {
        if (this.controllerResumes.get(resumeKey) === operation) this.controllerResumes.delete(resumeKey)
      })
    this.controllerResumes.set(resumeKey, operation)
    return operation
  }
  private async restoreControllerSchedule(owners: readonly RuntimeOwner[], signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const owner = owners.find((candidate) => candidate.unitId === 'controller')
    const record = owner ? this.generations.get(key(owner)) : undefined
    if (!owner || !record?.controller || !record.owner || !this.sameStorageOwner(record.owner, owner))
      throw new HbarError('RUNTIME_OWNER_REVOKED', 'Controller foreground admission changed')
    const held = this.controllerIdleTransfer
    const ack = record.scheduleRestoreAck ?? (held && this.sameStorageOwner(held.owner, owner) ? held.ack : null)
    if (!ack) {
      if (this.scheduleAlarms.peek().committed?.phase === 'armed')
        throw new HbarError('RUNTIME_IDLE_FENCED', 'Controller foreground lacks its exact armed restoration')
      return
    }
    // The parent shares a single physical wake with any due alarm. Caller abort
    // cannot cancel another waiter's accepted restoration or replay UNKNOWN work.
    await this.scheduleAlarms.wakeForeground(owner, ack)
    signal.throwIfAborted()
    this.assertDemandOwners([owner])
  }
  private controllerRestoreAck(): ScheduleTransferAck {
    const held = this.controllerIdleTransfer
    const physical = held?.physical
    if (!held || !this.cleanIdlePhysicalReceipt(held.owner, physical))
      throw new HbarError('CONTROLLER_IDLE_RESTORE_UNCONFIRMED', 'Controller has no confirmed idle exit')
    const ack = this.scheduleAlarms.restoreAck(held.owner)
    if (!ack || ack.token !== held.ack.token || ack.version !== held.ack.version || ack.epoch !== held.ack.epoch)
      throw new HbarError('CONTROLLER_IDLE_RESTORE_UNCONFIRMED', 'Controller armed transfer identity changed')
    return ack
  }
  private cleanIdlePhysicalReceipt(
    owner: RuntimeOwner,
    receipt: RuntimePhysicalRetirementReceipt | null | undefined,
  ): receipt is RuntimePhysicalRetirementReceipt {
    return (
      !!receipt &&
      this.sameStorageOwner(receipt.owner, owner) &&
      !receipt.forced &&
      receipt.exitCode === 0 &&
      receipt.cleanDisposeAck &&
      receipt.nativeJoined &&
      receipt.onExitCompleted
    )
  }
  private deadlinePhysicalAttempt(snapshot: RuntimeAlarmSnapshot): RuntimeAlarmAttempt | null {
    const alarm = snapshot.inFlight,
      attempt = snapshot.inFlightAttempt
    return alarm && attempt !== null
      ? { key: alarm.key, id: alarm.id, version: alarm.version, epoch: alarm.epoch, attempt }
      : null
  }
  private queueDeadlineReconcile(
    unitId: 'kernel' | 'maintenance' | 'controller',
    settled: Promise<void>,
    reconcile: () => boolean | Promise<boolean>,
    failed: () => void,
  ): void {
    if (this.deadlineReconciles.has(unitId)) return
    // At most one metadata settlement per timer domain; periodic observation
    // never creates another physical request or an unbounded waiter collection.
    const operation = settled
      .then(async () => {
        await reconcile()
      })
      .catch(failed)
      .finally(() => {
        if (this.deadlineReconciles.get(unitId) === operation) this.deadlineReconciles.delete(unitId)
      })
    this.deadlineReconciles.set(unitId, operation)
  }
  private reconcileDeadlinePhysicalOwners(): void {
    const owners = [
      ...[...this.sessionWakeCheckpointDemands.values()].map((held) => held.owner),
      this.sessionWakeAlarms.pendingPhysicalAttempt()?.owner,
      this.maintenanceAlarms.peek().physicalOwner,
      this.scheduleAlarms.peek().physicalOwner,
    ]
    for (const owner of owners) {
      if (!owner) continue
      const receipt = this.generations.get(key(owner))?.process.retirementReceipt(owner)
      if (receipt) this.deadlineOwnerPhysicallyExited(receipt)
    }
  }
  private deadlineOwnerPhysicallyExited(receipt: RuntimePhysicalRetirementReceipt): void {
    // The native/onExit hook and private metadata reconciliation both re-read
    // this exact ManagedProcess ledger. No caller DTO grants physical authority.
    const actual = this.generations.get(key(receipt.owner))?.process.retirementReceipt(receipt.owner)
    if (
      !actual ||
      !this.sameStorageOwner(actual.owner, receipt.owner) ||
      actual.childPid !== receipt.childPid ||
      !actual.nativeJoined ||
      !actual.onExitCompleted
    )
      return
    const failed = (): void =>
      this.emitProcessLifecycleDiagnostic({
        component: 'host',
        level: 'error',
        event: 'host.runtime_idle_deadline_reconcile_failed',
        phase: `generation.${actual.owner.generation}`,
        contextId: actual.owner.unitId,
        requestId: actual.owner.incarnation,
        instanceId: this.instanceId,
        processId: process.pid,
        outcome: 'unknown',
      })
    if (actual.owner.unitId === 'kernel') {
      const checkpointDemand = this.sessionWakeCheckpointDemands.get(actual.owner.incarnation)
      if (checkpointDemand && this.sameStorageOwner(checkpointDemand.owner, actual.owner)) {
        checkpointDemand.hold?.release()
        checkpointDemand.proofPin.release()
        checkpointDemand.queueProofHold?.release()
        this.sessionWakeCheckpointDemands.delete(actual.owner.incarnation)
      }
      const pending = this.sessionWakeAlarms.pendingPhysicalAttempt()
      if (!pending || !this.sameStorageOwner(pending.owner, actual.owner)) return
      this.sessionWakePhysicalReceipt = { ...actual, owner: { ...actual.owner } }
      if (this.sessionWakeAlarms.physicalExitConfirmed(actual)) {
        this.queueDeadlineReconcile(
          'kernel',
          this.sessionWakeAlarms.whenSettled(),
          () => {
            const reconciled = this.sessionWakeAlarms.reconcile(pending.attempt)
            if (reconciled && this.sessionWakePhysicalReceipt?.owner.incarnation === actual.owner.incarnation)
              this.sessionWakePhysicalReceipt = null
            return reconciled
          },
          failed,
        )
      }
      return
    }
    if (actual.owner.unitId === 'maintenance') {
      this.maintenance.physicalExitConfirmed(actual)
      const attempt = this.deadlinePhysicalAttempt(this.maintenanceAlarms.peek().alarm)
      if (this.maintenanceAlarms.physicalExitConfirmed(actual) && attempt)
        this.queueDeadlineReconcile(
          'maintenance',
          this.maintenanceAlarms.whenSettled(),
          () => this.maintenanceAlarms.reconcile(attempt),
          failed,
        )
      return
    }
    if (actual.owner.unitId === 'controller') {
      const attempt = this.deadlinePhysicalAttempt(this.scheduleAlarms.peek().alarm)
      if (this.scheduleAlarms.physicalExitConfirmed(actual) && attempt)
        this.queueDeadlineReconcile(
          'controller',
          this.scheduleAlarms.whenSettled(),
          () => this.scheduleAlarms.reconcile(attempt),
          failed,
        )
    }
  }
  private releaseEmptyKernelCheckpointWhenActive(): void {
    if (!this.sessionWakeCheckpointDemands.size) return
    const unit = this.manager.snapshot().units.find((value) => value.descriptor.id === 'kernel')
    if (unit?.idle?.phase !== 'active' || unit.idle.checkpointPending) return
    const selected = unit.generations.find((value) => value.role === 'default' && value.phase === 'serving')
    if (!selected) return
    for (const held of this.sessionWakeCheckpointDemands.values()) {
      if (held.hold || held.owner.generation !== selected.generation || held.owner.incarnation !== selected.incarnation)
        continue
      const record = this.generations.get(key(held.owner))
      const state = record?.process.snapshot()
      if (
        !record?.owner ||
        !this.sameStorageOwner(record.owner, held.owner) ||
        state?.phase !== 'serving' ||
        state.role !== 'default' ||
        record.process.retirementReceipt(held.owner)
      )
        continue
      // Only Manager's same-owner return to active proves a noop checkpoint was
      // cancelled before irreversible drain. UNKNOWN/draining never enters here.
      held.proofPin.release()
      held.queueProofHold?.release()
      this.sessionWakeCheckpointDemands.delete(held.owner.incarnation)
    }
  }
  private async checkpointSessionWakes(
    owner: RuntimeOwner,
    record: Generation,
    signal: AbortSignal,
  ): Promise<RuntimeIdleCheckpoint> {
    const trace = new IdleCheckpointDiagnostic({
      domain: 'goal',
      owner,
      emit: (input) =>
        this.emitProcessLifecycleDiagnostic({ ...input, instanceId: this.instanceId, processId: process.pid }),
    })
    if (
      this.closing ||
      this.initializing ||
      !this.controllerStarted ||
      signal.aborted ||
      !record.owner ||
      !this.sameStorageOwner(record.owner, owner)
    )
      return trace.result('busy')
    let ack: SessionWakeAck | null = null
    let checkpointHold: HostRuntimeDemandHold | undefined
    let proofPin: { release(): void } | null = null
    let queueProofHold: { release(): void } | undefined
    let emptyProofRegistered = false
    try {
      trace.at('preview')
      // A null cache is not an empty queue. Establish its real same-owner proof
      // before preview, which itself requires that proof and cannot refresh it.
      if (this.storage.snapshot().queuedSessionCount === null) {
        const before = this.storage.snapshot()
        let storageOwner: RuntimeOwner | undefined
        if (before.phase === 'serving' && before.owner) {
          // This internal checkpoint is not new business demand. Pin the exact
          // already-serving writer without resetting its inactivity deadline.
          // A concurrent retirement stays busy; never wake a replacement here.
          const pin = this.manager.tryPinServingOwners([before.owner])
          if (!pin) return trace.result('busy')
          queueProofHold = pin
          storageOwner = before.owner
        } else {
          // An actually cold writer still needs ordinary bounded admission.
          const hold = await this.demand.acquire(['storage'], signal)
          queueProofHold = hold
          storageOwner = hold.owners.find((value) => value.unitId === 'storage')
        }
        signal.throwIfAborted()
        const installed = this.storage.snapshot()
        if (
          !storageOwner ||
          installed.phase !== 'serving' ||
          !installed.owner ||
          !this.sameStorageOwner(storageOwner, installed.owner)
        )
          return trace.result('busy')
        this.assertDemandOwners([storageOwner])
        const queued = await this.storage.call('queuedSessions')
        signal.throwIfAborted()
        this.assertDemandOwners([storageOwner])
        const proof = this.storage.snapshot()
        if (
          queued.length ||
          proof.queuedSessionCount !== 0 ||
          proof.phase !== 'serving' ||
          !proof.owner ||
          !this.sameStorageOwner(storageOwner, proof.owner)
        )
          return trace.result('busy')
        if (
          this.closing ||
          !this.controllerStarted ||
          this.generations.get(key(owner)) !== record ||
          !record.owner ||
          !this.sameStorageOwner(record.owner, owner) ||
          record.process.retirementReceipt(owner)
        )
          return trace.result('busy')
      }
      const manifest = await record.process.call('kernel.sessionWakes.preview', undefined, sessionWakeManifestSchema, {
        signal,
      })
      trace.at('identity')
      if (
        signal.aborted ||
        this.closing ||
        !this.controllerStarted ||
        !record.owner ||
        !this.sameStorageOwner(record.owner, owner) ||
        !this.sameStorageOwner(manifest.owner, owner)
      )
        return trace.result('busy')
      const empty = manifest.entries.length === 0
      if (empty) {
        if (!this.sessionWakeAlarms.emptyCheckpointAllowed()) return trace.result('busy')
      }
      if (this.sessionWakeCheckpointDemands.size >= 2) return trace.result('busy')
      // A nonempty preview resolves real Goal coverage and may wake its Storage
      // dependencies. Retain that exact closure without acquiring the retiring Kernel.
      if (!empty) {
        checkpointHold = await this.demand.acquire(['plugin.goal'], signal)
        this.assertDemandOwners(checkpointHold.owners)
        const storageOwner = checkpointHold.owners.find((value) => value.unitId === 'storage')
        const installed = this.storage.snapshot()
        if (
          !storageOwner ||
          installed.phase !== 'serving' ||
          !installed.owner ||
          !this.sameStorageOwner(storageOwner, installed.owner)
        )
          return trace.result('busy')
        // Only an actual complete queuedSessions reply may refresh the existing
        // owner/version-guarded cache. null remains unknown and never becomes zero.
        const queued = await this.storage.call('queuedSessions')
        signal.throwIfAborted()
        this.assertDemandOwners(checkpointHold.owners)
        const queueProof = this.storage.snapshot()
        if (
          queued.length ||
          queueProof.queuedSessionCount !== 0 ||
          !queueProof.owner ||
          !this.sameStorageOwner(storageOwner, queueProof.owner) ||
          queueProof.phase !== 'serving'
        )
          return trace.result('busy')
      }
      // Freeze only already-active plugin owners. Sleeping owners remain receipt-only;
      // any retiring/candidate owner makes this attempt busy before an offer exists.
      const proofSource = this.pluginQuiescenceSource()
      const activeOwners = proofSource
        .units()
        .filter((unit) => proofSource.unitIds.includes(unit.descriptor.id) && unit.idle?.phase !== 'sleeping')
        .flatMap((unit) => {
          const selected = unit.generations.find(
            (generation) => generation.role === 'default' && generation.phase === 'serving',
          )
          return selected
            ? [{ unitId: unit.descriptor.id, generation: selected.generation, incarnation: selected.incarnation }]
            : []
        })
      proofPin = this.manager.tryPinServingOwners(activeOwners)
      if (!proofPin) return trace.result('busy')
      const pluginProof = await readRuntimePluginQuiescence(proofSource)
      signal.throwIfAborted()
      if (
        pluginProof.coverage !== 'complete' ||
        pluginProof.queuedRuns !== false ||
        pluginProof.owners.some(
          (value) =>
            value.requests !== 0 ||
            value.runs !== 0 ||
            ((empty || value.owner.unitId !== 'plugin.goal') && (!value.eligible || value.resources !== 0)),
        )
      )
        return trace.result('busy')
      // Recheck the retiring owner after every dependency await. If its exact
      // native/onExit receipt arrived before this registration, no old offer may
      // retain a hold that the already-completed hook could not have observed.
      if (
        this.closing ||
        !this.controllerStarted ||
        record.process.retirementReceipt(owner) ||
        this.sessionWakeCheckpointDemands.has(owner.incarnation) ||
        this.sessionWakeCheckpointDemands.size >= 2
      )
        return trace.result('busy')
      // This is the already-selected retiring owner, not a new business admission.
      // defaultOwner intentionally refuses retiring units; inspect exact facts only.
      const kernelUnit = this.manager.snapshot().units.find((unit) => unit.descriptor.id === owner.unitId)
      const selectedKernel = kernelUnit?.generations.find(
        (generation) => generation.role === 'default' && generation.phase === 'serving',
      )
      const processOwner = record.process.owner()
      const processState = record.process.snapshot()
      if (
        owner.unitId !== 'kernel' ||
        kernelUnit?.idle?.phase !== 'retiring' ||
        !selectedKernel ||
        selectedKernel.generation !== owner.generation ||
        selectedKernel.incarnation !== owner.incarnation ||
        this.generations.get(key(owner)) !== record ||
        !record.owner ||
        !this.sameStorageOwner(record.owner, owner) ||
        !this.sameStorageOwner(processOwner, owner) ||
        processState.phase !== 'serving' ||
        processState.role !== 'default'
      )
        return trace.result('busy')
      // No await from this exact-owner check through hold registration and offer.
      this.sessionWakeCheckpointDemands.set(owner.incarnation, {
        owner: { ...owner },
        hold: checkpointHold,
        proofPin,
        queueProofHold,
      })
      if (empty) {
        // No timer transfer or plugin wake is needed. The same live owner proof
        // still spans Kernel's irreversible drain, final probe and native exit.
        emptyProofRegistered = true
        this.sessionWakeIdleTransfer = null
        return trace.result('noop')
      }
      trace.at('offer')
      ack = this.sessionWakeAlarms.offer(manifest)
      trace.at('quiesce')
      const quiesced = await record.process.call('kernel.sessionWakes.quiesce', { ack }, sessionWakeStatusSchema, {
        signal,
      })
      trace.at('identity')
      if (quiesced.phase !== 'quiesced' || quiesced.token !== ack.token || quiesced.revision !== manifest.revision)
        return trace.result('unknown')
      trace.at('commit')
      const committed = await record.process.call('kernel.sessionWakes.commit', { ack }, sessionWakeStatusSchema, {
        signal,
      })
      this.sessionWakeAlarms.commit(ack, committed)
      trace.at('arm')
      this.sessionWakeAlarms.arm(ack)
      trace.at('identity')
      if (
        signal.aborted ||
        !record.owner ||
        !this.sameStorageOwner(record.owner, owner) ||
        this.sessionWakeAlarms.restoreAck(owner)?.token !== ack.token
      )
        return trace.result('unknown')
      this.sessionWakeIdleTransfer = { owner: { ...owner }, ack, process: record.process, physical: null }
      return trace.result('prepared')
    } catch (error) {
      // A rejected preview has changed no timer or admission authority. Once an
      // offer exists, only an exact acknowledged settlement can reopen this gate.
      return trace.result(ack === null ? 'busy' : 'unknown', error)
    } finally {
      // Before an offer every local hold is reversible. After an offer, keep all
      // three proofs through final probe and the exact native/onExit boundary.
      if (ack === null && !emptyProofRegistered) {
        queueProofHold?.release()
        proofPin?.release()
      }
      if (checkpointHold && ack === null) {
        // No transfer was offered. This call dispatched no Kernel quiesce/commit.
        const held = this.sessionWakeCheckpointDemands.get(owner.incarnation)
        if (held?.hold === checkpointHold) this.sessionWakeCheckpointDemands.delete(owner.incarnation)
        checkpointHold.release()
      }
      // Once offered, UNKNOWN retains the exact hold until independent native/onExit
      // proof; logical errors/cancel do not release it or reopen the old transfer.
    }
  }
  private sessionWakeRestoreAck(): SessionWakeAck | null {
    const held = this.sessionWakeIdleTransfer
    if (!held) return null // An empty checkpoint retained no future continuation.
    const ack = this.sessionWakeAlarms.restoreAck(held.owner)
    if (
      !this.cleanIdlePhysicalReceipt(held.owner, held.physical) ||
      !ack ||
      ack.token !== held.ack.token ||
      ack.manifest.revision !== held.ack.manifest.revision
    )
      throw new HbarError('SESSION_WAKE_UNKNOWN', 'Kernel has no confirmed deadline restoration')
    return ack
  }
  private restoreSessionWakeRecord(record: Generation, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    if (!record.sessionWakeRestoreAck) return Promise.resolve()
    if (record.sessionWakeRestore) return record.sessionWakeRestore
    const owner = record.owner,
      peer = record.peer,
      ack = record.sessionWakeRestoreAck
    if (!owner || !peer || owner.unitId !== 'kernel' || this.coordinator.role(owner) !== 'default')
      return Promise.reject(new HbarError('SESSION_WAKE_UNKNOWN', 'Deadline restoration owner is not active'))
    // Publish one shared restoration before invoking the peer. A foreground
    // waiter's abort cannot cancel an already accepted restore for other callers.
    const operation = Promise.resolve().then(async () => {
      const sharedSignal = AbortSignal.any([this.sourceAbort.signal, AbortSignal.timeout(120_000)])
      sharedSignal.throwIfAborted()
      if (
        record.peer !== peer ||
        !record.owner ||
        !this.sameStorageOwner(record.owner, owner) ||
        this.coordinator.role(owner) !== 'default'
      )
        throw new HbarError('RUNTIME_OWNER_REVOKED', 'Deadline restoration peer changed before dispatch')
      const reply = await peer.call('kernel.sessionWakes.restore', { ack }, sessionWakeStatusSchema, {
        signal: sharedSignal,
        timeoutMs: 120_000,
      })
      if (
        reply.phase !== 'restored' ||
        reply.token !== ack.token ||
        reply.revision !== ack.manifest.revision ||
        record.peer !== peer ||
        !record.owner ||
        !this.sameStorageOwner(record.owner, owner) ||
        this.coordinator.role(owner) !== 'default'
      )
        throw new HbarError('SESSION_WAKE_UNKNOWN', 'Deadline restoration was not acknowledged by its exact owner')
    })
    // A rejection is retained too: no automatic replay after an unknown restore.
    record.sessionWakeRestore = operation
    return operation
  }
  private async restoreSessionWakeOwner(owner: RuntimeOwner, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const record = this.generations.get(key(owner))
    if (!record?.owner || !this.sameStorageOwner(record.owner, owner))
      throw new HbarError('RUNTIME_OWNER_REVOKED', 'Kernel deadline restoration owner changed')
    await this.restoreSessionWakeRecord(record, signal)
    signal.throwIfAborted()
    this.assertDemandOwners([owner])
  }
  private async checkpointMaintenanceInspection(
    owner: RuntimeOwner,
    record: Generation,
    signal: AbortSignal,
  ): Promise<RuntimeIdleCheckpoint> {
    const trace = new IdleCheckpointDiagnostic({
      domain: 'maintenance',
      owner,
      emit: (input) =>
        this.emitProcessLifecycleDiagnostic({ ...input, instanceId: this.instanceId, processId: process.pid }),
    })
    if (
      this.closing ||
      this.initializing ||
      !this.controllerStarted ||
      signal.aborted ||
      !record.owner ||
      !this.sameStorageOwner(record.owner, owner)
    )
      return trace.result('busy')
    let ack: MaintenanceInspectionAck | null = null
    try {
      trace.at('catalog')
      const catalog = this.storageCatalog
      if (!catalog || this.storageFailure || catalog.databaseIds.length !== 1) return trace.result('busy')
      const databaseId = catalog.databaseIds[0]
      if (!databaseId) return trace.result('busy')
      trace.at('preview')
      const preview = await record.process.call(
        'maintenance.inspection.preview',
        { databaseId, catalogRevision: catalog.revision },
        maintenanceInspectionManifestSchema,
        { signal },
      )
      trace.at('identity')
      if (
        signal.aborted ||
        this.closing ||
        !this.controllerStarted ||
        !record.owner ||
        !this.sameStorageOwner(record.owner, owner)
      )
        return trace.result('busy')
      trace.at('offer')
      ack = this.maintenanceAlarms.offer(owner, preview)
      trace.at('quiesce')
      const final = await record.process.call(
        'maintenance.inspection.quiesce',
        ack,
        maintenanceInspectionManifestSchema,
        { signal },
      )
      trace.at('commit')
      this.maintenanceAlarms.commit(owner, ack, final)
      const child = await record.process.call('maintenance.inspection.commit', ack, maintenanceInspectionCommitSchema, {
        signal,
      })
      trace.at('arm')
      this.maintenanceAlarms.activate(child)
      trace.at('identity')
      const committed = this.maintenanceAlarms.peek().committed
      if (
        signal.aborted ||
        !record.owner ||
        !this.sameStorageOwner(record.owner, owner) ||
        committed?.phase !== 'armed' ||
        !sameMaintenanceAck(committed.ack, ack)
      )
        return trace.result('unknown')
      this.maintenanceIdleTransfer = { owner: { ...owner }, ack, process: record.process, physical: null }
      return trace.result('prepared')
    } catch (error) {
      // Preview is read-only. After reservation/sealing, uncertainty never reopens
      // either admission gate or authorizes a fresh cleanup operation.
      return trace.result(ack === null ? 'busy' : 'unknown', error)
    }
  }
  private maintenanceCleanExit(owner: RuntimeOwner): MaintenanceCleanExitProof | null {
    const held = this.maintenanceIdleTransfer
    if (held && this.sameStorageOwner(held.owner, owner) && this.cleanIdlePhysicalReceipt(owner, held.physical))
      return { ...held.physical, ownerCleanupComplete: true }
    const retired = this.manager.retirement(owner)
    return retired.status === 'retired' &&
      retired.ownerCleanupCompleted &&
      this.cleanIdlePhysicalReceipt(owner, retired.physical)
      ? { ...retired.physical, ownerCleanupComplete: true }
      : null
  }
  private maintenanceRestoreAck(): MaintenanceInspectionAck {
    const held = this.maintenanceIdleTransfer
    const proof = held ? this.maintenanceCleanExit(held.owner) : null
    const ack = held && proof ? this.maintenanceAlarms.restoreAck(held.owner, proof) : null
    if (!held || !ack || !sameMaintenanceAck(held.ack, ack))
      throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Maintenance has no confirmed idle restoration')
    return ack
  }
  private async resumeServingMaintenance(epoch = this.controllerBackgroundEpoch): Promise<void> {
    if (this.closing || this.initializing || !this.controllerStarted || epoch !== this.controllerBackgroundEpoch) return
    const selected = this.manager
      .snapshot()
      .units.find((unit) => unit.descriptor.id === 'maintenance')
      ?.generations.find((generation) => generation.role === 'default' && generation.phase === 'serving')
    if (!selected) return // A parent alarm or foreground command owns demand, not application metadata.
    const record = this.generations.get(key(selected))
    const owner = record?.owner
    if (!record || !owner) return
    const admitted = (): boolean =>
      !this.closing &&
      !this.initializing &&
      this.controllerStarted &&
      epoch === this.controllerBackgroundEpoch &&
      record.owner !== null &&
      this.sameStorageOwner(record.owner, owner) &&
      this.coordinator.role(owner) === 'default'
    const resumeKey = `${epoch}:${owner.incarnation}`
    const existing = this.maintenanceResumes.get(resumeKey)
    if (existing) return existing
    if (this.maintenanceResumes.size >= 3)
      throw new HbarError('RUNTIME_LIFECYCLE_CAPACITY', 'Maintenance resume capacity is exhausted')
    const previousPause = this.controllerPause
    const operation = Promise.resolve()
      .then(async () => {
        await previousPause
        if (!admitted()) return
        await this.restoreMaintenanceInspection(owner, this.sourceAbort.signal)
        if (!admitted()) return
        await this.maintenance.resumeInitializedInspection(
          owner,
          { epoch: this.baseOwner.incarnation, owner },
          this.sourceAbort.signal,
        )
      })
      .finally(() => {
        if (this.maintenanceResumes.get(resumeKey) === operation) this.maintenanceResumes.delete(resumeKey)
      })
    this.maintenanceResumes.set(resumeKey, operation)
    return operation
  }
  private async pauseServingMaintenance(): Promise<void> {
    const selected = this.manager
      .snapshot()
      .units.find((unit) => unit.descriptor.id === 'maintenance')
      ?.generations.find((generation) => generation.role === 'default' && generation.phase === 'serving')
    if (!selected) return
    const record = this.generations.get(key(selected))
    const owner = record?.owner
    if (!record || !owner || !this.sameStorageOwner(owner, selected)) return
    const transfer = this.maintenanceAlarms.peek()
    if (
      (transfer.offered && this.sameStorageOwner(transfer.offered.owner, owner)) ||
      (transfer.committed &&
        transfer.committed.phase !== 'delivered' &&
        this.sameStorageOwner(transfer.committed.owner, owner))
    )
      return
    await this.maintenance.pauseInspection(owner, { epoch: this.baseOwner.incarnation, owner }, this.sourceAbort.signal)
  }
  private async restoreMaintenanceInspection(owner: RuntimeOwner, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const record = this.generations.get(key(owner))
    if (!record?.owner || !this.sameStorageOwner(record.owner, owner))
      throw new HbarError('RUNTIME_OWNER_REVOKED', 'Maintenance foreground owner changed')
    const held = this.maintenanceIdleTransfer
    const ack = record.maintenanceRestoreAck ?? (held && this.sameStorageOwner(held.owner, owner) ? held.ack : null)
    if (!ack) {
      if (this.maintenanceAlarms.peek().committed?.phase === 'armed')
        throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Maintenance lacks its armed restoration identity')
      return
    }
    await this.maintenanceAlarms.wakeForeground(owner, ack)
    signal.throwIfAborted()
    this.assertDemandOwners([owner])
  }
  private controllerProjection(): RuntimeKernelState {
    try {
      return this.facade.projection()
    } catch (error) {
      if (runtimeDomainError(error)?.code !== 'RUNTIME_RECOVERING') throw error
      const previous =
        this.kernelMetadata ??
        [...this.generations.values()]
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
    // Existing authenticated status connections use their bounded identity cache
    // while Storage sleeps. A normal authenticated business request may wake it.
    return this.storage.snapshot().phase === 'serving' && !this.storageFailure
  }
  /** A metrics sampler never performs a Storage call or refreshes an idle clock. */
  metricsSnapshot(): { readonly queuedRuns: number | null } {
    return { queuedRuns: this.storageFailure ? null : this.storage.snapshot().queuedSessionCount }
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
    this.workflowRecoveryAdmission = true
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
          const storageArtifact = prepared.artifacts.find((unit) => unit.unitId === 'storage')
          if (!storageArtifact)
            throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Startup needs the registered migration Worker')
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
          const installation = new Storage(options.layout.database, options.layout, {
            // The immutable artifact provides the same Worker entry in source and relocated Host bundles.
            workerPath: join(this.artifacts.root, storageArtifact.id, 'worker.js'),
            requestTimeoutMs: STARTUP_STORAGE_READY_TIMEOUT_MS,
            instanceId: this.instanceId,
            ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
            diagnosticsFullCoverage: options.diagnosticFullCoverage === true,
          })
          this.startupStorage = installation
          try {
            await installation.call('ready')
            this.sourceAbort.signal.throwIfAborted()
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
      await this.initializeUnit(prepared, 'storage')
      if (!this.initialExecutionPrepared) {
        await options.prepareInitialExecution?.(this.storage)
        this.initialExecutionPrepared = true
      }
      if (options.profileModule) await this.initializeUnit(prepared, 'driver.pi')
      else if (!this.deferredInitialDriver) {
        const artifact = (this.initialArtifacts ?? prepared).artifacts.find((value) => value.unitId === 'driver.pi')
        if (!artifact) throw new HbarError('RUNTIME_UNIT_NOT_FOUND', 'Initial Driver artifact is missing')
        this.manager.stageInitialDriver((this.initialArtifacts ?? prepared).id, 'driver.pi')
        this.deferredInitialDriver = { unitId: 'driver.pi', selectedArtifactId: artifact.id }
      }
      await this.initializeUnit(prepared, 'controller')
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
      this.setStartupPhase('startup.retirements')
      await this.reconcileBootstrapFaultRetirements()
      this.completeStartupPhase()
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
      // Adopt the already-serving owners before startup resume can claim new work.
      await this.demand.adoptServing(this.sourceAbort.signal, this.deferredInitialDriver)
      this.initializing = false
      if (this.buildUnits.some((unit) => unit.descriptor.id === 'maintenance')) {
        this.setStartupPhase('maintenance.reconcile')
        await this.maintenance.reconcile()
        this.completeStartupPhase()
      }
      this.setStartupPhase('kernel.resume')
      await this.demand.withUnits(['kernel'], this.sourceAbort.signal, async (owners) => {
        this.assertDemandOwners(owners)
        const startupKernel = this.currentKernel()
        await this.resume()
        if (!this.resumed.has(startupKernel.owner.incarnation))
          throw new HbarError('RUNTIME_INITIALIZING', 'Startup Kernel deadline recovery has not acknowledged')
        this.initialKernelResumeCompleted = true
      })
      this.completeStartupPhase()
      this.setStartupPhase('workflow.reconcile')
      await this.reconcileWorkflowPending()
      this.completeStartupPhase()
      this.workflowRecoveryAdmission = false
      this.schedule()
      this.setStartupPhase('goal.resume')
      await this.kernel.plugins.get('goal').resumeOnStartup()
      this.completeStartupPhase()
      if (this.controllerStarted) {
        this.setStartupPhase('controller.resume')
        await this.resumeControllerBackground(this.currentGeneration('controller'))
        await this.resumeServingMaintenance()
        this.completeStartupPhase()
      }
      this.reasonCode = null
      this.startupNextAttemptAt = null
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
    const sleepingStorage =
      storage.phase === 'waiting' &&
      state.units.find((unit) => unit.descriptor.id === 'storage')?.idle?.phase === 'sleeping'
    const ready =
      !this.initializing &&
      !this.closing &&
      (state.ready || this.coldDriverAdmissionReady(state)) &&
      this.demand.admissionReady() &&
      (storage.phase === 'serving' || sleepingStorage) &&
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
    if (this.initializing) return this.manager.reload(artifactSetId, unitIds)
    const admission = this.demand.beginReload(unitIds)
    let operation: { operationId: string }
    try {
      operation = this.manager.reload(artifactSetId, unitIds)
    } catch (error) {
      const code = runtimeDomainError(error)?.code
      if (
        code &&
        [
          'INVALID_INPUT',
          'RUNTIME_UNIT_NOT_FOUND',
          'RUNTIME_ARTIFACT_SET_NOT_FOUND',
          'RUNTIME_ARTIFACT_UNREGISTERED',
          'RUNTIME_OPERATION_CAPACITY',
          'RUNTIME_IDLE_BUSY',
          'RUNTIME_EXIT_UNKNOWN',
          'RUNTIME_STOPPING',
        ].includes(code)
      )
        admission.abortBeforeDispatch()
      throw error
    }
    const result = this.manager.getReload(operation.operationId)
    // A fully restart-required operation dispatches no candidate or replacement.
    // Keep the Manager result, but release this exact provisional demand barrier.
    if (result.units.length > 0 && result.units.every((unit) => unit.phase === 'restart_required'))
      admission.abortBeforeDispatch()
    else admission.commit(operation.operationId)
    return operation
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
        !this.recoveryResponsibility.pending() &&
        !this.scheduled &&
        !this.settingsScheduling.running() &&
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
    this.controllerStarted = false
    this.controllerBackgroundEpoch++
    this.scheduleAlarms.stop()
    this.maintenanceAlarms.stop()
    this.sessionWakeAlarms.close()
    this.demand.stop()
    this.recoveryResponsibility.stop()
    this.disposeStatus()
    this.statusFeed.close()
    this.disposeSource()
    this.deferredWakeups.close()
    this.sourceAbort.abort()
    clearInterval(this.sweep)
    const compilerClose = this.compiler.close().then(
      () => undefined,
      (error: unknown) => ({ error }),
    )
    let primary: { error: unknown } | undefined
    try {
      await this.settingsScheduling.running()
      await Promise.allSettled([this.startupProbe?.close(), this.startupStorage?.close()])
      await this.sourceTask
      for (const record of this.generations.values())
        if (record.artifact.unitId === 'kernel') await record.process.dispose()
      await this.storage.close()
      await this.manager.close()
      this.recoveryResponsibility.reconcilePhysical()
      await this.startupTask?.catch(() => {})
      await this.transitions
      this.facade.dispose()
    } catch (error) {
      primary = { error }
    }
    const cleanup = await compilerClose
    if (primary && cleanup) throw new AggregateError([primary.error, cleanup.error], 'Host shutdown failed')
    if (primary) throw primary.error
    if (cleanup) throw cleanup.error
  }
  private async buildInitial(): Promise<RuntimeArtifact[]> {
    await this.compiler.prepare()
    const artifacts: RuntimeArtifact[] = []
    for (let offset = 0; offset < this.buildUnits.length; offset += 2) {
      const batch = await Promise.allSettled(
        this.buildUnits
          .slice(offset, offset + 2)
          .map((unit) => this.compiler.build(this.artifacts, unit, this.sourceAbort.signal)),
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
    await this.compiler.prepare()
    this.sourceBaseline = await this.compiler.build(this.artifacts, hostRuntimeBaseBuildUnit(), this.sourceAbort.signal)
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
      await this.compiler.prepare()
      for (let offset = 0; offset < affected.length; offset += 2) {
        const batch = affected
          .slice(offset, offset + 2)
          .map((id) => this.buildUnits.find((unit) => unit.descriptor.id === id))
        const result = await Promise.allSettled(
          batch.map((unit) => {
            if (!unit) throw new HbarError('RUNTIME_UNIT_NOT_FOUND', 'Changed source has no registered build unit')
            return this.compiler.build(this.artifacts, unit, this.sourceAbort.signal)
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
  private assertDemandOwners(owners: readonly RuntimeOwner[]): void {
    for (const owner of owners) {
      const current = this.manager.defaultOwner(owner.unitId)
      const record = this.generations.get(key(owner))
      if (
        current.incarnation !== owner.incarnation ||
        !record ||
        record.owner?.incarnation !== owner.incarnation ||
        record.process.snapshot().phase !== 'serving'
      )
        throw new HbarError('RUNTIME_OWNER_REVOKED', 'Demand selection changed before admission')
    }
  }
  private async withClaimDependencies<Result>(
    owner: RuntimeOwner,
    sessionId: string,
    signal: AbortSignal,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    return withRuntimeClaimAdmission({
      coordinator: this.coordinator,
      responsibility: this.recoveryResponsibility,
      owner,
      sessionId,
      signal,
      operation,
      pending: () => [...this.pendingClaims.values()].some((value) => value.draft.sessionId === sessionId),
      ready: () => this.demand.admissionReady() && this.canWake(sessionId),
      prepare: async () => {
        const kernel = this.generations.get(key(owner))
        if (kernel?.state?.driverIsolation === 'legacy') return operation()
        const targets = [
          // Hold the preflight closure before waiting for cold execution dependencies.
          'kernel',
          'driver.pi',
          ...this.buildUnits.filter((unit) => unit.descriptor.kind === 'plugin').map((unit) => unit.descriptor.id),
        ]
        const demand: HostRuntimeDemandPort = this.demand
        // Failed acquisition keeps any unresolved start authority inside the unified parent adapter.
        const hold = await demand.acquire(targets, signal)
        let retained = false
        try {
          signal.throwIfAborted()
          if (this.coordinator.role(owner) !== 'default') return await operation()
          this.coordinator.assertCanWrite(owner)
          this.assertDemandOwners(hold.owners)
          return await operation()
        } catch (error) {
          const pending = [...this.pendingClaims.values()].find(
            (value) => value.draft.sessionId === sessionId && value.draft.owner.incarnation === owner.incarnation,
          )
          if (pending) {
            const holds = this.claimDemandHolds.get(pending.draft.runId) ?? []
            holds.push(hold)
            this.claimDemandHolds.set(pending.draft.runId, holds)
            retained = true
          }
          throw error
        } finally {
          if (!retained) hold.release()
        }
      },
    })
  }
  private driverDemand(): RuntimeDriverDemand {
    return {
      withDefault: async (signal, operation) => {
        signal.throwIfAborted()
        if (this.closing) throw new HbarError('RUNTIME_STOPPING', 'Host is stopping')
        const demand: HostRuntimeDemandPort = this.demand
        const hold = await demand.acquire(['driver.pi'], signal)
        let started = false,
          settled = false,
          incarnation: string | undefined
        const release = () => {
          if (settled) return
          settled = true
          hold.release()
          if (incarnation) {
            const holds = this.summaryDemandHolds.get(incarnation)
            holds?.delete(hold)
            if (!holds?.size) this.summaryDemandHolds.delete(incarnation)
          }
        }
        try {
          signal.throwIfAborted()
          if (this.closing) throw new HbarError('RUNTIME_STOPPING', 'Host is stopping')
          this.assertDemandOwners(hold.owners)
          const owner = hold.owners.find((value) => value.unitId === 'driver.pi')
          if (!owner) throw new HbarError('RUNTIME_VERSION_UNAVAILABLE', 'Demand omitted the Driver owner')
          const record = this.generations.get(key(owner))
          if (!record) throw new HbarError('RUNTIME_OWNER_REVOKED', 'Demand Driver owner disappeared')
          const endpoint = this.driver({
            unitId: owner.unitId,
            generation: owner.generation,
            artifactId: record.artifact.id,
          })
          incarnation = owner.incarnation
          const holds = this.summaryDemandHolds.get(incarnation) ?? new Set<HostRuntimeDemandHold>()
          holds.add(hold)
          this.summaryDemandHolds.set(incarnation, holds)
          return await operation(endpoint, {
            onDispatchStarted: () => {
              started = true
            },
            onDispatchSettled: release,
          })
        } finally {
          // Logical timeout/cancel after submission is not evidence of physical completion.
          if (!started) release()
        }
      },
    }
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
    const existing = this.coordinator.executionForSession(sessionId)
    if (existing?.owner.incarnation === owner.incarnation) return existing.versions
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
  private coldDriverAdmissionReady(state = this.manager.snapshot()): boolean {
    return (
      this.initialKernelResumeCompleted &&
      this.coldDriverBootstrapReady(state) &&
      state.units.some(
        (unit) =>
          unit.descriptor.id === 'kernel' &&
          (unit.idle?.phase === 'sleeping' ||
            unit.generations.some(
              (generation) =>
                generation.role === 'default' &&
                generation.phase === 'serving' &&
                this.resumed.has(generation.incarnation),
            )),
      )
    )
  }
  private coldDriverBootstrapReady(state = this.manager.snapshot()): boolean {
    return (
      !this.options.profileModule &&
      dormantDriverBootstrapReady(
        state,
        this.buildUnits.map((unit) => unit.descriptor),
        this.deferredInitialDriver,
      )
    )
  }
  /** Kernel restore/resume may precede Driver creation; execution admission stays strict. */
  private kernelRecoveryReady(): boolean {
    if (this.executionReady()) return true
    const state = this.manager.snapshot()
    return (
      this.coldDriverBootstrapReady(state) &&
      state.units.some(
        (unit) =>
          unit.descriptor.id === 'kernel' &&
          unit.generations.some((generation) => generation.role === 'default' && generation.phase === 'serving'),
      )
    )
  }
  private executionReady(): boolean {
    const snapshot = this.manager.snapshot()
    const current = snapshot.units
      .find((unit) => unit.descriptor.id === 'kernel')
      ?.generations.find((generation) => generation.role === 'default' && generation.phase === 'serving')
    if (!current) return false
    const kernel = this.generations.get(key(current))
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
      snapshot.units
        .find((unit) => unit.descriptor.id === id)
        ?.generations.some((g) => g.role === 'default' && g.phase === 'serving'),
    )
  }
  private canAdmit(sessionId: string): boolean {
    return (
      this.canWake(sessionId) &&
      this.executionReady() &&
      this.storage.snapshot().phase === 'serving' &&
      !this.pluginPreparingCatalog.size
    )
  }
  private canWake(sessionId: string): boolean {
    return (
      !this.closing &&
      !this.initializing &&
      !this.workflowRecoveryAdmission &&
      !this.maintaining &&
      !this.maintenance.isWriting() &&
      !this.storageFailure &&
      ![...this.interrupted.values()].some((failure) =>
        failure.leases.some((lease) => lease.sessionId === sessionId),
      ) &&
      ![...this.leases.values()].some(
        (lease) => lease.sessionId === sessionId && !this.coordinator.execution(lease.runId),
      )
    )
  }
  private createGeneration(
    artifact: RuntimeArtifact,
    generation: number,
    changed: () => void,
    purpose?: 'startup' | 'idle-wake',
  ): ManagedProcess {
    const scheduleRestoreAck =
      artifact.unitId === 'controller' && purpose === 'idle-wake' ? this.controllerRestoreAck() : null
    const maintenanceRestoreAck =
      artifact.unitId === 'maintenance' && purpose === 'idle-wake' ? this.maintenanceRestoreAck() : null
    const previousController = this.controllerIdleTransfer?.owner
    const scheduleRestoreManifest =
      scheduleRestoreAck && previousController
        ? this.scheduleAlarms.restoreManifest(previousController, scheduleRestoreAck)
        : null
    if (scheduleRestoreAck && !scheduleRestoreManifest)
      throw new HbarError('CONTROLLER_IDLE_RESTORE_UNCONFIRMED', 'Controller absolute checkpoint is unavailable')
    const inspection = maintenanceRestoreAck ? this.maintenanceAlarms.peek().committed : null
    if (maintenanceRestoreAck && (!inspection || !sameMaintenanceAck(inspection.ack, maintenanceRestoreAck)))
      throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Maintenance absolute checkpoint identity changed')
    const sessionWakeRestoreAck =
      artifact.unitId === 'kernel' && purpose === 'idle-wake' ? this.sessionWakeRestoreAck() : null
    let restoreAssigned = false
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
                : artifact.descriptor.kind === 'driver'
                  ? { physicalModelActivity: true }
                  : {}
    let record: Generation
    const managed = new ManagedProcess({
      descriptor: artifact.descriptor,
      artifactId: artifact.id,
      generation,
      purpose:
        purpose ??
        (this.initializing &&
        !this.manager
          .snapshot()
          .units.find((unit) => unit.descriptor.id === artifact.unitId)
          ?.generations.some((g) => g.role === 'default')
          ? 'startup'
          : 'candidate'),
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
        ...RUNTIME_DRIVER_MODEL_ACTIVITY_METHODS,
        ...RUNTIME_PLUGIN_CONTROL_METHODS,
        ...RUNTIME_MAINTENANCE_CONTROL_METHODS,
        ...RUNTIME_NODE_LINK_CONTROLS,
        ...RUNTIME_COMMAND_JOB_CONTROLS,
        ...SESSION_WAKE_CONTROL_METHODS,
        ...controllerScheduleControlMethods,
        'storage.catalog',
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
      onPhysicalRetirement: (receipt) => {
        this.storageOwnerPhysicallyExited(receipt)
        this.deadlineOwnerPhysicallyExited(receipt)
        for (const hold of this.summaryDemandHolds.get(receipt.owner.incarnation) ?? []) hold.release()
        this.summaryDemandHolds.delete(receipt.owner.incarnation)
        this.retirementConsumption.observe(managed, receipt.owner)
        this.schedule()
      },
      onPeer: (peer, owner, preparation) => {
        // ManagedProcess can recover another incarnation after having served.
        // A delivered idle ACK never authorizes that later crash recovery.
        const restoreForPeer = restoreAssigned ? null : scheduleRestoreAck
        const maintenanceForPeer = restoreAssigned ? null : maintenanceRestoreAck
        const sessionWakesForPeer = restoreAssigned ? null : sessionWakeRestoreAck
        restoreAssigned = true
        record.owner = owner
        record.peer = peer
        record.preparation = preparation
        record.scheduleRestoreAck = restoreForPeer
        record.maintenanceRestoreAck = maintenanceForPeer
        record.maintenanceRestoreCheckpoint = maintenanceForPeer && inspection ? inspection.manifest.checkpoint : null
        record.controllerRestoreReply = null
        record.maintenanceRestoreReply = null
        record.deadlineRestorationAcknowledged = false
        record.sessionWakeRestoreAck = sessionWakesForPeer
        record.sessionWakeRestore = null
        if (restoreForPeer || maintenanceForPeer || sessionWakesForPeer)
          this.emitProcessLifecycleDiagnostic({
            component: 'host',
            level: 'info',
            event: 'host.runtime_idle_wake_started',
            phase: `generation.${owner.generation}`,
            contextId: owner.unitId,
            requestId: owner.incarnation,
            instanceId: this.instanceId,
            processId: process.pid,
          })
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
            ...(restoreForPeer && scheduleRestoreManifest
              ? { scheduleIdleRestore: restoreForPeer, scheduleIdleManifest: scheduleRestoreManifest }
              : {}),
            kernel: this.kernel,
            maintenance: this.maintenance,
            nodeLink: this.nodeLink,
            projection: () => this.controllerProjection(),
            background: () => this.coordinator.role(owner) === 'default',
            admitsApplications: () => ['default', 'draining'].includes(this.coordinator.role(owner)),
            withBackground: (operation) => this.demand.withBackground(operation),
            fresh: (event) => this.facade.replay({ method: 'notifications.created', params: event }),
            retainCommand: (jobId) => {
              const resource = this.commandScopes.retain(this.coordinator, owner, `command.job:${jobId}`)
              if (!resource) throw new HbarError('BUSY', 'The command job already retains its owner')
              return () => this.coordinator.releaseResource(owner, resource.id)
            },
          })
        if (artifact.unitId === 'maintenance')
          record.cleanup.push(
            this.maintenance.attach(
              peer,
              owner,
              { unitId: artifact.unitId, generation, artifactId: artifact.id },
              maintenanceForPeer ? 'idle-wake' : undefined,
            ),
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
      onActivated: async (owner, role, signal) => {
        if (!record.peer || record.owner?.incarnation !== owner.incarnation)
          throw new HbarError('RUNTIME_OWNER_REVOKED', 'Description readiness belongs to an expired owner')
        if (artifact.unitId === 'storage' && this.coordinator.role(owner) === 'default') {
          const catalog = await record.peer.call('storage.catalog', undefined, storageActivatedCatalogSchema, {
            signal,
          })
          signal.throwIfAborted()
          if (!record.owner || !this.sameStorageOwner(record.owner, owner))
            throw new HbarError('RUNTIME_OWNER_REVOKED', 'Storage catalog owner changed during activation')
          this.storageCatalog = catalog
        }
        if (artifact.unitId === 'kernel') {
          // Activated-default construction has completed, but ManagedProcess has
          // not published serving. Restore every checkpoint before any frontdoor.
          await this.restoreSessionWakeRecord(record, signal)
          if (role === 'default' && record.preparation === 'idle-wake') {
            signal.throwIfAborted()
            const peer = record.peer
            if (
              !peer ||
              !record.owner ||
              !this.sameStorageOwner(record.owner, owner) ||
              this.coordinator.role(owner) !== 'default'
            )
              throw new HbarError('RUNTIME_OWNER_REVOKED', 'Idle scheduling owner changed before activation')
            await peer.call('kernel.resume', undefined, z.undefined(), { signal, timeoutMs: 120_000 })
            signal.throwIfAborted()
            if (
              record.peer !== peer ||
              !record.owner ||
              !this.sameStorageOwner(record.owner, owner) ||
              this.coordinator.role(owner) !== 'default'
            )
              throw new HbarError('RUNTIME_OWNER_REVOKED', 'Idle scheduling owner changed during activation')
            this.resumed.add(owner.incarnation)
          }
          record.state = await record.peer.call('kernel.state', undefined, runtimeKernelStateSchema, {
            signal,
            timeoutMs: 120_000,
          })
          record.stateSampledAt = Date.now()
          if (this.coordinator.role(owner) === 'default') this.kernelMetadata = record.state
        }
        if (artifact.descriptor.kind === 'plugin')
          record.pluginState = await record.peer.call('plugin.state', undefined, runtimePluginStateSchema, {
            signal,
            timeoutMs: 120_000,
          })
        if (artifact.unitId === 'controller') {
          await record.controller?.refreshCatalog()
          if (record.scheduleRestoreAck && role === 'default') {
            if (!record.controller || record.preparation !== 'idle-wake')
              throw new HbarError(
                'CONTROLLER_IDLE_RESTORE_UNCONFIRMED',
                'Controller activation restoration is not current',
              )
            record.controllerRestoreReply = await record.controller.wakeSchedule(record.scheduleRestoreAck, signal)
          }
          if (this.coordinator.role(owner) === 'default' && record.controller)
            this.controllerCatalog = record.controller.list()
        }
        if (artifact.unitId === 'maintenance' && record.maintenanceRestoreAck && role === 'default') {
          if (!record.maintenanceRestoreCheckpoint || record.preparation !== 'idle-wake')
            throw new HbarError('MAINTENANCE_INSPECTION_UNKNOWN', 'Maintenance activation checkpoint is missing')
          record.maintenanceRestoreReply = await this.maintenance.initializeIdleBeforeServing(
            record.peer,
            owner,
            record.maintenanceRestoreAck,
            record.maintenanceRestoreCheckpoint,
            signal,
          )
        }
        signal.throwIfAborted()
      },
      onState: (state) => {
        if (
          state.phase === 'serving' &&
          state.role === 'default' &&
          record.owner &&
          record.owner.incarnation === state.incarnation &&
          !record.deadlineRestorationAcknowledged
        ) {
          if (record.scheduleRestoreAck && record.controllerRestoreReply) {
            this.scheduleAlarms.activationRestored(
              record.owner,
              record.scheduleRestoreAck,
              record.controllerRestoreReply,
            )
            record.deadlineRestorationAcknowledged = true
          } else if (record.maintenanceRestoreAck && record.maintenanceRestoreReply) {
            this.maintenanceAlarms.activationRestored(
              record.owner,
              record.maintenanceRestoreAck,
              record.maintenanceRestoreReply,
            )
            record.deadlineRestorationAcknowledged = true
          }
        }
        changed()
        if (state.phase === 'serving' || state.phase === 'draining')
          this.transition(async () => {
            if (artifact.unitId === 'controller' && state.role === 'default') {
              await record.controller?.refreshCatalog()
              if (record.controller) this.controllerCatalog = record.controller.list()
              if (this.controllerStarted && !this.initializing) await this.resumeControllerBackground(record)
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
              if (
                record.process.snapshot().phase === 'serving' &&
                record.process.snapshot().role === 'default' &&
                record.owner &&
                this.manager.defaultOwner(artifact.unitId).incarnation === record.owner.incarnation
              )
                this.pluginCatalog.publish(
                  record.owner,
                  {
                    unitId: artifact.unitId,
                    generation: record.owner.generation,
                    artifactId: artifact.id,
                  },
                  record.pluginState,
                )
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
      onCallTimeout: (owner, childPid, event) => {
        this.emitProcessLifecycleDiagnostic({
          component: 'host',
          level: 'error',
          event: 'host.runtime_call_timeout',
          phase: event.phase,
          contextId: owner.unitId,
          requestId: owner.incarnation,
          callId: event.callId,
          method: event.method,
          durationMs: event.elapsedMs,
          instanceId: this.instanceId,
          processId: process.pid,
          childPid,
          errorCode: 'RUNTIME_CALL_TIMEOUT',
          outcome: 'failure',
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
        // Guarded retirement consumption owns final destruction after every reference settles.
        this.schedule()
      },
    })
    record = {
      artifact,
      process: managed,
      scheduleRestoreAck,
      maintenanceRestoreAck,
      maintenanceRestoreCheckpoint: inspection?.manifest.checkpoint ?? null,
      controllerRestoreReply: null,
      maintenanceRestoreReply: null,
      deadlineRestorationAcknowledged: false,
      sessionWakeRestoreAck,
      sessionWakeRestore: null,
      preparation: null,
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
  private pluginQuiescenceSource(): RuntimePluginQuiescenceSource {
    return {
      unitIds: this.buildUnits.filter((unit) => unit.descriptor.kind === 'plugin').map((unit) => unit.descriptor.id),
      units: () => this.manager.snapshot().units,
      metadataOwner: (unitId) =>
        this.pluginCatalog.metadata().find((value) => value.owner.unitId === unitId)?.owner ?? null,
      retired: (candidate) => {
        const receipt = this.manager.retirement(candidate)
        return (
          receipt.status === 'retired' &&
          receipt.ownerCleanupCompleted &&
          receipt.physical.nativeJoined &&
          receipt.physical.onExitCompleted &&
          !receipt.physical.forced &&
          receipt.physical.exitCode === 0 &&
          receipt.physical.cleanDisposeAck &&
          receipt.physical.owner.incarnation === candidate.incarnation
        )
      },
      probe: (candidate) => {
        const plugin = this.generations.get(key(candidate))
        if (!plugin?.owner || plugin.owner.incarnation !== candidate.incarnation)
          return Promise.reject(new HbarError('RUNTIME_OWNER_REVOKED', 'Plugin idle owner changed'))
        return plugin.process.idleSnapshot()
      },
      queuedRuns: () => {
        const count = this.storage.snapshot().queuedSessionCount
        return count === null || this.storageFailure ? null : count > 0
      },
    }
  }
  private attachKernel(record: Generation, peer: IpcPeer, owner: RuntimeOwner): void {
    record.cleanup.push(
      peer.register(
        'kernel.plugin.quiescence',
        procedure(z.undefined(), kernelPluginQuiescenceSchema, async () => {
          this.coordinator.assertCanRead(owner)
          if (
            record.owner?.incarnation !== owner.incarnation ||
            !record.peer ||
            !['serving', 'draining'].includes(record.process.snapshot().phase)
          )
            throw new HbarError('RUNTIME_OWNER_REVOKED', 'Only the captured Kernel can read idle authority')
          const proof = await readRuntimePluginQuiescence(this.pluginQuiescenceSource())
          this.coordinator.assertCanRead(owner)
          if (record.owner?.incarnation !== owner.incarnation)
            throw new HbarError('RUNTIME_OWNER_REVOKED', 'Kernel changed during idle proof')
          return proof
        }),
      ),
    )
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
        'kernel.delegation.wake',
        procedure(delegatedInputWakeSchema, z.undefined(), async (input) => {
          assertCommandCaller(input)
          const grant = await this.storage.call('delegatedInputRead', {
            sessionId: input.sessionId,
            requestId: input.requestId,
          })
          if (
            !grant ||
            grant.delegationId !== input.delegationId ||
            grant.sourceRunId !== input.runId ||
            grant.targetSessionId !== input.targetSessionId ||
            grant.targetRunId !== input.targetRunId ||
            grant.delivery !== 'dedicated' ||
            grant.status !== 'delivered'
          )
            throw new HbarError('DECISION_CONFLICT', 'The dedicated wake requires its original live source grant')
          assertCommandCaller(input)
          await this.wake(input.targetSessionId)
        }),
      ),
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
        'kernel.commands.clients',
        procedure(runtimeKernelCommandClientsSchema, clientCommandDirectorySchema, async (input, call) => {
          const source = assertCommandCaller(input)
          const execution = this.commandExecution
          if (!execution)
            throw new HbarError('COMMAND_TARGET_UNAVAILABLE', 'The Host listener has no client command directory')
          const result = await execution.clientDirectory(source, input.query, call.signal)
          assertCommandCaller(input)
          return result
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
        withClaimDependencies: (sessionId, signal, operation) =>
          this.withClaimDependencies(owner, sessionId, signal, operation),
        canAdmit: (sessionId) => {
          const admitted = this.canAdmit(sessionId)
          if (!admitted && !this.closing && !this.recoveryResponsibility.retryNotification(sessionId))
            this.deferredWakeups.defer(sessionId)
          return admitted
        },
        canIdle: (sessionId) => {
          if (!this.canWake(sessionId)) return false
          if (this.storage.snapshot().phase !== 'serving') return false
          if (this.pluginPreparingCatalog.size) return false
          if (this.generations.get(key(owner)) !== record) return false
          if (!record.owner) return false
          if (!this.sameStorageOwner(record.owner, owner)) return false
          if (record.process.snapshot().phase !== 'serving') return false
          const unit = this.manager.snapshot().units.find((candidate) => candidate.descriptor.id === owner.unitId)
          if (unit?.idle?.phase !== 'active') return false
          if (
            !unit.generations.some(
              (current) =>
                current.role === 'default' &&
                current.phase === 'serving' &&
                current.generation === owner.generation &&
                current.incarnation === owner.incarnation,
            )
          )
            return false
          if (!this.coordinator.canIdle(owner, sessionId)) return false
          this.recoveryResponsibility.acknowledgeIdle(sessionId, owner)
          return true
        },
        idleDenied: (sessionId) => {
          // This is a real Kernel drain notification, not a metadata poll. Catalog
          // publication schedules reconciliation, which flushes this existing queue.
          if (
            !this.pluginPreparingCatalog.size ||
            !this.canWake(sessionId) ||
            this.storage.snapshot().phase !== 'serving' ||
            this.generations.get(key(owner)) !== record ||
            !record.owner ||
            !this.sameStorageOwner(record.owner, owner) ||
            record.process.snapshot().phase !== 'serving'
          )
            return
          const unit = this.manager.snapshot().units.find((candidate) => candidate.descriptor.id === owner.unitId)
          if (
            unit?.idle?.phase !== 'active' ||
            !unit.generations.some(
              (current) =>
                current.role === 'default' &&
                current.phase === 'serving' &&
                current.generation === owner.generation &&
                current.incarnation === owner.incarnation,
            )
          )
            return
          if (!this.recoveryResponsibility.retryNotification(sessionId)) this.deferredWakeups.defer(sessionId)
        },
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
          if (owner && this.coordinator.role(owner) === 'default') this.kernelMetadata = state
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
    const installedOwner = { ...record.owner }
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
      owner: installedOwner,
      retire: () => record.process.dispose(),
      suspend: (operationId) => record.process.call('storage.suspend', { operationId }, z.undefined()),
      resume: (operationId) => record.process.call('storage.resume', { operationId }, z.undefined()),
      callPhysical: (method, args, authority, diagnostic) =>
        this.callStoragePhysical(record, installedOwner, method, args, authority, diagnostic),
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
  private sameStorageOwner(left: RuntimeOwner, right: RuntimeOwner): boolean {
    return (
      left.unitId === right.unitId && left.generation === right.generation && left.incarnation === right.incarnation
    )
  }
  private releaseExecutionProjection(lease: ExecutionOwnership): Promise<void> {
    const snapshot = this.storage.snapshot()
    // Coordinator has validated the original lease before calling persistence.release.
    // Closing admits only that release against its already-serving writer; it cannot start one.
    return this.closing && !this.storageFailure && snapshot.phase === 'serving' && snapshot.owner
      ? this.releaseStorageOwner.run({ ...snapshot.owner }, () => this.storage.call('runtimeExecutionRelease', lease))
      : this.storage.call('runtimeExecutionRelease', lease)
  }
  private async acquireStorageDemand(): Promise<StorageDemandLease> {
    const captured = this.releaseStorageOwner.getStore()
    if (this.closing && captured) {
      const snapshot = this.storage.snapshot()
      if (
        this.storageFailure ||
        snapshot.phase !== 'serving' ||
        !snapshot.owner ||
        !this.sameStorageOwner(snapshot.owner, captured)
      )
        throw new HbarError('STORAGE_DEMAND_OWNER_CHANGED', 'Execution release lost its exact closing writer')
      const pin = this.manager.tryPinServingOwners([captured])
      if (!pin) throw new HbarError('RUNTIME_STOPPING', 'Execution release writer is no longer serving')
      return { owner: { ...captured }, release: () => pin.release() }
    }
    const signal = AbortSignal.any([this.sourceAbort.signal, AbortSignal.timeout(5_000)])
    // Explicit bootstrap borrows only already-serving owners, never starts a replacement.
    // It is not a catch/fallback for a failed normal acquire.
    const hold = await (this.initializing
      ? this.demand.acquireBootstrap(['storage'], signal)
      : this.demand.acquire(['storage'], signal))
    const owner = hold.owners.find((value) => value.unitId === 'storage')
    const beforeInstall = this.storage.snapshot()
    if (
      owner &&
      beforeInstall.phase === 'waiting' &&
      beforeInstall.owner === null &&
      !this.storageFailure &&
      !this.storageIdleCheckpoint
    ) {
      // Manager readiness publishes the exact serving process before the Host's
      // serialized onState observer necessarily installs its StableStorage writer.
      // Complete that local installation under this existing demand hold; never
      // reopen a fenced/unknown writer or dispatch a Storage request to repair it.
      const record = this.generations.get(key(owner))
      if (record?.owner && this.sameStorageOwner(record.owner, owner)) {
        try {
          this.assertDemandOwners([owner])
          await this.installStorage(record)
        } catch (error) {
          this.storageUnknownDemands.add(hold)
          throw error
        }
      }
    }
    const installed = this.storage.snapshot()
    if (!owner || installed.phase !== 'serving' || !installed.owner || !this.sameStorageOwner(owner, installed.owner)) {
      this.storageUnknownDemands.add(hold)
      this.storage.fence('STORAGE_DEMAND_OWNER_CHANGED')
      throw new HbarError('STORAGE_DEMAND_OWNER_CHANGED', 'Storage demand ownership requires reconciliation')
    }
    return { owner: { ...owner }, release: () => hold.release() }
  }
  private callStoragePhysical<K extends keyof StorageMethods>(
    record: Generation,
    expectedOwner: RuntimeOwner,
    method: K,
    args: Parameters<StorageMethods[K]>,
    authority?: ExecutionOwnership,
    diagnostic?: import('@hbar/contracts').ReadonlyDiagnosticCorrelation,
  ): StoragePhysicalCall<ReturnType<StorageMethods[K]>> {
    const owner = record.owner
    if (
      !owner ||
      !this.sameStorageOwner(owner, expectedOwner) ||
      !this.sameStorageOwner(record.process.owner(), expectedOwner)
    ) {
      // The old writer closure must never dispatch through a recovered incarnation.
      return {
        result: Promise.reject(new HbarError('STORAGE_WRITER_UNAVAILABLE', 'Storage owner is unavailable')),
        settled: Promise.resolve({ owner: { ...expectedOwner }, kind: 'not-dispatched' }),
      }
    }
    const exact = { ...owner }
    if (this.storagePhysical.size >= 1_024)
      return {
        result: Promise.reject(new HbarError('STORAGE_CAPACITY', 'Storage physical ledger is full')),
        settled: Promise.resolve({ owner: exact, kind: 'not-dispatched' }),
      }
    let resolvePhysical: (value: StoragePhysicalSettlement) => void = () => {
      throw new HbarError('STORAGE_PHYSICAL_PROOF_REQUIRED', 'Storage physical ledger was not initialized')
    }
    const settled = new Promise<StoragePhysicalSettlement>((resolve) => {
      resolvePhysical = resolve
    })
    let complete = false
    const entry = {
      owner: exact,
      settle: (kind: StoragePhysicalSettlement['kind']): void => {
        if (complete) return
        complete = true
        this.storagePhysical.delete(entry)
        resolvePhysical({ owner: exact, kind })
      },
    }
    this.storagePhysical.add(entry)
    // Schema validation happens before ManagedProcess/IpcPeer. Failure here is an actual
    // local no-dispatch boundary. A later catch never guesses that a send did not happen.
    try {
      storageRpcInput(method, args, authority)
    } catch (error) {
      entry.settle('not-dispatched')
      return { result: Promise.reject(error), settled }
    }
    const result = callStorageRpc(
      {
        execute: (input) =>
          record.process.call('storage.call', { ...input, ...(diagnostic ? { diagnostic } : {}) }, z.unknown(), {
            // IpcPeer invokes this for reply or a proven pre-send cancellation/rejection only.
            // Timeout/cancel of a sent operation leaves this physical promise pending.
            onDispatchSettled: (event) => entry.settle(event),
          }),
      },
      method,
      args,
      authority,
    )
    return { result, settled }
  }
  private storageOwnerPhysicallyExited(receipt: RuntimePhysicalRetirementReceipt): void {
    if (receipt.owner.unitId !== 'storage' || !receipt.nativeJoined || !receipt.onExitCompleted) return
    for (const entry of this.storagePhysical) {
      if (this.sameStorageOwner(entry.owner, receipt.owner)) entry.settle('owner-exited')
    }
    // Physical absence is not the original write receipt. StableStoragePort remains
    // fenced on unknown writes, even after releasing the completed physical demand.
  }
  private async fault(owner: RuntimeOwner, reason: string): Promise<void> {
    this.recoveryResponsibility.notificationOwnerFailed(owner)
    const candidate = this.coordinator.role(owner) === 'candidate'
    // A never-activated candidate belongs to Manager's preparation/cleanup gate.
    // It has never supplied a default owner to the adopted demand lifecycle.
    if (!candidate) this.demand.fence(owner)
    if (owner.unitId === 'node-link') this.nodeLink.faulted(owner)
    if (this.closing || candidate) return
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
  /** All existing consumers must finish or independently retain exact native proof before Process ACK. */
  private canConsumeRetirementReceipt(owner: RuntimeOwner): boolean {
    if (this.sessionWakeCheckpointDemands.has(owner.incarnation)) return false
    if (this.recoveryResponsibility.hasPhysicalOwner(owner)) return false
    if (this.interrupted.has(owner.incarnation) || this.summaryDemandHolds.has(owner.incarnation)) return false
    if (this.owners.has(owner.incarnation)) {
      const refs = this.coordinator.references(owner)
      if (refs.runs || refs.tools || refs.resources) return false
    }
    const uses = (versions: ExecutionOwnership['versions']): boolean =>
      [versions.kernel, versions.driver, ...versions.plugins, ...versions.hooks].some(
        (version) => version.unitId === owner.unitId && version.generation === owner.generation,
      )
    if (
      [...this.leases.values()].some((lease) => uses(lease.versions)) ||
      [...this.pendingClaims.values()].some((pending) => uses(pending.draft.versions))
    )
      return false
    if (
      [...this.storagePhysical].some((entry) => this.sameStorageOwner(entry.owner, owner)) ||
      [...this.storageUnknownDemands].some((hold) => hold.owners.some((value) => this.sameStorageOwner(value, owner)))
    )
      return false
    const pending = this.sessionWakeAlarms.pendingPhysicalAttempt()?.owner
    const maintenance = this.maintenanceAlarms.peek().physicalOwner
    const controller = this.scheduleAlarms.peek().physicalOwner
    if ([pending, maintenance, controller].some((value) => value && this.sameStorageOwner(value, owner))) return false
    if (this.sessionWakeIdleTransfer?.owner.incarnation === owner.incarnation && this.sessionWakeIdleTransfer.process)
      return false
    if (this.maintenanceIdleTransfer?.owner.incarnation === owner.incarnation && this.maintenanceIdleTransfer.process)
      return false
    if (this.controllerIdleTransfer?.owner.incarnation === owner.incarnation && this.controllerIdleTransfer.process)
      return false
    if (
      this.storageIdleCheckpoint?.owner.incarnation === owner.incarnation ||
      this.storageFailure?.owner.incarnation === owner.incarnation
    )
      return false
    return true
  }
  private consumeRetirementReceipts(): Promise<void> {
    return this.retirementConsumption.reconcile((generation, owner) =>
      this.manager.consumeRetirementReceipt(generation, owner),
    )
  }
  private async reconcileBootstrapFaultRetirements(): Promise<void> {
    // Cold startup has not admitted business execution. Clear only empty old-owner
    // bookkeeping after its exact physical exit; accepted/UNKNOWN work stays held.
    for (const [incarnation, failure] of this.interrupted) {
      if (!failure.exited || failure.leases.length || failure.owner.unitId === 'storage') continue
      const record = this.generations.get(key(failure.owner))
      const physical =
        this.retirementConsumption.physicalReceipt(failure.owner) ?? record?.process.retirementReceipt(failure.owner)
      const retained = this.manager.retirement(failure.owner)
      const physicallyRetired =
        physical &&
        this.sameStorageOwner(physical.owner, failure.owner) &&
        physical.nativeJoined &&
        physical.onExitCompleted
      if (
        !physicallyRetired &&
        !(retained.status === 'retired' && this.sameStorageOwner(retained.owner, failure.owner))
      )
        continue
      if (this.owners.has(incarnation)) {
        const references = this.coordinator.references(failure.owner)
        if (references.runs || references.tools || references.resources) continue
        this.coordinator.disposeOwner(failure.owner)
        this.owners.delete(incarnation)
      }
      this.interrupted.delete(incarnation)
    }
    await this.consumeRetirementReceipts()
    await this.demand.reconcileRetirements()
    await this.consumeRetirementReceipts()
  }
  private async reconcile(): Promise<void> {
    if (this.initializing || this.closing) return
    // Receipt reconciliation is metadata-only: it cannot wake a sleeping child.
    this.recoveryResponsibility.reconcilePhysical()
    this.reconcileDeadlinePhysicalOwners()
    await this.demand.reconcileRetirements()
    await this.consumeRetirementReceipts()
    this.recoveryResponsibility.refreshAdmissions()
    const maintenance = this.manager.snapshot().units.find((unit) => unit.descriptor.id === 'maintenance')
    if (
      maintenance?.generations.some((generation) => generation.role === 'default' && generation.phase === 'serving')
    ) {
      try {
        await this.maintenance.reconcile()
      } catch (error) {
        if (['serving', 'draining'].includes(this.currentGeneration('maintenance').process.snapshot().phase))
          throw error
      }
    }
    // Remembered scheduling notifications are actual demand. They must be able to
    // wake a clean sleeping dependency closure before executionReady can be true.
    await this.deferredWakeups.flush(
      (sessionId) => this.demand.admissionReady() && this.canWake(sessionId),
      (sessionId) => this.wake(sessionId),
      this.sourceAbort.signal,
    )
    await this.recoveryResponsibility.flush(
      (sessionId) => this.demand.admissionReady() && this.canWake(sessionId),
      (sessionId) => this.recoveryNotification(sessionId),
    )
    await this.flushCapacityWakeups()
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
        if (pending) {
          if (!(await this.reconcileClaim(pending.draft, kernel))) continue
        } else {
          if (!(await this.recoveryResponsibility.recover(lease, true, this.recoveryDispatch(kernel, lease.runId))))
            continue
          await this.recoveryResponsibility.replay(lease, () => this.replay(lease.sessionId))
          this.leases.delete(lease.runId)
          this.stopped.delete(lease.runId)
          this.recoveryResponsibility.notify(lease)
        }
        // A Kernel and a captured dependency can fail for the same Run. The
        // authority reconciliation above verifies ALL interrupted owners exited
        // and physical resources released; recovery/replay must succeed before
        // retiring every duplicate bookkeeping reference to that one outcome.
        for (const interruption of this.interrupted.values()) {
          const index = interruption.leases.findIndex((value) => value.runId === lease.runId)
          if (index >= 0) interruption.leases.splice(index, 1)
        }
        this.recoveryResponsibility.notify(lease)
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
    await this.consumeRetirementReceipts()
    this.recoveryResponsibility.refreshAdmissions()
    await this.refreshKernels()
    await this.resume()
    this.humanWaits.refreshPending()
  }
  private async reconcileClaim(draft: ExecutionOwnership, kernel: RuntimeKernelEndpoint): Promise<boolean> {
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
    if (
      !(await this.recoveryResponsibility.recover(
        draft,
        run.status !== 'queued',
        this.recoveryDispatch(kernel, draft.runId),
      ))
    )
      return false
    await this.recoveryResponsibility.replay(draft, () => this.replay(draft.sessionId))
    this.leases.delete(draft.runId)
    this.pendingClaims.delete(draft.runId)
    for (const hold of this.claimDemandHolds.get(draft.runId) ?? []) hold.release()
    this.claimDemandHolds.delete(draft.runId)
    this.stopped.delete(draft.runId)
    this.recoveryResponsibility.notify(draft)
    return true
  }
  private recoveryDispatch(kernel: RuntimeKernelEndpoint, runId: string): RecoveryDispatchStart {
    return (settled) => {
      const record = this.generations.get(key(kernel.owner))
      const pin = this.manager.tryPinServingOwners([kernel.owner])
      if (!pin) throw new HbarError('RUNTIME_RECOVERING', 'Recovery needs the exact serving Kernel')
      try {
        if (
          !record?.peer ||
          !record.owner ||
          !this.sameStorageOwner(record.owner, kernel.owner) ||
          record.process.snapshot().phase !== 'serving'
        )
          throw new HbarError('RUNTIME_RECOVERING', 'Recovery Kernel peer changed before dispatch')
        const ticket = record.peer.callTracked('kernel.recover', { runIds: [runId] }, runtimeKernelRecoverySchema, {
          timeoutMs: 120_000,
          signal: this.sourceAbort.signal,
          onDispatchSettled: settled,
        })
        return {
          owner: kernel.owner,
          result: ticket.result,
          settled: ticket.settled,
          release: () => pin.release(),
          exited: () => {
            const receipt = record.process.retirementReceipt(kernel.owner)
            return receipt?.nativeJoined === true && receipt.onExitCompleted
          },
        }
      } catch (error) {
        pin.release()
        throw error
      }
    }
  }
  private recoveryNotification(sessionId: string): RecoveryDispatchStart {
    return async (settled, captureOwner): Promise<RecoveryDispatch> => {
      const hold = await this.demand.acquire(['kernel'], this.sourceAbort.signal)
      try {
        this.assertDemandOwners(hold.owners)
        if (!this.canWake(sessionId) || this.storage.snapshot().phase !== 'serving' || this.pluginPreparingCatalog.size)
          throw new HbarError('RUNTIME_RECOVERING', 'Recovery notification admission is not ready')
        const owner = hold.owners.find((value) => value.unitId === 'kernel')
        if (!owner) throw new HbarError('RUNTIME_OWNER_REVOKED', 'Recovery notification has no Kernel')
        await this.restoreSessionWakeOwner(owner, this.sourceAbort.signal)
        this.assertDemandOwners(hold.owners)
        const record = this.generations.get(key(owner))
        if (
          !record?.peer ||
          !record.owner ||
          !this.sameStorageOwner(record.owner, owner) ||
          record.process.snapshot().phase !== 'serving'
        )
          throw new HbarError('RUNTIME_RECOVERING', 'Notification Kernel peer changed before dispatch')
        captureOwner(owner)
        const ticket = record.peer.callTracked('kernel.wake', { sessionId }, z.undefined(), {
          signal: this.sourceAbort.signal,
          onDispatchSettled: settled,
        })
        return {
          owner,
          result: ticket.result,
          settled: ticket.settled,
          release: () => hold.release(),
          exited: () => {
            const receipt = record.process.retirementReceipt(owner)
            return receipt?.nativeJoined === true && receipt.onExitCompleted
          },
        }
      } catch (error) {
        hold.release()
        throw error
      }
    }
  }
  private async reconcileWorkflowPending(): Promise<void> {
    if (!this.buildUnits.some((unit) => unit.descriptor.id === 'plugin.workflow')) return
    const endpoint = this.pluginEndpoint('plugin.workflow')
    const assertAuthority = (sessionId: string) => {
      if (!this.workflowRecoveryAdmission || this.closing || this.initializing || !this.kernelRecoveryReady())
        throw new HbarError('WORKFLOW_RECOVERY_AUTHORITY', 'Workflow startup recovery authority has ended')
      if (this.manager.defaultOwner('plugin.workflow').incarnation !== endpoint.owner.incarnation)
        throw new HbarError('WORKFLOW_RECOVERY_AUTHORITY', 'Workflow recovery owner changed')
      this.coordinator.assertCanWrite(endpoint.owner)
      if (
        !this.coordinator.canIdle(this.currentKernel().owner, sessionId) ||
        this.resources.sessions().includes(sessionId) ||
        [...this.pendingClaims.values()].some((claim) => claim.draft.sessionId === sessionId) ||
        [...this.leases.values()].some((lease) => lease.sessionId === sessionId) ||
        [...this.interrupted.values()].some((failure) => failure.leases.some((lease) => lease.sessionId === sessionId))
      )
        throw new HbarError('WORKFLOW_RECOVERY_ACTIVE', 'Workflow Session still has execution ownership')
    }
    const diagnostic = (
      sessionId: string,
      outcome: 'success' | 'skipped',
      errorCode:
        | 'WORKFLOW_RECOVERY_RECONCILED'
        | 'WORKFLOW_RECOVERY_ACTIVE'
        | 'WORKFLOW_RECOVERY_OWNED'
        | 'WORKFLOW_RECOVERY_CONFLICT',
    ) =>
      this.emitProcessLifecycleDiagnostic({
        component: 'host',
        level: outcome === 'success' ? 'info' : 'warn',
        event: 'host.runtime_workflow_recovery',
        phase: `generation.${endpoint.owner.generation}`,
        contextId: endpoint.owner.unitId,
        requestId: endpoint.owner.incarnation,
        instanceId: this.instanceId,
        processId: process.pid,
        sessionId,
        errorCode,
        outcome,
      })
    let after = ''
    for (let page = 0; page < 1_000; page++) {
      const result = workflowRecoveryPageSchema.parse(
        await endpoint.application.call('workflowRecovery', ['list', after]),
      )
      for (const sessionId of result.sessionIds) {
        try {
          assertAuthority(sessionId)
          await endpoint.application.call('workflowRecovery', [
            'recover',
            sessionId,
            async (input: unknown) => {
              await commitRuntimeWorkflowRecovery({ storage: this.storage, sessionId, input, assertAuthority })
            },
          ])
          diagnostic(sessionId, 'success', 'WORKFLOW_RECOVERY_RECONCILED')
        } catch (error) {
          if (
            !(error instanceof HbarError) ||
            !['WORKFLOW_RECOVERY_ACTIVE', 'WORKFLOW_RECOVERY_OWNED', 'WORKFLOW_RECOVERY_CONFLICT'].includes(error.code)
          )
            throw error
          const code =
            error.code === 'WORKFLOW_RECOVERY_ACTIVE'
              ? 'WORKFLOW_RECOVERY_ACTIVE'
              : error.code === 'WORKFLOW_RECOVERY_OWNED'
                ? 'WORKFLOW_RECOVERY_OWNED'
                : 'WORKFLOW_RECOVERY_CONFLICT'
          diagnostic(sessionId, 'skipped', code)
          // Unsafe/unreleased historical work remains pending; startup must not counterfeit settlement.
        }
      }
      if (result.nextAfter === null) return
      if (result.nextAfter <= after)
        throw new HbarError('WORKFLOW_RECOVERY_CURSOR', 'Workflow recovery cursor did not advance')
      after = result.nextAfter
    }
    throw new HbarError('WORKFLOW_RECOVERY_CAPACITY', 'Workflow recovery exceeded its bounded Session scan')
  }
  private async resume(): Promise<void> {
    if (this.closing || this.initializing || !this.kernelRecoveryReady() || this.storage.snapshot().phase !== 'serving')
      return
    const kernel = this.currentKernel()
    if (this.resumed.has(kernel.owner.incarnation) && !this.settingsScheduling.pending()) return
    if (this.settingsScheduling.pending()) {
      await this.demand.withUnits(['kernel'], this.sourceAbort.signal, async (owners) => {
        this.assertDemandOwners(owners)
        if (!owners.some((owner) => this.sameStorageOwner(owner, kernel.owner)))
          throw new HbarError('RUNTIME_OWNER_REVOKED', 'Settings resume changed Kernel owner')
        await this.consumeSettingsScheduling(kernel.owner, this.sourceAbort.signal)
      })
      return
    }
    await this.refreshExecutionCapacity()
    await this.restoreSessionWakeOwner(kernel.owner, this.sourceAbort.signal)
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
        if (!this.canWake(sessionId)) continue
        await this.demand.withUnits(['kernel'], this.sourceAbort.signal, async (owners) => {
          this.assertDemandOwners(owners)
          if (!this.canWake(sessionId)) return
          const kernel = owners.find((owner) => owner.unitId === 'kernel')
          if (!kernel) throw new HbarError('RUNTIME_OWNER_REVOKED', 'Capacity demand lacks its Kernel')
          await this.restoreSessionWakeOwner(kernel, this.sourceAbort.signal)
          await this.consumeSettingsScheduling(kernel, this.sourceAbort.signal)
          const next = await this.storage.call('nextQueuedRun', sessionId)
          this.assertDemandOwners(owners)
          if (next?.id !== runId) {
            this.coordinator.releaseQueuedSession(sessionId, runId)
            if (!next) return
          }
          // Inspect the durable queue only; final claim still owns full dependency admission.
          await this.wake(sessionId)
        })
      } catch (error) {
        console.error(
          '[hbar runtime] capacity wake deferred',
          runtimeDomainError(error)?.code ?? 'CAPACITY_WAKE_FAILED',
        )
        return
      }
    }
  }
  private refreshSettingsScheduling(): void {
    this.settingsScheduling.request()
    if (!this.closing && !this.initializing) this.schedule()
  }
  private consumeSettingsScheduling(owner: RuntimeOwner, signal: AbortSignal): Promise<void> {
    return this.settingsScheduling.consume(owner, signal, async (captured, admission) => {
      admission.throwIfAborted()
      this.assertDemandOwners([captured])
      await this.refreshExecutionCapacity()
      admission.throwIfAborted()
      this.assertDemandOwners([captured])
      const record = this.generations.get(key(captured))
      if (!record || !record.owner || !this.sameStorageOwner(record.owner, captured))
        throw new HbarError('RUNTIME_OWNER_REVOKED', 'Settings refresh lost its exact Kernel')
      await this.restoreSessionWakeOwner(captured, admission)
      await record.process.call('kernel.resume', undefined, z.undefined(), { signal: admission, timeoutMs: 120_000 })
      // The exact physical ACK is a known completion even if cancellation/retirement races its reply.
      this.resumed.add(captured.incarnation)
    })
  }
  private async wake(sessionId: string): Promise<void> {
    if (!this.canWake(sessionId)) {
      if (!this.closing) this.deferredWakeups.defer(sessionId)
      return
    }
    await this.demand.withUnits(['kernel'], this.sourceAbort.signal, async (owners) => {
      this.assertDemandOwners(owners)
      // Wake requests a claim attempt. Dependency holds and final canAdmit
      // still precede version selection and durable execution ownership.
      if (
        !this.canWake(sessionId) ||
        this.storage.snapshot().phase !== 'serving' ||
        this.pluginPreparingCatalog.size > 0
      ) {
        if (!this.closing) this.deferredWakeups.defer(sessionId)
        return
      }
      const kernel = this.currentKernel()
      await this.restoreSessionWakeOwner(kernel.owner, this.sourceAbort.signal)
      await kernel.process.call('kernel.wake', { sessionId }, z.undefined())
    })
  }
  private async handoff(lease: ExecutionOwnership): Promise<void> {
    if (!this.closing) {
      try {
        await this.replay(lease.sessionId)
        if (!this.closing) {
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
        }
      } catch (error) {
        if (!this.closing) throw error
      }
    }
    // Only the durable release ACK reaches this callback. Closing retains that
    // known completion without opening another replay, refresh, or wake operation.
    this.leases.delete(lease.runId)
    this.recoveryResponsibility.finish(lease.runId)
    if (this.closing) return
    this.schedule()
    await this.wake(lease.sessionId)
  }
  private async resolveKernel(
    target: string,
    method: string,
    args: readonly unknown[],
    captured?: RuntimeKernelEndpoint,
  ): Promise<RuntimeKernelEndpoint> {
    return (await this.boundKernel(target, method, args, captured)) ?? this.currentKernel()
  }
  private async withKernelCall<Result>(
    target: string,
    method: string,
    args: readonly unknown[],
    captured: RuntimeKernelEndpoint | undefined,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const bound = await this.boundKernel(target, method, args, captured)
    if (bound) return this.facade.pin(bound, operation)
    const signal = AbortSignal.any([
      this.sourceAbort.signal,
      AbortSignal.timeout(120_000),
      ...args.filter((value): value is AbortSignal => value instanceof AbortSignal),
    ])
    if (this.initializing) {
      const bootstrap = await this.demand.acquireBootstrap(['kernel'], signal)
      try {
        signal.throwIfAborted()
        this.assertDemandOwners(bootstrap.owners)
        const kernel = bootstrap.owners.find((owner) => owner.unitId === 'kernel')
        if (!kernel) throw new HbarError('RUNTIME_OWNER_REVOKED', 'Bootstrap demand lacks its Kernel owner')
        const record = this.generations.get(key(kernel))
        const endpoint = record ? this.endpoint(record) : null
        if (!endpoint || !this.sameStorageOwner(endpoint.owner, kernel))
          throw new HbarError('RUNTIME_OWNER_REVOKED', 'Bootstrap Kernel endpoint changed before dispatch')
        await this.restoreSessionWakeOwner(kernel, signal)
        signal.throwIfAborted()
        this.assertDemandOwners(bootstrap.owners)
        await this.consumeSettingsScheduling(kernel, signal)
        return await this.facade.pin(endpoint, operation)
      } finally {
        bootstrap.release()
      }
    }
    return this.demand.withUnits(['kernel'], signal, async (owners) => {
      signal.throwIfAborted()
      this.assertDemandOwners(owners)
      const kernel = owners.find((owner) => owner.unitId === 'kernel')
      if (!kernel) throw new HbarError('RUNTIME_OWNER_REVOKED', 'Foreground demand lacks its Kernel owner')
      const record = this.generations.get(key(kernel))
      const endpoint = record ? this.endpoint(record) : null
      if (!endpoint || !this.sameStorageOwner(endpoint.owner, kernel))
        throw new HbarError('RUNTIME_OWNER_REVOKED', 'Foreground Kernel endpoint changed before dispatch')
      await this.restoreSessionWakeOwner(kernel, signal)
      signal.throwIfAborted()
      this.assertDemandOwners(owners)
      await this.consumeSettingsScheduling(kernel, signal)
      return this.facade.pin(endpoint, operation)
    })
  }
  private async boundKernel(
    target: string,
    method: string,
    args: readonly unknown[],
    captured?: RuntimeKernelEndpoint,
  ): Promise<RuntimeKernelEndpoint | null> {
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
    return captured ?? null
  }
  private async cancelRun(runId: string): Promise<void> {
    const result = await this.storage.call('runtimeRecoveryCancel', runId)
    for (const event of result.events) this.facade.replay({ method: 'session.event', params: event })
    const targets = result.targets ?? [result.run]
    const active = targets.flatMap((run) => {
      const lease = this.coordinator.execution(run.id)
      if (!lease && run.status === 'cancelled') this.coordinator.releaseQueuedSession(run.sessionId, run.id)
      const endpoint = lease
        ? this.endpoints().find((value) => value.owner.incarnation === lease.owner.incarnation)
        : null
      return endpoint ? [{ endpoint, run }] : []
    })
    if (
      !active.length &&
      result.run.status === 'failed' &&
      result.events.some((event) => event.type === 'run.cancelRequested' && event.runId === result.run.id)
    )
      active.push({ endpoint: this.currentKernel(), run: result.run })
    for (const { endpoint, run } of active)
      if (['serving', 'draining'].includes(endpoint.process.snapshot().phase)) {
        try {
          await endpoint.process.call('kernel.cancel', { runId: run.id, persisted: true }, z.undefined())
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
