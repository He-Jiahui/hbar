import { createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { sessionSearchCommands } from '@hbar/contracts/commands/session-search'
import type { ClientTransport } from './transport'

/** Read-only, typed Host search. Results are validated by the command schemas. */
export function createSessionSearchCommandClient(client: ClientTransport) {
  return createCommandClient(sessionSearchCommands, {
    execute(commandId, input, options) {
      options?.signal?.throwIfAborted()
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
