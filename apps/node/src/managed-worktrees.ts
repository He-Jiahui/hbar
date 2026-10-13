import { nodeGitMethods } from '@hbar/contracts/node-git'
import type { WorkspaceNodeService } from '@hbar/node-core'

/** Installs B-owned worktree allocation over the ordinary admitted Git receipt path. */
export async function installManagedNodeWorktrees(node: WorkspaceNodeService): Promise<void> {
  const allocator = await node.createWorktreeAllocator({
    worktree: async (input, signal) =>
      nodeGitMethods['git.worktree'].output.parse(await node.git('git.worktree', input, signal)),
  })
  node.installWorktrees(allocator)
}
