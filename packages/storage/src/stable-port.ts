import { HbarError } from '@hbar/contracts'
import { RUNTIME_LIMITS, type ExecutionOwnership, type RuntimeOwner } from '@hbar/contracts/runtime'
import type { StorageMethods } from './types'
import type { StorageFatalEvent, StorageFatalListener, StoragePort } from './index'
import { storageRpcCallSchema, type StorageRpcCall } from './rpc'

// Only methods whose implementation is a read belong here; every undeclared method is conservatively a write.
const readOnlyMethods: ReadonlySet<keyof StorageMethods> = new Set([
  'ready',
  'getSetting',
  'session',
  'sessions',
  'workspace',
  'workspaces',
  'providers',
  'plugins',
  'events',
  'readEventPage',
  'run',
  'runByRequest',
  'sessionExecutionPrincipal',
  'runExecutionPrincipal',
  'commandExecutionRead',
  'commandExecutionPending',
  'deviceById',
  'snapshot',
  'cancelRequested',
  'runtimeExecutionRead',
  'runtimeRecoveryRead',
  'runtimeRecoveryChain',
  'runtimeActiveRuns',
  'runtimeUnreleasedExecutions',
  'recoveryInputMessage',
  'settingsLayers',
  'settingsReceipt',
  'activeOperations',
  'stats',
  'pendingSessionLaunchTargetPreparations',
  'pendingNodeExecutionIntents',
  'nodeRunWorktree',
  'nodeRunWorktreeAdmission',
  'nodeRunWorkspaceMount',
  'queuedSessions',
  'recentSessions',
  'nextQueuedRun',
  'readRunSteering',
])

export interface ManagedStorageWriter {
  readonly owner: RuntimeOwner
  call<K extends keyof StorageMethods>(
    method: K,
    args: Parameters<StorageMethods[K]>,
    authority?: ExecutionOwnership,
    diagnostic?: import('@hbar/contracts').ReadonlyDiagnosticCorrelation,
  ): Promise<ReturnType<StorageMethods[K]>>
  /** Resolution confirms the owner process and its Worker exited, rather than just asking them to close. */
  retire(): Promise<void>
  /** Closes and joins the Storage Worker before releasing its physical writer lease. */
  suspend?(operationId: string): Promise<void>
  /** Verifies integrity before reacquiring the writer lease and creating a fresh Worker. */
  resume?(operationId: string): Promise<void>
}
interface WaitingCall {
  readonly bytes: number
  readonly writes: boolean
  readonly execute: (writer: ManagedStorageWriter) => Promise<void>
  readonly reject: (error: Error) => void
  readonly timer: ReturnType<typeof setTimeout>
}
export interface StableStorageSnapshot {
  readonly phase: 'waiting' | 'serving' | 'handover' | 'fenced' | 'closed'
  readonly owner: RuntimeOwner | null
  readonly inFlight: number
  readonly queued: number
  readonly bufferedBytes: number
  readonly reasonCode: string | null
}

