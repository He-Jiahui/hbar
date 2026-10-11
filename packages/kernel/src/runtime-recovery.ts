import { z } from 'zod'
import { HbarError, type Run } from '@hbar/contracts'
import type { RuntimeRecoveryRecord, RuntimeManualRecovery, StoragePort } from '@hbar/storage'

export interface RuntimeRecoveryAdmission {
  reconcile(run: Run, record: RuntimeRecoveryRecord): Promise<void>
  check(run: Run): Promise<string | null>
  publish(record: RuntimeRecoveryRecord): void
}

/** Recovery creates a new identity after reconciliation; it never resurrects a historical Run. */
export class RuntimeRecoveryService {
  private readonly pending = new Map<string, Promise<RuntimeRecoveryRecord>>()
  constructor(
    private readonly storage: StoragePort,
    private readonly admission: RuntimeRecoveryAdmission,
  ) {}
  async recover(runIds: readonly string[]): Promise<RuntimeRecoveryRecord[]> {
    const ids = z.array(z.string().min(1).max(160)).max(256).parse(runIds)
    await this.storage.call('recover', { runIds: ids, preserveQueued: true, preserveApprovals: true })
    const records: RuntimeRecoveryRecord[] = []
    // Reconciliation writes are serialized; only one continuation identity can be created per predecessor.
    for (const id of new Set(ids)) {
      const run = await this.storage.call('run', id)
      if (run.status === 'interrupted') records.push(await this.resume(id))
    }
    return records
  }
  resume(predecessorRunId: string): Promise<RuntimeRecoveryRecord> {
    return this.resumeOperation(predecessorRunId)
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
}
