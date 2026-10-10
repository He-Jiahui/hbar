import type { Run, RunStatus } from '@hbar/contracts'
import type { UsageQueryResult } from '@hbar/contracts/commands/usage'

export const SESSION_MONITORING_RUN_LIMIT = 80
export const SESSION_MONITORING_CHART_BUCKETS = 40
export const SESSION_MONITORING_MODEL_PAGE = 20

export function monitoringModels(models: UsageQueryResult['models']): UsageQueryResult['models'] {
  const ids = new Set<string>()
  return models
    .filter((model) => !ids.has(model.modelSelectionId) && Boolean(ids.add(model.modelSelectionId)))
    .sort(
      (left, right) =>
        right.input + right.output - left.input - left.output ||
        left.modelSelectionId.localeCompare(right.modelSelectionId),
    )
}

/** Filter ownership before deduplication and limiting, then preserve chronological Run identity. */
export function monitoringRuns(runs: readonly Run[], sessionId: string | null): readonly Run[] {
  if (sessionId === null) return []
  const ids = new Set<string>()
  return runs
    .filter((run) => run.sessionId === sessionId && !ids.has(run.id) && Boolean(ids.add(run.id)))
    .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id))
    .slice(0, SESSION_MONITORING_RUN_LIMIT)
}

export function monitoringRunCounts(runs: readonly Run[]): Readonly<Record<RunStatus, number>> {
  const counts: Record<RunStatus, number> = {
    queued: 0,
    running: 0,
    waiting_approval: 0,
    guided: 0,
    completed: 0,
    cancelled: 0,
    failed: 0,
    interrupted: 0,
  }
  for (const run of runs) counts[run.status] += 1
  return counts
}

export interface MonitoringUsageBucket {
  readonly start: number
  readonly end: number
  readonly input: number
  readonly output: number
}

/** Sum real buckets into at most 40 columns; aggregation never invents observations or drops usage. */
export function monitoringUsageBuckets(series: UsageQueryResult['series']): readonly MonitoringUsageBucket[] {
  const ordered = [...series].sort((left, right) => left.start - right.start)
  const size = Math.max(1, Math.ceil(ordered.length / SESSION_MONITORING_CHART_BUCKETS))
  const result: MonitoringUsageBucket[] = []
  for (let offset = 0; offset < ordered.length; offset += size) {
    const group = ordered.slice(offset, offset + size)
    const first = group[0]
    const last = group.at(-1)
    if (!first || !last) continue
    result.push({
      start: first.start,
      end: last.end,
      input: group.reduce((sum, bucket) => sum + bucket.input, 0),
      output: group.reduce((sum, bucket) => sum + bucket.output, 0),
    })
  }
  return result
}
