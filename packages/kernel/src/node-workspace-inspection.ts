import type { NodeExecutionTarget, RemoteNodeExecutionTarget } from '@hbar/contracts/node-execution-target'
import type { WorkspaceFolderSnapshot } from '@hbar/contracts/commands/workspace-folders'
import type { NodeWorkspaceMountManifest } from '@hbar/contracts/node-workspace-mount-plan'

export interface NodeWorkspaceInspectionRequest {
  readonly sessionId: string
  readonly runId: string
  readonly workspaceId: string
}

/** Captures the exact workspace and A-verified B capabilities before an approval is persisted. */
export interface NodeWorkspaceInspectionPort {
  captureExecutionTarget(request: NodeWorkspaceInspectionRequest, signal: AbortSignal): Promise<NodeExecutionTarget>
  resolveWorkspaceMountManifest?(
    request: NodeWorkspaceInspectionRequest,
    folders: WorkspaceFolderSnapshot,
    primary: Pick<RemoteNodeExecutionTarget, 'nodeId' | 'rootId' | 'nodePath'>,
    signal: AbortSignal,
  ): Promise<NodeWorkspaceMountManifest>
  verifyWorkspaceFolders?(
    nodeId: string,
    folders: readonly { readonly id: string; readonly alias: string; readonly path: string }[],
    signal: AbortSignal,
  ): Promise<readonly { readonly id: string; readonly alias: string; readonly path: string }[]>
}
