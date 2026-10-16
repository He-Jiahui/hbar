import { HbarError } from '@hbar/contracts'
import { runtimeDomainError, type IpcCallOptions } from '@hbar/runtime'

export const DRIVER_CALLBACK_ADMISSION_CONTRACT = {
  version: 2,
  active: 6,
  leafActive: 2,
  leafMethods: ['modelDiagnostic', 'emit', 'commit', 'steering', 'closeSteering'],
  queued: 128,
  deadline: 'queue-and-dispatch',
  completion: 'reply-or-not-dispatched',
} as const

type Settlement = NonNullable<IpcCallOptions['onDispatchSettled']>
interface Permit {
  settle: Settlement
  unknown(): boolean
}
interface Waiting {
  readonly signal: AbortSignal
  readonly grant: (permit: Permit) => void
  readonly reject: (error: unknown) => void
  readonly abort: () => void
  readonly timer: ReturnType<typeof setTimeout>
}

/** A permit follows physical IPC settlement, never just the caller's logical Promise. */
class CallbackLane {
  constructor(
    private readonly limit: number,
    private readonly onFence: () => void = () => {},
    private readonly queuedCount: () => number = () => this.queue.length,
  ) {}
  private active = 0
  private unconfirmed = 0
  private closed = false
  private fenced = false
  private readonly queue: Waiting[] = []

  snapshot() {
    return {
      active: this.active,
      queued: this.queue.length,
      unconfirmed: this.unconfirmed,
      closed: this.closed,
      fenced: this.fenced,
    }
  }

  async run<Result>(
    signal: AbortSignal,
    timeoutMs: number,
    operation: (options: { timeoutMs: number; onDispatchSettled: Settlement }) => Promise<Result>,
  ): Promise<Result> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647)
      throw new HbarError('INVALID_INPUT', 'Driver callback deadline is outside its supported range')
    const deadline = performance.now() + timeoutMs
    const permit = await this.acquire(signal, deadline)
    let started = false
    try {
      signal.throwIfAborted()
      this.assertAdmission()
      const remainingMs = Math.floor(deadline - performance.now())
      if (remainingMs < 1) throw new HbarError('IPC_TIMEOUT', 'Driver callback admission deadline expired')
      started = true
      return await operation({ timeoutMs: remainingMs, onDispatchSettled: permit.settle })
    } catch (error) {
      if (!started) permit.settle('not-dispatched')
      else {
        if (permit.unknown() && runtimeDomainError(error)?.code !== 'IPC_CANCELLED') this.fence()
      }
      throw error
    }
  }

  /** Closing admission is not evidence that any dispatched handler physically returned. */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.rejectWaiting('DRIVER_CALLBACK_GATE_CLOSED')
  }

  private assertAdmission(): void {
    if (this.closed) throw new HbarError('DRIVER_CALLBACK_GATE_CLOSED', 'Driver callback admission is closed')
    if (this.fenced)
      throw new HbarError('DRIVER_CALLBACK_GATE_FENCED', 'Driver callback physical completion is unconfirmed')
  }

  private acquire(signal: AbortSignal, deadline: number): Promise<Permit> {
    signal.throwIfAborted()
    this.assertAdmission()
    if (this.active < this.limit) return Promise.resolve(this.permit())
    if (this.queuedCount() >= DRIVER_CALLBACK_ADMISSION_CONTRACT.queued)
      return Promise.reject(new HbarError('DRIVER_CALLBACK_GATE_BUSY', 'Driver callback admission queue is full'))
    return new Promise<Permit>((resolve, reject) => {
      const remove = (error: unknown) => {
        const index = this.queue.indexOf(waiting)
        if (index < 0) return
        this.queue.splice(index, 1)
        this.clean(waiting)
        reject(error)
      }
      const waiting: Waiting = {
        signal,
        grant: resolve,
        reject,
        abort: () => remove(signal.reason),
        timer: setTimeout(
          () => remove(new HbarError('IPC_TIMEOUT', 'Driver callback admission deadline expired')),
          Math.max(1, Math.ceil(deadline - performance.now())),
        ),
      }
      this.queue.push(waiting)
      signal.addEventListener('abort', waiting.abort, { once: true })
    })
  }

  private permit(): Permit {
    this.active++
    let settled = false
    let unknown = false
    return {
      settle: () => {
        if (settled) return
        settled = true
        this.active--
        if (unknown) this.unconfirmed--
        if (!this.closed && !this.fenced) {
          const waiting = this.queue.shift()
          if (waiting) {
            this.clean(waiting)
            waiting.grant(this.permit())
          }
        }
      },
      unknown: () => {
        if (settled) return false
        if (!unknown) {
          unknown = true
          this.unconfirmed++
        }
        return true
      },
    }
  }

  private clean(waiting: Waiting): void {
    clearTimeout(waiting.timer)
    waiting.signal.removeEventListener('abort', waiting.abort)
  }
  fence(): void {
    if (this.fenced) return
    this.fenced = true
    this.onFence()
    this.rejectWaiting('DRIVER_CALLBACK_GATE_FENCED')
  }
  private rejectWaiting(code: 'DRIVER_CALLBACK_GATE_CLOSED' | 'DRIVER_CALLBACK_GATE_FENCED'): void {
    for (const waiting of this.queue.splice(0)) {
      this.clean(waiting)
      waiting.reject(new HbarError(code, 'Driver callback admission is unavailable'))
    }
  }
}

/** Fixed recursive admission retained for direct contract tests. */
export class RuntimeDriverCallbackGate extends CallbackLane {
  constructor() {
    super(DRIVER_CALLBACK_ADMISSION_CONTRACT.active)
  }
}

/** Both lanes share an authority boundary and a bounded waiting budget. */
export class RuntimeDriverCallbackAdmission {
  private readonly recursive: CallbackLane
  private readonly leaf: CallbackLane
  constructor() {
    const fence = () => {
      this.recursive.fence()
      this.leaf.fence()
    }
    const queued = () => this.recursive.snapshot().queued + this.leaf.snapshot().queued
    this.recursive = new CallbackLane(DRIVER_CALLBACK_ADMISSION_CONTRACT.active, fence, queued)
    this.leaf = new CallbackLane(DRIVER_CALLBACK_ADMISSION_CONTRACT.leafActive, fence, queued)
  }
  run<Result>(
    method: string,
    signal: AbortSignal,
    timeoutMs: number,
    operation: (options: { timeoutMs: number; onDispatchSettled: Settlement }) => Promise<Result>,
  ): Promise<Result> {
    // Only these audited callbacks await Storage leaves or local diagnostics.
    const leaf = DRIVER_CALLBACK_ADMISSION_CONTRACT.leafMethods.some((value) => value === method)
    return (leaf ? this.leaf : this.recursive).run(signal, timeoutMs, operation)
  }
  snapshot() {
    const recursive = this.recursive.snapshot(),
      leaf = this.leaf.snapshot()
    return { recursive, leaf, active: recursive.active + leaf.active, queued: recursive.queued + leaf.queued }
  }
  close(): void {
    this.recursive.close()
    this.leaf.close()
  }
}