/** Stable admission port shared by all versions. It never replays an in-flight call to another writer. */
export class StableStoragePort implements StoragePort {
  private writer: ManagedStorageWriter | undefined
  private phase: StableStorageSnapshot['phase'] = 'waiting'
  private reasonCode: string | null = null
  private active = 0
  private activeWrites = 0
  private bytes = 0
  private queue: WaitingCall[] = []
  private readonly idle = new Set<() => void>()
  private readonly fatalListeners = new Set<StorageFatalListener>()
  private fatalNotified = false
  private transition: Promise<void> | undefined
  private closing: Promise<void> | undefined
  private maintenance: { operationId: string; owner: RuntimeOwner } | undefined
  private resuming: Promise<void> | undefined
  constructor(private readonly waitMs = 5_000) {
    if (!Number.isSafeInteger(waitMs) || waitMs < 1 || waitMs > 120_000)
      throw new RangeError('Invalid storage handover deadline')
  }
  snapshot(): StableStorageSnapshot {
    return {
      phase: this.phase,
      owner: this.writer ? { ...this.writer.owner } : null,
      inFlight: this.active,
      queued: this.queue.length,
      bufferedBytes: this.bytes,
      reasonCode: this.reasonCode,
    }
  }
  onFatal(listener: StorageFatalListener): () => void {
    this.fatalListeners.add(listener)
    return () => this.fatalListeners.delete(listener)
  }
  private notifyOutcomeUnknown(method: string): void {
    if (this.fatalNotified) return
    this.fatalNotified = true
    const event: StorageFatalEvent = {
      kind: 'outcome-unknown',
      code: 'STORAGE_RESULT_UNKNOWN',
      message: 'Storage write outcome requires reconciliation',
      method,
      occurredAt: Date.now(),
    }
    for (const listener of this.fatalListeners) {
      try {
        listener(event)
      } catch {
        // Fatal observers must not reopen or pump a fenced writer.
      }
    }
  }
  get writeCallsInFlight(): number {
    return this.activeWrites
  }
  install(writer: ManagedStorageWriter): void {
    if (this.phase === 'closed' || this.phase === 'fenced' || this.writer || this.active)
      throw new HbarError(
        'STORAGE_WRITER_UNAVAILABLE',
        'The old writer must exit and its outcomes must be reconciled before installation',
      )
    this.writer = writer
    this.phase = 'serving'
    this.reasonCode = null
    this.fatalNotified = false
    this.pump()
  }
  call<K extends keyof StorageMethods>(
    method: K,
    ...args: Parameters<StorageMethods[K]>
  ): Promise<ReturnType<StorageMethods[K]>> {
    return this.admit(method, args)
  }
  callOwned<K extends keyof StorageMethods>(
    authority: ExecutionOwnership,
    method: K,
    ...args: Parameters<StorageMethods[K]>
  ): Promise<ReturnType<StorageMethods[K]>> {
    return this.admit(method, args, authority)
  }
  executeRpc(raw: StorageRpcCall): Promise<unknown> {
    const input = storageRpcCallSchema.parse(raw)
    // The receiving Worker validates the concrete method's arguments. This is the same boundary as Storage.executeRpc.
    return this.admit(
      input.method,
      input.args as Parameters<StorageMethods[typeof input.method]>,
      input.authority,
      input.diagnostic,
    )
  }
  private admit<K extends keyof StorageMethods>(
    method: K,
    args: Parameters<StorageMethods[K]>,
    authority?: ExecutionOwnership,
    diagnostic?: import('@hbar/contracts').ReadonlyDiagnosticCorrelation,
  ): Promise<ReturnType<StorageMethods[K]>> {
    if (this.phase === 'closed' || this.phase === 'fenced')
      return Promise.reject(
        new HbarError(this.reasonCode ?? 'STORAGE_CLOSED', 'Stable storage admission is unavailable'),
      )
    let captured: Parameters<StorageMethods[K]>, lease: ExecutionOwnership | undefined, bytes: number
    try {
      captured = structuredClone(args)
      lease = authority ? structuredClone(authority) : undefined
      bytes = new TextEncoder().encode(
        JSON.stringify({ method, args: captured, authority: lease, diagnostic }),
      ).byteLength
    } catch {
      return Promise.reject(new HbarError('INVALID_STORAGE_INPUT', 'Storage request must be serializable data'))
    }
    if (
      bytes > RUNTIME_LIMITS.messageBytes ||
      this.bytes + bytes > RUNTIME_LIMITS.bufferedBytes ||
      ((this.phase !== 'serving' || this.active >= RUNTIME_LIMITS.inFlight) &&
        this.queue.length >= RUNTIME_LIMITS.queued)
    )
      return Promise.reject(new HbarError('STORAGE_CAPACITY', 'Storage admission capacity is exhausted'))
    return new Promise((resolve, reject) => {
      const pending: WaitingCall = {
        bytes,
        reject,
        writes: !readOnlyMethods.has(method),
        timer: setTimeout(() => {
          const index = this.queue.indexOf(pending)
          if (index < 0) return
          this.queue.splice(index, 1)
          this.bytes -= bytes
          reject(
            new HbarError('STORAGE_HANDOVER_TIMEOUT', 'Storage request was not admitted before the handover deadline'),
          )
        }, this.waitMs),
        execute: async (writer) => {
          try {
            resolve(await writer.call(method, captured, lease, diagnostic))
          } catch (error) {
            if (error instanceof HbarError && error.code === 'STORAGE_RESULT_UNKNOWN') {
              this.fence('STORAGE_RESULT_UNKNOWN')
              this.notifyOutcomeUnknown(String(method))
            }
            reject(error instanceof Error ? error : new HbarError('STORAGE_CALL_FAILED', 'Storage owner failed'))
          }
        },
      }
      this.bytes += bytes
      this.queue.push(pending)
      this.pump()
    })
  }
  private pump(): void {
    while (this.phase === 'serving' && this.writer && this.active < RUNTIME_LIMITS.inFlight && this.queue.length) {
      const request = this.queue.shift()!
      clearTimeout(request.timer)
      this.active++
      if (request.writes) this.activeWrites++
      const writer = this.writer
      void request.execute(writer).finally(() => {
        this.bytes -= request.bytes
        this.active--
        if (request.writes) this.activeWrites--
        if (!this.active) for (const notify of this.idle) notify()
        this.pump()
      })
    }
  }
  beginHandover(): Promise<void> {
    if (this.maintenance)
      return Promise.reject(
        new HbarError(
          'STORAGE_MAINTENANCE_ACTIVE',
          'The maintenance writer must release ownership before a storage update',
        ),
      )
    this.transition ??= this.retireWriter().finally(() => {
      this.transition = undefined
    })
    return this.transition
  }
  /** The caller owns the global maintenance gate. New calls wait within the usual admission bounds. */
  async beginMaintenance(operationId: string): Promise<void> {
    const writer = this.writer,
      suspend = writer?.suspend
    if (
      !operationId ||
      operationId.length > 160 ||
      this.maintenance ||
      this.transition ||
      this.phase !== 'serving' ||
      !writer ||
      !suspend ||
      !writer.resume
    )
      throw new HbarError('STORAGE_WRITER_UNAVAILABLE', 'An available managed writer is required for maintenance')
    this.maintenance = { operationId, owner: { ...writer.owner } }
    this.phase = 'handover'
    let timer: ReturnType<typeof setTimeout> | undefined
    let notify: (() => void) | undefined
    try {
      await Promise.race([
        (async () => {
          if (this.active)
            await new Promise<void>((resolve) => {
              notify = resolve
              this.idle.add(resolve)
            })
          if (this.phase !== 'handover')
            throw new HbarError('STORAGE_RESULT_UNKNOWN', 'Storage ownership changed while draining')
          await suspend.call(writer, operationId)
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new HbarError('STORAGE_EXIT_UNCONFIRMED', 'Maintenance could not confirm the old Worker exit')),
            this.waitMs,
          )
        }),
      ])
      if (this.phase !== 'handover')
        throw new HbarError('STORAGE_RESULT_UNKNOWN', 'Storage ownership changed during suspension')
    } catch (error) {
      this.fence(error instanceof HbarError ? error.code : 'STORAGE_EXIT_UNCONFIRMED')
      throw error
    } finally {
      clearTimeout(timer)
      if (notify) this.idle.delete(notify)
    }
  }
  endMaintenance(operationId: string): Promise<void> {
    const held = this.maintenance,
      writer = this.writer
    if (
      !held ||
      held.operationId !== operationId ||
      this.phase !== 'handover' ||
      !writer?.resume ||
      writer.owner.incarnation !== held.owner.incarnation
    )
      return Promise.reject(
        new HbarError(
          'STORAGE_RECONCILIATION_REQUIRED',
          'The exact suspended writer and verified maintenance receipt are required',
        ),
      )
    const resume = writer.resume.bind(writer)
    this.resuming ??= this.resumeMaintenance(operationId, resume).finally(() => {
      this.resuming = undefined
    })
    return this.resuming
  }
  private async resumeMaintenance(operationId: string, resume: (id: string) => Promise<void>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        resume(operationId),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new HbarError(
                  'STORAGE_EXIT_UNCONFIRMED',
                  'Verified storage resumption did not finish before its deadline',
                ),
              ),
            this.waitMs,
          )
        }),
      ])
      if (this.phase !== 'handover')
        throw new HbarError('STORAGE_RESULT_UNKNOWN', 'Storage ownership changed during resumption')
      this.maintenance = undefined
      this.phase = 'serving'
      this.pump()
    } catch (error) {
      this.fence(error instanceof HbarError ? error.code : 'STORAGE_INTEGRITY_UNKNOWN')
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
  private async retireWriter(): Promise<void> {
    if (this.phase === 'closed' || this.phase === 'fenced')
      throw new HbarError(this.reasonCode ?? 'STORAGE_CLOSED', 'Storage cannot hand over its writer')
    this.phase = 'handover'
    const deadline = Date.now() + this.waitMs
    let timer: ReturnType<typeof setTimeout> | undefined
    let notify: (() => void) | undefined
    try {
      if (this.active)
        await new Promise<void>((resolve, reject) => {
          notify = resolve
          this.idle.add(resolve)
          timer = setTimeout(
            () => reject(new HbarError('STORAGE_HANDOVER_TIMEOUT', 'In-flight transactions did not drain')),
            this.waitMs,
          )
        })
      clearTimeout(timer)
      const writer = this.writer
      if (writer)
        await Promise.race([
          writer.retire(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new HbarError('STORAGE_EXIT_UNCONFIRMED', 'Old writer exit could not be confirmed')),
              Math.max(1, deadline - Date.now()),
            )
          }),
        ])
      if (this.snapshot().phase === 'fenced' || this.snapshot().phase === 'closed')
        throw new HbarError(
          this.reasonCode ?? 'STORAGE_RESULT_UNKNOWN',
          'Writer outcomes are unknown or admission closed',
        )
      this.writer = undefined
      this.phase = 'waiting'
    } catch (error) {
      this.fence(error instanceof HbarError ? error.code : 'STORAGE_EXIT_UNCONFIRMED')
      throw error
    } finally {
      clearTimeout(timer)
      if (notify) this.idle.delete(notify)
    }
  }
  fence(reasonCode = 'STORAGE_RESULT_UNKNOWN'): void {
    if (this.phase === 'closed') return
    this.phase = 'fenced'
    this.reasonCode = reasonCode
    for (const request of this.queue.splice(0)) {
      clearTimeout(request.timer)
      this.bytes -= request.bytes
      request.reject(new HbarError(reasonCode, 'Storage write outcomes require reconciliation'))
    }
  }
  /** The composition root must verify integrity and receipts after confirmed exit before using this port. */
  reconcileExited(owner: RuntimeOwner): void {
    if (
      this.maintenance ||
      this.phase !== 'fenced' ||
      this.active ||
      !this.writer ||
      this.writer.owner.incarnation !== owner.incarnation ||
      this.writer.owner.generation !== owner.generation ||
      this.writer.owner.unitId !== owner.unitId
    )
      throw new HbarError(
        'STORAGE_RECONCILIATION_REQUIRED',
        'Physical storage calls and the exact exited writer must be reconciled',
      )
    this.writer = undefined
    this.phase = 'waiting'
    this.reasonCode = null
  }
  close(): Promise<void> {
    this.closing ??= this.closeWriter()
    return this.closing
  }
  private async closeWriter(): Promise<void> {
    this.fence('STORAGE_CLOSED')
    this.phase = 'closed'
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.writer?.retire() ?? Promise.resolve(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new HbarError('STORAGE_EXIT_UNCONFIRMED', 'Storage shutdown could not confirm writer exit')),
            this.waitMs,
          )
        }),
      ])
      this.writer = undefined
    } finally {
      clearTimeout(timer)
    }
  }
}
