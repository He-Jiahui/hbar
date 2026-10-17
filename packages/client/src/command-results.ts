import { createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { commandResultCommands } from '@hbar/contracts/commands/command-results'
import type { ClientTransport } from './transport'

/** Authenticated transport only; receipt identity never accepts a caller-provided actor or artifact manifest. */
export function createCommandResultClient(client: ClientTransport) {
  return createCommandClient(commandResultCommands, {
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
