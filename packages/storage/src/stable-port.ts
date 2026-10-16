import { HbarError } from '@hbar/contracts'
import { z } from 'zod'
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
  'readSessionFacts',
  'run',
  'runByRequest',
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
  'hasQueuedRuns',
  'recentSessions',
  'nextQueuedRun',
  'readRunSteering',
])

export interface StorageDemandLease {
  readonly owner: RuntimeOwner
  release(): void
}
export interface StorageDemandGate {
  /** Resolve only after the exact owner is installed. Never wake by calling this StableStoragePort. */
  acquire(): Promise<StorageDemandLease>
}
export interface StoragePhysicalSettlement {
  readonly owner: RuntimeOwner
  /** owner-exited requires native/Worker exit proof, not disconnect, timeout or cancel. */
  readonly kind: 'reply' | 'not-dispatched' | 'owner-exited'
}
export interface StoragePhysicalCall<Output> {
  readonly result: Promise<Output>
  readonly settled: Promise<StoragePhysicalSettlement>
}
export interface StorageDemandReconciliation {
  readonly owner: RuntimeOwner
  readonly physicalExitConfirmed: true
  readonly originalReceiptReconciliationConfirmed: true
}
export interface StorageHibernateCheckpoint {
  readonly owner: RuntimeOwner
  readonly operationId: string
  readonly databaseCloseAcknowledged: true
  readonly workerExitConfirmed: true
  readonly writerLeaseReleased: true
  readonly queuedSessionCount: 0
}
export type StorageIdleOutcome =
  | { readonly status: 'busy'; readonly checkpointed: false }
  | { readonly status: 'unknown' }
  | {
      readonly status: 'confirmed-physical-exit'
      readonly checkpoint: StorageHibernateCheckpoint
      readonly exitCode: 0
      readonly disposalAcknowledged: true
      readonly nativeJoined: true
    }

function sameStorageOwner(left: RuntimeOwner, right: RuntimeOwner): boolean {
  return left.unitId === right.unitId && left.generation === right.generation && left.incarnation === right.incarnation
}

