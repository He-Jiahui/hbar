import { COMMAND_PROTOCOL_VERSION, createCommandClient } from '@hbar/commands'
import { promptTemplateCommands } from '@hbar/contracts/commands/prompt-templates'
import type { ClientTransport } from './transport'

export const allPromptTemplateCommands = promptTemplateCommands
export function createPromptTemplateCommandClient(transport: ClientTransport) {
  return createCommandClient(allPromptTemplateCommands, {
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
