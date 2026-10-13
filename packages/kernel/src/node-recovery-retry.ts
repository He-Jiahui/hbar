export interface NodeRecoveryRetryTimers {
  set(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>
  clear(timer: ReturnType<typeof setTimeout>): void
}

const systemTimers: NodeRecoveryRetryTimers = {
  set: (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs)
    timer.unref?.()
    return timer
  },
  clear: (timer) => clearTimeout(timer),
}

/** One bounded, disposable reconnect/readback retry per interrupted Run. */
export class NodeRecoveryRetryScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly attempts = new Map<string, number>()
  private closed = false

  constructor(
    private readonly retry: (runId: string) => Promise<void>,
    private readonly timerPort: NodeRecoveryRetryTimers = systemTimers,
    private readonly capacity = 256,
  ) {}

  schedule(runId: string): void {
    if (this.closed || this.timers.has(runId)) return
    if (this.timers.size >= this.capacity) {
      console.error('[hbar recovery] node receipt retry capacity is exhausted')
      return
    }
    const attempt = this.attempts.get(runId) ?? 0
    const delayMs = attempt === 0 ? 15_000 : 30_000
    const timer = this.timerPort.set(() => {
      this.timers.delete(runId)
      if (this.closed) return
      this.retry(runId).catch((error: unknown) => {
        console.error(
          `[hbar recovery] node receipt retry failed (${error instanceof Error ? error.name : 'RECOVERY_FAILED'})`,
        )
        this.schedule(runId)
      })
    }, delayMs)
    this.timers.set(runId, timer)
    this.attempts.set(runId, Math.min(1, attempt + 1))
  }

  clear(runId: string): void {
    const timer = this.timers.get(runId)
    if (timer !== undefined) this.timerPort.clear(timer)
    this.timers.delete(runId)
    this.attempts.delete(runId)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const timer of this.timers.values()) this.timerPort.clear(timer)
    this.timers.clear()
    this.attempts.clear()
  }
}
