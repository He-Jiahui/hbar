import { HbarError } from '@hbar/contracts'
import type { NodeCapabilities } from '@hbar/contracts/node'
import { parseNodeWorkspaceLocator } from '@hbar/contracts/node-address'
import { nodeWorkspaceMountsSchema, type NodeWorkspaceMounts } from '@hbar/contracts/node-workspace-mounts'

export interface ResolvedNodeWorkspaceMount {
  readonly id: string
  readonly alias: string
  readonly nodeId: string
  readonly rootId: string
  readonly nodePath: string
  readonly access: 'read' | 'write'
}

export interface NodeWorkspaceMountRootVerifier {
  canonicalRoot(rootId: string, expectedNodePath: string, signal: AbortSignal): Promise<string>
}

/**
 * Resolve persisted alias bindings only against the authenticated node's current
 * registered roots. Client paths and roots missing from the capability snapshot
 * never become execution paths.
 */
export async function resolveNodeWorkspaceMounts(
  ownerNodeId: string,
  mountsInput: NodeWorkspaceMounts,
  capabilities: Pick<NodeCapabilities, 'nodeId' | 'roots'>,
  verifier: NodeWorkspaceMountRootVerifier,
  signal: AbortSignal,
): Promise<readonly ResolvedNodeWorkspaceMount[]> {
  if (capabilities.nodeId !== ownerNodeId)
    throw new HbarError('WORKSPACE_NODE_MISMATCH', 'Workspace mounts belong to a different workspace node')
  if (capabilities.roots.length > 64)
    throw new HbarError('NODE_INVALID_RESPONSE', 'Workspace node advertised more than 64 shared roots')
  const mounts = nodeWorkspaceMountsSchema.parse(mountsInput)
  const roots = new Map(capabilities.roots.map((root) => [root.rootId, root]))
  const resolved: ResolvedNodeWorkspaceMount[] = []
  for (const mount of mounts) {
    signal.throwIfAborted()
    const address = parseNodeWorkspaceLocator(mount.path)
    if (!address || address.nodeId !== ownerNodeId)
      throw new HbarError('WORKSPACE_NODE_MISMATCH', 'Cross-node workspace mounts are not supported')
    const root = roots.get(address.rootId)
    if (!root) throw new HbarError('NODE_ROOT_CHANGED', `Workspace node no longer shares root ${address.rootId}`)
    const canonicalRoot = await verifier.canonicalRoot(root.rootId, root.nodePath, signal)
    signal.throwIfAborted()
    if (canonicalRoot !== root.nodePath)
      throw new HbarError('NODE_ROOT_CHANGED', `Workspace node root ${root.rootId} changed its canonical path`)
    resolved.push(
      Object.freeze({
        id: mount.id,
        alias: mount.alias,
        nodeId: ownerNodeId,
        rootId: root.rootId,
        nodePath: root.nodePath,
        access: root.access,
      }),
    )
  }
  return Object.freeze(resolved)
}
