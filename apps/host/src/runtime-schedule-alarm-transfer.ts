import { randomUUID } from 'node:crypto'
import type { DemandLease, DemandOwner, RuntimePhysicalRetirementReceipt } from '@hbar/runtime'
import {
  RuntimeDemandAlarmScheduler,
  type RuntimeAlarmAttempt,
  type RuntimeAlarmClock,
  type RuntimeAlarmOutcome,
  type RuntimeDemandAlarm,
} from './runtime-demand-alarm-scheduler'
import {
  scheduleIdleManifestSchema,
  scheduleTransferAckSchema,
  scheduleWakeReplySchema,
  sameScheduleSource,
  type ScheduleIdleManifest,
  type ScheduleTransferAck,
  type ScheduleWakeReply,
} from './runtime-schedule-idle-contract'

export interface ScheduleAlarmTransferPorts {
  acquire(signal: AbortSignal): Promise<DemandLease>
  /** Current activated catalog metadata only; no transparent cross-database fallback. */
  catalog(): { readonly revision: string; readonly databaseIds: readonly string[] }
  wake(
    owner: DemandOwner,
    ack: ScheduleTransferAck,
    attempt: RuntimeAlarmAttempt,
    signal: AbortSignal,
  ): Promise<ScheduleWakeReply>
  /** Actual trusted joined-owner-exit receipt, not a logical RPC rejection/timeout. */
  physicalExit(owner: DemandOwner): Promise<'confirmed-physical-exit' | 'unknown'>
}
interface Transfer {
  readonly owner: DemandOwner
  readonly ack: ScheduleTransferAck
  readonly manifest: ScheduleIdleManifest
}
interface CommittedTransfer extends Transfer {
  readonly phase: 'prepared' | 'armed' | 'delivered'
  readonly earliestDueAt: number
}
interface Held {
  readonly lease: DemandLease
  readonly attempt: RuntimeAlarmAttempt
}
function sameOwner(left: DemandOwner, right: DemandOwner): boolean {
  return left.unitId === right.unitId && left.generation === right.generation && left.incarnation === right.incarnation
}
function sameAck(left: ScheduleTransferAck, right: ScheduleTransferAck): boolean {
  return (
    left.epoch === right.epoch &&
    left.token === right.token &&
    left.version === right.version &&
    left.databaseId === right.databaseId &&
    left.sourceRevision === right.sourceRevision &&
    left.catalogRevision === right.catalogRevision
  )
}
function sameAttempt(left: RuntimeAlarmAttempt, right: RuntimeAlarmAttempt): boolean {
  return (
    left.key === right.key &&
    left.id === right.id &&
    left.version === right.version &&
    left.epoch === right.epoch &&
    left.attempt === right.attempt
  )
}

/** Stable Host consumer: one bounded Schedule-domain transfer and one exact physical due invocation. */
export class RuntimeScheduleAlarmTransfer {
  private readonly alarms: RuntimeDemandAlarmScheduler
  private sequence = 0
  private offered: Transfer | null = null
  private committed: CommittedTransfer | null = null
  private held: Held | null = null
  private retiredPhysical: { readonly owner: DemandOwner; readonly attempt: RuntimeAlarmAttempt } | null = null
  private foregroundOwner: DemandOwner | null = null
  private wakeOwner: DemandOwner | null = null
  private stopped = false
  private paused = false

  constructor(
    private readonly epoch: string,
    private readonly ports: ScheduleAlarmTransferPorts,
    clock?: RuntimeAlarmClock,
  ) {
    this.alarms = new RuntimeDemandAlarmScheduler(
      epoch,
      { due: (alarm, signal, attempt) => this.due(alarm, signal, attempt) },
      clock,
      { maxKeys: 1 },
    )
  }

