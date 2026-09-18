import { createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { systemCommands } from '@hbar/contracts/commands/system'
import type { ClientTransport } from './transport'

export function createSystemCommandClient(client: ClientTransport) {
  return createCommandClient(systemCommands, {
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
