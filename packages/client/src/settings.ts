import { CommandError, COMMAND_PROTOCOL_VERSION, createCommandClient } from '@hbar/commands'
import { settingsCommands } from '@hbar/contracts/commands/settings'
import { HbarError } from '@hbar/contracts'
import type { ClientTransport } from './transport'

export function createSettingsCommandClient(client: ClientTransport) {
  return createCommandClient(settingsCommands, {
    async execute(commandId, input, options) {
      if (['settings.apply', 'settings.set', 'settings.unset'].includes(commandId) && !options?.idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'An idempotency key is required for a persistent settings command')
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
          ['settings.apply', 'settings.set', 'settings.unset'].includes(commandId) &&
          error instanceof HbarError &&
          ['DISCONNECTED', 'TIMEOUT'].includes(error.code)
        )
          throw new CommandError(
            'RESULT_UNKNOWN',
            `${commandId} response was lost; reconcile the original settings form`,
          )
        throw error
      }
    },
  })
}