export interface ManagedStorageWriter {
  readonly owner: RuntimeOwner
  call<K extends keyof StorageMethods>(
    method: K,
    args: Parameters<StorageMethods[K]>,
    authority?: ExecutionOwnership,
    diagnostic?: import('@hbar/contracts').ReadonlyDiagnosticCorrelation,
  ): Promise<ReturnType<StorageMethods[K]>>
  /** Required when demand mode is enabled; result timeout must NOT settle the physical promise. */
  callPhysical?<K extends keyof StorageMethods>(
    method: K,
    args: Parameters<StorageMethods[K]>,
    authority?: ExecutionOwnership,
    diagnostic?: import('@hbar/contracts').ReadonlyDiagnosticCorrelation,
  ): StoragePhysicalCall<ReturnType<StorageMethods[K]>>
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
  /** Last complete successful queue read, invalidated by every potentially mutating dispatch. */
  readonly queuedSessionCount: number | null
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
  private pendingDemand = 0
  private demandBytes = 0
  private readonly demandLeases = new Set<StorageDemandLease>()
  private readonly unknownPhysical = new Set<{ readonly owner: RuntimeOwner; readonly settle: () => void }>()
  private idleBoundary: { readonly owner: RuntimeOwner; readonly writer: ManagedStorageWriter } | undefined
  private queuedSessionCount: number | null = null
  private queueVersion = 0n
  constructor(
    private readonly waitMs = 5_000,
    private readonly demandGate?: StorageDemandGate,
  ) {
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
      queuedSessionCount: this.queuedSessionCount,
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
  demandSnapshot() {
    return {
      acquiring: this.pendingDemand,
      acquiringBytes: this.demandBytes,
      holds: this.demandLeases.size,
      unknownPhysical: this.unknownPhysical.size,
      activeWrites: this.activeWrites,
      maintenance: this.maintenance !== undefined || this.resuming !== undefined,
      idleSealed: this.idleBoundary !== undefined,
    }
  }
  install(writer: ManagedStorageWriter): void {
    if (this.phase === 'closed' || this.phase === 'fenced' || this.writer || this.active || this.idleBoundary)
      throw new HbarError(
        'STORAGE_WRITER_UNAVAILABLE',
        'The old writer must exit and its outcomes must be reconciled before installation',
      )
    if (this.demandGate && !writer.callPhysical)
      throw new HbarError('STORAGE_PHYSICAL_PROOF_REQUIRED', 'Demand storage requires physical call settlement')
    this.queueVersion++
    this.queuedSessionCount = null
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
    if (this.demandGate) return this.acquireDemand(method, args, authority, diagnostic)
    return this.admitReady(method, args, authority, diagnostic)
  }
  private async acquireDemand<K extends keyof StorageMethods>(
    method: K,
    args: Parameters<StorageMethods[K]>,
    authority?: ExecutionOwnership,
    diagnostic?: import('@hbar/contracts').ReadonlyDiagnosticCorrelation,
  ): Promise<ReturnType<StorageMethods[K]>> {
    if (this.phase === 'closed' || this.phase === 'fenced' || !this.demandGate)
      throw new HbarError(this.reasonCode ?? 'STORAGE_CLOSED', 'Storage demand admission is unavailable')
    if (this.pendingDemand >= RUNTIME_LIMITS.queued)
      throw new HbarError('STORAGE_CAPACITY', 'Storage demand capacity is exhausted')
    // Capture input before the wake await; the caller cannot mutate a delayed write's envelope.
    const captured = structuredClone(args)
    const capturedAuthority = authority ? structuredClone(authority) : undefined
    const capturedDiagnostic = diagnostic ? structuredClone(diagnostic) : undefined
    const demandBytes = new TextEncoder().encode(
      JSON.stringify({ method, args: captured, authority: capturedAuthority, diagnostic: capturedDiagnostic }),
    ).byteLength
    if (
      demandBytes > RUNTIME_LIMITS.messageBytes ||
      this.demandBytes + this.bytes + demandBytes > RUNTIME_LIMITS.bufferedBytes
    )
      throw new HbarError('STORAGE_CAPACITY', 'Storage wake buffer is exhausted')
    this.pendingDemand++
    this.demandBytes += demandBytes
    let expired = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const acquired = Promise.resolve()
      .then(() => this.demandGate?.acquire())
      .then(
        (lease) => {
          this.pendingDemand--
          this.demandBytes -= demandBytes
          if (!lease) throw new HbarError('STORAGE_DEMAND_UNAVAILABLE', 'Storage demand gate changed')
          this.demandLeases.add(lease)
          if (expired) {
            this.releaseDemand(lease)
            return undefined
          }
          return lease
        },
        (error: unknown) => {
          this.pendingDemand--
          this.demandBytes -= demandBytes
          throw error
        },
      )
    // Observe a late wake failure even after the admission timeout. No write has been dispatched.
    void acquired.catch(() => {})
    let lease: StorageDemandLease | undefined
    try {
      lease = await Promise.race([
        acquired,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            expired = true
            reject(new HbarError('STORAGE_DEMAND_TIMEOUT', 'Storage wake is not confirmed'))
          }, this.waitMs)
        }),
      ])
      if (!lease) throw new HbarError('STORAGE_DEMAND_TIMEOUT', 'Storage wake expired before admission')
      const writer = this.writer
      if (!writer || !sameStorageOwner(writer.owner, lease.owner) || this.phase !== 'serving' || this.idleBoundary) {
        this.releaseDemand(lease)
        lease = undefined
        throw new HbarError('STORAGE_DEMAND_OWNER_CHANGED', 'The exact installed storage owner is required')
      }
      // The queued/executing request now owns release, including timeout before dispatch.
      return await this.admitReady(method, captured, capturedAuthority, capturedDiagnostic, lease)
    } finally {
      clearTimeout(timer)
      // A logical result can settle before physical completion: never release the transferred lease here.
    }
  }
  private releaseDemand(lease: StorageDemandLease | undefined): void {
    if (lease && this.demandLeases.has(lease)) {
      try {
        lease.release()
        this.demandLeases.delete(lease)
      } catch {
        this.fence('STORAGE_DEMAND_RELEASE_UNKNOWN')
      }
    }
  }
  private async waitPhysicalReply(settled: Promise<void>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        settled,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new HbarError('STORAGE_RESULT_UNKNOWN', 'Physical reply is not confirmed')),
            this.waitMs,
          )
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }
  private admitReady<K extends keyof StorageMethods>(
    method: K,
    args: Parameters<StorageMethods[K]>,
    authority?: ExecutionOwnership,
    diagnostic?: import('@hbar/contracts').ReadonlyDiagnosticCorrelation,
    demand?: StorageDemandLease,
  ): Promise<ReturnType<StorageMethods[K]>> {
    if (this.phase === 'closed' || this.phase === 'fenced') {
      this.releaseDemand(demand)
      return Promise.reject(
        new HbarError(this.reasonCode ?? 'STORAGE_CLOSED', 'Stable storage admission is unavailable'),
      )
    }
    let captured: Parameters<StorageMethods[K]>, lease: ExecutionOwnership | undefined, bytes: number
    try {
      captured = structuredClone(args)
      lease = authority ? structuredClone(authority) : undefined
      bytes = new TextEncoder().encode(
        JSON.stringify({ method, args: captured, authority: lease, diagnostic }),
      ).byteLength
    } catch {
      this.releaseDemand(demand)
      return Promise.reject(new HbarError('INVALID_STORAGE_INPUT', 'Storage request must be serializable data'))
    }
    if (
      bytes > RUNTIME_LIMITS.messageBytes ||
      this.bytes + bytes > RUNTIME_LIMITS.bufferedBytes ||
      ((this.phase !== 'serving' || this.active >= RUNTIME_LIMITS.inFlight) &&
        this.queue.length >= RUNTIME_LIMITS.queued)
    ) {
      this.releaseDemand(demand)
      return Promise.reject(new HbarError('STORAGE_CAPACITY', 'Storage admission capacity is exhausted'))
    }
    return new Promise((resolve, reject) => {
      const pending: WaitingCall = {
        bytes,
        reject: (error) => {
          this.releaseDemand(demand)
          reject(error)
        },
        writes: !readOnlyMethods.has(method),
        timer: setTimeout(() => {
          const index = this.queue.indexOf(pending)
          if (index < 0) return
          this.queue.splice(index, 1)
          this.bytes -= bytes
          this.releaseDemand(demand)
          reject(
            new HbarError('STORAGE_HANDOVER_TIMEOUT', 'Storage request was not admitted before the handover deadline'),
          )
        }, this.waitMs),
        execute: async (writer) => {
          // Invalidate conservatively before any possible write dispatch. Even a reply-lost
          // write must invalidate; a late queuedSessions read cannot overwrite this version.
          if (!readOnlyMethods.has(method)) {
            this.queueVersion++
            this.queuedSessionCount = null
          }
          const queueReadVersion = this.queueVersion
          const queueReadEligible = method === 'queuedSessions' && this.activeWrites === 0
          const cacheQueue = (value: unknown): void => {
            if (
              !queueReadEligible ||
              queueReadVersion !== this.queueVersion ||
              this.activeWrites !== 0 ||
              this.writer !== writer ||
              this.phase !== 'serving'
            )
              return
            const complete = z.array(z.string()).safeParse(value)
            if (complete.success) this.queuedSessionCount = complete.data.length
          }
          let physical: StoragePhysicalSettlement | undefined
          const readPhysical = (): StoragePhysicalSettlement | undefined => physical
          let physicalDone: Promise<void> | undefined
          try {
            if (demand) {
              if (!writer.callPhysical || !sameStorageOwner(writer.owner, demand.owner))
                throw new HbarError('STORAGE_RESULT_UNKNOWN', 'Storage physical owner changed before invocation')
              const operation = writer.callPhysical(method, captured, lease, diagnostic)
              physicalDone = operation.settled.then((settlement) => {
                if (!sameStorageOwner(settlement.owner, demand.owner))
                  throw new HbarError('STORAGE_RESULT_UNKNOWN', 'Storage settlement owner does not match')
                physical = settlement
              })
              void physicalDone.catch(() => {})
              const result = await operation.result
              await this.waitPhysicalReply(physicalDone)
              if (readPhysical()?.kind !== 'reply')
                throw new HbarError('STORAGE_RESULT_UNKNOWN', 'Storage success lacks its original physical reply')
              cacheQueue(result)
              resolve(result)
            } else {
              const result = await writer.call(method, captured, lease, diagnostic)
              cacheQueue(result)
              resolve(result)
            }
          } catch (error) {
            // A logical timeout/rejection is not physical completion, even for a read.
            const settled = readPhysical()
            if (
              (demand && (!settled || settled.kind === 'owner-exited')) ||
              (error instanceof HbarError && error.code === 'STORAGE_RESULT_UNKNOWN')
            ) {
              this.fence('STORAGE_RESULT_UNKNOWN')
              if (!readOnlyMethods.has(method)) this.notifyOutcomeUnknown(String(method))
            }
            reject(error instanceof Error ? error : new HbarError('STORAGE_CALL_FAILED', 'Storage owner failed'))
          } finally {
            if (demand && !physicalDone) {
              // A synchronous adapter throw might follow dispatch. No completion means no release.
              this.fence('STORAGE_RESULT_UNKNOWN')
              await new Promise<void>((settle) => {
                this.unknownPhysical.add({ owner: { ...writer.owner }, settle })
              })
            } else if (physicalDone) {
              try {
                await physicalDone
              } catch {
                this.fence('STORAGE_RESULT_UNKNOWN')
                // No confirmed physical boundary: keep counters/lease, do not pump another writer.
                await new Promise<void>((settle) => {
                  this.unknownPhysical.add({ owner: { ...writer.owner }, settle })
                })
              }
            }
            this.releaseDemand(demand)
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
    if (this.maintenance || this.idleBoundary)
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
      this.idleBoundary ||
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
  /** Called only inside Manager's serialized retirement admission boundary, before checkpoint RPC. */
  beforeIdle(expectedOwner: RuntimeOwner): boolean {
    const writer = this.writer
    if (
      !this.demandGate ||
      !writer?.callPhysical ||
      !sameStorageOwner(writer.owner, expectedOwner) ||
      this.phase !== 'serving' ||
      this.active ||
      this.activeWrites ||
      this.queue.length ||
      this.bytes ||
      this.pendingDemand ||
      this.demandBytes ||
      this.demandLeases.size ||
      this.unknownPhysical.size ||
      this.maintenance ||
      this.transition ||
      this.resuming ||
      this.closing ||
      this.idleBoundary
    )
      return false
    this.idleBoundary = { owner: { ...expectedOwner }, writer }
    this.phase = 'handover'
    return true
  }
  /** Only after external exact-owner native exit AND original receipt reconciliation, never a timer. */
  confirmDemandOwnerReconciled(proof: StorageDemandReconciliation): void {
    if (
      this.phase !== 'fenced' ||
      !this.writer ||
      !sameStorageOwner(this.writer.owner, proof.owner) ||
      proof.physicalExitConfirmed !== true ||
      proof.originalReceiptReconciliationConfirmed !== true
    )
      throw new HbarError('STORAGE_RECONCILIATION_REQUIRED', 'Original storage owner and receipts must be reconciled')
    for (const held of this.unknownPhysical) {
      if (!sameStorageOwner(held.owner, proof.owner)) continue
      this.unknownPhysical.delete(held)
      held.settle()
    }
    // Still fenced. After counters settle the existing reconcileExited(owner) boundary is required.
  }
  afterIdle(expectedOwner: RuntimeOwner, result: StorageIdleOutcome): void {
    const held = this.idleBoundary
    if (
      !held ||
      !sameStorageOwner(held.owner, expectedOwner) ||
      this.writer !== held.writer ||
      !sameStorageOwner(held.writer.owner, expectedOwner) ||
      this.phase !== 'handover'
    ) {
      this.fence('STORAGE_IDLE_OUTCOME_UNKNOWN')
      throw new HbarError('STORAGE_IDLE_OUTCOME_UNKNOWN', 'Storage idle owner requires reconciliation')
    }
    if (result.status === 'busy' && result.checkpointed === false) {
      this.idleBoundary = undefined
      this.phase = 'serving'
      this.pump()
      return
    }
    if (
      result.status !== 'confirmed-physical-exit' ||
      !sameStorageOwner(result.checkpoint.owner, expectedOwner) ||
      result.exitCode !== 0 ||
      !result.disposalAcknowledged ||
      !result.nativeJoined ||
      !result.checkpoint.databaseCloseAcknowledged ||
      !result.checkpoint.workerExitConfirmed ||
      !result.checkpoint.writerLeaseReleased ||
      this.active ||
      this.activeWrites ||
      this.queue.length ||
      this.bytes ||
      result.checkpoint.queuedSessionCount !== 0 ||
      this.demandLeases.size ||
      this.maintenance
    ) {
      this.fence('STORAGE_IDLE_OUTCOME_UNKNOWN')
      return
    }
    this.writer = undefined
    this.idleBoundary = undefined
    this.phase = 'waiting'
    this.reasonCode = null
    this.queueVersion++
    this.queuedSessionCount = 0 // Explicit close checkpoint verified the actual empty domain queue.
    // A later demand acquires Manager authority, opens a fresh Worker and installs it. No call replay.
  }
  fence(reasonCode = 'STORAGE_RESULT_UNKNOWN'): void {
    if (this.phase === 'closed') return
    this.phase = 'fenced'
    this.reasonCode = reasonCode
    this.queueVersion++
    this.queuedSessionCount = null
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
