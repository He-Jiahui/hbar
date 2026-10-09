import { COMMAND_PROTOCOL_VERSION, createCommandClient } from '@hbar/commands'
import { chatDatabaseCommands } from '@hbar/contracts/commands/chat-database'
import type { ClientTransport } from './transport'

export function createChatDatabaseCommandClient(transport: ClientTransport) {
  return createCommandClient(chatDatabaseCommands, {
    execute(commandId, input, options) {
      return transport.call('command.execute', {
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
