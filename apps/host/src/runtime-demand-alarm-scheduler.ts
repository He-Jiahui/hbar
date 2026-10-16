export interface RuntimeDemandAlarm {
  readonly key: string
  /** Existing domain checkpoint/occurrence/intent identity, never a new Run request. */
  readonly id: string
  /** Authoritative monotone revision/cursor for this key, not a wall-clock guess. */
  readonly version: number
  /** Stable parent scheduler epoch; deliberately independent of child incarnation. */
  readonly epoch: string
  readonly unitId: string
  /** Absolute Unix milliseconds, unlike the lifecycle core's monotonic idle clock. */
  readonly dueAt: number
}

export type RuntimeDemandAlarmIdentity = Pick<RuntimeDemandAlarm, 'key' | 'id' | 'version' | 'epoch'>
export interface RuntimeAlarmAttempt extends RuntimeDemandAlarmIdentity {
  readonly attempt: number
}
export type RuntimeAlarmRunNow =
  | { readonly kind: 'started' | 'joined'; readonly attempt: RuntimeAlarmAttempt; readonly settled: Promise<void> }
  | { readonly kind: 'handled' | 'blocked' | 'stale' | 'busy' | 'paused' | 'stopped' }
export interface RuntimeAlarmTimer {
  cancel(): void
}
export interface RuntimeAlarmClock {
  now(): number
  /** Nonthrowing timer adapter; it must not invoke callback synchronously. */
  schedule(callback: () => void, delayMs: number): RuntimeAlarmTimer
}
export type RuntimeAlarmOutcome =
  | { readonly kind: 'handled' }
  /** Adapter positively knows no unknown effect will be replayed. */
  | { readonly kind: 'retry'; readonly reason: 'not-dispatched' | 'retryable-read' }
  | { readonly kind: 'unknown' }

export interface RuntimeAlarmPort {
  /**
   * Revalidate the exact durable checkpoint and acquire the unit's demand lease.
   * Hold it through actual callback settlement, not just logical cancellation.
   * handled means durable handoff/authoritative no-op, never Run success.
   * This must be a short due-check/wake frontdoor, not an entire Run lifetime.
   */
  due(alarm: RuntimeDemandAlarm, signal: AbortSignal, attempt: RuntimeAlarmAttempt): Promise<RuntimeAlarmOutcome>
}
export interface RuntimeAlarmLimits {
  readonly maxKeys?: number
  readonly maxAttempts?: number
  readonly initialBackoffMs?: number
  readonly maxBackoffMs?: number
  readonly maxTimerDelayMs?: number
}
export type RuntimeAlarmPhase = 'queued' | 'running' | 'handled' | 'cancelled' | 'blocked'
export interface RuntimeAlarmSnapshot {
  readonly stopped: boolean
  readonly paused: boolean
  readonly inFlight: RuntimeDemandAlarm | null
  readonly inFlightAttempt: number | null
  readonly inFlightFenced: boolean
  readonly entries: readonly {
    readonly alarm: RuntimeDemandAlarm
    readonly phase: RuntimeAlarmPhase
    readonly attempts: number
    readonly nextAttemptAt: number | null
    readonly reason: 'unknown' | 'callback-failed' | 'retry-limit' | 'stopped-active' | null
  }[]
}

interface Entry {
  readonly alarm: RuntimeDemandAlarm
  phase: RuntimeAlarmPhase
  attempts: number
  nextAttemptAt: number
  reason: 'unknown' | 'callback-failed' | 'retry-limit' | 'stopped-active' | null
}
interface Flight {
  readonly entry: Entry
  readonly controller: AbortController
  readonly attempt: number
  fenced: boolean
  done: Promise<void>
}
const defaultClock: RuntimeAlarmClock = {
  now: Date.now,
  schedule(callback, delayMs) {
    const handle = setTimeout(callback, delayMs)
    return { cancel: () => clearTimeout(handle) }
  },
}
function bound(value: number | undefined, fallback: number, maximum: number): number {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new RangeError('Invalid alarm bound')
  return result
}
function identifier(value: string): void {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200)
    throw new RangeError('Invalid alarm identifier')
  for (let index = 0; index < value.length; index++)
    if (value.charCodeAt(index) <= 31) throw new RangeError('Invalid alarm identifier')
}
function identity(left: RuntimeDemandAlarmIdentity, right: RuntimeDemandAlarmIdentity): boolean {
  return left.key === right.key && left.id === right.id && left.version === right.version && left.epoch === right.epoch
}

/**
 * Stable-parent in-memory delivery index, NOT a durable job store or recovery engine.
 * Terminal entries retain a bounded high-water mark. Capacity failure must block
 * child retirement; it is not permission to forget a checkpoint or evict alarms.
 */
export class RuntimeDemandAlarmScheduler {
  private readonly entries = new Map<string, Entry>()
  private readonly maxKeys: number
  private readonly maxAttempts: number
  private readonly initialBackoff: number
  private readonly maxBackoff: number
  private readonly maxTimerDelay: number
  private timer: RuntimeAlarmTimer | undefined
  private timerVersion = 0
  private active: Flight | undefined
  private stopped = false
  private paused = false

