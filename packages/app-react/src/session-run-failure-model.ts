import type { Run } from '@hbar/contracts'

/** Keep terminal failures attached to the session that owns the visible conversation. */
export function sessionRunFailures(runs: readonly Run[], sessionId: string | null): readonly Run[] {
  if (sessionId === null) return []
  return runs.filter((run) => run.sessionId === sessionId && (run.status === 'failed' || run.status === 'interrupted'))
}

/** A later attempt supersedes the failure banner, while every error remains in history. */
export function currentSessionRunFailure(runs: readonly Run[], sessionId: string | null): Run | null {
  if (sessionId === null) return null
  let latest: Run | null = null
  for (const run of runs) {
    if (run.sessionId !== sessionId) continue
    if (['queued', 'running', 'waiting_approval'].includes(run.status)) return null
    if (latest === null || run.createdAt > latest.createdAt) latest = run
  }
  return latest && (latest.status === 'failed' || latest.status === 'interrupted') ? latest : null
}
