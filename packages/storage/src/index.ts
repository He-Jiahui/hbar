import {
  HbarError,
  type DiagnosticSink,
  type DiagnosticScopePort,
  type ReadonlyDiagnosticCorrelation,
} from '@hbar/contracts'
import { Worker } from 'node:worker_threads'
import type { StorageMethods } from './types.ts'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import { storageRpcCallSchema } from './rpc'
export { readChatDatabaseActiveJournalProof, chatDatabaseActiveJournalProofSchema } from './chat-database-active-proof'
export type { ChatDatabaseActiveJournalProof } from './chat-database-active-proof'
import { z } from 'zod'
import { STORAGE_SCHEMA_VERSION } from './rpc-catalog'
import { buildActivatedStorageCatalog, storageActivatedCatalogSchema, type StorageActivatedCatalog } from './activated-catalog'
export { buildActivatedStorageCatalog, storageSourceDatabaseId, storageActivatedCatalogSchema } from './activated-catalog'
export type { StorageActivatedCatalog } from './activated-catalog'
export type { RuntimeRecoveryRecord, RuntimeRecoveryScope, RuntimeManualRecovery } from './runtime-state'
export type {
  NodeExecutionIntentIdentity,
  NodeExecutionIntentPage,
  NodeExecutionIntentPageInput,
  NodeExecutionIntentRecord,
  NodeExecutionIntentSettlementInput,
  NodeExecutionIntentSettlementReceipt,
  NodeExecutionIntentSettlementResult,
} from './node-execution-intents'
export type { NodeRunWorktreeAdmission, NodeRunWorktreeBindInput, NodeRunWorktreeBinding } from './node-run-worktrees'
export type { NodeRunWorkspaceMount, NodeRunWorkspaceMountBindInput } from './node-run-workspace-mounts'
export { runtimeRecoveryRecordSchema, runtimeManualRecoverySchema } from './runtime-state'
export { StableStoragePort } from './stable-port'
export type { ManagedStorageWriter, StableStorageSnapshot } from './stable-port'
export { scheduleIdleCheckpointInputSchema, scheduleIdleCheckpointSchema } from './schedule-idle-checkpoint'
export type { ScheduleIdleCheckpointInput, ScheduleIdleCheckpoint } from './schedule-idle-checkpoint'
export { searchIdleCheckpointSchema } from './search-idle-checkpoint'
export type { SearchIdleCheckpoint } from './search-idle-checkpoint'
export { storageRpcCallSchema, storageRpcInput, callStorageRpc } from './rpc'
export type { StorageRpcCall, StorageRpcPort } from './rpc'
export { STORAGE_RPC_METHODS, STORAGE_RPC_FINGERPRINT, STORAGE_SCHEMA_VERSION } from './rpc-catalog'
import type { StorageWorkerMessage } from './types.ts'
import { createStorageRequestDiagnostics } from './request-diagnostics.ts'
export type {
  CreateSessionCommandInput,
  ForkSessionCommandInput,
  ForkFromMessageCommandInput,
  ForkFromMessageReceiptInput,
  ForkableMessagesInput,
  ForkableMessagesResult,
  SettingsCommitInput,
  SettingsCommitReceipt,
  StoredSettingsLayer,
  StorageMethods,
  WorkspaceOrganizationMutationInput,
  WorkspaceDisplayNamesMutationInput,
  SessionLaunchTargetMutationInput,
  SessionLaunchTargetReceiptLookup,
  SessionLaunchTargetPreparationInput,
  SessionLaunchTargetPreparationUpdate,
  SessionLaunchTargetBindingInput,
  SessionLaunchTargetBinding,
  SessionLaunchTargetResolutionRecord,
  SessionLaunchTargetRuntimeSnapshot,
  SessionLaunchTargetPreparationStartMutationInput,
  SessionLaunchTargetPreparationOperationRecord,
  SessionLaunchTargetPreparationOperationTransitionInput,
  GuideQueuedRunMutationInput,
  GuideQueuedRunResult,
} from './types.ts'
export * from './path-layout.ts'
export * from './storage-locations.ts'
export { createChatDatabaseFileScanner, emptyChatDatabaseDiskUsage } from './chat-database-files'
export type { ChatDatabaseDeleteInput, ChatDatabaseDeleteResult } from './chat-database-deletion'
export type {
  ChatDatabaseCandidateCursor,
  ChatDatabaseCandidatePage,
  ChatDatabaseOperationPatch,
} from './chat-database-journal'
export type { ChatDatabaseTaskRuntime } from './chat-database-tasks'
export type { ChatDatabaseFilesPort, ChatDatabaseFileReferences } from './chat-database-files'
export type {
  ChatDatabaseArtifactUploadReservation,
  ChatDatabaseArtifactClaimResult,
  ChatDatabaseArtifactReclaim,
} from './chat-database-artifacts'
export { createChatDatabaseResourceScanner } from './chat-database-resource-scanner'
export type { ChatDatabaseResourceScanInput } from './chat-database-resource-scanner'
export type { ChatDatabaseResourceResult } from './chat-database-resource-ledger'
export { createChatDatabaseMaintenanceWorker } from './chat-database-maintenance-worker'
export type { ChatDatabaseMaintenanceWorkerPort, ChatDatabaseWriterHandover } from './chat-database-maintenance-worker'
export type { ChatDatabaseVacuumRecord } from './chat-database-vacuum-record'
export { chatDatabaseVacuumRecordSchema, createChatDatabaseVacuumRecords } from './chat-database-vacuum-record'
export * from './session-log-writer.ts'
export * from './session-log-recovery.ts'
export * from './project-registry.ts'
export type {
  SessionBranchExecutionRoot,
  SessionBranchTargetIntent,
  SessionBranchTargetIdentity,
  SessionBranchTargetRecord,
} from './session-branch-target'
import type { PathLayout } from './path-layout.ts'
export interface StoragePort {
  call<K extends keyof StorageMethods>(
    method: K,
    ...args: Parameters<StorageMethods[K]>
  ): Promise<ReturnType<StorageMethods[K]>>
  close(): Promise<void>
  /** Observe an unrecoverable worker failure. Normal close never emits this event. */
  onFatal?(listener: StorageFatalListener): () => void
}

