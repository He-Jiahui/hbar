import { createHash } from 'node:crypto'
import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { workflowCommands } from '@hbar/contracts/commands/workflows'
import type { WorkflowService } from '@hbar/plugin-sdk'

export function createWorkflowCommands(service: WorkflowService) {
  const registry = new CommandRegistry({ execution: 'host' })
  const translate = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }

  registry.register(workflowCommands['workflow.get'], ({ sessionId }) => translate(() => service.get(sessionId)))
  registry.register(
    workflowCommands['workflow.focus.set'],
    ({ sessionId, stepIndex, item, completionPolicy, expectedPlanRevision }) =>
      translate(() => service.focus(sessionId, stepIndex, item, completionPolicy, expectedPlanRevision)),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.plan.save'],
    ({ sessionId, objective, items, expectedRevision }) =>
      translate(() => service.savePlan(sessionId, objective, items, expectedRevision)),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.start'],
    ({ sessionId, objective, items, tokenBudget }, context) =>
      translate(() => {
        if (!context.actorId || !context.idempotencyKey)
          throw new HbarError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
        const inputHash = createHash('sha256')
          .update(JSON.stringify({ sessionId, objective, items, tokenBudget }))
          .digest('hex')
        return service.start(sessionId, objective, items, tokenBudget, undefined, {
          actorId: context.actorId,
          idempotencyKey: context.idempotencyKey,
          requestId: context.requestId,
          inputHash,
        })
      }),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.activate'],
    ({ sessionId, planRevision, tokenBudget }) =>
      translate(() => service.activate(sessionId, planRevision, tokenBudget)),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.expandScope'],
    ({ sessionId, itemId, scope, reason, expectedRevision }) =>
      translate(() => service.expandScope(sessionId, itemId, scope, reason, expectedRevision)),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.checkpoint'],
    ({ sessionId, itemId, outcome, summary, nextItemId, expectedRevision }) =>
      translate(() => service.checkpoint(sessionId, itemId, outcome, summary, nextItemId, expectedRevision)),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.delegate'],
    ({ sessionId, itemIds, modelId, tokenBudget, expectedRevision }) =>
      translate(() => service.delegate(sessionId, itemIds, modelId, tokenBudget, expectedRevision)),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.acceptCheck'],
    ({ sessionId, itemId, checkId, decision, note, expectedRevision }, context) =>
      translate(() => {
        if (!context.actorId) throw new HbarError('INVALID_INPUT', 'Authenticated actor is required')
        return service.acceptCheck(sessionId, itemId, checkId, decision, note, expectedRevision, context.actorId)
      }),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.complete'],
    ({ sessionId, expectedRevision }) => translate(() => service.complete(sessionId, expectedRevision)),
    { durable: true },
  )

  return {
    ...createCommandClient(workflowCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
