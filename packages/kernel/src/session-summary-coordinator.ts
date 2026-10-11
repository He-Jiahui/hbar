import type { SessionSummary } from '@hbar/contracts'

export interface SessionSummaryOverride {
  readonly activity?: SessionSummary['activity']
  readonly activeRunId?: string | null
}

type SessionSummaryTimer = ReturnType<typeof setTimeout>

interface InFlightSummary {
  publishable: boolean
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
    const operation = Promise.resolve().then(() => this.publish(sessionId, override, isCurrent))
    void operation
      .catch(() => undefined)
      .finally(() => {
        if (this.inFlight.get(sessionId) === state) this.inFlight.delete(sessionId)
        if (!this.closed && this.pending.has(sessionId)) this.scheduleTimer(sessionId)
      })
  }
}