  /** ACK is only reservation/receipt by this parent. Child must not pause before receiving it. */
  offer(owner: DemandOwner, input: ScheduleIdleManifest): ScheduleTransferAck {
    if (
      this.stopped ||
      this.paused ||
      this.offered ||
      this.committed?.phase === 'prepared' ||
      this.alarms.peek().inFlight
    )
      throw new Error('SCHEDULE_TRANSFER_BUSY')
    const manifest = scheduleIdleManifestSchema.parse(input)
    if (owner.unitId !== 'controller' || manifest.snapshot.coverage !== 'complete')
      throw new Error('SCHEDULE_CHECKPOINT_INCOMPLETE')
    const catalog = this.ports.catalog()
    // Current schema stores all schedules in one DB. Future project DBs need independently collected revisions.
    if (catalog.databaseIds.length !== 1 || catalog.databaseIds[0] !== manifest.snapshot.database.id)
      throw new Error('SCHEDULE_DATABASE_CATALOG_INCOMPLETE')
    if (this.sequence >= Number.MAX_SAFE_INTEGER) throw new Error('SCHEDULE_TRANSFER_SEQUENCE_EXHAUSTED')
    const ack = scheduleTransferAckSchema.parse({
      epoch: this.epoch,
      token: randomUUID(),
      version: ++this.sequence,
      databaseId: manifest.snapshot.database.id,
      sourceRevision: manifest.snapshot.database.sourceRevision,
      catalogRevision: catalog.revision,
    })
    this.offered = { owner: { ...owner }, ack, manifest }
    return { ...ack }
  }

  /** Called only after this exact child has quiesced requests/ticks and re-read the atomic Storage DTO. */
  commit(owner: DemandOwner, ack: ScheduleTransferAck, verified: ScheduleIdleManifest): void {
    verified = scheduleIdleManifestSchema.parse(verified)
    const transfer = this.offered
    if (this.stopped || !transfer || !sameOwner(transfer.owner, owner) || !sameAck(transfer.ack, ack))
      throw new Error('SCHEDULE_TRANSFER_STALE')
    const catalog = this.ports.catalog()
    if (
      catalog.revision !== ack.catalogRevision ||
      catalog.databaseIds.length !== 1 ||
      catalog.databaseIds[0] !== ack.databaseId ||
      !sameScheduleSource(transfer.manifest, verified)
    )
      throw new Error('SCHEDULE_CHECKPOINT_CHANGED')
    const offeredDueAt = transfer.manifest.nextDueAt
    const verifiedDueAt = verified.nextDueAt
    if (offeredDueAt === null || verifiedDueAt === null) throw new Error('SCHEDULE_ALARM_DEADLINE_REQUIRED')
    // Do not arm yet: the child must acknowledge its committed phase before a due callback can reach it.
    // Keep the verified observation truthful without extending the previously offered absolute deadline.
    this.committed = {
      ...transfer,
      manifest: verified,
      phase: 'prepared',
      earliestDueAt: Math.min(offeredDueAt, verifiedDueAt),
    }
    this.foregroundOwner = null
    this.wakeOwner = null
    this.offered = null
  }

  /** Final exact child-commit ACK. Only an armed transfer permits retirement or clean restore. */
  activate(owner: DemandOwner, ack: ScheduleTransferAck): void {
    const transfer = this.committed
    if (
      this.stopped ||
      !transfer ||
      !sameOwner(transfer.owner, owner) ||
      !sameAck(transfer.ack, ack) ||
      transfer.phase === 'delivered'
    )
      throw new Error('SCHEDULE_TRANSFER_STALE')
    const nextDueAt = transfer.earliestDueAt
    if (transfer.phase === 'armed') return
    const catalog = this.ports.catalog()
    if (
      catalog.revision !== ack.catalogRevision ||
      catalog.databaseIds.length !== 1 ||
      catalog.databaseIds[0] !== ack.databaseId
    )
      throw new Error('SCHEDULE_DATABASE_CATALOG_CHANGED')
    const alarm: RuntimeDemandAlarm = {
      key: 'controller:schedule',
      id: ack.token,
      version: ack.version,
      epoch: ack.epoch,
      unitId: 'controller',
      dueAt: nextDueAt,
    }
    if (this.alarms.upsert(alarm) !== 'accepted') throw new Error('SCHEDULE_ALARM_NOT_ACCEPTED')
    this.committed = { ...transfer, phase: 'armed' }
  }

