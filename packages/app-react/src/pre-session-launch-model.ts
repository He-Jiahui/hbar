import type { PreSessionDraftState } from '@hbar/contracts/commands/pre-session-draft'
import type { SessionLaunchSelection } from '@hbar/contracts/commands/session-launch-target'

export function firstSendIsLocked(draft: PreSessionDraftState | undefined): boolean {
  return Boolean(
    draft &&
    (['preparing', 'creating', 'configuring', 'submitting', 'unknown'].includes(draft.phase) ||
      draft.launchPreparation?.phase === 'paused-navigation'),
  )
}

export function launchSelectionBranchName(selection: SessionLaunchSelection): string | null {
  if (selection.mode === 'shared-current') return null
  return selection.branch.kind === 'derived'
    ? selection.branch.baseRef.slice('refs/heads/'.length)
    : selection.branch.name
}
