import { createCommandClient, COMMAND_PROTOCOL_VERSION, CommandError } from '@hbar/commands'
import { interactionCommands } from '@hbar/contracts/commands/interaction'
import { HbarError } from '@hbar/contracts'
import type { ClientTransport } from './transport'

export function createInteractionCommandClient(client: ClientTransport) {
  return createCommandClient(interactionCommands, {
    async execute(commandId, input, options) {
      try {
        return await client.call('command.execute', {
          protocol: COMMAND_PROTOCOL_VERSION,
          requestId: options?.requestId ?? crypto.randomUUID(),
          commandId,
          commandVersion: options?.version ?? 1,
          input,
        })
      } catch (error) {
        if (error instanceof HbarError && ['DISCONNECTED', 'TIMEOUT'].includes(error.code))
          throw new CommandError(
            'RESULT_UNKNOWN',
            `${commandId} response was lost; inspect the session before retrying`,
          )
        throw error
      }
    },
  })
}
