import { HbarError } from '@hbar/contracts'
import type { RuntimeCoordinator } from '@hbar/runtime'
import type { ExecutionOwnership, RuntimeOwner } from '@hbar/contracts/runtime'

export interface RecoveryDispatch {
  readonly owner: RuntimeOwner
  readonly result: Promise<unknown>
  readonly settled: Promise<unknown>
  /** Release only after a physical reply, source-level non-dispatch, or exact native/onExit proof. */
  release(): void
  exited(): boolean
}
export type RecoveryDispatchStart = (
  settled: (event: 'reply' | 'not-dispatched') => void,
  captureOwner: (owner: RuntimeOwner) => void,
) => RecoveryDispatch | Promise<RecoveryDispatch>

export interface RecoveryNotificationFailure {
  readonly sessionId: string
  readonly runId: string
  readonly errorCode: string
  readonly physicalPending: boolean
  readonly owner: RuntimeOwner | null
}

interface Attempt {
  readonly kind: 'recover' | 'notify'
  readonly notificationRevision: number
  handle: RecoveryDispatch | null
  notDispatched: boolean
  replied: boolean
  physical: boolean
}
interface Responsibility {
  draft: ExecutionOwnership
  phase: 'live' | 'recover' | 'replay' | 'cleanup' | 'notify'
  notificationFailureReported: boolean
  notificationRevision: number
  notificationAcknowledged: boolean
  notificationOwner: RuntimeOwner | null
  inheritedNotification: boolean
  recoverKnown: boolean
  replayKnown: boolean
  attempt: Attempt | null
}

/** One slot is reserved at the original claim boundary, never while retiring an owner.
 * Notification responsibility is logical scheduling work, not old execution authority.
 */
export class RuntimeRecoveryResponsibility {
  private readonly records = new Map<string, Responsibility>()
  private readonly physical = new Set<Attempt>()
  private stopped = false
  private readonly reservations = new Map<string, object>()
  private readonly waiters = new Set<() => void>()

  async withClaimReservation<Result>(
    sessionId: string,
    signal: AbortSignal,
    operation: () => Promise<Result>,
    ready: () => boolean = () => true,
  ): Promise<Result> {
    signal.throwIfAborted()
    if (this.stopped) throw new HbarError('RUNTIME_STOPPING', 'Recovery admission is closed')
    const token = {}
    while (!ready() || !this.reserve(sessionId, token)) {
      if (this.waiters.size >= 4096)
        throw new HbarError('RUNTIME_DEPENDENCY_UNAVAILABLE', 'Claim admission wait capacity is exhausted')
      await new Promise<void>((resolve, reject) => {
        const changed = (): void => {
          cleanup()
          resolve()
        }
        const aborted = (): void => {
          cleanup()
          reject(signal.reason)
        }
        const cleanup = (): void => {
          this.waiters.delete(changed)
          signal.removeEventListener('abort', aborted)
        }
        this.waiters.add(changed)
        signal.addEventListener('abort', aborted, { once: true })
        if (signal.aborted) aborted()
      })
      signal.throwIfAborted()
      if (this.stopped) throw new HbarError('RUNTIME_STOPPING', 'Recovery admission is closed')
    }
    try {
      signal.throwIfAborted()
      return await operation()
    } finally {
      if (this.reservations.get(sessionId) === token) this.reservations.delete(sessionId)
      this.capacityChanged()
    }
  }

  private reserve(sessionId: string, token: object): boolean {
    if (this.reservations.has(sessionId)) return false
    const notificationSessions = new Set(
      [...this.records.values()].filter((record) => record.phase === 'notify').map((record) => record.draft.sessionId),
    )
    const extra = [...this.reservations.keys()].filter((id) => !notificationSessions.has(id)).length
    const inherited = [...this.records.values()].filter(
      (record) => record.phase === 'notify' && record.draft.sessionId === sessionId,
    ).length
    if (this.records.size + extra - inherited >= this.maximum) return false
    this.reservations.set(sessionId, token)
    return true
  }

  refreshAdmissions(): void {
    for (const wake of [...this.waiters]) wake()
  }

  hasSession(sessionId: string): boolean {
    return [...this.records.values()].some((record) => record.draft.sessionId === sessionId)
  }

