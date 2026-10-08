import type { Run } from '@hbar/contracts'

type ContextRun = Pick<Run, 'id' | 'status' | 'createdAt' | 'endedAt'>

/** Refresh after the latest observed completion, independent of timeline ordering. */
export function latestSessionContextTerminalRunId(runs: readonly ContextRun[]): string | null {
  let latest: ContextRun | undefined
  for (const run of runs) {
    if (!['completed', 'failed', 'cancelled', 'interrupted', 'guided'].includes(run.status)) continue
    if (!latest || (run.endedAt ?? run.createdAt) > (latest.endedAt ?? latest.createdAt)) latest = run
  }
  return latest?.id ?? null
}
