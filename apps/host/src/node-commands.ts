import { HbarError, type Workspace } from '@hbar/contracts'
import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { nodeCommands } from '@hbar/contracts/commands/nodes'
import type { RuntimeNodeLinkPort } from './runtime-node-link-contract'
import type { NodeWorkspaceCreate } from '@hbar/contracts/node-workspaces'

type NodeManagementPort = Pick<RuntimeNodeLinkPort, 'invite' | 'list' | 'revoke' | 'call'>

/** Resolve a user-facing node selector, then bind creation to its current authenticated root capability. */
export function createRemoteWorkspaceCreator(
  port: Pick<NodeManagementPort, 'list' | 'call'> | undefined,
  create: (input: NodeWorkspaceCreate) => Promise<Workspace>,
) {
  return async (input: {
    node?: string | undefined
    rootId?: string | undefined
    name?: string | undefined
  }): Promise<Workspace> => {
    if (input.node === undefined || input.rootId === undefined)
      throw new HbarError('INVALID_INPUT', 'A workspace node and shared root ID are required')
    const selector = input.node
    const rootId = input.rootId
    if (!port)
      throw new HbarError('NODE_LINK_UNAVAILABLE', 'Start the managed conversation Host to create a node workspace')
    const nodes: Awaited<ReturnType<NodeManagementPort['list']>>['items'][number][] = []
    let after: string | undefined
    for (let page = 0; page < 10; page++) {
      const result = await port.list({ limit: 100, ...(after ? { after } : {}) })
      nodes.push(...result.items)
      if (!result.nextCursor) break
      if (result.nextCursor === after)
        throw new HbarError('NODE_REGISTRY_INVALID', 'Node registry cursor did not advance')
      after = result.nextCursor
    }
    const exactId = nodes.find((node) => node.nodeId === selector)
    const nameMatches = exactId ? [] : nodes.filter((node) => node.name.toLowerCase() === selector.toLowerCase())
    const selected = exactId ?? (nameMatches.length === 1 ? nameMatches[0] : undefined)
    if (!selected || nameMatches.length > 1)
      throw new HbarError(
        'NODE_NOT_FOUND',
        nameMatches.length > 1 ? 'Node name is ambiguous; use its node ID' : 'Workspace node was not found',
      )
    if (selected.revokedAt !== null) throw new HbarError('NODE_REVOKED', 'Workspace node access was revoked')
    if (!selected.online) throw new HbarError('NODE_OFFLINE', 'Workspace node is offline')
    const capabilities = await port.call(selected.nodeId, 'node.capabilities', {})
    if (capabilities.nodeId !== selected.nodeId)
      throw new HbarError('NODE_IDENTITY_MISMATCH', 'Live node capabilities do not match the selected node')
    const root = capabilities.roots.find((candidate) => candidate.rootId === rootId)
    if (!root) throw new HbarError('NODE_ROOT_NOT_FOUND', 'Workspace node does not share the requested root')
    const persistedRoot = selected.capabilities?.roots.find((candidate) => candidate.rootId === rootId)
    if (!persistedRoot || persistedRoot.nodePath !== root.nodePath)
      throw new HbarError('NODE_ROOT_CHANGED', 'Workspace root changed; wait for node capabilities to refresh')
    return create({ nodeId: selected.nodeId, rootId, ...(input.name ? { name: input.name } : {}) })
  }
}

export function createNodeCommands(port?: NodeManagementPort) {
  const registry = new CommandRegistry({ execution: 'host' })
  const run = async <Output>(invoke: (owner: NodeManagementPort) => Promise<Output>): Promise<Output> => {
    try {
      if (!port)
        throw new HbarError('NODE_LINK_UNAVAILABLE', 'Start the managed conversation Host to manage workspace nodes')
      return await invoke(port)
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  registry.register(nodeCommands['node.invite'], ({ name }) => run((port) => port.invite(name)))
  registry.register(nodeCommands['node.list'], (input) => run((port) => port.list(input)))
  registry.register(nodeCommands['node.revoke'], ({ selector }) => run((port) => port.revoke(selector)), {
    durable: true,
  })
  return {
    ...createCommandClient(nodeCommands, registry),
    dispatch: (value: unknown, actorId: string) => registry.dispatch(value, { actorId }),
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 100 }),
    dispose: () => registry.dispose(),
  }
}
