import { z } from 'zod'
import { HbarError, type Run } from '@hbar/contracts'
import type { RuntimeRecoveryRecord, RuntimeManualRecovery, StoragePort } from '@hbar/storage'
import type { NodeIntentRecoveryPort } from './node-intent-recovery-port'
import { NodeRecoveryRetryScheduler } from './node-recovery-retry'

export interface RuntimeRecoveryAdmission {
  reconcile(run: Run, record: RuntimeRecoveryRecord): Promise<void>
  check(run: Run): Promise<string | null>
  publish(record: RuntimeRecoveryRecord): void
}

/** Recovery creates a new identity after reconciliation; it never resurrects a historical Run. */
export class RuntimeRecoveryService {
  private readonly pending = new Map<string, Promise<RuntimeRecoveryRecord>>()
  private readonly nodeRecoveryControllers = new Set<AbortController>()
  private closing = false
  private readonly nodeRetries: NodeRecoveryRetryScheduler
  constructor(
    private readonly storage: StoragePort,
    private readonly admission: RuntimeRecoveryAdmission,
    private readonly nodeIntentRecovery?: NodeIntentRecoveryPort,
  ) {
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
  close(): void {
    this.closing = true
    for (const controller of this.nodeRecoveryControllers)
      controller.abort(new HbarError('RUNTIME_CLOSED', 'Kernel recovery is closing'))
    this.nodeRecoveryControllers.clear()
    this.nodeRetries.close()
  }
  resumeManual(predecessorRunId: string, manual: RuntimeManualRecovery): Promise<RuntimeRecoveryRecord> {
    return this.resumeOperation(predecessorRunId, manual)
  }
  private resumeOperation(predecessorRunId: string, manual?: RuntimeManualRecovery): Promise<RuntimeRecoveryRecord> {
    const existing = this.pending.get(predecessorRunId)
    if (existing) return existing
    if (this.pending.size >= 256)
      return Promise.reject(new HbarError('RECOVERY_CAPACITY', 'Recovery admission capacity is exhausted'))
    const operation = this.admit(predecessorRunId, manual).finally(() => this.pending.delete(predecessorRunId))
    this.pending.set(predecessorRunId, operation)
    return operation
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
