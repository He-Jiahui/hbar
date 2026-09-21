import { createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { workflowCoreCommands } from '@hbar/contracts/commands/workflows'
import type { ClientTransport } from './transport'

export function createWorkflowCommandClient(client: ClientTransport) {
  return createCommandClient(workflowCoreCommands, {
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
