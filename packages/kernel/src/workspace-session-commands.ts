import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { workspaceSessionCommands } from '@hbar/contracts/commands/workspaces'
import type { Kernel } from './index'
import { registerWorkspaceOrganizationCommands } from './workspace-organization-commands'
import { registerWorkspaceDisplayNamesCommands } from './workspace-display-names-commands'
import { registerWorkspaceFolderCommands } from './workspace-folders'

export function createWorkspaceSessionCommands(kernel: Kernel) {
  const registry = new CommandRegistry({ execution: 'host' })
  registerWorkspaceFolderCommands(
    registry,
    kernel.storage,
    [kernel.options.layout.dataRoot, kernel.options.layout.cacheRoot],
    () => {
      kernel.changed('workspace-folders')
      kernel.changed('workspaces')
    },
  )
  registerWorkspaceOrganizationCommands(registry, kernel.storage, () => kernel.changed('workspace-organization'))
  registerWorkspaceDisplayNamesCommands(registry, kernel.storage, () => kernel.changed('workspace-display-names'))
  const translate = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  registry.register(
    workspaceSessionCommands['workspace.create'],
    ({ path }) => translate(() => kernel.createWorkspace(path)),
    { durable: true },
  )
  registry.register(
    workspaceSessionCommands['session.create'],
    async (input, context) => {
      if (!context.actorId || !context.idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
      const session = await translate(() =>
        kernel.storage.call('createSessionCommand', {
          actorId: context.actorId!,
          idempotencyKey: context.idempotencyKey!,
          workspaceId: input.workspaceId,
          ...(input.title ? { title: input.title } : {}),
        }),
      )
      kernel.changed('sessions')
      return session
    },
    { durable: true },
  )
  registry.register(
    workspaceSessionCommands['session.rename'],
    (input) =>
      translate(() =>
        kernel.updateSession(input.sessionId, {
          title: input.title,
          ...(input.expectedTitle === undefined ? {} : { expectedTitle: input.expectedTitle }),
        }),
      ),
    { durable: true },
  )
  registry.register(
    workspaceSessionCommands['session.archive'],
    (input) =>
      translate(() => {
        if (kernel.active.has(input.sessionId)) throw new HbarError('BUSY', 'Stop the active run before archiving')
        return kernel.updateSession(input.sessionId, { archived: input.archived })
      }),
    { durable: true },
  )
  registry.register(
    workspaceSessionCommands['session.fork'],
    async (input, context) => {
      if (!context.actorId || !context.idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
      const session = await translate(() =>
        kernel.storage.call('forkSessionCommand', {
          actorId: context.actorId!,
          idempotencyKey: context.idempotencyKey!,
          sessionId: input.sessionId,
          ...(input.atSeq ? { atSeq: input.atSeq } : {}),
        }),
      )
      kernel.changed('sessions')
      return session
    },
    { durable: true },
  )
  registry.register(
    workspaceSessionCommands['session.forkFromMessage'],
    async (input, context) => {
      if (!context.actorId || !context.idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
      const session = await translate(() =>
        kernel.storage.call('forkFromMessageCommand', {
          actorId: context.actorId!,
          idempotencyKey: context.idempotencyKey!,
          sessionId: input.sessionId,
          messageId: input.messageId,
        }),
      )
      kernel.changed('sessions')
      return session
    },
    { durable: true },
  )
  registry.register(workspaceSessionCommands['session.forkableMessages'], ({ sessionId, messageIds }) =>
    translate(() => kernel.storage.call('forkableMessages', { sessionId, messageIds })),
  )
  registry.register(workspaceSessionCommands['session.forkFromMessageReceipt'], (input, context) => {
    if (!context.actorId) throw new CommandError('INVALID_INPUT', 'Authenticated actor is required')
    return translate(() =>
      kernel.storage.call('forkFromMessageReceipt', {
        actorId: context.actorId!,
        idempotencyKey: input.idempotencyKey,
        sessionId: input.sessionId,
        messageId: input.messageId,
      }),
    )
  })
  registry.register(workspaceSessionCommands['session.export'], async ({ sessionId, after, limit }) => {
    const rows = await translate(() => kernel.storage.call('events', sessionId, after, limit + 1))
    const events = rows.slice(0, limit)
    return {
      events,
      cursor: events.at(-1)?.seq ?? after,
      nextCursor: rows.length > limit ? (events.at(-1)?.seq ?? null) : null,
    }
  })
  return {
    ...createCommandClient(workspaceSessionCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
