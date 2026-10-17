import { HbarError } from '@hbar/contracts/errors'

export interface RpcDeadlineClock {
  now(): number
  schedule(callback: () => void, milliseconds: number): () => void
}
const systemClock: RpcDeadlineClock = {
  now: () => performance.now(),
  schedule(callback, milliseconds) {
    const timer = setTimeout(callback, milliseconds)
    return () => clearTimeout(timer)
  },
}

/** Only the original caller owns this timer. Pausing never changes physical RPC capacity. */
export class RpcDeadline {
  private remaining: number
  private armedAt = 0
  private generation = 0
  private pauses = 0
  private disposed = false
  private cancel: (() => void) | undefined
  constructor(
    milliseconds: number,
    private readonly expired: () => void,
    private readonly clock: RpcDeadlineClock = systemClock,
  ) {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 1 || milliseconds > 2_147_483_647)
      throw new HbarError('INVALID_INPUT', 'RPC deadlines require a positive timer-safe integer')
    this.remaining = milliseconds
    this.arm()
  }
  suspend(): () => void {
    if (this.disposed) return () => {}
    if (this.pauses >= 64)
      throw new HbarError('IPC_DEADLINE_WAIT_CAPACITY', 'RPC nested deadline wait capacity is full')
    if (this.pauses++ === 0) {
      this.remaining = Math.max(0, this.remaining - (this.clock.now() - this.armedAt))
      this.generation++
      this.cancel?.()
      this.cancel = undefined
    }
    let resumed = false
    return () => {
      if (resumed) return
      resumed = true
      if (this.disposed || --this.pauses > 0) return
      this.arm()
    }
  }
  dispose(): void {
    this.disposed = true
    this.generation++
    this.cancel?.()
    this.cancel = undefined
  }
  private arm(): void {
    this.armedAt = this.clock.now()
    const generation = ++this.generation
    this.cancel = this.clock.schedule(() => {
      if (this.disposed || generation !== this.generation) return
      this.cancel = undefined
      this.disposed = true
      this.expired()
    }, this.remaining)
  }
}
