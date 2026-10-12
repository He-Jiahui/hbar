import { createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { nodeCommands } from '@hbar/contracts/commands/nodes'
import type { ClientTransport } from './transport'

export function createNodeCommandClient(client: ClientTransport) {
  return createCommandClient(nodeCommands, {
    execute(commandId, input, options) {
      return client.call('command.execute', {
        protocol: COMMAND_PROTOCOL_VERSION,
        requestId: options?.requestId ?? crypto.randomUUID(),
        commandId,
        commandVersion: options?.version ?? 1,
        input,
      })
    },
  })
}
