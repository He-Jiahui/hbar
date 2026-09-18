import { createCommandClient, COMMAND_PROTOCOL_VERSION, CommandError } from '@hbar/commands'
import { budgetCommands, budgetReceiptSchema } from '@hbar/contracts/commands/budget'
import type { BudgetReceipt } from '@hbar/contracts/commands/budget'
import type { ClientTransport } from './transport'

/** Transport adapter only; the Host authenticates the actual actor from the socket. */
export function createBudgetCommandClient(client: ClientTransport) {
  const commands = createCommandClient(budgetCommands, {
    execute(id, input, options) {
      if (id === 'session.setBudget' && !options?.idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'An idempotency key is required for a persistent command')
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
    async getReceipt(sessionId: string, idempotencyKey: string): Promise<BudgetReceipt | null> {
      const result = await client.call('command.getReceipt', {
        commandId: 'session.setBudget',
        sessionId,
        idempotencyKey,
      })
      const parsed = budgetReceiptSchema.nullable().safeParse(result)
      if (!parsed.success) throw new CommandError('INVALID_OUTPUT', 'Invalid command receipt')
      return parsed.data
    },
  }
}
