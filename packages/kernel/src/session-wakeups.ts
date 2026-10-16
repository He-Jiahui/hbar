/** Host-owned bounded delays. Cancelling a timer also releases idle waiters. */
export class SessionWakeups {
  private pending = new Map<string, { timer: ReturnType<typeof setTimeout>; done: Promise<void>; resolve(): void }>()

  constructor(private readonly wake: (sessionId: string) => void) {}

  schedule(sessionId: string, at: number) {
    this.cancel(sessionId)
    let resolve!: () => void
    const done = new Promise<void>((finish) => {
      resolve = finish
    })
    const timer = setTimeout(
      () => {
        this.pending.delete(sessionId)
        this.wake(sessionId)
        resolve()
      },
      Math.max(1, Math.min(60_000, at - Date.now())),
    )
    this.pending.set(sessionId, { timer, done, resolve })
  }

  cancel(sessionId: string) {
    const pending = this.pending.get(sessionId)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(sessionId)
    pending.resolve()
  }

  get pendingCount(): number {
    return this.pending.size
  }

  get waiting() {
    return [...this.pending.values()].map(({ done }) => done)
  }

  has(sessionId: string): boolean {
    return this.pending.has(sessionId)
  }

  close() {
    for (const sessionId of this.pending.keys()) this.cancel(sessionId)
  }
}
