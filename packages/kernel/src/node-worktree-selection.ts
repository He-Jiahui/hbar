import { createHash } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import type { SessionLaunchSelection } from '@hbar/contracts/commands/session-launch-target'

export interface NodeWorktreeBranchPlan {
  readonly branch: string
  readonly createBranch: boolean
  readonly startPoint?: string
}

/** Shared remote branches need B-owned checkout preparation, not an isolated worktree. */
export function assertRemoteLaunchTargetSupported(
  selection: SessionLaunchSelection,
): asserts selection is Exclude<SessionLaunchSelection, { readonly mode: 'shared-branch' }> {
  if (selection.mode === 'shared-branch')
    throw new HbarError(
      'REMOTE_SHARED_BRANCH_UNSUPPORTED',
      'Remote shared-branch launch requires a safe B-owned shared-checkout preparation operation',
    )
}

/** Map A's revisioned launch choice to a B-owned worktree branch without resolving a host path. */
export function nodeWorktreeBranchPlan(
  selection: SessionLaunchSelection,
  sessionId: string,
  revision: number,
): NodeWorktreeBranchPlan | null {
  if (selection.mode === 'shared-current') return null
  if (selection.mode === 'shared-branch') assertRemoteLaunchTargetSupported(selection)

  switch (selection.branch.kind) {
    case 'existing':
      return { branch: selection.branch.name, createBranch: false }
    case 'new':
      return {
        branch: selection.branch.name,
        createBranch: true,
        ...(selection.branch.startPoint ? { startPoint: selection.branch.startPoint } : {}),
      }
    case 'derived': {
      const digest = createHash('sha256').update(`${sessionId}\0${revision}`).digest('hex')
      return {
        branch: `hbar/session-launch/${digest}`,
        createBranch: true,
        startPoint: selection.branch.baseRef.slice('refs/heads/'.length),
      }
    }
  }
}
