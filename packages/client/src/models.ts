import { createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { modelCommands } from '@hbar/contracts/commands/models'
import type { ClientTransport } from './transport'

export function createModelCommandClient(client: ClientTransport) {
  return createCommandClient(modelCommands, {
    execute(commandId, input, options) {
      return client.call('command.execute', {
        protocol: COMMAND_PROTOCOL_VERSION,
        requestId: options?.requestId ?? crypto.randomUUID(),
        commandId,
        commandVersion: options?.version ?? 1,
        ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
        input,
      })
    },
  })
}