export type StorageFatalKind = 'timeout' | 'worker-error' | 'worker-exit' | 'outcome-unknown'

export interface StorageFatalEvent {
  readonly kind: StorageFatalKind
  readonly code: string
  readonly message: string
  readonly method?: string
  readonly storageRequestId?: number
  readonly pendingCount?: number
  readonly workerState?: 'failed' | 'closed'
  readonly outcome?: 'failure' | 'unknown'
  readonly durationMs?: number
  readonly occurredAt: number
}

export type StorageFatalListener = (event: StorageFatalEvent) => void

export interface StorageLifecycleOptions {
  /** Construct the actual Worker without acquiring production write authority. */
  readonly preflight?: boolean
  readonly workerPath?: string
  readonly requestTimeoutMs?: number
  readonly closeTimeoutMs?: number
  /** Fatal Worker failure belongs to its managed owner; unknown calls are never replayed here. */
  readonly onFatal?: (error: HbarError, event: StorageFatalEvent) => void
  readonly maxPendingRequests?: number
  readonly diagnostics?: DiagnosticSink
  readonly diagnosticScope?: DiagnosticScopePort
  readonly diagnosticsEnabled?: boolean
  readonly diagnosticsFullCoverage?: boolean
  readonly instanceId?: string
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void
  readonly reject: (error: Error) => void
  readonly timer: ReturnType<typeof setTimeout>
  readonly startedAt: number
  readonly method: string
  readonly correlation?: ReadonlyDiagnosticCorrelation
}

function timeoutOption(value: number | undefined, fallback: number): number {
  const timeout = value ?? fallback
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2_147_483_647)
    throw new RangeError('Storage timeout must be a positive timer-safe integer')
  return timeout
}

