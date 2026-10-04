import { HbarError } from '@hbar/contracts'
import type {
  SessionLaunchTarget,
  SessionLaunchTargetPreparationOperationInput,
  SessionLaunchTargetPreparationSnapshot,
  SessionLaunchTargetPreparationStartReceipt,
} from '@hbar/contracts/commands/session-launch-target'
import type {
  SessionLaunchTargetPreparationOperationRecord,
  SessionLaunchTargetPreparationStartMutationInput,
  SessionLaunchTargetPreparationOperationTransitionInput,
  StoragePort,
} from '@hbar/storage'

const MAX_ACTIVE_PREPARATIONS = 4
const MAX_QUEUED_PREPARATIONS = 64
const SHUTDOWN_ERROR = new HbarError('HOST_SHUTTING_DOWN', 'Host is shutting down')
const CANCEL_ERROR = new HbarError('USER_CANCELLED', 'Launch-target preparation cancellation was requested')
const RECONCILE_ERROR = {
  code: 'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
  message: 'Preparation was interrupted; verify the persisted worktree before continuing',
}

interface PreparationCallbacks {
  prepare(sessionId: string, revision: number, signal: AbortSignal): Promise<SessionLaunchTarget>
  reconcile(sessionId: string, revision: number, signal: AbortSignal): Promise<SessionLaunchTarget>
  reconcileCancellation(sessionId: string, revision: number, signal: AbortSignal): Promise<SessionLaunchTarget>
  readTarget(sessionId: string): Promise<SessionLaunchTarget>
}

interface QueuedOperation {
  operationId: string
  sessionId: string
  expectedRevision: number
  recovering: boolean
}

interface ActiveOperation extends QueuedOperation {
  controller: AbortController
  completion: Promise<void>
}

function identity(
  record: Pick<SessionLaunchTargetPreparationSnapshot, 'sessionId' | 'targetRevision' | 'operationId'>,
): SessionLaunchTargetPreparationOperationInput {
  return {
    sessionId: record.sessionId,
    expectedRevision: record.targetRevision,
    operationId: record.operationId,
  }
}

function operationError(error: unknown): { code: string; message: string } {
  if (error instanceof HbarError) return { code: error.code, message: error.message.slice(0, 1_000) }
  return {
    code: 'SESSION_LAUNCH_TARGET_PREPARATION_FAILED',
    message: 'Host could not complete launch-target preparation',
  }
}

function isTerminal(snapshot: SessionLaunchTargetPreparationSnapshot): boolean {
  return snapshot.status === 'ready' || snapshot.status === 'cancelled' || snapshot.status === 'failed'
}

export class SessionLaunchTargetPreparationService {
  private readonly queue: QueuedOperation[] = []
  private readonly queued = new Map<string, QueuedOperation>()
  private readonly active = new Map<string, ActiveOperation>()
  private readonly deferredRecoveries = new Map<string, QueuedOperation>()
  private readonly shutdownController = new AbortController()
  private closed = false

  constructor(
    private readonly storage: StoragePort,
    private readonly callbacks: PreparationCallbacks,
    private readonly onChanged: () => void = () => undefined,
  ) {}

  async start(
    input: SessionLaunchTargetPreparationStartMutationInput,
  ): Promise<SessionLaunchTargetPreparationStartReceipt> {
    if (this.closed) throw new HbarError('HOST_SHUTTING_DOWN', 'Host is shutting down')
    const receipt = await this.storage.call('startSessionLaunchTargetPreparation', input)
    const identity: SessionLaunchTargetPreparationOperationInput = {
      sessionId: receipt.sessionId,
      expectedRevision: receipt.targetRevision,
      operationId: receipt.operationId,
    }
    const snapshot = await this.storage.call('sessionLaunchTargetPreparation', identity).catch(() => null)
    if (!snapshot || !isTerminal(snapshot)) this.enqueue({ ...identity, recovering: false })
    return receipt
  }

