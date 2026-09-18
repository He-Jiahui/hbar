import { CommandRegistry, CommandError, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { budgetCommands } from '@hbar/contracts/commands/budget'
import type { BudgetService } from '@hbar/plugin-sdk'

/** The budget plugin owns the single domain use case and appends receipt with the budget fact. */
export function createBudgetCommands(service: BudgetService) {
  const registry = new CommandRegistry({ execution: 'host' })
  const translate = async <T>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  registry.register(budgetCommands['session.getBudget'], ({ sessionId }) => translate(() => service.get(sessionId)))
  registry.register(
    budgetCommands['session.clearBudget'],
    ({ sessionId }) => translate(() => service.clear(sessionId)),
    { durable: true },
  )
  registry.register(
    budgetCommands['session.setBudget'],
    (input, context) => {
      const actorId = context.actorId,
        idempotencyKey = context.idempotencyKey
      if (!actorId || !idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
      return translate(() =>
        service.setCommand(input, {
          actorId,
          idempotencyKey,
          requestId: context.requestId,
        }),
      )
    },
    { durable: true },
  )
  const commands = createCommandClient(budgetCommands, registry)
  return {
    ...commands,
    async dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    getReceipt(sessionId: string, actorId: string, idempotencyKey: string) {
      return translate(() => service.getCommandReceipt(sessionId, actorId, idempotencyKey))
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
