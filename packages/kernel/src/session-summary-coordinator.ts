import type { SessionSummary } from '@hbar/contracts'

export interface SessionSummaryOverride {
  readonly activity?: SessionSummary['activity']
  readonly activeRunId?: string | null
}

type SessionSummaryTimer = ReturnType<typeof setTimeout>

interface InFlightSummary {
  publishable: boolean
}

type SummarySettlement = { readonly ok: true } | { readonly ok: false; readonly error: unknown }

export interface SessionSummaryDrainOptions {
  readonly timeoutMs?: number | undefined
  readonly signal?: AbortSignal | undefined
}

export class SessionSummaryDrainError extends Error {
  constructor(
    readonly code: 'SUMMARY_DRAIN_TIMEOUT' | 'SUMMARY_DRAIN_FAILED',
    readonly pendingOperations: number,
    options?: ErrorOptions,
  ) {
    super(code, options)
    this.name = 'SessionSummaryDrainError'
  }
}

export interface SessionSummaryCoordinatorOptions {
  readonly delayMs?: number | undefined
  readonly setTimer?: ((callback: () => void, delayMs: number) => SessionSummaryTimer) | undefined
  readonly clearTimer?: ((timer: SessionSummaryTimer) => void) | undefined
}

export class SessionSummaryCoordinator {
  private readonly timers = new Map<string, SessionSummaryTimer>()
  private readonly pending = new Map<string, SessionSummaryOverride>()
  private readonly inFlight = new Map<string, InFlightSummary>()
  private readonly delayMs: number
  private readonly setTimer: (callback: () => void, delayMs: number) => SessionSummaryTimer
  private readonly clearTimer: (timer: SessionSummaryTimer) => void
  private closed = false
  private readonly operations = new Set<Promise<SummarySettlement>>()
  private readonly closeErrors: unknown[] = []

  constructor(
    private readonly publish: (
      sessionId: string,
      override: SessionSummaryOverride,
      isCurrent: () => boolean,
    ) => Promise<void>,
    options: SessionSummaryCoordinatorOptions = {},
  ) {
    this.delayMs = options.delayMs ?? 80
    this.setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs))
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer))
  }

  idleCounts() {
    return {
      timers: this.timers.size,
      pending: this.pending.size,
      inFlight: this.inFlight.size,
      operations: this.operations.size,
      failed: this.closeErrors.length,
      closed: this.closed,
    }
  }

  schedule(sessionId: string, activity?: SessionSummary['activity'], activeRunId?: string | null): void {
    if (this.closed) return
    const previous = this.pending.get(sessionId) ?? {}
    this.pending.set(sessionId, {
      ...previous,
      ...(activity === undefined ? {} : { activity }),
      ...(activeRunId === undefined ? {} : { activeRunId }),
    })
    this.scheduleTimer(sessionId)
  }

  cancel(sessionId: string): void {
    const timer = this.timers.get(sessionId)
    if (timer !== undefined) this.clearTimer(timer)
    this.timers.delete(sessionId)
    this.pending.delete(sessionId)
    const inFlight = this.inFlight.get(sessionId)
    if (inFlight) inFlight.publishable = false
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const timer of this.timers.values()) this.clearTimer(timer)
    this.timers.clear()
    this.pending.clear()
    for (const inFlight of this.inFlight.values()) inFlight.publishable = false
    this.inFlight.clear()
  }

  /** Join issued work; timeout/abort do not cancel storage calls or authorize storage retirement. */
  async closeAndWait(options: SessionSummaryDrainOptions = {}): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 5_000
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647)
      throw new RangeError('Summary drain timeout must be a positive timer-safe integer')
    this.close()
    const signal = options.signal
    signal?.throwIfAborted()
    const pending = [...this.operations]
    if (!pending.length) {
      this.assertDrainSucceeded()
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let abort: (() => void) | undefined
    try {
      const interrupted = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new SessionSummaryDrainError('SUMMARY_DRAIN_TIMEOUT', this.operations.size)),
          timeoutMs,
        )
        abort = () => reject(signal?.reason)
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) abort()
      })
      await Promise.race([Promise.all(pending), interrupted])
      this.assertDrainSucceeded()
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      if (abort) signal?.removeEventListener('abort', abort)
    }
  }

  private assertDrainSucceeded(): void {
    if (this.closeErrors.length)
      throw new SessionSummaryDrainError('SUMMARY_DRAIN_FAILED', this.operations.size, {
        cause: new AggregateError(this.closeErrors, 'Summary publications failed during drain'),
      })
  }

  private scheduleTimer(sessionId: string): void {
    if (this.closed || this.timers.has(sessionId) || this.inFlight.has(sessionId)) return
    const timer = this.setTimer(() => {
      this.timers.delete(sessionId)
      this.flush(sessionId)
    }, this.delayMs)
    this.timers.set(sessionId, timer)
  }

  private flush(sessionId: string): void {
    if (this.closed || this.inFlight.has(sessionId)) return
    const override = this.pending.get(sessionId)
    if (!override) return
    this.pending.delete(sessionId)
    const state: InFlightSummary = { publishable: true }
    this.inFlight.set(sessionId, state)
    const isCurrent = () => {
      if (this.closed || !state.publishable) return false
      const pending = this.pending.get(sessionId)
      if (!pending) return true
      const latest = { ...override, ...pending }
      return latest.activity === override.activity && latest.activeRunId === override.activeRunId
    }
    const publication = Promise.resolve().then(() => {
      if (!this.closed) return this.publish(sessionId, override, isCurrent)
      return undefined
    })
    const settled: Promise<SummarySettlement> = publication.then(
      (): SummarySettlement => ({ ok: true }),
      (error: unknown): SummarySettlement => ({ ok: false, error }),
    )
    const operation = settled.then((result): SummarySettlement => {
      if (this.closed && !result.ok) this.closeErrors.push(result.error)
      this.operations.delete(operation)
      if (this.inFlight.get(sessionId) === state) this.inFlight.delete(sessionId)
      if (!this.closed && this.pending.has(sessionId)) {
        try {
          this.scheduleTimer(sessionId)
        } catch (error) {
          return { ok: false, error }
        }
      }
      return result
    })
    this.operations.add(operation)
  }
}
