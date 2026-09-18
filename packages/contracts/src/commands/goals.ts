import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import {
  goalStatusSchema,
  idSchema,
  MAX_GOAL_OBJECTIVE_LENGTH,
  MAX_PLAN_STEPS,
  planStateSchema,
  planStepSchema,
  threadGoalSchema,
} from '../index'

const goalResponseSchema = z.strictObject({
  goal: threadGoalSchema.nullable(),
  remainingTokens: z.number().int().nonnegative().nullable(),
  completionBudgetReport: z.string().optional(),
})
const clearedSchema = z.strictObject({ cleared: z.boolean() })
const metadata = (id: string, kind: 'command' | 'query') => ({
  id,
  version: 1,
  owner: id.startsWith('goal.') ? 'hbar.goal' : 'hbar.plan',
  kind,
  execution: 'host' as const,
  stateEffect: kind === 'query' ? ('none' as const) : ('persistent' as const),
  category: 'agent.goal.plan',
  scope: 'session' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
})
const sessionArgument = { field: 'sessionId', type: 'string' as const, flag: 'session' }

export const goalPlanCommands = {
  'goal.get': defineCommand(
    { ...metadata('goal.get', 'query'), cli: { arguments: [sessionArgument] } },
    z.strictObject({ sessionId: idSchema }),
    goalResponseSchema,
  ),
  'goal.create': defineCommand(
    {
      ...metadata('goal.create', 'command'),
      cli: {
        arguments: [
          sessionArgument,
          { field: 'objective', type: 'string' as const, position: 0 },
          { field: 'tokenBudget', type: 'number' as const, flag: 'token-budget' },
        ],
      },
    },
    z.strictObject({
      sessionId: idSchema,
      objective: z.string().trim().min(1).max(MAX_GOAL_OBJECTIVE_LENGTH),
      tokenBudget: z.number().int().positive().optional(),
    }),
    goalResponseSchema,
  ),
  'goal.set': defineCommand(
    metadata('goal.set', 'command'),
    z.strictObject({
      sessionId: idSchema,
      objective: z.string().trim().min(1).max(MAX_GOAL_OBJECTIVE_LENGTH).nullable().optional(),
      status: goalStatusSchema.nullable().optional(),
      tokenBudget: z.number().int().positive().nullable().optional(),
      expectedGoalId: idSchema.optional(),
      maxTokenBudget: z.number().int().positive().optional(),
    }),
    goalResponseSchema,
  ),
  'goal.update': defineCommand(
    {
      ...metadata('goal.update', 'command'),
      cli: {
        arguments: [sessionArgument, { field: 'status', type: 'string' as const, position: 0 }],
      },
    },
    z.strictObject({ sessionId: idSchema, status: z.enum(['complete', 'blocked']) }),
    goalResponseSchema,
  ),
  'goal.clear': defineCommand(
    { ...metadata('goal.clear', 'command'), cli: { arguments: [sessionArgument] } },
    z.strictObject({ sessionId: idSchema }),
    clearedSchema,
  ),
  'plan.get': defineCommand(
    { ...metadata('plan.get', 'query'), cli: { arguments: [sessionArgument] } },
    z.strictObject({ sessionId: idSchema }),
    planStateSchema.nullable(),
  ),
  'plan.update': defineCommand(
    metadata('plan.update', 'command'),
    z.strictObject({
      sessionId: idSchema,
      turnId: idSchema.nullable().optional(),
      explanation: z.string().max(4_000).nullable().optional(),
      plan: z.array(planStepSchema).max(MAX_PLAN_STEPS),
    }),
    planStateSchema,
  ),
  'plan.clear': defineCommand(
    { ...metadata('plan.clear', 'command'), cli: { arguments: [sessionArgument] } },
    z.strictObject({ sessionId: idSchema }),
    clearedSchema,
  ),
}
