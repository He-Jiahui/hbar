import type { PreSessionDraftState } from '@hbar/contracts/commands/pre-session-draft'
import type { SessionLaunchSelection } from '@hbar/contracts/commands/session-launch-target'

export function firstSendNeedsContinue(draft: PreSessionDraftState | undefined): boolean {
  return Boolean(
    draft &&
    (draft.launchPreparation?.phase === 'paused-navigation' ||
      (draft.phase === 'failed' && draft.error === 'CONTINUE_REQUIRED')),
  )
}

export function firstSendIsLocked(draft: PreSessionDraftState | undefined): boolean {
  return Boolean(
    draft &&
    (['preparing', 'creating', 'configuring', 'submitting', 'unknown'].includes(draft.phase) ||
      firstSendNeedsContinue(draft)),
  )
}

export function launchSelectionBranchName(selection: SessionLaunchSelection): string | null {
  if (selection.mode === 'shared-current') return null
  if (selection.mode === 'shared-branch') return selection.branch.ref.slice('refs/heads/'.length)
  return selection.branch.kind === 'derived'
    ? selection.branch.baseRef.slice('refs/heads/'.length)
    : selection.branch.name
}
