import { HbarError } from '@hbar/contracts'

/** Unit preparation failures keep the already-bound stable listener alive. */
export async function recoverRuntimeStartup(options: {
  readonly signal: AbortSignal
  readonly start: () => Promise<void>
  readonly failed: (error: unknown, nextAttemptAt: number) => void
}): Promise<void> {
  let attempt = 0
  while (!options.signal.aborted) {
    try {
      await options.start()
      return
    } catch (error) {
      options.signal.throwIfAborted()
      const base = [250, 1_000, 4_000][attempt++] ?? 30_000
      const delay = Math.max(1, Math.round(base * (0.8 + Math.random() * 0.4)))
      options.failed(error, Date.now() + delay)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          options.signal.removeEventListener('abort', abort)
          resolve()
        }, delay)
        const abort = () => {
          clearTimeout(timer)
          reject(new HbarError('RUNTIME_STOPPING', 'Runtime startup stopped'))
        }
        options.signal.addEventListener('abort', abort, { once: true })
        if (options.signal.aborted) abort()
      })
    }
  }
  throw new HbarError('RUNTIME_STOPPING', 'Runtime startup stopped')
}
