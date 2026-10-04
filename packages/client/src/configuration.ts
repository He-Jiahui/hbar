import { createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import type { ClientTransport } from './transport'

export function createConfigurationCommandClient(client: ClientTransport) {
  return createCommandClient(configurationCommands, {
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
