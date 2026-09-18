import { createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { goalPlanCommands } from '@hbar/contracts/commands/goals'
import type { ClientTransport } from './transport'

export function createGoalPlanCommandClient(client: ClientTransport) {
  return createCommandClient(goalPlanCommands, {
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
