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
type Submission = NonNullable<IpcCallOptions['onDispatchStarted']>
export interface CallbackAdmissionObservation {
  readonly phase:
    | 'waiting'
    | 'granted'
    | 'transport_submitting'
    | 'transport_sent'
    | 'transport_send_failed'
    | 'logical_settled'
    | 'physical_reply'
    | 'not_dispatched'
  readonly stage:
    'admission' | 'waiting' | 'granted' | 'transport_submitting' | 'transport_sent' | 'transport_send_failed'
  readonly active: number
  readonly queued: number
  readonly unconfirmed: number
  readonly budgetMs: number
  readonly remainingBudgetMs: number
  readonly elapsedMs: number
  readonly errorCode?: string | undefined
}
export type CallbackAdmissionObserver = (event: CallbackAdmissionObservation) => void
interface CallbackOptions {
  timeoutMs: number
  onDispatchSettled: Settlement
  onDispatchStarted: Submission
}

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
    operation: (options: CallbackOptions) => Promise<Result>,
    observer?: CallbackAdmissionObserver,
  ): Promise<Result> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647)
      throw new HbarError('INVALID_INPUT', 'Driver callback deadline is outside its supported range')
    const deadline = performance.now() + timeoutMs
    let stage: CallbackAdmissionObservation['stage'] = 'admission'
    const emit = (phase: CallbackAdmissionObservation['phase'], error?: unknown): void => {
      if (
        phase === 'waiting' ||
        phase === 'granted' ||
        phase === 'transport_submitting' ||
        phase === 'transport_sent' ||
        phase === 'transport_send_failed'
      )
        stage = phase
      if (!observer) return
      try {
        const code = runtimeDomainError(error)?.code
        observer({
          phase,
          stage,
          active: this.active,
          queued: this.queue.length,
          unconfirmed: this.unconfirmed,
          budgetMs: timeoutMs,
          remainingBudgetMs: Math.max(0, Math.floor(deadline - performance.now())),
          elapsedMs: Math.max(0, performance.now() - (deadline - timeoutMs)),
          ...(code && /^[A-Z][A-Z0-9_.-]{0,127}$/.test(code) ? { errorCode: code } : {}),
        })
      } catch {
        /* Observation never owns admission or settlement. */
      }
    }
    const permit = await this.acquire(signal, deadline, () => emit('waiting')).catch((error: unknown) => {
      emit('logical_settled', error)
      throw error
    })
    emit('granted')
    let started = false
    try {
      signal.throwIfAborted()
      this.assertAdmission()
      const remainingMs = Math.floor(deadline - performance.now())
      if (remainingMs < 1) throw new HbarError('IPC_TIMEOUT', 'Driver callback admission deadline expired')
      started = true
      const value = await operation({
        timeoutMs: remainingMs,
        onDispatchStarted: (event) =>
          emit(
            event === 'submitting'
              ? 'transport_submitting'
              : event === 'sent'
                ? 'transport_sent'
                : 'transport_send_failed',
          ),
        onDispatchSettled: (event) => {
          permit.settle(event)
          emit(event === 'reply' ? 'physical_reply' : 'not_dispatched')
        },
      })
      emit('logical_settled')
      return value
    } catch (error) {
      if (!started) {
        permit.settle('not-dispatched')
        emit('not_dispatched')
      } else {
        if (permit.unknown() && runtimeDomainError(error)?.code !== 'IPC_CANCELLED') this.fence()
      }
      emit('logical_settled', error)
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

  private acquire(signal: AbortSignal, deadline: number, waitingObserved: () => void): Promise<Permit> {
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
      waitingObserved()
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
    operation: (options: CallbackOptions) => Promise<Result>,
    observer?: CallbackAdmissionObserver,
  ): Promise<Result> {
    // Only these audited callbacks await Storage leaves or local diagnostics.
    const leaf = DRIVER_CALLBACK_ADMISSION_CONTRACT.leafMethods.some((value) => value === method)
    return (leaf ? this.leaf : this.recursive).run(signal, timeoutMs, operation, observer)
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
