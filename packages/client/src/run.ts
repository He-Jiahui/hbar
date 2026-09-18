import { createCommandClient, COMMAND_PROTOCOL_VERSION, CommandError } from '@hbar/commands'
import { runCommands, runAcceptedSchema } from '@hbar/contracts/commands/run'
import type { RunAccepted } from '@hbar/contracts/commands/run'
import type { ClientTransport } from './transport'

export function createRunCommandClient(client: ClientTransport) {
  const commands = createCommandClient(runCommands, {
    execute(id, input, options) {
      if (id === 'run.submit' && !options?.idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'An idempotency key is required for run.submit')
      return client.call('command.execute', {
        protocol: COMMAND_PROTOCOL_VERSION,
        requestId: options?.requestId ?? crypto.randomUUID(),
        commandId: id,
        commandVersion: options?.version ?? 1,
        ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
        input,
      })
    },
  })
  return {
    ...commands,
    async getReceipt(sessionId: string, idempotencyKey: string): Promise<RunAccepted | null> {
      const result = await client.call('command.getReceipt', { commandId: 'run.submit', sessionId, idempotencyKey })
      const parsed = runAcceptedSchema.nullable().safeParse(result)
      if (!parsed.success) throw new CommandError('INVALID_OUTPUT', 'Invalid run acceptance receipt')
      return parsed.data
    },
  }
}