  read(input: SessionLaunchTargetPreparationOperationInput): Promise<SessionLaunchTargetPreparationSnapshot> {
    return this.storage.call('sessionLaunchTargetPreparation', input)
  }

  async cancel(input: SessionLaunchTargetPreparationOperationInput): Promise<SessionLaunchTargetPreparationSnapshot> {
    const snapshot = await this.storage.call('requestSessionLaunchTargetPreparationCancellation', input)
    if (snapshot.status === 'cancel-requested') {
      this.active.get(snapshot.operationId)?.controller.abort(CANCEL_ERROR)
      this.enqueue({
        operationId: snapshot.operationId,
        sessionId: snapshot.sessionId,
        expectedRevision: snapshot.targetRevision,
        recovering: false,
      })
    }
    this.notifyChanged()
    return snapshot
  }

  async reconcile(
    input: SessionLaunchTargetPreparationOperationInput,
  ): Promise<SessionLaunchTargetPreparationSnapshot> {
    const snapshot = await this.storage.call('sessionLaunchTargetPreparation', input)
    if (!isTerminal(snapshot))
      this.enqueue({
        operationId: snapshot.operationId,
        sessionId: snapshot.sessionId,
        expectedRevision: snapshot.targetRevision,
        recovering: true,
      })
    return snapshot
  }

  async resumePending(): Promise<void> {
    const records = await this.storage.call('pendingSessionLaunchTargetPreparations')
    for (const record of records)
      this.enqueue({
        operationId: record.operationId,
        sessionId: record.sessionId,
        expectedRevision: record.targetRevision,
        recovering: true,
      })
  }

  private enqueue(job: QueuedOperation): void {
    if (this.closed) return
    if (this.active.has(job.operationId)) return
    const existing = this.queued.get(job.operationId)
    if (existing) {
      if (job.recovering) existing.recovering = true
      return
    }
    if (this.queue.length >= MAX_QUEUED_PREPARATIONS) {
      // Storage acceptance caps the durable queue. Keep overflowed work persisted and rescan
      // once a running task frees capacity rather than dropping an accepted operation.
      if (job.recovering) this.deferredRecoveries.set(job.operationId, job)
      this.rescanAfterDrain = true
      return
    }
    this.queued.set(job.operationId, job)
    this.queue.push(job)
    this.pump()
  }

  private pump(): void {
    if (this.closed) return
    while (this.active.size < MAX_ACTIVE_PREPARATIONS && this.queue.length > 0) {
      const job = this.queue.shift()
      if (!job) return
      this.queued.delete(job.operationId)
      const controller = new AbortController()
      const completion = this.perform(job, controller.signal)
        .catch(() => this.recordReconciliationNeeded(job.operationId))
        .finally(() => {
          this.active.delete(job.operationId)
          this.pump()
          if (this.rescanAfterDrain) this.rescanPending()
        })
      this.active.set(job.operationId, { ...job, controller, completion })
    }
  }

  private async perform(job: QueuedOperation, signal: AbortSignal): Promise<void> {
    const initial = await this.storage.call('sessionLaunchTargetPreparationRecord', {
      sessionId: job.sessionId,
      expectedRevision: job.expectedRevision,
      operationId: job.operationId,
    })
    if (!initial || isTerminal(initial)) return
    const operation = identity(initial)
    let current: SessionLaunchTargetPreparationSnapshot = initial

    if (current.status === 'cancel-requested' || initial.cancellationRequested) {
      await this.finishCancellation(current)
      return
    }
    if (current.status === 'queued') {
      current = await this.transition(current, 'preparing', null)
      if (current.status === 'cancel-requested') {
        await this.finishCancellation(current)
        return
      }
      if (isTerminal(current)) return
    } else if (job.recovering && current.status === 'preparing') {
      current = await this.transition(current, 'reconciling', RECONCILE_ERROR)
      if (current.status === 'cancel-requested') {
        await this.finishCancellation(current)
        return
      }
      if (isTerminal(current)) return
    }

    if (signal.aborted) {
      await this.settleAbort(operation, current, signal.reason)
      return
    }

    try {
      const target = job.recovering
        ? await this.callbacks.reconcile(current.sessionId, current.targetRevision, signal)
        : await this.callbacks.prepare(current.sessionId, current.targetRevision, signal)
      await this.settleTarget(operation, target)
    } catch (error) {
      await this.settleError(operation, error)
    }
  }

