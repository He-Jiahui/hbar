import { HbarError } from '@hbar/contracts'
import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { nodeCommands } from '@hbar/contracts/commands/nodes'
import type { RuntimeNodeLinkPort } from './runtime-node-link-contract'

type NodeManagementPort = Pick<RuntimeNodeLinkPort, 'invite' | 'list' | 'revoke'>
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
