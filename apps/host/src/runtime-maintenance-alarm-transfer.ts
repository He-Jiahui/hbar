import { randomUUID } from 'node:crypto'
import type { DemandLease, DemandOwner, RuntimePhysicalRetirementReceipt } from '@hbar/runtime'
import {
  RuntimeDemandAlarmScheduler,
  type RuntimeAlarmClock,
  type RuntimeAlarmAttempt,
  type RuntimeDemandAlarm,
  type RuntimeAlarmOutcome,
} from './runtime-demand-alarm-scheduler'
import {
  maintenanceInspectionManifestSchema,
  maintenanceInspectionAckSchema,
  maintenanceInspectionWakeReplySchema,
  sameMaintenanceAck,
  completeEmptyMaintenanceJournal,
  type MaintenanceInspectionAck,
  type MaintenanceInspectionManifest,
  type MaintenanceInspectionCommit,
  type MaintenanceInspectionWakeReply,
} from './runtime-maintenance-inspection-contract'
import type { ChatDatabaseInspectionCheckpoint } from '@hbar/kernel/maintenance'

export interface MaintenanceCleanExitProof extends RuntimePhysicalRetirementReceipt {
  readonly ownerCleanupComplete: true
}
export interface MaintenanceInspectionTransferPorts {
  catalog(): { readonly revision: string; readonly databaseIds: readonly string[] }
  seal(owner: DemandOwner, ack: MaintenanceInspectionAck): void
  sealed(owner: DemandOwner, ack: MaintenanceInspectionAck): boolean
  /** Called after child abort ACK only. It may not clear an UNKNOWN seal. */
  unsealKnownAbort(owner: DemandOwner, ack: MaintenanceInspectionAck): void
  acquire(signal: AbortSignal): Promise<DemandLease>
  initializeIdle(
    owner: DemandOwner,
    ack: MaintenanceInspectionAck,
    checkpoint: ChatDatabaseInspectionCheckpoint,
    attempt: RuntimeAlarmAttempt,
    signal: AbortSignal,
  ): Promise<MaintenanceInspectionWakeReply>
  physicalExit(owner: DemandOwner): Promise<MaintenanceCleanExitProof | null>
}
interface Transfer {
  readonly owner: DemandOwner
  readonly ack: MaintenanceInspectionAck
  readonly manifest: MaintenanceInspectionManifest
}
interface Committed extends Transfer {
  readonly phase: 'prepared' | 'armed' | 'delivered'
}
interface Held {
  readonly lease: DemandLease
  readonly attempt: RuntimeAlarmAttempt
}
const sameOwner = (left: DemandOwner, right: DemandOwner) =>
  left.unitId === right.unitId && left.generation === right.generation && left.incarnation === right.incarnation
const sameAttempt = (left: RuntimeAlarmAttempt, right: RuntimeAlarmAttempt) =>
  left.key === right.key &&
  left.id === right.id &&
  left.version === right.version &&
  left.epoch === right.epoch &&
  left.attempt === right.attempt

