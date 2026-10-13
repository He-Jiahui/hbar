import { HbarError } from '@hbar/contracts'
import {
  acceptedNodeWorktreeTargetDigest,
  acceptedWorkspaceFolderDigest,
  nodeWorktreeProvisioningAuthoritySchema,
  type NodeWorktreeProvisioningAuthority,
} from '@hbar/contracts/node-worktree-provisioning'
import { nodeManagedWorktreeSchema, type NodeManagedWorktree } from '@hbar/contracts/node-worktree'
import type { NodeRunWorktreeAdmission, NodeRunWorktreeBinding } from '@hbar/storage'
import type { NodeWorktreePort, NodeWorktreeTarget } from './node-worktree-port'
import { nodeWorktreeBranchPlan } from './node-worktree-selection'

export interface NodeRunWorktreeStoragePort {
  nodeRunWorktree(runId: string): NodeRunWorktreeBinding | null | Promise<NodeRunWorktreeBinding | null>
  nodeRunWorktreeBind(input: {
    runId: string
    launchTargetRevision: number
    worktree: NodeManagedWorktree
  }): NodeRunWorktreeBinding | Promise<NodeRunWorktreeBinding>
}

function assertWorktreeMatchesAdmission(
  worktree: NodeManagedWorktree,
  admission: NodeRunWorktreeAdmission,
  plan: NonNullable<ReturnType<typeof nodeWorktreeBranchPlan>>,
): void {
  if (
    worktree.sessionId !== admission.sessionId ||
    worktree.targetRevision !== admission.launchTarget.expectedRevision ||
    worktree.parentRootId !== admission.originalWorkspaceLocation.rootId ||
    worktree.worktreeRootId !== `wt_${worktree.worktreeId}` ||
    worktree.branch !== plan.branch ||
    !worktree.nodePath.trim()
  )
    throw new HbarError('WORKSPACE_SCOPE', 'B returned a worktree outside the accepted Session launch target')
}

function assertBindingMatchesAdmission(binding: NodeRunWorktreeBinding, admission: NodeRunWorktreeAdmission): void {
  if (
    binding.runId !== admission.runId ||
    binding.sessionId !== admission.sessionId ||
    binding.workspaceId !== admission.workspaceId ||
    binding.nodeId !== admission.originalWorkspaceLocation.nodeId ||
    binding.parentRootId !== admission.originalWorkspaceLocation.rootId ||
    binding.originalWorkspaceLocation.nodePath !== admission.originalWorkspaceLocation.nodePath ||
    JSON.stringify(binding.launchTarget) !== JSON.stringify(admission.launchTarget)
  )
    throw new HbarError('SESSION_LOG_CORRUPTED', 'Persisted B worktree differs from its accepted Run provenance')
}

function provisioningAuthority(admission: NodeRunWorktreeAdmission): NodeWorktreeProvisioningAuthority {
  const folders = admission.workspaceFoldersSnapshot
  if (!folders || folders.workspaceId !== admission.workspaceId)
    throw new HbarError('NODE_MOUNT_ADMISSION_MISSING', 'Accepted Run has no matching workspace-folder snapshot')
  const workspaceFolderDigest = acceptedWorkspaceFolderDigest(folders)
  const fields = {
    workspaceId: admission.workspaceId,
    sessionId: admission.sessionId,
    targetRevision: admission.launchTarget.expectedRevision,
    selection: admission.launchTarget.selection,
    workspaceFolderRevision: folders.revision,
    workspaceFolderDigest,
  }
  return nodeWorktreeProvisioningAuthoritySchema.parse({
    kind: 'launch-target',
    ...fields,
    runId: admission.runId,
    nodeId: admission.originalWorkspaceLocation.nodeId,
    acceptedTargetDigest: acceptedNodeWorktreeTargetDigest(fields),
  })
}

function targetFor(admission: NodeRunWorktreeAdmission): NodeWorktreeTarget {
  const plan = nodeWorktreeBranchPlan(
    admission.launchTarget.selection,
    admission.sessionId,
    admission.launchTarget.expectedRevision,
  )
  if (!plan) throw new HbarError('INVALID_STATE', 'Shared-current launch does not allocate a B worktree')
  return {
    operationId: `${admission.runId}:worktree-get`,
    rootId: admission.originalWorkspaceLocation.rootId,
    expectedRoot: admission.originalWorkspaceLocation.nodePath,
    branch: plan.branch,
    createBranch: plan.createBranch,
    ...(plan.startPoint ? { startPoint: plan.startPoint } : {}),
  }
}

/** Reopens or creates the B-owned immutable target for an accepted remote Run. */
export async function ensureNodeRunWorktree(
  admission: NodeRunWorktreeAdmission,
  ports: { readonly storage: NodeRunWorktreeStoragePort; readonly worktrees: NodeWorktreePort },
  signal: AbortSignal,
): Promise<NodeRunWorktreeBinding | null> {
  const plan = nodeWorktreeBranchPlan(
    admission.launchTarget.selection,
    admission.sessionId,
    admission.launchTarget.expectedRevision,
  )
  if (!plan) return null

  const durable = await ports.storage.nodeRunWorktree(admission.runId)
  if (durable) assertBindingMatchesAdmission(durable, admission)

  signal.throwIfAborted()
  const target = targetFor(admission)
  const provisioning = provisioningAuthority(admission)
  let worktree = await ports.worktrees.get(
    admission.originalWorkspaceLocation.nodeId,
    { ...target, provisioning },
    signal,
  )
  if (!worktree) {
    worktree = await ports.worktrees.create(
      admission.originalWorkspaceLocation.nodeId,
      {
        ...target,
        operationId: `${admission.runId}:worktree-create`,
        provisioning,
      },
      signal,
    )
  }
  const parsed = nodeManagedWorktreeSchema.parse(worktree)
  assertWorktreeMatchesAdmission(parsed, admission, plan)
  if (
    durable &&
    (parsed.worktreeId !== durable.worktreeId ||
      parsed.nodePath !== durable.nodePath ||
      parsed.worktreeRootId !== durable.worktreeRootId ||
      parsed.createdByRunId !== durable.worktreeCreatedByRunId)
  )
    throw new HbarError('SESSION_LOG_CORRUPTED', 'B worktree differs from the durable Run binding')

  if (durable) return durable
  signal.throwIfAborted()
  const binding = await ports.storage.nodeRunWorktreeBind({
    runId: admission.runId,
    launchTargetRevision: admission.launchTarget.expectedRevision,
    worktree: parsed,
  })
  assertBindingMatchesAdmission(binding, admission)
  return binding
}