  /** A rejected prepare may resume the same child's existing timer; no startup/recovery is requested. */
  abort(owner: DemandOwner, ack: ScheduleTransferAck): boolean {
    if (!this.offered || !sameOwner(this.offered.owner, owner) || !sameAck(this.offered.ack, ack)) return false
    this.offered = null
    return true
  }

  /** Pure metadata only. Root MUST independently prove this exact old owner's physical exit first. */
  restoreAck(oldOwner: DemandOwner): ScheduleTransferAck | null {
    const transfer = this.committed
    const state = this.alarms.peek()
    if (
      this.stopped ||
      this.offered ||
      this.held ||
      state.inFlight ||
      state.inFlightFenced ||
      !transfer ||
      transfer.phase !== 'armed' ||
      !sameOwner(transfer.owner, oldOwner)
    )
      return null
    const alarm = state.entries[0]
    if (
      !alarm ||
      (alarm.phase !== 'queued' && alarm.phase !== 'running') ||
      alarm.alarm.id !== transfer.ack.token ||
      alarm.alarm.version !== transfer.ack.version
    )
      return null
    const catalog = this.ports.catalog()
    if (
      catalog.revision !== transfer.ack.catalogRevision ||
      catalog.databaseIds.length !== 1 ||
      catalog.databaseIds[0] !== transfer.ack.databaseId
    )
      return null
    return { ...transfer.ack }
  }

  /** Read the same frozen absolute checkpoint; this neither dispatches nor consumes its ACK. */
  restoreManifest(oldOwner: DemandOwner, expected: ScheduleTransferAck): ScheduleIdleManifest | null {
    const ack = this.restoreAck(oldOwner)
    const transfer = this.committed
    return ack && transfer && sameAck(ack, expected) ? structuredClone(transfer.manifest) : null
  }

  /** Trusted Host hook after this exact peer's restore ACK and first actual serving publication. */
  activationRestored(owner: DemandOwner, expected: ScheduleTransferAck, raw: ScheduleWakeReply): void {
    const reply = scheduleWakeReplySchema.parse(raw)
    const transfer = this.committed
    if (
      this.stopped ||
      this.offered ||
      !transfer ||
      transfer.phase === 'prepared' ||
      !sameAck(transfer.ack, expected) ||
      owner.unitId !== 'controller' ||
      owner.generation <= transfer.owner.generation ||
      owner.incarnation === transfer.owner.incarnation ||
      reply.manifest.snapshot.database.id !== expected.databaseId ||
      (this.wakeOwner && !sameOwner(this.wakeOwner, owner)) ||
      this.held
    )
      throw new Error('SCHEDULE_ACTIVATION_ACK_MISMATCH')
    if (transfer.phase === 'delivered') return
    // This is the already completed original physical result, so a later
    // catalog refresh cannot rewrite it. Future admissions still validate catalog.
    this.wakeOwner = { ...owner }
    this.committed = { ...transfer, phase: 'delivered' }
    // Never abort an in-flight acquisition/attempt. It joins the cached ACK after
    // ready, then its original scheduler continuation observes the completed transfer.
    if (!this.alarms.peek().inFlight)
      this.alarms.cancel({
        key: 'controller:schedule',
        id: expected.token,
        version: expected.version,
        epoch: expected.epoch,
      })
  }

