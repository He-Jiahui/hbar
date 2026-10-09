import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { chatDatabaseCommands } from '@hbar/contracts/commands/chat-database'
import type { ChatDatabaseStatisticsService } from './chat-database-statistics'
import type { ChatDatabaseMaintenanceService } from './chat-database-maintenance'
import type { ChatDatabaseArtifactReferenceService } from './chat-database-artifact-references'

export function createChatDatabaseCommands(
  statistics: ChatDatabaseStatisticsService,
  maintenance: ChatDatabaseMaintenanceService,
  artifacts: ChatDatabaseArtifactReferenceService,
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
  const actor = (actorId: string | undefined) => {
    if (!actorId) throw new CommandError('INVALID_REQUEST', 'Draft inventory requires an authenticated device')
    return actorId
  }
  registry.register(
    chatDatabaseCommands['chatDatabase.draft.sync'],
    (input, context) => checked(() => artifacts.sync(input, identity(context.actorId, context.idempotencyKey))),
    { durable: true },
  )
  registry.register(chatDatabaseCommands['chatDatabase.draft.list'], (input, context) =>
    checked(() => artifacts.list(actor(context.actorId), input.after, input.limit)),
  )
  registry.register(
    chatDatabaseCommands['chatDatabase.inventory.begin'],
    (input, context) => checked(() => artifacts.begin(input, identity(context.actorId, context.idempotencyKey))),
    { durable: true },
  )
  registry.register(
    chatDatabaseCommands['chatDatabase.inventory.finish'],
    (input, context) => checked(() => artifacts.finish(input, identity(context.actorId, context.idempotencyKey))),
    { durable: true },
  )
  registry.register(chatDatabaseCommands['chatDatabase.inventory.get'], (_input, context) =>
    checked(() => artifacts.inventory(actor(context.actorId))),
  )
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
