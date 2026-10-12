import type { NodeExecutionTarget } from '@hbar/contracts/node-execution-target'

export interface NodeWorkspaceInspectionRequest {
  readonly sessionId: string
  readonly runId: string
  readonly workspaceId: string
}

/** Captures the exact workspace and A-verified B capabilities before an approval is persisted. */
export interface NodeWorkspaceInspectionPort {
  captureExecutionTarget(request: NodeWorkspaceInspectionRequest, signal: AbortSignal): Promise<NodeExecutionTarget>
}