  private async transition(
    current: SessionLaunchTargetPreparationOperationRecord | SessionLaunchTargetPreparationSnapshot,
    status: SessionLaunchTargetPreparationSnapshot['status'],
    error: { code: string; message: string } | null,
  ): Promise<SessionLaunchTargetPreparationSnapshot> {
    const request: SessionLaunchTargetPreparationOperationTransitionInput = {
      sessionId: current.sessionId,
      expectedRevision: current.targetRevision,
      operationId: current.operationId,
      expectedOperationVersion: current.operationVersion,
      status,
      error,
    }
    const result = await this.storage.call('transitionSessionLaunchTargetPreparation', request)
    this.notifyChanged()
    return result
  }

  private async finishCancellation(
    current: SessionLaunchTargetPreparationOperationRecord | SessionLaunchTargetPreparationSnapshot,
  ): Promise<void> {
    const operation = identity(current)
    const target = await this.callbacks.readTarget(current.sessionId).catch(() => null)
    if (!target) {
      await this.transition(current, 'reconciling', RECONCILE_ERROR)
      return
    }
    if (target.resolution.status === 'ready') {
      await this.transition(current, 'ready', null)
      return
    }
    if (target.resolution.status === 'failed') {
      await this.transition(current, 'failed', { code: target.resolution.code, message: target.resolution.message })
      return
    }
    if (target.resolution.status === 'preparing' || target.resolution.status === 'reconciling') {
      const signal = this.shutdownController.signal
      try {
        const reconciled = await this.callbacks.reconcileCancellation(current.sessionId, current.targetRevision, signal)
        await this.settleTarget(operation, reconciled)
      } catch {
        await this.transition(current, 'reconciling', RECONCILE_ERROR)
      }
      return
    }
    await this.transition(current, 'cancelled', null)
  }

  private async settleTarget(
    operation: SessionLaunchTargetPreparationOperationInput,
    target: SessionLaunchTarget,
  ): Promise<void> {
    const current = await this.storage.call('sessionLaunchTargetPreparationRecord', operation)
    if (isTerminal(current)) return
    switch (target.resolution.status) {
      case 'ready':
        await this.transition(current, 'ready', null)
        return
      case 'failed':
        await this.transition(current, 'failed', { code: target.resolution.code, message: target.resolution.message })
        return
      case 'reconciling':
        await this.transition(current, 'reconciling', {
          code: target.resolution.code,
          message: target.resolution.message,
        })
        return
      case 'cancelled':
        await this.transition(current, 'cancelled', null)
        return
      case 'idle':
      case 'preparing':
        await this.transition(current, 'reconciling', RECONCILE_ERROR)
        return
    }
  }

  private async settleError(operation: SessionLaunchTargetPreparationOperationInput, error: unknown): Promise<void> {
    const current = await this.storage.call('sessionLaunchTargetPreparationRecord', operation)
    if (isTerminal(current)) return
    if (current.status === 'cancel-requested' || current.cancellationRequested) {
      await this.finishCancellation(current)
      return
    }
    const target = await this.callbacks.readTarget(operation.sessionId).catch(() => null)
    if (!target) {
      await this.transition(current, 'reconciling', RECONCILE_ERROR)
      return
    }
    if (target.resolution.status === 'ready') {
      await this.transition(current, 'ready', null)
      return
    }
    if (target.resolution.status === 'failed') {
      await this.transition(current, 'failed', { code: target.resolution.code, message: target.resolution.message })
      return
    }
    if (target.resolution.status === 'reconciling' || target.resolution.status === 'preparing') {
      await this.transition(current, 'reconciling', {
        code: target.resolution.status === 'reconciling' ? target.resolution.code : RECONCILE_ERROR.code,
        message: target.resolution.status === 'reconciling' ? target.resolution.message : RECONCILE_ERROR.message,
      })
      return
    }
    if (this.closed) {
      await this.transition(current, 'reconciling', RECONCILE_ERROR)
      return
    }
    if (error instanceof HbarError && error.code === 'HOST_SHUTTING_DOWN') {
      await this.transition(current, 'reconciling', RECONCILE_ERROR)
      return
    }
    if (error instanceof HbarError && error.code === 'USER_CANCELLED') {
      await this.transition(current, 'cancelled', null)
      return
    }
    await this.transition(current, 'failed', operationError(error))
  }