  retryNotification(sessionId: string): boolean {
    let retained = false
    for (const record of this.records.values()) {
      if (record.draft.sessionId !== sessionId) continue
      record.notificationRevision++
      record.notificationAcknowledged = false
      retained = true
    }
    if (retained) this.changed()
    return retained
  }

  notificationOwnerFailed(owner: RuntimeOwner): void {
    for (const record of this.records.values()) {
      const notified = record.attempt?.handle?.owner ?? record.notificationOwner
      if (
        notified?.unitId !== owner.unitId ||
        notified.generation !== owner.generation ||
        notified.incarnation !== owner.incarnation
      )
        continue
      record.notificationRevision++
      record.notificationAcknowledged = false
    }
    this.changed()
  }

  acknowledgeIdle(sessionId: string, owner: RuntimeOwner): void {
    for (const record of [...this.records.values()]) {
      const notified = record.attempt?.handle?.owner ?? record.notificationOwner
      if (
        record.phase !== 'notify' ||
        record.draft.sessionId !== sessionId ||
        notified?.unitId !== owner.unitId ||
        notified.generation !== owner.generation ||
        notified.incarnation !== owner.incarnation
      )
        continue
      this.records.delete(record.draft.runId)
    }
    this.capacityChanged()
  }
  private capacityChanged(): void {
    this.refreshAdmissions()
    this.changed()
  }
  constructor(
    private readonly changed: () => void,
    private readonly maximum = 4096,
    private readonly observeNotificationFailure?: (failure: RecoveryNotificationFailure) => void,
  ) {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 4096)
      throw new RangeError('Invalid recovery responsibility capacity')
  }

  begin(draft: ExecutionOwnership): void {
    if (this.stopped) throw new HbarError('RUNTIME_STOPPING', 'Recovery admission is closed')
    const existing = this.records.get(draft.runId)
    if (existing) {
      this.record(draft.runId, draft)
      if (existing.phase !== 'live')
        throw new HbarError('RUNTIME_RECOVERING', 'An unresolved Run responsibility cannot claim again')
      return
    }
    const notifications = [...this.records.values()].filter(
      (record) => record.phase === 'notify' && record.draft.sessionId === draft.sessionId,
    )
    if (
      this.records.size -
        notifications.length +
        [...this.reservations.keys()].filter(
          (id) =>
            id !== draft.sessionId &&
            ![...this.records.values()].some((record) => record.phase === 'notify' && record.draft.sessionId === id),
        ).length >=
      this.maximum
    )
      throw new HbarError('EXECUTION_CAPACITY', 'Recovery responsibility capacity is exhausted')
    // A real new claim assumes this Session's scheduling obligation. Physical
    // notification attempts remain independently pinned until actual settlement.
    for (const record of notifications) this.records.delete(record.draft.runId)
    this.reservations.delete(draft.sessionId)
    this.records.set(draft.runId, {
      draft,
      phase: 'live',
      inheritedNotification: notifications.length > 0,
      recoverKnown: false,
      replayKnown: false,
      attempt: null,
      notificationFailureReported: false,
      notificationRevision: 0,
      notificationAcknowledged: false,
      notificationOwner: null,
    })
  }

  acknowledgeClaim(draft: ExecutionOwnership, canonical: ExecutionOwnership): void {
    const record = this.record(draft.runId, draft)
    if (
      record.phase !== 'live' ||
      canonical.runId !== draft.runId ||
      canonical.leaseId !== draft.leaseId ||
      canonical.sessionId !== draft.sessionId ||
      canonical.owner.unitId !== draft.owner.unitId ||
      canonical.owner.generation !== draft.owner.generation ||
      canonical.owner.incarnation !== draft.owner.incarnation ||
      JSON.stringify(canonical.versions) !== JSON.stringify(draft.versions) ||
      !Number.isSafeInteger(canonical.fence) ||
      canonical.fence < draft.fence
    )
      throw new HbarError('EXECUTION_PROJECTION_INVALID', 'Canonical claim acknowledgment changed identity')
    record.draft = canonical
  }
  claimEmpty(runId: string): void {
    const record = this.record(runId)
    if (record.inheritedNotification) record.phase = 'notify'
    else this.records.delete(runId)
    this.capacityChanged()
  }

  finish(runId: string): void {
    const record = this.records.get(runId)
    if (record?.phase === 'live') this.records.delete(runId)
    this.capacityChanged()
  }

  async recover(draft: ExecutionOwnership, needed: boolean, start: RecoveryDispatchStart): Promise<boolean> {
    const record = this.record(draft.runId, draft)
    if (record.recoverKnown) return true
    if (record.attempt) return false // Unknown dispatched recovery is never replayed.
    if (!needed) {
      record.recoverKnown = true
      record.phase = 'replay'
      return true
    }
    record.phase = 'recover'
    return this.dispatch(record, 'recover', start)
  }

  async replay(draft: ExecutionOwnership, operation: () => Promise<void>): Promise<void> {
    const record = this.record(draft.runId, draft)
    if (!record.recoverKnown) throw new HbarError('RUNTIME_RECOVERING', 'Recovery acknowledgment is unresolved')
    if (record.replayKnown) return
    await operation()
    record.replayKnown = true
    record.phase = 'cleanup'
  }

  notify(draft: ExecutionOwnership): void {
    const record = this.record(draft.runId, draft)
    if (!record.replayKnown) throw new HbarError('RUNTIME_RECOVERING', 'Recovery delivery is unresolved')
    record.phase = 'notify'
    this.capacityChanged()
  }

  async flush(
    canNotify: (sessionId: string) => boolean,
    start: (sessionId: string) => RecoveryDispatchStart,
  ): Promise<void> {
    if (this.stopped) return
    for (const record of [...this.records.values()]) {
      if (
        record.phase !== 'notify' ||
        record.notificationAcknowledged ||
        record.attempt ||
        !canNotify(record.draft.sessionId)
      )
        continue
      // Pure kernel.wake is an idempotent scheduling notification. A failed
      // notification must not block old-owner cleanup or another Session.
      try {
        await this.dispatch(record, 'notify', start(record.draft.sessionId))
      } catch (error) {
        this.reportNotificationFailure(record, error)
      }
      if (this.records.get(record.draft.runId) === record) {
        this.records.delete(record.draft.runId)
        this.records.set(record.draft.runId, record)
      }
      return // At most one physical notification per ordinary reconciliation.
    }
  }

  reconcilePhysical(): void {
    for (const attempt of [...this.physical]) {
      if (attempt.notDispatched || attempt.replied || attempt.handle?.exited()) this.release(attempt)
    }
    for (const record of this.records.values()) {
      if (record.attempt?.kind === 'notify' && !record.attempt.physical) record.attempt = null
    }
  }

  hasPhysicalOwner(owner: RuntimeOwner): boolean {
    return [...this.physical].some((attempt) => {
      const captured = attempt.handle?.owner
      return (
        captured?.unitId === owner.unitId &&
        captured.generation === owner.generation &&
        captured.incarnation === owner.incarnation
      )
    })
  }

  pending(): boolean {
    return this.records.size > 0 || this.physical.size > 0 || this.reservations.size > 0 || this.waiters.size > 0
  }
  stop(): void {
    this.stopped = true
    this.capacityChanged()
  }

  private reportNotificationFailure(record: Responsibility, error: unknown): void {
    if (record.notificationFailureReported) return
    record.notificationFailureReported = true
    const safeCodes = [
      'RUNTIME_RECOVERING',
      'RUNTIME_IDLE_FENCED',
      'RUNTIME_OWNER_REVOKED',
      'IPC_TIMEOUT',
      'IPC_DISCONNECTED',
      'IPC_CAPACITY',
      'IPC_PROTOCOL',
      'ABORTED',
    ]
    // Read the post-dispatch attempt: a caller failure can retain a physical owner.
    const attempt = record.attempt
    try {
      this.observeNotificationFailure?.({
        sessionId: record.draft.sessionId,
        runId: record.draft.runId,
        errorCode:
          error instanceof HbarError && safeCodes.includes(error.code) ? error.code : 'RECOVERY_NOTIFICATION_FAILED',
        physicalPending: attempt?.physical ?? false,
        owner: attempt?.handle?.owner ?? null,
      })
    } catch {
      /* Observation cannot alter retained notification or physical authority. */
    }
  }

  private record(runId: string, draft?: ExecutionOwnership): Responsibility {
    const record = this.records.get(runId)
    if (!record) throw new HbarError('EXECUTION_PROJECTION_INVALID', 'Original Run responsibility is missing')
    if (
      draft &&
      (record.draft.leaseId !== draft.leaseId ||
        record.draft.sessionId !== draft.sessionId ||
        record.draft.fence !== draft.fence ||
        record.draft.owner.unitId !== draft.owner.unitId ||
        record.draft.owner.generation !== draft.owner.generation ||
        record.draft.owner.incarnation !== draft.owner.incarnation ||
        JSON.stringify(record.draft.versions) !== JSON.stringify(draft.versions))
    )
      throw new HbarError('EXECUTION_PROJECTION_INVALID', 'Run recovery responsibility changed identity')
    return record
  }

  private release(attempt: Attempt): void {
    if (!attempt.physical) return
    attempt.handle?.release()
    attempt.physical = false
    this.physical.delete(attempt)
    this.changed()
  }

  private async dispatch(
    record: Responsibility,
    kind: Attempt['kind'],
    start: RecoveryDispatchStart,
  ): Promise<boolean> {
    if (this.physical.size >= 256) return false
    const attempt: Attempt = {
      kind,
      notificationRevision: record.notificationRevision,
      handle: null,
      notDispatched: false,
      replied: false,
      physical: true,
    }
    record.attempt = attempt
    this.physical.add(attempt)
    try {
      attempt.handle = await start(
        (event) => {
          if (event === 'not-dispatched') attempt.notDispatched = true
          else attempt.replied = true
        },
        (owner) => {
          if (kind === 'notify') record.notificationOwner = owner
        },
      )
    } catch (error) {
      // The start adapter may reject only before IPC submission; acquisition's
      // own unknown startup responsibility remains in HostDemand.
      record.attempt = null
      this.release(attempt)
      throw error
    }
    const handle = attempt.handle
    if (!handle) throw new HbarError('IPC_PROTOCOL', 'Recovery dispatch returned no physical handle')
    const complete = (): void => {
      if (kind === 'recover') {
        record.recoverKnown = true
        record.phase = 'replay'
      } else if (this.records.get(record.draft.runId) === record) {
        record.notificationOwner = handle.owner
        record.notificationAcknowledged = record.notificationRevision === attempt.notificationRevision
      }
      this.release(attempt)
      record.attempt = null
      this.changed()
    }
    // settled observes the original reply even if the caller deadline rejected.
    void handle.settled
      .then(complete, () => {
        if (attempt.notDispatched || attempt.replied || !attempt.physical) {
          this.release(attempt)
          if (attempt.notDispatched || kind === 'notify') record.attempt = null
        }
        // A remote error reply is physical completion, not successful recovery.
        // The adapter marks reply separately so notification can retry safely.
        this.changed()
      })
      .catch(() => {
        // A failed release remains in the physical set; the next reconciliation
        // retries it and propagates any error through the normal Host transition.
        this.changed()
      })
    try {
      await handle.result
      // A valid result also proves the same original physical success.
      if (!record.recoverKnown && kind === 'recover') complete()
      return kind === 'notify' || record.recoverKnown
    } catch (error) {
      if (attempt.notDispatched) {
        this.release(attempt)
        record.attempt = null
      }
      throw error
    }
  }
}

/** Shared by the real Host claim path and its composition regression. */
export async function withRuntimeClaimAdmission<Result>(options: {
  readonly coordinator: Pick<RuntimeCoordinator, 'role' | 'assertCanWrite' | 'executionForSession'>
  readonly responsibility: RuntimeRecoveryResponsibility
  readonly owner: RuntimeOwner
  readonly sessionId: string
  readonly signal: AbortSignal
  readonly pending: () => boolean
  readonly ready: () => boolean
  readonly operation: () => Promise<Result>
  readonly prepare: () => Promise<Result>
}): Promise<Result> {
  const bypass = (): boolean => {
    options.signal.throwIfAborted()
    if (options.coordinator.role(options.owner) !== 'default') return true
    options.coordinator.assertCanWrite(options.owner)
    return !!options.coordinator.executionForSession(options.sessionId) || options.pending()
  }
  // Preserve the original draining/null and existing-authority paths. Their
  // Coordinator operation validates exact Run/owner; they allocate no new slot.
  if (bypass()) return options.operation()
  return options.responsibility.withClaimReservation(
    options.sessionId,
    options.signal,
    () => (bypass() ? options.operation() : options.prepare()),
    options.ready,
  )
}