  /**
   * Root already holds its request lease. This joins the same scheduler attempt as due, with its own
   * internal physical lease. It does not consume the Root lease or admit foreground application work.
   */
  async wakeForeground(owner: DemandOwner, expected: ScheduleTransferAck): Promise<void> {
    const ack = scheduleTransferAckSchema.parse(expected)
    const transfer = this.committed
    if (this.stopped || this.offered || !transfer || transfer.phase === 'prepared' || !sameAck(transfer.ack, ack))
      throw new Error('SCHEDULE_TRANSFER_STALE')
    if (
      owner.unitId !== 'controller' ||
      (this.wakeOwner && !sameOwner(this.wakeOwner, owner)) ||
      (this.foregroundOwner && !sameOwner(this.foregroundOwner, owner))
    )
      throw new Error('SCHEDULE_WAKE_OWNER_MISMATCH')
    // This is a new admission even when a previous exact wake was delivered.
    // Do not apply this current-catalog check to an already dispatched reply below.
    if (!this.sourceCurrent(ack)) throw new Error('SCHEDULE_DATABASE_CATALOG_CHANGED')
    if (transfer.phase === 'delivered') {
      if (!this.wakeOwner || !sameOwner(this.wakeOwner, owner)) throw new Error('SCHEDULE_WAKE_OWNER_MISMATCH')
      return
    }
    if (this.paused) throw new Error('SCHEDULE_ALARMS_PAUSED')
    this.foregroundOwner = { ...owner }
    const run = this.alarms.runNow({
      key: 'controller:schedule',
      id: ack.token,
      version: ack.version,
      epoch: ack.epoch,
    })
    if (run.kind !== 'started' && run.kind !== 'joined') throw new Error('SCHEDULE_WAKE_NOT_CONFIRMED')
    await run.settled
    const delivered = this.committed
    if (
      delivered &&
      sameAck(delivered.ack, ack) &&
      delivered.phase === 'delivered' &&
      this.wakeOwner &&
      sameOwner(this.wakeOwner, owner)
    )
      return
    // A positively known pre-dispatch retry may later be attempted by the ordinary alarm. UNKNOWN retains its fence.
    if (!this.held && this.committed === transfer && this.foregroundOwner && sameOwner(this.foregroundOwner, owner))
      this.foregroundOwner = null
    throw new Error('SCHEDULE_WAKE_NOT_CONFIRMED')
  }

  peek() {
    return {
      stopped: this.stopped,
      paused: this.paused,
      offered: this.offered ? { owner: { ...this.offered.owner }, ack: { ...this.offered.ack } } : null,
      committed: this.committed
        ? {
            phase: this.committed.phase,
            owner: { ...this.committed.owner },
            ack: { ...this.committed.ack },
            databaseRevisions: [{ ...this.committed.manifest.snapshot.database }],
            nextDueAt: this.committed.earliestDueAt,
          }
        : null,
      physicalOwner: this.held ? { ...this.held.lease.owner } : null,
      wakeOwner: this.wakeOwner ? { ...this.wakeOwner } : null,
      alarm: this.alarms.peek(),
    }
  }
  stop(): void {
    this.stopped = true
    this.alarms.stop()
  }
  pause(): void {
    this.paused = true
    this.alarms.pause()
  }
  resume(): void {
    if (this.stopped || !this.paused) return
    this.paused = false
    this.alarms.resume()
  }
  whenSettled(): Promise<void> {
    return this.alarms.whenSettled()
  }

  /** Trusted native join/onExit hook; independent of subsequent Manager owner cleanup. */
  physicalExitConfirmed(receipt: RuntimePhysicalRetirementReceipt): boolean {
    const held = this.held
    if (!held || !sameOwner(held.lease.owner, receipt.owner) || !receipt.nativeJoined || !receipt.onExitCompleted)
      return false
    // Preserve one exact attempt if the late RPC/UNKNOWN microtask has not settled yet.
    this.retiredPhysical = { owner: { ...receipt.owner }, attempt: { ...held.attempt } }
    this.held = null
    held.lease.release()
    return true
  }

