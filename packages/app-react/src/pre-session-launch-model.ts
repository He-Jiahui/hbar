import type { SessionLaunchSelection } from '@hbar/app-runtime'

export { firstSendIsLocked, firstSendNeedsContinue } from '@hbar/app-runtime'

export function launchSelectionBranchName(selection: SessionLaunchSelection): string | null {
  if (selection.mode === 'shared-current') return null
  if (selection.mode === 'shared-branch') return selection.branch.ref.slice('refs/heads/'.length)
  return selection.branch.kind === 'derived'
    ? selection.branch.baseRef.slice('refs/heads/'.length)
    : selection.branch.name
}
