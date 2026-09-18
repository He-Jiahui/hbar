import { createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { fileCommands } from '@hbar/contracts/commands/files'
import type { ClientTransport } from './transport'

export function createFileCommandClient(client: ClientTransport) {
  return createCommandClient(fileCommands, {
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
