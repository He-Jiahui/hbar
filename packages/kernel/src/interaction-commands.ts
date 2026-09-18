import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { interactionCommands } from '@hbar/contracts/commands/interaction'
import type { Kernel } from './index'

export function createInteractionCommands(kernel: Kernel) {
  const registry = new CommandRegistry({ execution: 'host' })
  const translate = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }

  registry.register(
    interactionCommands['approval.resolve'],
    ({ sessionId, approvalId, decision }) =>
      translate(async () => {
        const approval = await kernel.storage.call('approval', approvalId)
        if (approval.sessionId !== sessionId)
          throw new CommandError('COMMAND_NOT_FOUND', 'Approval was not found in the selected session')
        await kernel.resolveApproval(approvalId, decision)
        const resolved = await kernel.storage.call('approval', approvalId)
        return { sessionId, approvalId, status: resolved.status }
      }),
    { durable: true },
  )
  registry.register(
    interactionCommands['questionnaire.answer'],
    ({ sessionId, requestId, answers }) =>
      translate(async () => {
        const pending = (await kernel.snapshot(sessionId)).userInputs.some((request) => request.requestId === requestId)
        const accepted = pending ? await kernel.resolveUserInput(requestId, answers) : false
        return { sessionId, requestId, accepted }
      }),
    { durable: true },
  )

  return {
    ...createCommandClient(interactionCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