export class Storage {
  private worker: Worker
  private exited: Promise<void>
  private nextId = 0
  private pending = new Map<number, PendingRequest>()
  private stopped = false
  private catalog: StorageActivatedCatalog | null = null
  private closing: Promise<void> | null = null
  private cleanCloseAcknowledged = false
  private closeWorkerError = false
  private terminating: Promise<void> | null = null
  private fatalNotified = false
  private fatalListeners = new Set<StorageFatalListener>()
  private readonly requestTimeoutMs: number
  private readonly closeTimeoutMs: number
  private readonly notifyFatalError: ((error: HbarError, event: StorageFatalEvent) => void) | undefined
  private readonly maxPendingRequests: number
  private readonly diagnostics: ReturnType<typeof createStorageRequestDiagnostics>
  constructor(path: string, layout?: PathLayout, lifecycle: StorageLifecycleOptions = {}) {
    this.requestTimeoutMs = timeoutOption(lifecycle.requestTimeoutMs, 30_000)
    this.closeTimeoutMs = timeoutOption(lifecycle.closeTimeoutMs, 5_000)
    this.maxPendingRequests = lifecycle.maxPendingRequests ?? 1_024
    if (
      !Number.isSafeInteger(this.maxPendingRequests) ||
      this.maxPendingRequests < 1 ||
      this.maxPendingRequests > 1_000_000
    )
      throw new RangeError('Storage pending request limit must be an integer from 1 to 1000000')
    this.diagnostics = createStorageRequestDiagnostics({
      ...(lifecycle.diagnostics === undefined ? {} : { sink: lifecycle.diagnostics }),
      ...(lifecycle.diagnosticScope === undefined ? {} : { scope: lifecycle.diagnosticScope }),
      ...(lifecycle.instanceId === undefined ? {} : { instanceId: lifecycle.instanceId }),
      ...(lifecycle.diagnosticsFullCoverage === undefined ? {} : { fullCoverage: lifecycle.diagnosticsFullCoverage }),
    })
    this.notifyFatalError = lifecycle.onFatal
    const options = {
      workerData: {
        path,
        preflight: lifecycle.preflight === true,
        sessions: layout?.sessions,
        diagnostics: layout?.diagnostics,
        settings: layout?.settings,
        artifacts: layout?.artifacts,
        cache: layout?.cacheRoot,
        diagnosticsEnabled: lifecycle.diagnosticsEnabled ?? lifecycle.diagnostics !== undefined,
        diagnosticsFullCoverage: lifecycle.diagnosticsFullCoverage ?? false,
        ...(lifecycle.instanceId === undefined ? {} : { instanceId: lifecycle.instanceId }),
      },
    }
    const workerPath = lifecycle.workerPath ?? process.env.HBAR_STORAGE_WORKER
    this.worker = workerPath
      ? new Worker(workerPath, options)
      : Bun.isStandaloneExecutable
        ? // Bun only embeds Worker entrypoints referenced by a direct path literal matching the build input.
          new Worker('./packages/storage/src/worker.ts', options)
        : new Worker(new URL('./worker.ts', import.meta.url), options)
    this.exited = new Promise((resolve) => {
      this.worker.once('exit', (code: number) => {
        const error = new HbarError('STORAGE_WORKER_EXITED', `Storage worker exited with code ${code}`)
        if (!this.closing)
          this.emitDiagnostic('storage.worker_exit', 'error', error, { workerState: 'failed', outcome: 'failure' })
        if (!this.closing) this.fail(error, { kind: 'worker-exit', ...this.pendingFailureDetails() })
        resolve()
      })
    })
    this.worker.on('message', (reply: StorageWorkerMessage) => {
      if ('type' in reply && reply.type === 'diagnostic') {
        const correlation =
          reply.operationId === undefined
            ? this.diagnostics.capture()
            : this.pending.get(reply.operationId)?.correlation
        this.diagnostics.forward(reply.event, correlation)
        return
      }
      if (!('id' in reply)) return
      const handler = this.pending.get(reply.id)
      if (!handler) return
      if (!reply.ok && reply.code === 'STORAGE_RESULT_UNKNOWN') {
        const error = new HbarError('STORAGE_RESULT_UNKNOWN', 'Storage write outcome requires reconciliation')
        this.emitDiagnostic('storage.result_unknown', 'fatal', error, {
          method: handler.method,
          pending: this.pending.size,
          workerState: 'failed',
          outcome: 'unknown',
          storageRequestId: reply.id,
          durationMs: Math.max(0, performance.now() - handler.startedAt),
          ...(handler.correlation === undefined ? {} : { correlation: handler.correlation }),
        })
        this.fail(error, {
          kind: 'outcome-unknown',
          method: handler.method,
          storageRequestId: reply.id,
          pendingCount: this.pending.size,
          durationMs: Math.max(0, performance.now() - handler.startedAt),
          outcome: 'unknown',
        })
        void this.terminate().catch(() => {
          // close() awaits the same termination result; unknown outcomes are never replayed.
        })
        return
      }
      this.pending.delete(reply.id)
      clearTimeout(handler.timer)
      this.diagnostics.settled({
        id: reply.id,
        method: handler.method,
        startedAt: handler.startedAt,
        pending: this.pending.size,
        outcome: reply.ok ? 'success' : 'failure',
        ...(reply.ok ? {} : { errorCode: reply.code }),
        ...(handler.correlation === undefined ? {} : { correlation: handler.correlation }),
      })
      if (reply.ok) {
        if (handler.method === 'ready') {
          const ready = z.strictObject({ version: z.literal(STORAGE_SCHEMA_VERSION) }).safeParse(reply.result)
          if (ready.success && lifecycle.preflight !== true && path !== ':memory:' && path.length > 0) {
            this.catalog = buildActivatedStorageCatalog({ sourceMode: 'single-worker-single-path', path,
              preflight: false, readySchemaVersion: ready.data.version, expectedSchemaVersion: STORAGE_SCHEMA_VERSION })
          }
        }
        handler.resolve(reply.result)
      }
      else handler.reject(new HbarError(reply.code, reply.error))
    })
    this.worker.on('error', (event) => {
      this.closeWorkerError = true
      const error = new HbarError(
        'STORAGE_WORKER_FAILED',
        `Storage worker failed: ${event instanceof Error ? event.message : String(event)}`,
      )
      this.emitDiagnostic('storage.worker_error', 'error', error, { workerState: this.closing ? 'closed' : 'failed' })
      if (!this.closing) this.fail(error, { kind: 'worker-error', ...this.pendingFailureDetails() })
      void this.terminate().catch(() => {
        // close() awaits the same termination result; no unhandled event-callback rejection.
      })
    })
  }
  /** Cached activated-source metadata; never reads or wakes its Worker. */
  activatedCatalog(): StorageActivatedCatalog {
    if (!this.catalog || this.stopped || this.closing || this.terminating)
      throw new HbarError('STORAGE_CATALOG_UNAVAILABLE', 'Storage catalog requires an activated healthy source')
    return storageActivatedCatalogSchema.parse(this.catalog)
  }
  /** Explicit startup handshake budget; ordinary serving calls keep their configured deadline. */
  ready(timeoutMs: number): Promise<ReturnType<StorageMethods['ready']>> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000)
      return Promise.reject(new RangeError('Storage startup ready deadline must be from 1 to 120000 milliseconds'))
    if (this.stopped || this.closing) return Promise.reject(new HbarError('STORAGE_CLOSED', 'Storage is closed'))
    return this.request('ready', [], timeoutMs)
  }
  call<K extends keyof StorageMethods>(
    method: K,
    ...args: Parameters<StorageMethods[K]>
  ): Promise<ReturnType<StorageMethods[K]>> {
    if (this.stopped || this.closing) return Promise.reject(new HbarError('STORAGE_CLOSED', 'Storage is closed'))
    return this.request(method, args, this.requestTimeoutMs)
  }
  callOwned<K extends keyof StorageMethods>(
    authority: ExecutionOwnership,
    method: K,
    ...args: Parameters<StorageMethods[K]>
  ): Promise<ReturnType<StorageMethods[K]>> {
    if (this.stopped || this.closing) return Promise.reject(new HbarError('STORAGE_CLOSED', 'Storage is closed'))
    return this.request(method, args, this.requestTimeoutMs, authority)
  }
  executeRpc(raw: import('./rpc').StorageRpcCall): Promise<unknown> {
    const input = storageRpcCallSchema.parse(raw)
    if (this.stopped || this.closing) return Promise.reject(new HbarError('STORAGE_CLOSED', 'Storage is closed'))
    return this.request(
      input.method,
      input.args as Parameters<StorageMethods[typeof input.method]>,
      this.requestTimeoutMs,
      input.authority,
      input.diagnostic,
    )
  }
  private request<K extends keyof StorageMethods>(
    method: K,
    args: Parameters<StorageMethods[K]>,
    timeoutMs: number,
    authority?: ExecutionOwnership,
    diagnostic?: import('@hbar/contracts').ReadonlyDiagnosticCorrelation,
  ): Promise<ReturnType<StorageMethods[K]>> {
    if (method !== 'close' && this.pending.size >= this.maxPendingRequests) {
      this.diagnostics.record({
        event: 'storage.admission_rejected',
        phase: 'admission',
        level: 'warn',
        method: String(method),
        errorCode: 'OVERLOADED',
        pending: this.pending.size,
        outcome: 'skipped',
      })
      return Promise.reject(new HbarError('OVERLOADED', 'Storage pending request limit reached'))
    }
    return new Promise((resolve, reject) => {
      const id = ++this.nextId
      const startedAt = performance.now()
      const correlation = diagnostic ?? this.diagnostics.capture()
      const timer = setTimeout(() => {
        // A timed-out write may have committed. Fail the owner without replaying it or accepting more work.
        const error = new HbarError(
          'STORAGE_TIMEOUT',
          `Storage ${method} did not reply within ${timeoutMs}ms; result may be unknown`,
        )
        this.emitDiagnostic('storage.timeout', 'fatal', error, {
          method: String(method),
          pending: this.pending.size,
          workerState: 'failed',
          outcome: 'unknown',
          storageRequestId: id,
          durationMs: Math.max(0, performance.now() - startedAt),
          ...(correlation === undefined ? {} : { correlation }),
        })
        if (method === 'close' && this.closing) this.stop(error)
        else
          this.fail(error, {
            kind: 'timeout',
            method: String(method),
            storageRequestId: id,
            durationMs: Math.max(0, performance.now() - startedAt),
            outcome: 'unknown',
          })
        void this.terminate().catch(() => {
          // The explicit close path reports a failed termination to its caller.
        })
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (value) => resolve(value as ReturnType<StorageMethods[K]>),
        reject,
        timer,
        startedAt,
        method: String(method),
        ...(correlation === undefined ? {} : { correlation }),
      })
      try {
        this.worker.postMessage({ id, method, args, ...(authority ? { authority } : {}) })
        this.diagnostics.dispatched({
          id,
          method: String(method),
          pending: this.pending.size,
          ...(correlation === undefined ? {} : { correlation }),
        })
      } catch (error) {
        this.pending.delete(id)
        clearTimeout(timer)
        this.diagnostics.settled({
          id,
          method: String(method),
          startedAt,
          pending: this.pending.size,
          outcome: 'failure',
          errorCode: 'STORAGE_DISPATCH_FAILED',
          ...(correlation === undefined ? {} : { correlation }),
        })
        reject(error)
      }
    })
  }
  onFatal(listener: StorageFatalListener): () => void {
    this.fatalListeners.add(listener)
    return () => this.fatalListeners.delete(listener)
  }
  private pendingFailureDetails(): {
    readonly pendingCount: number
    readonly workerState: 'failed'
    readonly outcome: 'failure' | 'unknown'
    readonly method?: string
    readonly storageRequestId?: number
    readonly durationMs?: number
  } {
    const pendingCount = this.pending.size
    const onlyPending = pendingCount === 1 ? this.pending.entries().next().value : undefined
    return {
      pendingCount,
      workerState: 'failed',
      outcome: pendingCount > 0 ? 'unknown' : 'failure',
      ...(onlyPending
        ? {
            storageRequestId: onlyPending[0],
            method: onlyPending[1].method,
            durationMs: Math.max(0, performance.now() - onlyPending[1].startedAt),
          }
        : {}),
    }
  }
  private fail(
    error: HbarError,
    details: {
      kind: StorageFatalKind
      method?: string
      storageRequestId?: number
      pendingCount?: number
      workerState?: 'failed' | 'closed'
      outcome?: 'failure' | 'unknown'
      durationMs?: number
    },
  ): void {
    const pendingCount = details.pendingCount ?? this.pending.size
    this.stop(error)
    if (this.fatalNotified) return
    this.fatalNotified = true
    const event: StorageFatalEvent = {
      kind: details.kind,
      code: error.code,
      message: error.message,
      ...(details.method ? { method: details.method } : {}),
      ...(details.storageRequestId === undefined ? {} : { storageRequestId: details.storageRequestId }),
      pendingCount,
      workerState: details.workerState ?? 'failed',
      outcome: details.outcome ?? (pendingCount > 0 ? 'unknown' : 'failure'),
      ...(details.durationMs === undefined ? {} : { durationMs: details.durationMs }),
      occurredAt: Date.now(),
    }
    if (!this.closing) {
      try {
        this.notifyFatalError?.(error, event)
      } catch {
        console.error('[hbar storage] fatal observer failed')
      }
    }
    for (const listener of this.fatalListeners) {
      try {
        listener(event)
      } catch {
        // Observers must not affect storage shutdown or pending request settlement.
      }
    }
  }
  private emitDiagnostic(
    event: string,
    level: 'info' | 'error' | 'fatal',
    error: HbarError,
    details: {
      method?: string
      pending?: number
      workerState: 'failed' | 'closed'
      outcome?: 'success' | 'failure' | 'unknown'
      storageRequestId?: number
      durationMs?: number
      correlation?: ReadonlyDiagnosticCorrelation
    },
  ): void {
    try {
      this.diagnostics.record(
        {
          level,
          event,
          ...(details.method ? { method: details.method } : {}),
          errorCode: error.code,
          workerState: details.workerState,
          ...(details.pending === undefined ? {} : { pending: details.pending }),
          ...(details.outcome ? { outcome: details.outcome } : {}),
          ...(details.storageRequestId === undefined ? {} : { storageRequestId: details.storageRequestId }),
          ...(details.durationMs === undefined ? {} : { durationMs: details.durationMs }),
        },
        details.correlation,
      )
    } catch {
      // Diagnostics cannot affect lifecycle or request settlement.
    }
  }
  private stop(error: Error): void {
    this.stopped = true
    for (const [id, handler] of this.pending) {
      clearTimeout(handler.timer)
      this.diagnostics.settled({
        id,
        method: handler.method,
        startedAt: handler.startedAt,
        pending: this.pending.size,
        outcome: 'unknown',
        errorCode: error instanceof HbarError ? error.code : 'STORAGE_CLOSED',
        ...(handler.correlation === undefined ? {} : { correlation: handler.correlation }),
      })
      handler.reject(error)
    }
    this.pending.clear()
  }
  private terminate(): Promise<void> {
    this.terminating ??= this.worker.terminate().then(() => this.exited)
    return this.terminating
  }
  close(): Promise<void> {
    this.closing ??= this.closeWorker()
    return this.closing
  }
  /** Owner-only hibernate checkpoint; never a general Storage RPC or a write replay. */
  async closeIdle(): Promise<{ databaseCloseAcknowledged: true; workerExitConfirmed: true }> {
    if (this.stopped || this.closing || this.pending.size !== 0)
      throw new HbarError('STORAGE_IDLE_BUSY', 'A healthy quiescent Storage Worker is required')
    // closeWorker waits for the actual close RPC and then joins the Worker termination.
    this.closing = this.closeWorker()
    await this.closing
    if (!this.cleanCloseAcknowledged || this.closeWorkerError)
      throw new HbarError('STORAGE_IDLE_OUTCOME_UNKNOWN', 'The database close checkpoint is not confirmed')
    await this.exited
    return { databaseCloseAcknowledged: true, workerExitConfirmed: true }
  }
  private async closeWorker(): Promise<void> {
    let closeError: HbarError | undefined
    try {
      if (!this.stopped) {
        await this.request('close', [], this.closeTimeoutMs)
        this.cleanCloseAcknowledged = true
      }
    } catch (error) {
      closeError = error instanceof HbarError ? error : new HbarError('STORAGE_CLOSE_FAILED', String(error))
      throw closeError
    } finally {
      this.emitDiagnostic(
        'storage.close',
        closeError ? 'error' : 'info',
        closeError ?? new HbarError('STORAGE_CLOSED', 'Storage closed'),
        {
          workerState: 'closed',
          outcome: closeError ? 'failure' : 'success',
        },
      )
      this.stop(new HbarError('STORAGE_CLOSED', 'Storage is closed'))
      await this.terminate()
    }
  }
}
export { STORAGE_PREFLIGHT_METHODS, assertStoragePreflightMethod } from './preflight'
export { createMaintenanceWorkerPreflight } from './maintenance-worker-preflight'

export { NodeLocalConfirmationStorage } from './node-local-confirmations'
