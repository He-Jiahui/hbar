import type { RuntimeSystemPort } from './system-commands'

export interface RuntimeActivitySource {
  readonly activeRuns: () => number
  readonly readQueuedSessionCount: () => Promise<number>
  readonly runtime?: Pick<RuntimeSystemPort, 'snapshot' | 'metricsSnapshot'>
}

export interface RuntimeActivityCounts {
  readonly activeRuns: number
  readonly queuedRuns: number | null
  readonly managedChildProcesses: number | null
}

/** Monitoring is observational. Managed mode reads stable Host metadata only;
 * a missing/invalid projection is unknown and must never wake the database.
 */
export async function readRuntimeActivity(source: RuntimeActivitySource): Promise<RuntimeActivityCounts> {
  const runtime = source.runtime?.snapshot()
  const count = source.runtime
    ? (source.runtime.metricsSnapshot?.().queuedRuns ?? null)
    : await source.readQueuedSessionCount()
  return {
    activeRuns: source.activeRuns(),
    queuedRuns: count !== null && Number.isSafeInteger(count) && count >= 0 ? count : null,
    managedChildProcesses: runtime
      ? runtime.units.reduce(
          (total, unit) => total + unit.generations.filter((generation) => generation.pid !== null).length,
          0,
        )
      : null,
  }
}
