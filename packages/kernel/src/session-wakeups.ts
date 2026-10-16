import { HbarError } from '@hbar/contracts'
import {
  sessionWakeAckSchema,
  sessionWakeManifestSchema,
  sameSessionWake,
  type SessionWakeAck,
  type SessionWakeEntry,
  type SessionWakeManifest,
} from '@hbar/contracts/session-wake'
import type { RuntimeOwner } from '@hbar/contracts/runtime'

export interface SessionWakeClock {
  now(): number
  schedule(callback: () => void, delayMs: number): { cancel(): void }
}
const defaultClock: SessionWakeClock = {
  now: () => Date.now(),
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs)
    return { cancel: () => clearTimeout(timer) }
  },
}
interface Pending {
  transferred: boolean
  readonly dueAt: number
  readonly entry: SessionWakeEntry | undefined
  timer: { cancel(): void } | undefined
  readonly done: Promise<void>
  resolve(): void
}
/** Absolute deadlines are real occupancy until an exact parent transfer has committed. */
export class SessionWakeups {
  private readonly pending = new Map<string, Pending>()
  private revision = 0
  private transfer: { ack: SessionWakeAck; phase: 'quiesced' | 'committed' | 'unknown' } | undefined
  private rollback: { readonly ack: SessionWakeAck; readonly phase: 'committed' } | undefined
  private closed = false
  constructor(
    private readonly wake: (sessionId: string) => void,
    private readonly clock: SessionWakeClock = defaultClock,
  ) {}
  // Every local timer owns one future revision for cancellation or natural firing.
  private reserveChange(localAfter: number): void {
    if (this.revision >= Number.MAX_SAFE_INTEGER - localAfter)
      throw new HbarError('SESSION_WAKE_REVISION_LIMIT', 'Wake revision exhausted')
  }
  private localCount(): number {
    return [...this.pending.values()].filter((value) => !value.transferred).length
  }
  private changed(): void {
    if (this.revision === Number.MAX_SAFE_INTEGER)
      throw new HbarError('SESSION_WAKE_REVISION_LIMIT', 'Wake revision exhausted')
    this.revision++
  }
  schedule(sessionId: string, dueAt: number, entry?: SessionWakeEntry): void {
    if (this.closed || (this.transfer && this.transfer.phase !== 'committed'))
      throw new HbarError('SESSION_WAKE_FENCED', 'Wake timers are transferred or closed')
    if (
      !Number.isSafeInteger(dueAt) ||
      dueAt < 0 ||
      (entry && (entry.sessionId !== sessionId || entry.dueAt !== dueAt))
    )
      throw new HbarError('INVALID_INPUT', 'Wake deadline identity is invalid')
    if (!this.pending.has(sessionId) && this.pending.size >= 128)
      throw new HbarError('SESSION_WAKE_CAPACITY', 'Wake capacity exhausted')
    const previous = this.pending.get(sessionId)
    this.reserveChange(this.localCount() + (previous && !previous.transferred ? 0 : 1))
    previous?.timer?.cancel()
    previous?.resolve()
    let resolve: () => void = () => {}
    const done = new Promise<void>((finish) => {
      resolve = finish
    })
    const value: Pending = { dueAt, entry, transferred: false, timer: undefined, done, resolve }
    this.pending.set(sessionId, value)
    this.changed()
    this.arm(sessionId, value)
  }
  private arm(sessionId: string, value: Pending): void {
    value.timer = this.clock.schedule(
      () => {
        if (
          this.closed ||
          value.transferred ||
          (this.transfer && this.transfer.phase !== 'committed') ||
          this.pending.get(sessionId) !== value
        )
          return
        if (value.dueAt > this.clock.now()) {
          this.arm(sessionId, value)
          return
        }
        this.reserveChange(this.localCount() - 1)
        this.pending.delete(sessionId)
        this.changed()
        value.resolve()
        this.wake(sessionId)
      },
      Math.max(1, Math.min(60_000, value.dueAt - this.clock.now())),
    )
  }
  cancel(sessionId: string): void {
    const value = this.pending.get(sessionId)
    if (!value) return
    if (this.transfer && this.transfer.phase !== 'committed') {
      this.transfer.phase = 'unknown'
      throw new HbarError('SESSION_WAKE_FENCED', 'Transferred wake requires reconciliation')
    }
    this.reserveChange(this.localCount() - Number(!value.transferred))
    value.timer?.cancel()
    this.pending.delete(sessionId)
    value.resolve()
    this.changed()
  }
  preview(owner: RuntimeOwner): SessionWakeManifest {
    if (this.closed || (this.transfer && this.transfer.phase !== 'committed'))
      throw new HbarError('SESSION_WAKE_FENCED', 'Wake checkpoint unavailable')
    const entries: SessionWakeEntry[] = []
    for (const value of this.pending.values()) {
      if (!value.entry || value.dueAt <= this.clock.now())
        throw new HbarError('BUSY', 'Due or untyped wake cannot transfer')
      entries.push(value.entry)
    }
    return sessionWakeManifestSchema.parse({ schemaVersion: 1, owner, revision: this.revision, entries })
  }
  quiesce(raw: SessionWakeAck, owner: RuntimeOwner): void {
    const ack = sessionWakeAckSchema.parse(raw)
    if (JSON.stringify(this.preview(owner)) !== JSON.stringify(ack.manifest))
      throw new HbarError('SESSION_WAKE_STALE', 'Wake checkpoint changed before quiescence')
    this.rollback = this.transfer?.phase === 'committed' ? { ack: this.transfer.ack, phase: 'committed' } : undefined
    for (const value of this.pending.values()) value.timer?.cancel()
    this.transfer = { ack, phase: 'quiesced' }
  }
  commit(ack: SessionWakeAck): void {
    this.exact(ack)
    const transfer = this.transfer
    if (!transfer) throw new HbarError('SESSION_WAKE_STALE', 'Wake transfer is absent')
    transfer.phase = 'committed'
    this.rollback = undefined
    for (const value of this.pending.values()) {
      value.transferred = true
      value.resolve()
    }
  }
  abort(ack: SessionWakeAck): void {
    this.exact(ack)
    this.transfer = this.rollback
    this.rollback = undefined
    for (const [sessionId, value] of this.pending) if (!value.transferred) this.arm(sessionId, value)
  }
  restore(ack: SessionWakeAck, entries: readonly SessionWakeEntry[]): void {
    if (this.closed || this.pending.size || this.transfer)
      throw new HbarError('SESSION_WAKE_FENCED', 'Restoration requires a fresh Kernel')
    const parsed = sessionWakeAckSchema.parse(ack)
    if (new Set(entries.map((entry) => entry.sessionId)).size !== entries.length)
      throw new HbarError('SESSION_WAKE_STALE', 'Duplicate restored wake identity')
    for (const entry of entries) {
      if (!parsed.manifest.entries.some((value) => sameSessionWake(value, entry)))
        throw new HbarError('SESSION_WAKE_STALE', 'Restored wake was not acknowledged')
    }
    for (const entry of entries) {
      this.pending.set(entry.sessionId, {
        dueAt: entry.dueAt,
        entry,
        transferred: true,
        timer: undefined,
        done: Promise.resolve(),
        resolve() {},
      })
    }
    this.revision = parsed.manifest.revision
    this.transfer = entries.length ? { ack: parsed, phase: 'committed' } : undefined
  }
  matches(token: string, entry: SessionWakeEntry): boolean {
    if (this.transfer?.phase !== 'committed' || this.transfer.ack.token !== token) return false
    const value = this.pending.get(entry.sessionId)
    return (
      value?.transferred === true &&
      !!value.entry &&
      sameSessionWake(value.entry, entry) &&
      this.transfer.ack.manifest.entries.some((accepted) => sameSessionWake(accepted, entry))
    )
  }
  delivered(token: string, entry: SessionWakeEntry): boolean {
    if (!this.matches(token, entry)) return false
    this.reserveChange(this.localCount())
    this.pending.delete(entry.sessionId)
    this.changed()
    if (!this.pending.size) this.transfer = undefined
    return true
  }
  private exact(ack: SessionWakeAck): void {
    if (this.closed || this.transfer?.phase !== 'quiesced' || JSON.stringify(this.transfer.ack) !== JSON.stringify(ack))
      throw new HbarError('SESSION_WAKE_STALE', 'Wake transfer identity changed')
  }
  get waiting() {
    if (this.closed) return []
    return [...this.pending.values()].filter((value) => !value.transferred).map((value) => value.done)
  }
  get pendingCount(): number {
    return (
      [...this.pending.values()].filter((value) => !value.transferred).length +
      Number(this.transfer?.phase === 'unknown')
    )
  }
  has(sessionId: string): boolean {
    return this.pending.has(sessionId)
  }
  close(): void {
    this.closed = true
    for (const value of this.pending.values()) {
      value.timer?.cancel()
      value.resolve()
    }
    // Closing creates no transfer ACK, clears no UNKNOWN, and proves no delivery.
  }
}
