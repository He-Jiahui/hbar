export interface RecoveryPolicyOptions {
  readonly fastDelaysMs?: readonly [number, number, number]
  readonly slowDelayMs?: number
  readonly healthyResetMs?: number
  readonly jitter?: number
}

export function timerDuration(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 2_147_483_647)
    throw new RangeError('Lifecycle duration must be a positive timer-safe integer')
  return resolved
}

/** The same policy applies to Host restarts and managed runtime generation recovery. */
export class RecoveryPolicy {
  private failures = 0
  private healthySince: number | null = null
  private readonly fast: readonly [number, number, number]
  private readonly slow: number
  private readonly reset: number
  private readonly jitter: number

  constructor(options: RecoveryPolicyOptions = {}) {
    this.fast = options.fastDelaysMs ?? [250, 1_000, 4_000]
    for (const delay of this.fast) timerDuration(delay, 250)
    this.slow = timerDuration(options.slowDelayMs, 30_000)
    this.reset = timerDuration(options.healthyResetMs, 60_000)
    this.jitter = options.jitter ?? 0.2
    if (!Number.isFinite(this.jitter) || this.jitter < 0 || this.jitter > 0.5)
      throw new RangeError('Recovery jitter must be between zero and one half')
  }

  healthy(now = Date.now()): void {
    this.healthySince ??= now
  }

  interrupted(): void {
    this.healthySince = null
  }

  failed(now = Date.now()): { failures: number; delayMs: number; nextAttemptAt: number } {
    if (this.healthySince !== null && now - this.healthySince >= this.reset) this.failures = 0
    this.healthySince = null
    const base = this.fast[this.failures] ?? this.slow
    this.failures++
    const delayMs = Math.max(1, Math.round(base * (1 + (Math.random() * 2 - 1) * this.jitter)))
    return { failures: this.failures, delayMs, nextAttemptAt: now + delayMs }
  }
}
