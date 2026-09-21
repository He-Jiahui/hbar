import { createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import type { WireNotification, WorkflowSnapshot } from '@hbar/contracts'
import { workflowCommands } from '@hbar/contracts/commands/workflows'
import type { ClientTransport } from './transport'

export function createWorkflowCommandClient(client: ClientTransport) {
  const commands = createCommandClient(workflowCommands, {
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
  return {
    ...commands,
    watch(sessionId: string, listener: (snapshot: WorkflowSnapshot) => void) {
      const eventClient = client as ClientTransport & {
        onEvent?: (listener: (event: WireNotification) => void) => () => void
      }
      if (!eventClient.onEvent) return () => undefined
      return eventClient.onEvent((event) => {
        if (event.method === 'workflow.updated' && event.params.sessionId === sessionId) listener(event.params.snapshot)
      })
    },
  }
}
