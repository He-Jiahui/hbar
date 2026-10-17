import { z } from 'zod'
import { HbarError, type Run } from '@hbar/contracts'
import {
  runtimeManualRecoverySchema,
  type RuntimeRecoveryRecord,
  type RuntimeManualRecovery,
  type StoragePort,
} from '@hbar/storage'
import type { NodeIntentRecoveryPort } from './node-intent-recovery-port'
import { NodeRecoveryRetryScheduler } from './node-recovery-retry'
import { BackendRecoveryDiscovery } from './backend-recovery-discovery'

export interface RuntimeRecoveryAdmission {
  reconcile(run: Run, record: RuntimeRecoveryRecord): Promise<void>
  check(run: Run): Promise<string | null>
  publish(record: RuntimeRecoveryRecord): void
}

interface PendingRecovery {
  manual?: RuntimeManualRecovery
  readonly operation: Promise<RuntimeRecoveryRecord>
}

/** Recovery creates a new identity after reconciliation; it never resurrects a historical Run. */
export class RuntimeRecoveryService {
  private readonly pending = new Map<string, PendingRecovery>()
  private readonly nodeRecoveryControllers = new Set<AbortController>()
  private closing = false
  private readonly nodeRetries: NodeRecoveryRetryScheduler
  private readonly backendDiscovery: BackendRecoveryDiscovery
  constructor(
    private readonly storage: StoragePort,
    private readonly admission: RuntimeRecoveryAdmission,
    private readonly nodeIntentRecovery?: NodeIntentRecoveryPort,
  ) {
    this.backendDiscovery = new BackendRecoveryDiscovery(this.storage, async (runId) => {
      await this.resume(runId)
    })
    this.nodeRetries = new NodeRecoveryRetryScheduler(async (runId) => {
      await this.recover([runId])
    })
  }
  async recover(runIds: readonly string[]): Promise<RuntimeRecoveryRecord[]> {
    if (this.closing) return []
    const ids = z.array(z.string().min(1).max(160)).max(256).parse(runIds)
    const recoveryScope = { runIds: ids, preserveQueued: true, preserveApprovals: true }
    const waiting: string[] = []
    if (!this.nodeIntentRecovery) {
      await this.storage.call('recover', recoveryScope)
    } else {
      // First let Storage recover every ordinary interrupted call while keeping
      // precisely bound node runs intact until their receipts are authoritative.
      await this.storage.call('recover', { ...recoveryScope, deferNodeExecutions: true })
      if (this.closing) return []
      const resumable: string[] = []
      const controller = new AbortController()
      this.nodeRecoveryControllers.add(controller)
      // Keep Host startup/read access responsive; reconnect receipts are retried
      // asynchronously by the bounded per-Run scheduler below.
      const timer = setTimeout(
        () => controller.abort(new HbarError('NODE_RECEIPT_TIMEOUT', 'Node receipt recovery timed out')),
        5_000,
      )
      timer.unref?.()
      try {
        for (const id of new Set(ids)) {
          const run = await this.storage.call('run', id)
          if (run.status !== 'running' && run.status !== 'waiting_approval' && run.status !== 'interrupted') continue
          if (controller.signal.aborted) {
            this.scheduleNodeRetry(id)
            waiting.push(id)
            continue
          }
          try {
            const outcome = await this.nodeIntentRecovery.reconcileRun(id, controller.signal)
            if (outcome === 'settled') {
              resumable.push(id)
              this.clearNodeRetry(id)
            } else {
              this.scheduleNodeRetry(id)
              waiting.push(id)
            }
          } catch (error) {
            const unavailable =
              error instanceof HbarError &&
              [
                'NODE_OFFLINE',
                'NODE_BUSY',
                'NODE_LINK_UNAVAILABLE',
                'NODE_RESULT_UNKNOWN',
                'RUNTIME_RECOVERING',
              ].includes(error.code)
            if (!controller.signal.aborted && !unavailable) throw error
            this.scheduleNodeRetry(id)
            waiting.push(id)
          }
        }
      } finally {
        clearTimeout(timer)
        this.nodeRecoveryControllers.delete(controller)
      }
      if (this.closing) return []
      // Runs still waiting on an authenticated node remain unchanged. A bounded
      // per-Run timer retries receipt reconciliation; no continuation is queued.
      if (resumable.length) await this.storage.call('recover', { ...recoveryScope, runIds: resumable })
    }
    const records: RuntimeRecoveryRecord[] = []
    // Reconciliation writes are serialized; only one continuation identity can be created per predecessor.
    for (const id of new Set(ids)) {
      if (this.nodeIntentRecovery && waiting.includes(id)) continue
      const run = await this.storage.call('run', id)
      if (run.status === 'interrupted') records.push(await this.resume(id))
    }
    return records
  }
  resume(predecessorRunId: string): Promise<RuntimeRecoveryRecord> {
    return this.resumeOperation(predecessorRunId)
  }
  get backendDiscoveryPending(): boolean {
    return this.backendDiscovery.pending
  }
  discoverBackendWaiting(canContinue: () => boolean): void {
    this.backendDiscovery.request(canContinue)
  }
  pauseBackendDiscovery(): void {
    this.backendDiscovery.pause()
  }
  waitForBackendDiscovery(): Promise<void> {
    return this.backendDiscovery.waitForSettlement()
  }
  close(): void {
    this.closing = true
    this.backendDiscovery.close()
    for (const controller of this.nodeRecoveryControllers)
      controller.abort(new HbarError('RUNTIME_CLOSED', 'Kernel recovery is closing'))
    this.nodeRecoveryControllers.clear()
    this.nodeRetries.close()
  }
  resumeManual(predecessorRunId: string, manual: RuntimeManualRecovery): Promise<RuntimeRecoveryRecord> {
    const parsed = runtimeManualRecoverySchema.safeParse(manual)
    if (!parsed.success)
      return Promise.reject(new HbarError('INVALID_INPUT', 'Manual recovery requires its canonical command identity'))
    return this.resumeOperation(predecessorRunId, parsed.data)
  }
  private resumeOperation(predecessorRunId: string, manual?: RuntimeManualRecovery): Promise<RuntimeRecoveryRecord> {
    if (this.closing) return Promise.reject(new HbarError('RUNTIME_CLOSED', 'Kernel recovery is closing'))
    const existing = this.pending.get(predecessorRunId)
    if (existing) {
      if (manual) {
        if (
          existing.manual &&
          (existing.manual.command.actorId !== manual.command.actorId ||
            existing.manual.command.inputHash !== manual.command.inputHash)
        )
          return Promise.reject(new HbarError('IDEMPOTENCY_CONFLICT', 'Recovery already has another manual command'))
        if (
          existing.manual &&
          (existing.manual.requestId !== manual.requestId ||
            existing.manual.command.idempotencyKey !== manual.command.idempotencyKey)
        )
          return Promise.reject(
            new HbarError('CONTINUATION_ALREADY_EXISTS', 'Recovery already belongs to another manual request'),
          )
        existing.manual ??= manual
      }
      return existing.operation
    }
    if (this.pending.size >= 256)
      return Promise.reject(new HbarError('RECOVERY_CAPACITY', 'Recovery admission capacity is exhausted'))
    // Start in a microtask so the one shared entry exists before any storage or observer callback.
    const entry: PendingRecovery = {
      ...(manual ? { manual } : {}),
      operation: Promise.resolve().then(() => this.admitPending(predecessorRunId, entry)),
    }
    this.pending.set(predecessorRunId, entry)
    return entry.operation
  }
  private async admitPending(predecessorRunId: string, entry: PendingRecovery): Promise<RuntimeRecoveryRecord> {
    try {
      if (this.closing) throw new HbarError('RUNTIME_CLOSED', 'Kernel recovery is closing')
      const manual = entry.manual
      const record = await this.admit(predecessorRunId, manual)
      // A late manual request gets one recheck; accepted or uncertain writes never get replayed here.
      if (!record.run && !manual && entry.manual && !this.closing)
        return await this.admit(predecessorRunId, entry.manual)
      return record
    } finally {
      // No await between the last handoff check and removal: late callers start a fresh recheck.
      if (this.pending.get(predecessorRunId) === entry) this.pending.delete(predecessorRunId)
    }
  }
  private async admit(predecessorRunId: string, manual?: RuntimeManualRecovery): Promise<RuntimeRecoveryRecord> {
    let record = await this.storage.call('runtimeRecoveryPlan', predecessorRunId)
    if (
      record.run ||
      (record.chain.status === 'manual_required' && (!manual || record.chain.reasonCode !== 'RECOVERY_LIMIT'))
    )
      return record
    record = await this.storage.call('runtimeRecoveryHold', predecessorRunId, record.recoveryId, null, manual)
    if (record.chain.status !== 'pending') {
      this.publish(record)
      return record
    }
    const run = await this.storage.call('run', predecessorRunId)
    let reason: string | null
    try {
      await this.storage.call('runtimeRecoveryReconcile', predecessorRunId, record.recoveryId)
      await this.admission.reconcile(run, record)
      reason = await this.admission.check(await this.storage.call('run', predecessorRunId))
    } catch (error) {
      reason = error instanceof HbarError ? error.code : 'RECOVERY_RECONCILIATION_FAILED'
    }
    if (reason)
      record = await this.storage.call('runtimeRecoveryHold', predecessorRunId, record.recoveryId, reason, manual)
    else record = await this.storage.call('runtimeRecoveryQueue', predecessorRunId, record.recoveryId)
    this.publish(record)
    return record
  }
  private publish(record: RuntimeRecoveryRecord): void {
    try {
      this.admission.publish(record)
    } catch {
      console.error('[hbar recovery] state observer failed')
    }
  }
  private scheduleNodeRetry(runId: string): void {
    this.nodeRetries.schedule(runId)
  }
  private clearNodeRetry(runId: string): void {
    this.nodeRetries.clear(runId)
  }
}
