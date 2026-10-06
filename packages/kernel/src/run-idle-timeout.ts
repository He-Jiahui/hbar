import { HbarError } from '@hbar/contracts'

export const DEFAULT_RUN_IDLE_TIMEOUT_MS = 20 * 60_000

export interface RunIdleScheduler {
  now(): number
  schedule(callback: () => void, delayMs: number): () => void
}

const scheduler: RunIdleScheduler = {
  now: () => performance.now(),
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs)
    return () => clearTimeout(timer)
  },
}

export function resolveRunIdleTimeoutMs(value = DEFAULT_RUN_IDLE_TIMEOUT_MS): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647)
    throw new HbarError('INVALID_RUN_IDLE_TIMEOUT', 'Run idle timeout must be a positive timer-safe integer')
  return value
}

/** Progress renews the deadline; duplicate updates and elapsed Run time do not. */
export function createRunIdleTimeout(
  controller: AbortController,
  timeoutMs = DEFAULT_RUN_IDLE_TIMEOUT_MS,
  clock: RunIdleScheduler = scheduler,
): { progress(): void; suspend(): () => void; dispose(): void } {
  resolveRunIdleTimeoutMs(timeoutMs)
  let lastProgress = clock.now()
  let cancelTimer: (() => void) | undefined
  let disposed = false
  let suspended = 0

  const dispose = () => {
    if (disposed) return
    disposed = true
    cancelTimer?.()
    cancelTimer = undefined
    controller.signal.removeEventListener('abort', dispose)
  }
  const check = () => {
    cancelTimer = undefined
    if (disposed) return
    const remaining = timeoutMs - (clock.now() - lastProgress)
    if (remaining > 0) cancelTimer = clock.schedule(check, remaining)
    else {
      dispose()
      controller.abort(new HbarError('RUN_TIMEOUT', `Run made no progress for ${timeoutMs} milliseconds`))
    }
  }

  if (controller.signal.aborted) disposed = true
  else {
    controller.signal.addEventListener('abort', dispose, { once: true })
    cancelTimer = clock.schedule(check, timeoutMs)
  }
  return {
    progress() {
      if (!disposed) lastProgress = clock.now()
    },
    suspend() {
      if (disposed) return () => {}
      suspended++
      cancelTimer?.()
      cancelTimer = undefined
      let resumed = false
      return () => {
        if (resumed) return
        resumed = true
        suspended--
        if (disposed || suspended > 0) return
        lastProgress = clock.now()
        cancelTimer = clock.schedule(check, timeoutMs)
      }
    },
    dispose,
  }
}
