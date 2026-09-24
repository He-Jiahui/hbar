import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { goalPlanCommands } from '@hbar/contracts/commands/goals'
import type { GoalService, PlanService } from '@hbar/plugin-sdk'

export function createGoalPlanCommands(goals: GoalService, plans: PlanService) {
  const registry = new CommandRegistry({ execution: 'host' })
  const translate = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }

  registry.register(goalPlanCommands['goal.get'], ({ sessionId }) => translate(() => goals.get(sessionId)))
  registry.register(goalPlanCommands['goal.snapshot'], ({ sessionId }) =>
    translate(async () => {
      const [goal, plan] = await Promise.all([goals.snapshot(sessionId), plans.snapshot(sessionId)])
      return { ...goal.value, plan: plan.value, sessionId, goalSeq: goal.seq, planSeq: plan.seq }
    }),
  )
  registry.register(
    goalPlanCommands['goal.create'],
    ({ sessionId, objective, tokenBudget }) => translate(() => goals.create(sessionId, objective, tokenBudget)),
    { durable: true },
  )
  registry.register(
    goalPlanCommands['goal.set'],
    ({ sessionId, ...input }) => translate(() => goals.set(sessionId, input)),
    { durable: true },
  )
  registry.register(
    goalPlanCommands['goal.update'],
    ({ sessionId, status }) => translate(() => goals.update(sessionId, status)),
    { durable: true },
  )
  registry.register(
    goalPlanCommands['goal.clear'],
    ({ sessionId, expectedGoalId }) => translate(() => goals.clear(sessionId, expectedGoalId)),
    {
      durable: true,
    },
  )
  registry.register(goalPlanCommands['plan.get'], ({ sessionId }) => translate(() => plans.get(sessionId)))
  registry.register(
    goalPlanCommands['plan.update'],
    ({ sessionId, plan, explanation, turnId, expectedRevision }) =>
      translate(() => plans.update(sessionId, plan, explanation, turnId, expectedRevision)),
    { durable: true },
  )
  registry.register(
    goalPlanCommands['plan.clear'],
    ({ sessionId, expectedRevision }) => translate(() => plans.clear(sessionId, expectedRevision)),
    { durable: true },
  )

  return {
    ...createCommandClient(goalPlanCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
