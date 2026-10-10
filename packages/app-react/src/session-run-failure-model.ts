import type { Run } from '@hbar/contracts'

/** Keep terminal failures attached to the session that owns the visible conversation. */
export function sessionRunFailures(runs: readonly Run[], sessionId: string | null): readonly Run[] {
  if (sessionId === null) return []
  return runs.filter(
    (run) =>
      run.sessionId === sessionId &&
      (run.status === 'failed' || run.status === 'interrupted'),
  )
}