/** One bounded periodic inspection obligation; not a maintenance job or a durable Host-crash journal. */
export class RuntimeMaintenanceAlarmTransfer {
  private readonly alarms: RuntimeDemandAlarmScheduler
  private sequence = 0
  private offered: Transfer | null = null
  private committed: Committed | null = null
  private held: Held | null = null
  private retiredPhysical: { readonly owner: DemandOwner; readonly attempt: RuntimeAlarmAttempt } | null = null
  private foregroundOwner: DemandOwner | null = null
  private wakeOwner: DemandOwner | null = null
  private stopped = false
  private paused = false
  constructor(
    private readonly epoch: string,
    private readonly ports: MaintenanceInspectionTransferPorts,
    clock?: RuntimeAlarmClock,
  ) {
    this.alarms = new RuntimeDemandAlarmScheduler(
      epoch,
      { due: (alarm, signal, attempt) => this.due(alarm, signal, attempt) },
      clock,
      { maxKeys: 1 },
    )
  }
  offer(owner: DemandOwner, raw: MaintenanceInspectionManifest): MaintenanceInspectionAck {
    if (
      this.stopped ||
      this.paused ||
      this.offered ||
      this.held ||
      (this.committed && this.committed.phase !== 'delivered') ||
      this.alarms.peek().inFlight
    )
      throw new Error('MAINTENANCE_INSPECTION_BUSY')
    const manifest = maintenanceInspectionManifestSchema.parse(raw)
    if (owner.unitId !== 'maintenance' || !completeEmptyMaintenanceJournal(manifest) || !this.sourceCurrent(manifest))
      throw new Error('MAINTENANCE_INSPECTION_INCOMPLETE')
    if (this.sequence >= Number.MAX_SAFE_INTEGER) throw new Error('MAINTENANCE_INSPECTION_CAPACITY')
    const ack = maintenanceInspectionAckSchema.parse({
      epoch: this.epoch,
      token: randomUUID(),
      version: ++this.sequence,
      source: manifest.source,
    })
    this.ports.seal(owner, ack) // Reservation/admission seal precedes any child timer pause.
    this.offered = { owner: { ...owner }, ack, manifest }
    return structuredClone(ack)
  }
  commit(owner: DemandOwner, rawAck: MaintenanceInspectionAck, raw: MaintenanceInspectionManifest): void {
    const ack = maintenanceInspectionAckSchema.parse(rawAck),
      manifest = maintenanceInspectionManifestSchema.parse(raw)
    const offered = this.offered
    if (
      this.stopped ||
      this.paused ||
      !offered ||
      !sameOwner(offered.owner, owner) ||
      !sameMaintenanceAck(offered.ack, ack) ||
      !this.ports.sealed(owner, ack) ||
      !completeEmptyMaintenanceJournal(manifest) ||
      !this.sourceCurrent(manifest) ||
      manifest.source.databaseId !== ack.source.databaseId ||
      manifest.source.catalogRevision !== ack.source.catalogRevision
    )
      throw new Error('MAINTENANCE_INSPECTION_UNKNOWN')
    // Cursor may legitimately advance while admitted work quiesces. The final manifest wins.
    this.committed = { owner: { ...owner }, ack, manifest, phase: 'prepared' }
    this.offered = null
    this.foregroundOwner = null
    this.wakeOwner = null
  }
  activate(raw: MaintenanceInspectionCommit): void {
    const ack = maintenanceInspectionAckSchema.parse(raw.ack),
      transfer = this.committed
    if (
      this.stopped ||
      this.paused ||
      !transfer ||
      transfer.phase === 'delivered' ||
      !sameOwner(transfer.owner, raw.owner) ||
      !sameMaintenanceAck(transfer.ack, ack) ||
      !this.ports.sealed(transfer.owner, ack) ||
      !this.sourceCurrent(transfer.manifest)
    )
      throw new Error('MAINTENANCE_INSPECTION_UNKNOWN')
    if (transfer.phase === 'armed') return
    const dueAt = transfer.manifest.checkpoint.nextCheckAt
    if (
      dueAt === null ||
      this.alarms.upsert({
        key: 'maintenance:inspection',
        id: ack.token,
        version: ack.version,
        epoch: ack.epoch,
        unitId: 'maintenance',
        dueAt,
      }) !== 'accepted'
    )
      throw new Error('MAINTENANCE_INSPECTION_ALARM_REJECTED')
    this.committed = { ...transfer, phase: 'armed' }
  }
  /** Root has both positively known parent precommit abort and exact child abort ACK. */
  abortAfterChildAck(owner: DemandOwner, ack: MaintenanceInspectionAck): void {
    if (
      this.stopped ||
      !this.offered ||
      !sameOwner(this.offered.owner, owner) ||
      !sameMaintenanceAck(this.offered.ack, ack) ||
      this.held ||
      this.alarms.peek().inFlight
    )
      throw new Error('MAINTENANCE_INSPECTION_UNKNOWN')
    this.ports.unsealKnownAbort(owner, ack)
    this.offered = null
  }
  restoreAck(oldOwner: DemandOwner, proof: MaintenanceCleanExitProof): MaintenanceInspectionAck | null {
    const transfer = this.committed
    const snapshot = this.alarms.peek()
    if (
      this.stopped ||
      this.paused ||
      this.offered ||
      this.held ||
      !transfer ||
      transfer.phase !== 'armed' ||
      !sameOwner(transfer.owner, oldOwner) ||
      !this.cleanExit(oldOwner, proof) ||
      !this.sourceCurrent(transfer.manifest) ||
      snapshot.inFlightFenced
    )
      return null
    const pending = snapshot.entries.find(
      (entry) =>
        entry.alarm.key === 'maintenance:inspection' &&
        entry.alarm.id === transfer.ack.token &&
        entry.alarm.version === transfer.ack.version &&
        entry.alarm.epoch === transfer.ack.epoch,
    )
    // Physical fence reconciliation must not turn a blocked UNKNOWN into a new restore permit.
    if (!pending || (pending.phase !== 'queued' && pending.phase !== 'running')) return null
    return structuredClone(transfer.ack)
  }
  async wakeForeground(owner: DemandOwner, ack: MaintenanceInspectionAck): Promise<void> {
    const transfer = this.committed
    if (
      this.stopped ||
      this.paused ||
      this.offered ||
      !transfer ||
      transfer.phase === 'prepared' ||
      !sameMaintenanceAck(transfer.ack, ack) ||
      owner.unitId !== 'maintenance' ||
      !this.sourceCurrent(transfer.manifest) ||
      (this.wakeOwner && !sameOwner(this.wakeOwner, owner))
    )
      throw new Error('MAINTENANCE_INSPECTION_UNKNOWN')
    if (transfer.phase === 'delivered' && this.wakeOwner && sameOwner(this.wakeOwner, owner)) return
    if (this.foregroundOwner && !sameOwner(this.foregroundOwner, owner))
      throw new Error('MAINTENANCE_INSPECTION_UNKNOWN')
    this.foregroundOwner = { ...owner }
    const run = this.alarms.runNow({
      key: 'maintenance:inspection',
      id: ack.token,
      version: ack.version,
      epoch: ack.epoch,
    })
    if (run.kind !== 'started' && run.kind !== 'joined') throw new Error('MAINTENANCE_INSPECTION_UNKNOWN')
    await run.settled
    const current = this.committed
    if (
      !current ||
      current.phase !== 'delivered' ||
      !sameMaintenanceAck(current.ack, ack) ||
      !this.wakeOwner ||
      !sameOwner(this.wakeOwner, owner)
    )
      throw new Error('MAINTENANCE_INSPECTION_UNKNOWN')
  }
  peek() {
    return {
      stopped: this.stopped,
      paused: this.paused,
      offered: this.offered ? structuredClone(this.offered) : null,
      committed: this.committed ? structuredClone(this.committed) : null,
      physicalOwner: this.held ? { ...this.held.lease.owner } : null,
      alarm: this.alarms.peek(),
    }
  }
  pause(): void {
    this.paused = true
    this.alarms.pause()
  }
  resume(): void {
    if (!this.stopped && this.paused) {
      this.paused = false
      this.alarms.resume()
    }
  }
  stop(): void {
    this.stopped = true
    this.alarms.stop()
  }
  whenSettled(): Promise<void> {
    return this.alarms.whenSettled()
  }
  /** Pure detached identity, valid even before the scheduler marks UNKNOWN. */
  pendingPhysicalAttempt(): RuntimeAlarmAttempt | null {
    const pending = this.retiredPhysical?.attempt ?? this.held?.attempt
    return pending ? { ...pending } : null
  }
  /** Trusted native/onExit hook, independent of later Manager owner cleanup. */
  physicalExitConfirmed(proof: RuntimePhysicalRetirementReceipt): boolean {
    const held = this.held
    if (!held || !sameOwner(held.lease.owner, proof.owner) || !proof.nativeJoined || !proof.onExitCompleted)
      return false
    // Release only physical demand; the uncertain business transfer stays blocked.
    // Store one exact attempt even if the alarm's UNKNOWN finish has not run yet.
    this.retiredPhysical = { owner: { ...proof.owner }, attempt: { ...held.attempt } }
    this.held = null
    held.lease.release()
    return true
  }
  async reconcile(attempt: RuntimeAlarmAttempt): Promise<boolean> {
    const retired = this.retiredPhysical
    if (retired && sameAttempt(retired.attempt, attempt)) {
      if (!this.alarms.confirmPhysicalCompletion(attempt)) return false
      this.retiredPhysical = null
      return true // No await of owner cleanup and no permission to replay the restore.
    }
    const held = this.held
    if (!held || !sameAttempt(held.attempt, attempt)) return false
    const proof = await this.ports.physicalExit(held.lease.owner)
    if (
      this.held !== held ||
      !proof ||
      !this.physicalComplete(held.lease.owner, proof) ||
      !this.alarms.confirmPhysicalCompletion(attempt)
    )
      return false
    this.held = null
    held.lease.release()
    return true // UNKNOWN transfer remains blocked; physical settlement is not permission to repeat restore.
  }
  private sourceCurrent(manifest: MaintenanceInspectionManifest): boolean {
    const catalog = this.ports.catalog()
    return (
      catalog.revision === manifest.source.catalogRevision &&
      catalog.databaseIds.length === 1 &&
      catalog.databaseIds[0] === manifest.source.databaseId
    )
  }
  private cleanExit(owner: DemandOwner, proof: MaintenanceCleanExitProof): boolean {
    return this.physicalComplete(owner, proof) && !proof.forced && proof.cleanDisposeAck && proof.exitCode === 0
  }
  private physicalComplete(owner: DemandOwner, proof: MaintenanceCleanExitProof): boolean {
    return sameOwner(owner, proof.owner) && proof.nativeJoined && proof.onExitCompleted && proof.ownerCleanupComplete
  }
  private async due(
    alarm: RuntimeDemandAlarm,
    signal: AbortSignal,
    attempt: RuntimeAlarmAttempt,
  ): Promise<RuntimeAlarmOutcome> {
    const transfer = this.committed
    if (
      !transfer ||
      transfer.phase !== 'armed' ||
      alarm.id !== transfer.ack.token ||
      alarm.version !== transfer.ack.version ||
      alarm.epoch !== this.epoch
    )
      return { kind: 'handled' }
    if (this.stopped || this.paused || signal.aborted || this.offered)
      return { kind: 'retry', reason: 'not-dispatched' }
    // Restoring an old checkpoint requires the exact old owner's independently verified clean exit.
    let proof: MaintenanceCleanExitProof | null
    try {
      proof = await this.ports.physicalExit(transfer.owner)
    } catch {
      return { kind: 'retry', reason: 'retryable-read' }
    } // No acquire or restore was dispatched.
    if (this.stopped || this.paused || signal.aborted || this.committed !== transfer || this.offered)
      return { kind: 'retry', reason: 'not-dispatched' }
    if (!proof) return { kind: 'retry', reason: 'retryable-read' } // No restore was dispatched; only re-read trusted exit proof.
    if (!this.cleanExit(transfer.owner, proof) || !this.sourceCurrent(transfer.manifest)) return { kind: 'unknown' }
    let lease: DemandLease
    try {
      lease = await this.ports.acquire(signal)
    } catch {
      return { kind: 'retry', reason: 'not-dispatched' }
    } // Root lifecycle owns uncertain startup, not this inspection.
    if (
      this.stopped ||
      this.paused ||
      signal.aborted ||
      this.committed !== transfer ||
      this.offered ||
      !this.sourceCurrent(transfer.manifest) ||
      (this.foregroundOwner && !sameOwner(this.foregroundOwner, lease.owner))
    ) {
      lease.release()
      return { kind: 'retry', reason: 'not-dispatched' }
    }
    const held: Held = { lease, attempt: { ...attempt } }
    this.held = held
    this.wakeOwner = { ...lease.owner }
    try {
      const reply = maintenanceInspectionWakeReplySchema.parse(
        await this.ports.initializeIdle(lease.owner, transfer.ack, transfer.manifest.checkpoint, attempt, signal),
      )
      // Pause/stop after dispatch cannot turn a valid physical reply into UNKNOWN.
      // Root stop waits for this settlement and then pauses/disposes the awake child.
      const retired = this.retiredPhysical
      const physicallyReleased =
        retired !== null && sameOwner(retired.owner, lease.owner) && sameAttempt(retired.attempt, held.attempt)
      if (
        this.committed !== transfer ||
        (this.held !== held && !physicallyReleased) ||
        !sameOwner(reply.owner, lease.owner) ||
        !sameMaintenanceAck(reply.ack, transfer.ack) ||
        reply.checkpoint.version !== transfer.manifest.checkpoint.version ||
        reply.checkpoint.cursor !== transfer.manifest.checkpoint.cursor ||
        reply.checkpoint.nextCheckAt !== transfer.manifest.checkpoint.nextCheckAt
      )
        return { kind: 'unknown' }
      this.committed = { ...transfer, phase: 'delivered' }
      if (physicallyReleased) this.retiredPhysical = null
      else {
        this.held = null
        lease.release()
      }
      return { kind: 'handled' } // The acknowledged child now owns its timer, not a new cleanup request.
    } catch {
      return { kind: 'unknown' }
    } // Retain exact attempt + physical lease; never finally-release a dispatched unknown.
  }
}
