import { HbarError } from '@hbar/contracts'
import type { RuntimePhysicalRetirementReceipt } from '@hbar/runtime'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import {
  sessionWakeManifestSchema,
  sameSessionWake,
  type SessionWakeAck,
  type SessionWakeEntry,
  type SessionWakeManifest,
} from '@hbar/contracts/session-wake'
import {
  RuntimeDemandAlarmScheduler,
  type RuntimeAlarmClock,
  type RuntimeAlarmAttempt,
  type RuntimeAlarmOutcome,
  type RuntimeDemandAlarm,
} from './runtime-demand-alarm-scheduler'

export interface SessionWakePhysicalHold {
  readonly owner: RuntimeOwner
  release(): void
}
export interface SessionWakeTransferPorts {
  readonly clock: RuntimeAlarmClock
  acquire(signal: AbortSignal): Promise<SessionWakePhysicalHold>
  /** Restore ALL proofs before this notification; this method must not submit a Run. */
  notify(
    hold: SessionWakePhysicalHold,
    ack: SessionWakeAck,
    entry: SessionWakeEntry,
    signal: AbortSignal,
  ): Promise<'notified' | 'stale' | 'not-dispatched'>
  /** Root-owned ManagedProcess retirement ledger only; never caller metadata or an abort result. */
  physicalRetirement(owner: RuntimeOwner): RuntimePhysicalRetirementReceipt | null
  fault(owner: RuntimeOwner, error: unknown): void
}
interface Transfer {
  readonly ack: SessionWakeAck
  readonly remaining: Map<string, SessionWakeEntry>
  phase: 'offered' | 'committed' | 'armed' | 'unknown'
}
function sameOwner(a: RuntimeOwner, b: RuntimeOwner): boolean {
  return a.unitId === b.unitId && a.generation === b.generation && a.incarnation === b.incarnation
}
function sameAck(a: SessionWakeAck, b: SessionWakeAck): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** One existing parent scheduler domain; no second timer, retry engine or physical singleflight. */
export class RuntimeSessionWakeTransfer {
  private readonly alarms: RuntimeDemandAlarmScheduler
  private readonly epoch = crypto.randomUUID()
  private sequence = 0
  private offered: Transfer | undefined
  private current: Transfer | undefined
  private held:
    { readonly hold: SessionWakePhysicalHold; readonly attempt: RuntimeAlarmAttempt; released: boolean } | undefined
  private paused = false
  private closed = false
  constructor(private readonly ports: SessionWakeTransferPorts) {
    this.alarms = new RuntimeDemandAlarmScheduler(
      this.epoch,
      { due: (alarm, signal, attempt) => this.due(alarm, signal, attempt) },
      ports.clock,
      { maxKeys: 1 },
    )
  }
  offer(raw: SessionWakeManifest): SessionWakeAck {
    if (
      this.closed ||
      this.paused ||
      this.offered ||
      this.held ||
      this.alarms.peek().inFlight ||
      this.current?.phase === 'unknown'
    )
      throw new HbarError('SESSION_WAKE_FENCED', 'Existing wake transfer requires settlement')
    const manifest = sessionWakeManifestSchema.parse(raw)
    this.assertResponsibilityCovered(manifest)
    const ack: SessionWakeAck = { token: crypto.randomUUID(), manifest }
    this.offered = {
      ack,
      phase: 'offered',
      remaining: new Map(manifest.entries.map((entry) => [entry.sessionId, entry])),
    }
    return structuredClone(ack)
  }
  commit(ack: SessionWakeAck, child: { token: string; revision: number; phase: string }): void {
    const state = this.exactOffer(ack)
    if (
      this.closed ||
      state.phase !== 'offered' ||
      child.phase !== 'committed' ||
      child.token !== ack.token ||
      child.revision !== ack.manifest.revision
    )
      throw new HbarError('SESSION_WAKE_STALE', 'Child commit did not acknowledge this transfer')
    state.phase = 'committed'
  }
  arm(ack: SessionWakeAck): void {
    const state = this.exactOffer(ack)
    if (this.closed || state.phase !== 'committed' || this.held || this.alarms.peek().inFlight)
      throw new HbarError('SESSION_WAKE_FENCED', 'Only a settled child commit may arm')
    this.assertResponsibilityCovered(state.ack.manifest)
    // Replacing the one domain is permitted only after the new child acknowledged its whole manifest.
    this.current = state
    this.offered = undefined
    state.phase = 'armed'
    this.armNext(state)
  }
  abort(ack: SessionWakeAck, child: { token: string; revision: number; phase: string }): void {
    const state = this.exactOffer(ack)
    if (
      state.phase !== 'offered' ||
      child.phase !== 'aborted' ||
      child.token !== ack.token ||
      child.revision !== ack.manifest.revision
    )
      throw new HbarError('SESSION_WAKE_FENCED', 'Unconfirmed transfer cannot be discarded')
    this.offered = undefined
  }
  restoreAck(oldOwner: RuntimeOwner): SessionWakeAck | undefined {
    const state = this.current,
      snapshot = this.alarms.peek()
    if (
      this.closed ||
      this.offered ||
      this.held ||
      snapshot.inFlightFenced ||
      !state ||
      state.phase !== 'armed' ||
      !sameOwner(state.ack.manifest.owner, oldOwner)
    )
      return undefined
    const alarm = snapshot.entries[0]
    if (!alarm || alarm.alarm.id !== state.ack.token || !['queued', 'running'].includes(alarm.phase)) return undefined
    return structuredClone(state.ack)
  }
  restoration(oldOwner: RuntimeOwner): SessionWakeManifest | undefined {
    return this.restoreAck(oldOwner)?.manifest
  }
  private exactOffer(ack: SessionWakeAck): Transfer {
    if (!this.offered || !sameAck(this.offered.ack, ack))
      throw new HbarError('SESSION_WAKE_STALE', 'Unknown offered transfer')
    return this.offered
  }
  private assertResponsibilityCovered(manifest: SessionWakeManifest): void {
    if (
      this.current &&
      [...this.current.remaining.values()].some(
        (entry) => !manifest.entries.some((value) => sameSessionWake(entry, value)),
      )
    )
      throw new HbarError(
        'SESSION_WAKE_RESPONSIBILITY_UNCOVERED',
        'New manifest omits an outstanding acknowledged deadline',
      )
  }
  private armNext(state: Transfer): void {
    if (this.closed || this.current !== state || state.phase !== 'armed') return
    if (!state.remaining.size) {
      const prior = this.alarms.peek().entries[0]
      if (prior) this.alarms.cancel(prior.alarm)
      this.current = undefined
      return
    }
    if (this.sequence === Number.MAX_SAFE_INTEGER)
      throw new HbarError('SESSION_WAKE_REVISION_LIMIT', 'Parent wake revision exhausted')
    const alarm: RuntimeDemandAlarm = {
      key: 'kernel:goal-deadlines',
      id: state.ack.token,
      epoch: this.epoch,
      version: ++this.sequence,
      unitId: 'kernel',
      dueAt: Math.min(...[...state.remaining.values()].map((entry) => entry.dueAt)),
    }
    if (this.alarms.upsert(alarm) !== 'accepted')
      throw new HbarError('SESSION_WAKE_FENCED', 'Parent wake alarm was not accepted')
  }
  private async due(
    alarm: RuntimeDemandAlarm,
    signal: AbortSignal,
    attempt: RuntimeAlarmAttempt,
  ): Promise<RuntimeAlarmOutcome> {
    const state = this.current
    if (!state || state.phase !== 'armed' || state.ack.token !== alarm.id) return { kind: 'handled' }
    if (this.closed || this.paused || this.offered || signal.aborted) return { kind: 'retry', reason: 'not-dispatched' }
    const due = [...state.remaining.values()].filter((entry) => entry.dueAt <= this.ports.clock.now())
    if (!due.length) return { kind: 'retry', reason: 'not-dispatched' }
    try {
      const hold = await this.ports.acquire(signal)
      this.held = { hold, attempt: { ...attempt }, released: false }
      if (this.closed || this.paused || this.offered || signal.aborted) {
        this.releaseHeld(hold)
        this.held = undefined
        return { kind: 'retry', reason: 'not-dispatched' }
      }
      for (const entry of due) {
        if (this.closed || this.paused || signal.aborted) break
        const outcome = await this.ports.notify(hold, state.ack, entry, signal)
        if (outcome === 'not-dispatched') {
          this.releaseHeld(hold)
          this.held = undefined
          return { kind: 'retry', reason: 'not-dispatched' }
        }
        if (outcome !== 'notified' && outcome !== 'stale')
          throw new HbarError('SESSION_WAKE_UNKNOWN', 'Unrecognized wake notification outcome')
        // A reply, including stale, is an authoritative notification outcome, never Run success.
        state.remaining.delete(entry.sessionId)
      }
      this.releaseHeld(hold)
      this.held = undefined
      // Wait for the shared scheduler to finish this exact physical flight before changing its version.
      this.alarms
        .whenSettled()
        .then(() => this.armNext(state))
        .catch((error) => this.fail(state, error))
      return { kind: 'handled' }
    } catch (error) {
      // acquire failure may itself leave an unknown wake; no automatic retry without positive evidence.
      this.fail(state, error)
      return { kind: 'unknown' }
    }
  }
  private fail(state: Transfer, error: unknown): void {
    state.phase = 'unknown'
    try {
      this.ports.fault(state.ack.manifest.owner, error)
    } catch {
      /* diagnostics own no authority */
    }
  }
  private releaseHeld(hold: SessionWakePhysicalHold): void {
    const held = this.held
    if (!held || held.hold !== hold || held.released) return
    held.released = true
    try {
      held.hold.release()
    } catch (error) {
      held.released = false
      throw error
    }
  }
  /** Trusted native callback only. Re-read the real ledger; caller metadata grants no authority. */
  physicalExitConfirmed(receipt: RuntimePhysicalRetirementReceipt): boolean {
    const held = this.held
    if (!held || !sameOwner(receipt.owner, held.hold.owner)) return false
    const actual = this.ports.physicalRetirement(held.hold.owner)
    if (
      !actual ||
      !sameOwner(actual.owner, held.hold.owner) ||
      actual.childPid !== receipt.childPid ||
      actual.nativeJoined !== true ||
      actual.onExitCompleted !== true ||
      !Number.isSafeInteger(actual.childPid) ||
      actual.childPid < 1 ||
      !Number.isSafeInteger(actual.exitCode) ||
      this.held !== held
    )
      return false
    this.releaseHeld(held.hold)
    // Preserve attempt metadata even before the RPC rejection microtask fences the scheduler.
    return true
  }
  /** Detached identity only. This is not evidence of physical completion. */
  pendingPhysicalAttempt():
    | { readonly owner: RuntimeOwner; readonly attempt: RuntimeAlarmAttempt; readonly physicalReleased: boolean }
    | undefined {
    const held = this.held
    return held
      ? { owner: { ...held.hold.owner }, attempt: { ...held.attempt }, physicalReleased: held.released }
      : undefined
  }
  /** Host-private ledger reconciliation. Never registered on an RPC or plugin port. */
  reconcile(attempt: RuntimeAlarmAttempt): boolean {
    const held = this.held
    if (
      !held ||
      held.attempt.key !== attempt.key ||
      held.attempt.id !== attempt.id ||
      held.attempt.version !== attempt.version ||
      held.attempt.epoch !== attempt.epoch ||
      held.attempt.attempt !== attempt.attempt
    )
      return false
    const receipt = this.ports.physicalRetirement(held.hold.owner)
    if (!receipt || !this.physicalExitConfirmed(receipt) || this.held !== held) return false
    if (!this.alarms.confirmPhysicalCompletion(attempt)) return false
    this.held = undefined
    // Physical absence is not a known notification outcome. Keep UNKNOWN and its responsibility.
    return true
  }
  pause(): void {
    this.paused = true
    this.alarms.pause()
  }
  resume(): void {
    if (this.closed) return
    this.paused = false
    this.alarms.resume()
  }
  whenSettled(): Promise<void> {
    return this.alarms.whenSettled()
  }
  /** Pure domain responsibility check; terminal scheduler high-water records are not live work. */
  emptyCheckpointAllowed(): boolean {
    const snapshot = this.alarms.peek(),
      state = this.current
    return (
      !this.closed &&
      !this.offered &&
      !this.held &&
      !snapshot.inFlight &&
      !snapshot.inFlightFenced &&
      (!state || (state.phase === 'armed' && state.remaining.size === 0))
    )
  }
  peek() {
    return this.alarms.peek()
  }
  close(): void {
    this.closed = true
    this.alarms.stop()
  }
}