  constructor(
    private readonly epoch: string,
    private readonly port: RuntimeAlarmPort,
    private readonly clock: RuntimeAlarmClock = defaultClock,
    limits: RuntimeAlarmLimits = {},
  ) {
    identifier(epoch)
    this.maxKeys = bound(limits.maxKeys, 128, 4096)
    this.maxAttempts = bound(limits.maxAttempts, 8, 32)
    this.initialBackoff = bound(limits.initialBackoffMs, 1000, 86_400_000)
    this.maxBackoff = bound(limits.maxBackoffMs, 60_000, 86_400_000)
    this.maxTimerDelay = bound(limits.maxTimerDelayMs, 60_000, 2_147_483_647)
    if (this.initialBackoff > this.maxBackoff) throw new RangeError('Invalid alarm backoff range')
  }

  upsert(input: RuntimeDemandAlarm): 'accepted' | 'unchanged' | 'stale' | 'capacity' {
    if (this.stopped) throw new Error('ALARM_SCHEDULER_STOPPED')
    for (const value of [input.key, input.id, input.epoch, input.unitId]) identifier(value)
    if (
      !Number.isSafeInteger(input.version) ||
      input.version < 0 ||
      !Number.isSafeInteger(input.dueAt) ||
      input.dueAt < 0
    )
      throw new RangeError('Invalid alarm revision or timestamp')
    if (input.epoch !== this.epoch) return 'stale'
    const previous = this.entries.get(input.key)
    if (previous && input.version < previous.alarm.version) return 'stale'
    if (previous && input.version === previous.alarm.version) {
      if (
        !identity(input, previous.alarm) ||
        input.unitId !== previous.alarm.unitId ||
        input.dueAt !== previous.alarm.dueAt
      )
        throw new Error('ALARM_REVISION_CONFLICT')
      return 'unchanged'
    }
    if (!previous && this.entries.size >= this.maxKeys) return 'capacity'
    // Copy only fixed metadata. No prompt, snapshot, callback closure or tool payload.
    const alarm: RuntimeDemandAlarm = Object.freeze({
      key: input.key,
      id: input.id,
      version: input.version,
      epoch: input.epoch,
      unitId: input.unitId,
      dueAt: input.dueAt,
    })
    this.entries.set(alarm.key, { alarm, phase: 'queued', attempts: 0, nextAttemptAt: alarm.dueAt, reason: null })
    if (this.active?.entry.alarm.key === alarm.key) this.active.controller.abort()
    this.arm()
    return 'accepted'
  }

  cancel(expected: RuntimeDemandAlarmIdentity): boolean {
    const entry = this.entries.get(expected.key)
    if (!entry || !identity(entry.alarm, expected) || entry.phase === 'cancelled') return false
    entry.phase = 'cancelled'
    if (this.active?.entry === entry) this.active.controller.abort()
    this.arm()
    return true
  }

  /** Inspection is detached and never acquires demand, reschedules timers or extends idle. */
  peek(): RuntimeAlarmSnapshot {
    return {
      stopped: this.stopped,
      paused: this.paused,
      inFlight: this.active ? { ...this.active.entry.alarm } : null,
      inFlightAttempt: this.active?.attempt ?? null,
      inFlightFenced: this.active?.fenced ?? false,
      entries: [...this.entries.values()].map((entry) => ({
        alarm: { ...entry.alarm },
        phase: entry.phase,
        attempts: entry.attempts,
        nextAttemptAt: entry.phase === 'queued' ? entry.nextAttemptAt : null,
        reason: entry.reason,
      })),
    }
  }

