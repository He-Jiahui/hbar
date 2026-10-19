import type { createStorageWorkerDiagnostics } from './worker-diagnostics'

type StartupDiagnostics = Pick<ReturnType<typeof createStorageWorkerDiagnostics>, 'emit'>
type StartupPhase = 'preflight.read' | 'preflight.check' | 'recovery'

function processCpu(): ReturnType<typeof process.cpuUsage> | undefined {
  try {
    return process.cpuUsage()
  } catch {
    return undefined
  }
}

/** Observes synchronous startup work. CPU covers every thread in this OS process, not only its Worker. */
export function observeStorageStartupPhase<T>(
  diagnostics: StartupDiagnostics,
  phase: StartupPhase,
  action: () => T,
): T {
  const startedAt = performance.now()
  const cpuBefore = processCpu()
  let outcome: 'success' | 'failure' = 'failure'
  const publish: StartupDiagnostics['emit'] = (event) => {
    try {
      diagnostics.emit(event)
    } catch {
      // Losing telemetry must not replace the storage result or its original failure.
    }
  }
  try {
    const result = action()
    outcome = 'success'
    return result
  } finally {
    const durationMs = Math.max(0, performance.now() - startedAt)
    const cpuAfter = processCpu()
    publish({
      event: 'sqlite.startup_phase_wall_completed',
      phase,
      level: 'info',
      outcome,
      workerState: 'starting',
      durationMs,
    })
    const user = cpuBefore && cpuAfter ? cpuAfter.user - cpuBefore.user : undefined
    const system = cpuBefore && cpuAfter ? cpuAfter.system - cpuBefore.system : undefined
    if (
      user !== undefined &&
      system !== undefined &&
      Number.isSafeInteger(user) &&
      Number.isSafeInteger(system) &&
      user >= 0 &&
      system >= 0
    ) {
      publish({
        event: 'sqlite.startup_phase_process_cpu_completed',
        phase,
        level: 'info',
        outcome,
        workerState: 'starting',
        durationMs: (user + system) / 1_000,
      })
    } else {
      publish({
        event: 'sqlite.startup_phase_process_cpu_unavailable',
        phase,
        level: 'info',
        outcome: 'unknown',
        workerState: 'starting',
      })
    }
  }
}
