import type { WireNotification } from '@hbar/contracts'

/** The Web composition root maps Host invalidations; Runtime owns visibility and bounded reads. */
export function isRunBoardInvalidation(event: WireNotification): boolean {
  if (event.method === 'plan.updated' || event.method === 'plan.cleared') return true
  return (
    event.method === 'host.changed' &&
    [
      'session-activity',
      'sessions',
      'workspaces',
      'workspace-display-names',
      'runs',
      'notifications',
      'schedules',
      'resync',
    ].includes(event.params.kind)
  )
}
