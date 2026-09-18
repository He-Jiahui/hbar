import { createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { metricsCommands } from '@hbar/contracts/commands/metrics'
import type { ClientTransport } from './transport'

export function createMetricsCommandClient(client: ClientTransport) {
  return createCommandClient(metricsCommands, {
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
