import { GitRuntime, gitConfigSchema } from '@hbar/git'
import type { GitRunner } from '@hbar/git'

/** Build the B-local GitService around the admission-bound argv runner. */
export function createWorkspaceNodeGitRuntime(root: string, runner: GitRunner): GitRuntime {
  return new GitRuntime(root, gitConfigSchema.parse({ timeoutMs: 120_000, maxOutputBytes: 48 * 1024 }), runner)
}
