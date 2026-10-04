import { createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { usageCommands } from '@hbar/contracts/commands/usage'
import type { ClientTransport } from './transport'

export function createUsageCommandClient(client: ClientTransport) {
  return createCommandClient(usageCommands, {
    execute(id, input, options) {
      return client.call('command.execute', {
        protocol: COMMAND_PROTOCOL_VERSION,
        requestId: options?.requestId ?? crypto.randomUUID(),
        commandId: id,
        commandVersion: options?.version ?? 1,
        input,
      })
    },
  })
}
