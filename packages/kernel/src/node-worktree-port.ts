import type { NodeManagedWorktree, NodeWorktreeCreateRequest, NodeWorktreeRemove } from '@hbar/contracts/node-worktree'
import type { NodeWorktreeProvisioningAuthority } from '@hbar/contracts/node-worktree-provisioning'

export interface NodeWorktreeTarget {
  readonly operationId: string
  readonly rootId: string
  readonly expectedRoot: string
  readonly branch: string
  readonly startPoint?: string
  readonly createBranch: boolean
}

/** A's explicit boundary for B-owned worktree allocation and cleanup. */
export interface NodeWorktreePort {
  create(nodeId: string, input: NodeWorktreeCreateRequest, signal: AbortSignal): Promise<NodeManagedWorktree>
  remove(nodeId: string, input: NodeWorktreeRemove, signal: AbortSignal): Promise<void>
  get(
    nodeId: string,
    input: NodeWorktreeTarget & { readonly provisioning: NodeWorktreeProvisioningAuthority },
    signal: AbortSignal,
  ): Promise<NodeManagedWorktree | null>
}
