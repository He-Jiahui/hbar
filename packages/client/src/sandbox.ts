import { COMMAND_PROTOCOL_VERSION, createCommandClient } from '@hbar/commands'
import { sandboxCommands } from '@hbar/contracts/commands/sandbox'
import type { ClientTransport } from './transport'

export function createSandboxCommandClient(transport: ClientTransport) {
  return createCommandClient(sandboxCommands, {
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
