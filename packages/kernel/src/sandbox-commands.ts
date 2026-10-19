import { CommandError, CommandRegistry, createCommandClient, type CommandContext } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { sandboxCommands } from '@hbar/contracts/commands/sandbox'
import type { SandboxWriteIdentity } from './sandbox-service'
import type { SandboxCommandPort } from './controller-port'

function translate(error: unknown): never {
  if (error instanceof CommandError) throw error
  if (error instanceof HbarError) throw new CommandError(error.code, error.message)
  throw error
}

function writeIdentity(context: CommandContext): SandboxWriteIdentity {
  if (!context.actorId || !context.idempotencyKey)
    throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
  return { actorId: context.actorId, idempotencyKey: context.idempotencyKey }
}

export function createSandboxCommands(service: SandboxCommandPort) {
  const registry = new CommandRegistry({ execution: 'host' })
  registry.register(sandboxCommands['sandbox.list'], async () => ({ items: await service.list() }))
  registry.register(sandboxCommands['sandbox.get'], ({ id }) => service.get(id).catch(translate))
  registry.register(
    sandboxCommands['sandbox.save'],
    (input, context) => service.save(input, writeIdentity(context)).catch(translate),
    { durable: true },
  )
  registry.register(
    sandboxCommands['sandbox.delete'],
    (input, context) => service.delete(input, writeIdentity(context)).catch(translate),
    { durable: true },
  )
  registry.register(sandboxCommands['sandbox.receipt'], (request, context) => {
    if (!context.actorId) throw new CommandError('FORBIDDEN', 'Authenticated actor is required')
    const input =
      request.commandId === 'sandbox.save'
        ? sandboxCommands['sandbox.save'].input.parse(request.input)
        : sandboxCommands['sandbox.delete'].input.parse(request.input)
    return service
      .receipt(request.commandId, input, { actorId: context.actorId, idempotencyKey: request.idempotencyKey })
      .then((result) => sandboxCommands['sandbox.receipt'].output.parse(result))
      .catch(translate)
  })
  return {
    ...createCommandClient(sandboxCommands, registry),
    dispatchPrepared: registry.dispatchPrepared.bind(registry),
    dispatchPreparedTracked: registry.dispatchPreparedTracked.bind(registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: (filter: Parameters<CommandRegistry['list']>[0] = {}) =>
      registry.list({ ...filter, limit: filter.limit ?? 500 }),
    dispose: () => registry.dispose(),
  }
}