  /** Abort is only a request. Keep the single physical flight until its Promise settles. */
  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.clearTimer()
    if (this.active) {
      if (
        this.entries.get(this.active.entry.alarm.key) === this.active.entry &&
        this.active.entry.phase === 'running'
      ) {
        this.active.entry.phase = 'blocked'
        this.active.entry.reason = 'stopped-active'
      }
      this.active.controller.abort()
    }
    // Queued records remain inspectable; authoritative checkpoints remain durable outside this class.
  }

  /** Logical delivery Promise only. An inFlightFenced snapshot still forbids retirement. */
  whenSettled(): Promise<void> {
    return this.active?.done ?? Promise.resolve()
  }

  /** Reversible admission stop. Accepted physical callbacks retain their own real completion. */
  pause(): void {
    this.paused = true
    this.clearTimer()
  }
  resume(): void {
    if (this.stopped || !this.paused) return
    this.paused = false
    this.arm()
  }

  /** Foreground joins the same physical delivery. It only cancels an unexecuted timer, never its active callback. */
  runNow(expected: RuntimeDemandAlarmIdentity): RuntimeAlarmRunNow {
    if (this.stopped) return { kind: 'stopped' }
    if (this.paused) return { kind: 'paused' }
    const entry = this.entries.get(expected.key)
    if (!entry || !identity(entry.alarm, expected)) return { kind: 'stale' }
    if (this.active) {
      if (this.active.entry !== entry) return { kind: 'busy' }
      if (this.active.fenced) return { kind: 'blocked' }
      return this.runReceipt('joined', this.active)
    }
    if (entry.phase === 'handled') return { kind: 'handled' }
    if (entry.phase !== 'queued') return { kind: 'blocked' }
    entry.nextAttemptAt = this.clock.now()
    this.clearTimer()
    this.fire(entry)
    const flight = this.currentFlight()
    if (!flight) throw new Error('ALARM_DELIVERY_NOT_STARTED')
    return this.runReceipt('started', flight)
  }

  private runReceipt(kind: 'started' | 'joined', flight: Flight): RuntimeAlarmRunNow {
    return {
      kind,
      settled: flight.done,
      attempt: {
        key: flight.entry.alarm.key,
        id: flight.entry.alarm.id,
        version: flight.entry.alarm.version,
        epoch: flight.entry.alarm.epoch,
        attempt: flight.attempt,
      },
    }
  }
  private currentFlight(): Flight | undefined {
    return this.active
  }

  /**
   * INTERNAL trusted Host receipt-coordinator hook, never a public command/RPC.
   * Caller must independently verify exact physical completion/owner exit.
   * A settled RPC Promise, logical abort or timeout is NOT that evidence.
   * This clears only the physical fence; the failed alarm remains blocked.
   */
  confirmPhysicalCompletion(expected: RuntimeAlarmAttempt): boolean {
    if (
      !this.active?.fenced ||
      this.active.attempt !== expected.attempt ||
      !identity(this.active.entry.alarm, expected)
    )
      return false
    this.active = undefined
    this.arm()
    return true
  }

  private clearTimer(): void {
    this.timerVersion++
    this.timer?.cancel()
    this.timer = undefined
  }
  private next(): Entry | undefined {
    let earliest: Entry | undefined
    for (const entry of this.entries.values()) {
      if (entry.phase !== 'queued') continue
      if (
        !earliest ||
        entry.nextAttemptAt < earliest.nextAttemptAt ||
        (entry.nextAttemptAt === earliest.nextAttemptAt && entry.alarm.key < earliest.alarm.key)
      )
        earliest = entry
    }
    return earliest
  }
  private arm(): void {
    this.clearTimer()
    if (this.stopped || this.paused || this.active) return
    const next = this.next()
    if (!next) return
    const ticket = this.timerVersion
    const delay = Math.max(1, Math.min(this.maxTimerDelay, next.nextAttemptAt - this.clock.now()))
    this.timer = this.clock.schedule(() => {
      if (this.stopped || this.paused || ticket !== this.timerVersion) return
      this.timer = undefined
      this.fire()
    }, delay)
  }
  private fire(selected?: Entry): void {
    if (this.stopped || this.paused || this.active) return
    const entry = selected ?? this.next()
    if (entry && (this.entries.get(entry.alarm.key) !== entry || entry.phase !== 'queued')) return
    if (!entry || entry.nextAttemptAt > this.clock.now()) {
      this.arm()
      return
    }
    entry.phase = 'running'
    entry.attempts++
    const flight: Flight = {
      entry,
      controller: new AbortController(),
      attempt: entry.attempts,
      fenced: false,
      done: Promise.resolve(),
    }
    this.active = flight
    // Defer invocation until active is set, including synchronous/reentrant callbacks.
    flight.done = Promise.resolve()
      .then(() =>
        this.port.due(entry.alarm, flight.controller.signal, {
          key: entry.alarm.key,
          id: entry.alarm.id,
          version: entry.alarm.version,
          epoch: entry.alarm.epoch,
          attempt: flight.attempt,
        }),
      )
      .then(
        (outcome) => this.finish(flight, outcome, false),
        () => this.finish(flight, { kind: 'unknown' }, true),
      )
  }
  private finish(flight: Flight, outcome: RuntimeAlarmOutcome, failed: boolean): void {
    if (this.active !== flight) return
    const entry = flight.entry
    if (outcome.kind === 'unknown') {
      // A failed/unknown callback may only have stopped waiting for physical work.
      // Keep the global singleflight until independently trusted reconciliation.
      flight.fenced = true
      if (this.entries.get(entry.alarm.key) === entry && entry.phase === 'running') {
        entry.phase = 'blocked'
        entry.reason = failed ? 'callback-failed' : 'unknown'
      }
      flight.controller.abort()
      return
    }
    this.active = undefined
    // Superseded/cancelled/stopped completion cannot acknowledge a successor checkpoint.
    if (!this.stopped && this.entries.get(entry.alarm.key) === entry && entry.phase === 'running') {
      if (outcome.kind === 'handled') entry.phase = 'handled'
      else if (outcome.kind === 'retry' && entry.attempts < this.maxAttempts) {
        entry.phase = 'queued'
        entry.nextAttemptAt =
          this.clock.now() + Math.min(this.maxBackoff, this.initialBackoff * 2 ** (entry.attempts - 1))
      } else {
        entry.phase = 'blocked'
        entry.reason = 'retry-limit'
      }
    }
    this.arm()
  }
}
