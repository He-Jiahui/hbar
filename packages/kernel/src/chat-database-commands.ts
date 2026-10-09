import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { chatDatabaseCommands } from '@hbar/contracts/commands/chat-database'
import type { ChatDatabaseStatisticsService } from './chat-database-statistics'
import type { ChatDatabaseMaintenanceService } from './chat-database-maintenance'

export function createChatDatabaseCommands(
  statistics: ChatDatabaseStatisticsService,
  maintenance: ChatDatabaseMaintenanceService,
) {
  const registry = new CommandRegistry({ execution: 'host', maxConcurrent: 8 })
  const checked = async <Value>(action: () => Promise<Value>): Promise<Value> => {
    try {
      return await action()
    } catch (reason) {
      if (reason instanceof HbarError) throw new CommandError(reason.code, reason.message)
      throw reason
    }
  }
  const identity = (actorId: string | undefined, idempotencyKey: string | undefined) => {
    if (!actorId || !idempotencyKey)
      throw new CommandError('INVALID_REQUEST', 'Maintenance requires a device and an idempotency key')
    return { actorId, idempotencyKey }
  }
  registry.register(
    chatDatabaseCommands['chatDatabase.preview'],
    (input, context) => checked(() => maintenance.preview(input, identity(context.actorId, context.idempotencyKey))),
    { durable: true },
  )
  registry.register(
    chatDatabaseCommands['chatDatabase.cleanup'],
    (input, context) => checked(() => maintenance.cleanup(input, identity(context.actorId, context.idempotencyKey))),
    { durable: true },
  )
  registry.register(chatDatabaseCommands['chatDatabase.previewPage'], (input) => checked(() => maintenance.page(input)))
  registry.register(chatDatabaseCommands['chatDatabase.operation'], (input) =>
    checked(() => maintenance.read(input.operationId)),
  )
  registry.register(chatDatabaseCommands['chatDatabase.receipt'], (input, context) =>
    checked(() => maintenance.receipt(identity(context.actorId, input.idempotencyKey))),
  )
  registry.register(
    chatDatabaseCommands['chatDatabase.cancel'],
    (input, context) =>
      checked(() => maintenance.cancel(input.operationId, identity(context.actorId, context.idempotencyKey))),
    { durable: true },
  )
  registry.register(
    chatDatabaseCommands['chatDatabase.reconcile'],
    (input, context) =>
      checked(() => maintenance.reconcile(input.operationId, identity(context.actorId, context.idempotencyKey))),
    { durable: true },
  )
  registry.register(chatDatabaseCommands['chatDatabase.history'], (input) => checked(() => maintenance.history(input)))
  registry.register(chatDatabaseCommands['chatDatabase.statistics'], async (input) => {
    try {
      return await statistics.get(input.scope, input.refresh)
    } catch (reason) {
      if (reason instanceof HbarError) throw new CommandError(reason.code, reason.message)
      throw reason
    }
  })
  return {
    ...createCommandClient(chatDatabaseCommands, registry),
    dispatch: (value: unknown, actorId: string) => registry.dispatch(value, { actorId }),
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 100 }),
    dispose: () => registry.dispose(),
  }
}
