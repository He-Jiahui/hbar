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

  registry.register(interactionCommands['planExit.get'], (input) =>
    translate(async () => {
      const approval = await kernel.storage.call('approval', input.approvalId)
      if (
        approval.tool !== 'exit_plan_mode' ||
        approval.sessionId !== input.sessionId ||
        approval.runId !== input.runId ||
        approval.callId !== input.callId
      )
        throw new CommandError('PLAN_EXIT_TARGET', 'Plan decision does not match the original request')
      return {
        sessionId: approval.sessionId,
        approvalId: approval.id,
        runId: approval.runId,
        callId: approval.callId,
        status: approval.status,
        ...(approval.feedback === undefined ? {} : { feedback: approval.feedback }),
      }
    }),
  )
  registry.register(
    interactionCommands['planExit.resolve'],
    (input, context) =>
      translate(async () => {
        if (!context.actorId) throw new CommandError('INVALID_INPUT', 'Authenticated actor is required')
        if (input.decision === 'implement' && input.feedback)
          throw new CommandError('INVALID_INPUT', 'Feedback is only accepted when continuing to plan')
        const resolved = await kernel.resolvePlanExit({
          sessionId: input.sessionId,
          approvalId: input.approvalId,
          runId: input.runId,
          callId: input.callId,
          decision: input.decision,
          ...(input.feedback === undefined ? {} : { feedback: input.feedback }),
          actorId: context.actorId,
        })
        return {
          sessionId: resolved.sessionId,
          approvalId: resolved.id,
          runId: resolved.runId,
          callId: resolved.callId,
          status: resolved.status === 'allowed' ? ('allowed' as const) : ('denied' as const),
        }
      }),
    { durable: true },
  )
  registry.register(
    interactionCommands['approval.resolve'],
    ({ sessionId, approvalId, decision }) =>
      translate(async () => {
        const approval = await kernel.storage.call('approval', approvalId)
        if (approval.sessionId !== sessionId)
          throw new CommandError('COMMAND_NOT_FOUND', 'Approval was not found in the selected session')
        if (approval.tool === 'exit_plan_mode')
          throw new CommandError('PLAN_EXIT_DECISION_REQUIRED', 'Use the Plan exit decision for this request')
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
