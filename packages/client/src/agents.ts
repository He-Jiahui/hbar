import { createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { agentCommands } from '@hbar/contracts/commands/agents'
import type { ClientTransport } from './transport'

export function createAgentCommandClient(client: ClientTransport) {
  return createCommandClient(agentCommands, {
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
