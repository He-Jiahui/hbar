import {
  CommandError,
  CommandRegistry,
  createCommandClient,
  type CommandDefinition,
  type CommandContext,
} from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { scheduleCommands } from '@hbar/contracts/commands/schedules'
import { promptTemplateCommands } from '@hbar/contracts/commands/prompt-templates'
import { notificationCommands } from '@hbar/contracts/commands/notifications'
import type { NotificationService } from './notification-service'
import type { ScheduleService } from './schedule-service'
import type { ScheduleCreateInput, ScheduleUpdateInput } from '@hbar/contracts/commands/schedules'
import type { PromptTemplateStoragePort } from './prompt-template-service'
import { createPromptTemplateService } from './prompt-template-service'
import { createRunBoardQueries } from './run-board-queries'

function translate(error: unknown): never {
  if (error instanceof CommandError) throw error
  if (error instanceof HbarError) throw new CommandError(error.code, error.message)
  throw error
}

function writeIdentity(context: CommandContext): { actorId: string; idempotencyKey: string } {
  if (!context.actorId || !context.idempotencyKey)
    throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
  return { actorId: context.actorId, idempotencyKey: context.idempotencyKey }
}

function facade<T extends Readonly<Record<string, CommandDefinition>>>(definitions: T, registry: CommandRegistry) {
  return {
    ...createCommandClient(definitions, registry),
    dispatchPrepared: registry.dispatchPrepared.bind(registry),
    dispatchPreparedTracked: registry.dispatchPreparedTracked.bind(registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}

export function createScheduleCommands(
  service: ScheduleService,
  receipts?: {
    lookup(
      commandId: 'schedule.create' | 'schedule.update' | 'schedule.delete',
      input: ScheduleCreateInput | ScheduleUpdateInput | { scheduleId: string; expectedRevision: number },
      identity: { actorId: string; idempotencyKey: string },
    ): Promise<unknown | null>
  },
) {
  const registry = new CommandRegistry({ execution: 'host' })
  registry.register(scheduleCommands['schedule.list'], (input) =>
    service.list(input.workspaceId, input.after ?? null, input.limit),
  )
  registry.register(scheduleCommands['schedule.get'], ({ scheduleId }) => service.get(scheduleId))
  registry.register(scheduleCommands['schedule.preview'], (input) => service.preview(input))
  registry.register(scheduleCommands['schedule.occurrences'], (input) =>
    service.occurrences(input.scheduleId, input.after ?? null, input.limit),
  )
  registry.register(
    scheduleCommands['schedule.create'],
    async (input, context) => {
      try {
        const identity = writeIdentity(context)
        const prior = await receipts?.lookup('schedule.create', input, identity)
        return prior ? scheduleCommands['schedule.create'].output.parse(prior) : await service.create(input, identity)
      } catch (error) {
        return translate(error)
      }
    },
    {
      durable: true,
    },
  )
  registry.register(
    scheduleCommands['schedule.update'],
    async (input, context) => {
      try {
        const identity = writeIdentity(context)
        const prior = await receipts?.lookup('schedule.update', input, identity)
        return prior ? scheduleCommands['schedule.update'].output.parse(prior) : await service.update(input, identity)
      } catch (error) {
        return translate(error)
      }
    },
    {
      durable: true,
    },
  )
  registry.register(
    scheduleCommands['schedule.delete'],
    async (input, context) => {
      try {
        const identity = writeIdentity(context)
        const prior = await receipts?.lookup('schedule.delete', input, identity)
        return prior
          ? scheduleCommands['schedule.delete'].output.parse(prior)
          : await service.delete(input.scheduleId, input.expectedRevision, identity)
      } catch (error) {
        return translate(error)
      }
    },
    { durable: true },
  )
  registry.register(scheduleCommands['schedule.receipt'], async (request, context) => {
    if (!context.actorId) throw new CommandError('FORBIDDEN', 'Authenticated actor is required')
    const value = await receipts?.lookup(request.commandId, request.input, {
      actorId: context.actorId,
      idempotencyKey: request.idempotencyKey,
    })
    return scheduleCommands['schedule.receipt'].output.parse(value ?? null)
  })
  return facade(scheduleCommands, registry)
}

export function createPromptTemplateCommands(port: PromptTemplateStoragePort) {
  const service = createPromptTemplateService(port)
  const registry = new CommandRegistry({ execution: 'host' })
  registry.register(promptTemplateCommands['promptTemplate.list'], (input) =>
    service.list({
      workspaceId: input.workspaceId,
      ...(input.after === undefined ? {} : { after: input.after }),
      limit: input.limit,
    }),
  )
  registry.register(promptTemplateCommands['promptTemplate.get'], ({ id }) => service.get(id))
  registry.register(
    promptTemplateCommands['promptTemplate.save'],
    (input, context) => service.save(input, writeIdentity(context)).catch(translate),
    { durable: true },
  )
  registry.register(
    promptTemplateCommands['promptTemplate.delete'],
    (input, context) => service.delete(input, writeIdentity(context)).catch(translate),
    { durable: true },
  )
  registry.register(promptTemplateCommands['promptTemplate.receipt'], (request, context) => {
    if (!context.actorId) throw new CommandError('FORBIDDEN', 'Authenticated actor is required')
    return service
      .receipt(request.commandId, request.input, { actorId: context.actorId, idempotencyKey: request.idempotencyKey })
      .then((result) => promptTemplateCommands['promptTemplate.receipt'].output.parse(result))
      .catch(translate)
  })
  return facade(promptTemplateCommands, registry)
}

export function createNotificationCommands(service: NotificationService) {
  const registry = new CommandRegistry({ execution: 'host' })
  registry.register(notificationCommands['notification.page'], (input) => service.page(input))
  registry.register(
    notificationCommands['notification.markRead'],
    ({ id, read }, context) => service.markRead(id, read, writeIdentity(context)).catch(translate),
    {
      durable: true,
    },
  )
  registry.register(
    notificationCommands['notification.markAllRead'],
    (_input, context) => service.markAllRead(writeIdentity(context)).catch(translate),
    { durable: true },
  )
  registry.register(notificationCommands['notification.preferences.get'], () => service.preferences())
  registry.register(
    notificationCommands['notification.preferences.set'],
    (input, context) => service.setPreferences(input, writeIdentity(context)).catch(translate),
    {
      durable: true,
    },
  )
  registry.register(notificationCommands['notification.receipt'], (request, context) => {
    if (!context.actorId) throw new CommandError('FORBIDDEN', 'Authenticated actor is required')
    const definition = notificationCommands[request.commandId]
    const input = definition.input.parse(request.input)
    return service
      .receipt(request.commandId, input, { actorId: context.actorId, idempotencyKey: request.idempotencyKey })
      .then((result) => (result === null ? null : definition.output.parse(result)))
      .catch(translate)
  })
  return facade(notificationCommands, registry)
}

export function createRunBoardCommands(storage: Parameters<typeof createRunBoardQueries>[0]) {
  return createRunBoardQueries(storage)
}