  /** Host-only reconciliation: the exact attempt AND independently joined owner exit are required. */
  async reconcile(attempt: RuntimeAlarmAttempt): Promise<boolean> {
    const retired = this.retiredPhysical
    if (retired && sameAttempt(retired.attempt, attempt)) {
      if (!this.alarms.confirmPhysicalCompletion(attempt)) return false
      this.retiredPhysical = null
      return true // Only physical fence clears; blocked alarm cannot restore/replay its old ACK.
    }
    const held = this.held
    if (!held || !sameAttempt(held.attempt, attempt)) return false
    if ((await this.ports.physicalExit(held.lease.owner)) !== 'confirmed-physical-exit' || this.held !== held)
      return false
    if (!this.alarms.confirmPhysicalCompletion(attempt)) return false
    this.held = null
    held.lease.release()
    return true
  }

  private sourceCurrent(ack: ScheduleTransferAck): boolean {
    const catalog = this.ports.catalog()
    return (
      catalog.revision === ack.catalogRevision &&
      catalog.databaseIds.length === 1 &&
      catalog.databaseIds[0] === ack.databaseId
    )
  }

  private async due(
    alarm: RuntimeDemandAlarm,
    signal: AbortSignal,
    attempt: RuntimeAlarmAttempt,
  ): Promise<RuntimeAlarmOutcome> {
    const transfer = this.committed
    if (
      this.stopped ||
      !transfer ||
      transfer.phase !== 'armed' ||
      alarm.id !== transfer.ack.token ||
      alarm.version !== transfer.ack.version
    )
      return { kind: 'handled' }
    if (this.paused) return { kind: 'retry', reason: 'not-dispatched' }
    if (this.offered) return { kind: 'retry', reason: 'not-dispatched' }
    let lease: DemandLease
    try {
      lease = await this.ports.acquire(signal)
    } catch {
      return { kind: 'retry', reason: 'not-dispatched' }
    }
    let sourceCurrent: boolean
    try {
      sourceCurrent = this.sourceCurrent(transfer.ack)
    } catch {
      lease.release()
      return { kind: 'retry', reason: 'retryable-read' }
    }
    // The lifecycle owns any failed shared startup. No Schedule RPC has been dispatched at this point.
    if (
      signal.aborted ||
      this.paused ||
      this.stopped ||
      this.committed !== transfer ||
      this.offered ||
      !sourceCurrent
    ) {
      lease.release()
      return { kind: 'retry', reason: 'not-dispatched' }
    }
    if (this.foregroundOwner && !sameOwner(this.foregroundOwner, lease.owner)) {
      lease.release()
      return { kind: 'retry', reason: 'not-dispatched' }
    }
    this.wakeOwner = { ...lease.owner }
    const held: Held = { lease, attempt: { ...attempt } }
    this.held = held
    try {
      const reply = scheduleWakeReplySchema.parse(await this.ports.wake(lease.owner, transfer.ack, attempt, signal))
      if (reply.manifest.snapshot.database.id !== transfer.ack.databaseId) throw new Error('SCHEDULE_DATABASE_CHANGED')
      // A trusted exit may have released this exact hold before the late RPC reply arrived.
      const retired = this.retiredPhysical
      const physicallyReleased =
        retired !== null && sameOwner(retired.owner, lease.owner) && sameAttempt(retired.attempt, held.attempt)
      if (this.committed !== transfer || (this.held !== held && !physicallyReleased)) return { kind: 'unknown' }
      if (this.held === held) {
        this.held = null
        lease.release()
      }
      if (physicallyReleased) this.retiredPhysical = null
      this.committed = { ...transfer, phase: 'delivered' }
      // The awake child owns its regular timer again. Future idle transfer re-reads current facts.
      return { kind: 'handled' }
    } catch {
      // Retain lease/attempt for actual physical reconciliation. Never release in a finally block.
      return { kind: 'unknown' }
    }
  }
}
