import { timerDuration } from './recovery-policy'
import { hostSupervisorMessageSchema } from './supervisor-protocol'
import { hostLifecycleEvent, type HostRuntimeDiagnostics } from './runtime-diagnostics'

export const FAILURE_EXIT_CODE = 76

/** The deadline exits the owner process rather than abandoning its cleanup promise. */
export function installHostShutdown(cleanup: () => Promise<void>, timeoutMs = 5_000, diagnostics?: HostRuntimeDiagnostics): (code?: number) => void {
  timerDuration(timeoutMs, 5_000)
  let closing = false
  return (code = 0) => {
    if (closing) return
    closing = true
    if (diagnostics) hostLifecycleEvent(diagnostics, 'host.stop_requested', { exitCode: code })
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

export function registerHostProcessHandlers(shutdown: (code?: number) => void, diagnostics?: HostRuntimeDiagnostics): () => void {
  const stop = () => shutdown(0)
  const interrupt = () => { if (diagnostics) hostLifecycleEvent(diagnostics, 'host.signal_received', { signal: 'SIGINT' }); stop() }
  const terminate = () => { if (diagnostics) hostLifecycleEvent(diagnostics, 'host.signal_received', { signal: 'SIGTERM' }); stop() }
  const fatal = () => {
    console.error('[hbar] fatal process failure; execution owner is being terminated')
    shutdown(FAILURE_EXIT_CODE)
  }
  const message = (value: unknown) => {
    const parsed = hostSupervisorMessageSchema.safeParse(value)
    if (parsed.success && parsed.data.type === 'host.shutdown') stop()
  }
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', terminate)
  process.on('disconnect', stop)
  process.on('uncaughtException', fatal)
  process.on('unhandledRejection', fatal)
  process.on('message', message)
  return () => {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
    process.off('disconnect', stop)
    process.off('uncaughtException', fatal)
    process.off('unhandledRejection', fatal)
    process.off('message', message)
  }
}
