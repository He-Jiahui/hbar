import { createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { interactionCommands } from '@hbar/contracts/commands/interaction'
import type { ClientTransport } from './transport'

export function createInteractionCommandClient(client: ClientTransport) {
  return createCommandClient(interactionCommands, {
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
