import { CommandError, type CommandRegistry } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import {
  decisionCommands,
  decisionDetailSchema,
  type DecisionIdentity,
  type DecisionDetail,
} from '@hbar/contracts/commands/decisions'
import type { InteractionCommandKernelPort } from './controller-port'
import { executeDecisionOperation } from './decision-command-operation'

/** The common directory routes each decision through its original interaction use case. */
export function registerDecisionCommands(registry: CommandRegistry, kernel: InteractionCommandKernelPort): void {
  const translate = async <Result>(operation: () => Promise<Result>): Promise<Result> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  const get = async (target: DecisionIdentity): Promise<DecisionDetail> => {
    if (target.kind === 'questionnaire') {
      const state = await kernel.storage.call('userInputRead', { sessionId: target.sessionId, requestId: target.id })
      if (!state) throw new CommandError('COMMAND_NOT_FOUND', 'The decision is absent from this Session')
      const run = await kernel.storage.call('run', state.request.runId)
      return decisionDetailSchema.parse({
        ...target,
        runId: state.request.runId,
        callId: state.request.callId,
        revision: state.revision,
        createdAt: state.createdAt,
        sourceRunStatus: run.status,
        status:
          state.settlement?.kind === 'answered'
            ? 'answered'
            : state.settlement?.kind === 'cancelled'
              ? 'cancelled'
              : 'pending',
        state,
      })
    }
    const approval = await kernel.storage.call('approval', target.id)
    if (
      approval.sessionId !== target.sessionId ||
      (approval.tool === 'exit_plan_mode' ? 'plan_exit' : 'approval') !== target.kind
    )
      throw new CommandError('COMMAND_NOT_FOUND', 'The decision is absent from this Session or kind')
    const run = await kernel.storage.call('run', approval.runId)
    return decisionDetailSchema.parse({
      ...approval,
      kind: target.kind,
      sourceRunStatus: run.status,
      revision: approval.status === 'pending' ? 1 : 2,
    })
  }
  registry.register(decisionCommands['decision.list'], (input) =>
    translate(() => kernel.storage.call('decisionPage', input)),
  )
  registry.register(decisionCommands['decision.get'], (input) => translate(() => get(input)))
  registry.register(
    decisionCommands['decision.resolve'],
    (input, context) =>
      translate(async () => {
        if (!context.actorId || !context.idempotencyKey)
          throw new CommandError('INVALID_INPUT', 'An authenticated actor and decision key are required')
        const actorId = context.actorId
        return executeDecisionOperation(
          kernel.storage,
          { actorId, idempotencyKey: context.idempotencyKey, input },
          async () => {
            const resolution = input.resolution
            const target: DecisionIdentity = { sessionId: input.sessionId, kind: resolution.kind, id: input.id }
            const before = await get(target)
            if (before.revision !== input.expectedRevision)
              throw new CommandError('DECISION_CONFLICT', 'The decision changed; read its current state')
            if (before.status !== 'pending') return { accepted: false, decision: before }
            let accepted = true
            switch (resolution.kind) {
              case 'questionnaire':
                accepted = await kernel.resolveUserInput(input.id, resolution.response.answers)
                break
              case 'approval':
                await kernel.resolveApproval(input.id, resolution.decision)
                break
              case 'plan_exit':
                if (resolution.decision === 'implement' && resolution.feedback)
                  throw new CommandError('INVALID_INPUT', 'Feedback belongs to a continue-planning decision')
                await kernel.resolvePlanExit({
                  sessionId: input.sessionId,
                  approvalId: input.id,
                  runId: before.runId,
                  callId: before.callId,
                  decision: resolution.decision,
                  actorId,
                  ...(resolution.feedback ? { feedback: resolution.feedback } : {}),
                })
                break
            }
            const decision = await get(target)
            if (resolution.kind === 'approval') accepted = decision.status === resolution.decision
            if (!accepted && decision.status === 'pending')
              throw new CommandError(
                'DECISION_EXECUTOR_UNAVAILABLE',
                'The source question needs Run recovery before it can accept an answer',
              )
            return { accepted, decision }
          },
        )
      }),
    { durable: true },
  )
}