  private async settleAbort(
    operation: SessionLaunchTargetPreparationOperationInput,
    current: SessionLaunchTargetPreparationOperationRecord | SessionLaunchTargetPreparationSnapshot,
    reason: unknown,
  ): Promise<void> {
    if (reason instanceof HbarError && reason.code === 'HOST_SHUTTING_DOWN') {
      await this.transition(current, 'reconciling', RECONCILE_ERROR)
      return
    }
    await this.settleError(operation, reason)
  }

  private rescanAfterDrain = false
  private rescanning = false
  private rescanCompletion: Promise<void> | null = null

  private rescanPending(): void {
    if (this.closed || this.rescanning || this.queue.length >= MAX_QUEUED_PREPARATIONS) return
    this.rescanning = true
    this.rescanAfterDrain = false
    const completion = this.storage
      .call('pendingSessionLaunchTargetPreparations')
      .then((records) => {
        const pendingById = new Map(records.map((record) => [record.operationId, record]))
        for (const [operationId, job] of this.deferredRecoveries) {
          const record = pendingById.get(operationId)
          if (!record || this.active.has(operationId) || this.queued.has(operationId)) {
            this.deferredRecoveries.delete(operationId)
            continue
          }
          if (this.queue.length >= MAX_QUEUED_PREPARATIONS) {
            this.rescanAfterDrain = true
            break
          }
          this.deferredRecoveries.delete(operationId)
          this.enqueue({ ...job, recovering: true })
        }
        for (const record of records) {
          if (record.status !== 'queued' && record.status !== 'cancel-requested') continue
          if (this.active.has(record.operationId) || this.queued.has(record.operationId)) continue
          if (this.queue.length >= MAX_QUEUED_PREPARATIONS) {
            this.rescanAfterDrain = true
            break
          }
          this.enqueue({
            operationId: record.operationId,
            sessionId: record.sessionId,
            expectedRevision: record.targetRevision,
            recovering: false,
          })
        }
      })
      .catch(() => {
        this.rescanAfterDrain = true
      })
      .finally(() => {
        this.rescanning = false
        this.rescanCompletion = null
      })
    this.rescanCompletion = completion
    void completion
  }

  private async recordReconciliationNeeded(operationId: string): Promise<void> {
    try {
      const pending = await this.storage.call('pendingSessionLaunchTargetPreparations')
      const record = pending.find((candidate) => candidate.operationId === operationId)
      if (!record || isTerminal(record)) return
      if (record.status === 'cancel-requested' || record.cancellationRequested) {
        await this.finishCancellation(record)
        return
      }
      await this.transition(record, 'reconciling', RECONCILE_ERROR)
    } catch {
      // A storage failure leaves the last durable state available for startup recovery.
    }
  }

  private notifyChanged(): void {
    try {
      this.onChanged()
    } catch {
      // Notifications are hints; the operation snapshot remains the source of truth.
    }
  }

  async close(): Promise<void> {
    this.closed = true
    this.shutdownController.abort(SHUTDOWN_ERROR)
    for (const active of this.active.values()) active.controller.abort(SHUTDOWN_ERROR)
    await Promise.all([
      ...[...this.active.values()].map((active) => active.completion),
      ...(this.rescanCompletion ? [this.rescanCompletion] : []),
    ])
    this.queue.length = 0
    this.queued.clear()
  }
}
