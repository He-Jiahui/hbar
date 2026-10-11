import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { sessionBranchTargetCommands } from '@hbar/contracts/commands/session-branch-target'
import type { SessionBranchTargetCommandKernelPort } from './controller-port'

export function createSessionBranchTargetCommands(kernel: SessionBranchTargetCommandKernelPort) {
  const registry = new CommandRegistry({ execution: 'host' })
  const translate = async <Value>(action: () => Promise<Value>): Promise<Value> => {
    try {
      return await action()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  registry.register(sessionBranchTargetCommands['sessionBranchTarget.list'], (input, context) =>
    translate(() => kernel.sessionBranchTargets.list(input, context.signal, context.actorId)),
  )
  registry.register(
    sessionBranchTargetCommands['sessionBranchTarget.select'],
    (input, context) => {
      if (!context.actorId || !context.idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and operation key are required')
      return translate(() =>
        kernel.selectSessionBranchTarget(
          input,
          { actorId: context.actorId!, idempotencyKey: context.idempotencyKey! },
          context.signal,
        ),
      )
    },
    { durable: true },
  )
  registry.register(sessionBranchTargetCommands['sessionBranchTarget.operation'], (input, context) => {
    if (!context.actorId) throw new CommandError('INVALID_INPUT', 'Authenticated actor is required')
    return translate(
      async () =>
        (await kernel.storage.call('sessionBranchTargetOperation', { ...input, actorId: context.actorId! }))
          ?.snapshot ?? null,
    )
  })
  registry.register(
    sessionBranchTargetCommands['sessionBranchTarget.reconcile'],
    (input, context) => {
      if (!context.actorId || !context.idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and operation key are required')
      return translate(() =>
        kernel.reconcileSessionBranchTarget({ ...input, actorId: context.actorId! }, context.signal),
      )
    },
    { durable: true },
  )
  return {
    ...createCommandClient(sessionBranchTargetCommands, registry),
    dispatch: (value: unknown, actorId: string) => registry.dispatch(value, { actorId }),
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
