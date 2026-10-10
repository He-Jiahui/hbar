import { timerDuration } from './recovery-policy'
import { hostSupervisorMessageSchema } from './supervisor-protocol'

export const FAILURE_EXIT_CODE = 76

/** The deadline exits the owner process rather than abandoning its cleanup promise. */
export function installHostShutdown(cleanup: () => Promise<void>, timeoutMs = 5_000): (code?: number) => void {
  timerDuration(timeoutMs, 5_000)
  let closing = false
  return (code = 0) => {
    if (closing) return
    closing = true
    const deadline = setTimeout(() => {
      console.error('[hbar] resource shutdown deadline exceeded')
      process.exit(code)
    }, timeoutMs)
    void Promise.resolve()
      .then(cleanup)
      .catch(() => {
        console.error('[hbar] resource shutdown failed')
      })
      .finally(() => {
        clearTimeout(deadline)
        process.exit(code)
      })
  }
}

export function registerHostProcessHandlers(shutdown: (code?: number) => void): () => void {
  const stop = () => shutdown(0)
  const fatal = () => {
    console.error('[hbar] fatal process failure; execution owner is being terminated')
    shutdown(FAILURE_EXIT_CODE)
  }
  const message = (value: unknown) => {
    const parsed = hostSupervisorMessageSchema.safeParse(value)
    if (parsed.success && parsed.data.type === 'host.shutdown') stop()
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  process.on('disconnect', stop)
  process.on('uncaughtException', fatal)
  process.on('unhandledRejection', fatal)
  process.on('message', message)
  return () => {
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
    process.off('disconnect', stop)
    process.off('uncaughtException', fatal)
    process.off('unhandledRejection', fatal)
    process.off('message', message)
  }
}
