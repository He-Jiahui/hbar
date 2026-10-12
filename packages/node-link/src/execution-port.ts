import type { z } from 'zod'
import type { WorkspaceExecutionScope } from '@hbar/plugin-sdk'
import type {
  NodeCallAuthority,
  NodeWorkspaceLocation,
  nodeWorkspaceMethods,
  NodeWorkspaceMethod,
} from '@hbar/contracts/node'

/** Private A-side adapter. Each invocation becomes a named, plain-data node method. */
export interface NodeExecutionPort {
  call<Method extends NodeWorkspaceMethod>(
    nodeId: string,
    method: Method,
    input: z.input<(typeof nodeWorkspaceMethods)[Method]['input']>,
    signal?: AbortSignal,
  ): Promise<z.output<(typeof nodeWorkspaceMethods)[Method]['output']>>
}
export type NodeExecutionScope = WorkspaceExecutionScope
export interface NodeExecutionTarget {
  readonly location: NodeWorkspaceLocation
  readonly authority: NodeCallAuthority
  readonly platform: 'linux' | 'darwin' | 'win32'
  readonly signal: AbortSignal
}
export const nodeTargetBinding = (target: Pick<NodeExecutionTarget, 'location'>) => ({
  rootId: target.location.rootId,
  expectedRoot: target.location.nodePath,
})
export const nodeOperationKey = (authority: NodeCallAuthority): string => `${authority.runId}:${authority.callId}`
