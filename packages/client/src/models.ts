import { createCommandClient, COMMAND_PROTOCOL_VERSION, CommandError } from '@hbar/commands'
import { modelCommands } from '@hbar/contracts/commands/models'
import { HbarError } from '@hbar/contracts'
import type { ClientTransport } from './transport'

export function createModelCommandClient(client: ClientTransport) {
  return createCommandClient(modelCommands, {
    async execute(commandId, input, options) {
      try {
        return await client.call('command.execute', {
          protocol: COMMAND_PROTOCOL_VERSION,
          requestId: options?.requestId ?? crypto.randomUUID(),
          commandId,
          commandVersion: options?.version ?? 1,
          ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
          input,
        })
      } catch (error) {
        if (
          ['session.setModel', 'session.setThinkingLevel'].includes(commandId) &&
          error instanceof HbarError &&
          ['DISCONNECTED', 'TIMEOUT'].includes(error.code)
        )
          throw new CommandError('RESULT_UNKNOWN', `${commandId} response was lost; refresh the session model`)
        throw error
      }
    },
  })
}
