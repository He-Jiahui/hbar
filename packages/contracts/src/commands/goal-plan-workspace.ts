import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema, planStepStatusSchema } from '../index'

const instanceId = z.string().min(1).max(160)
const summary = z.strictObject({
  instanceId,
  sessionId: idSchema,
  view: z.enum(['overview', 'goal', 'plan']),
  status: z.enum(['loading', 'ready', 'error']),
  goalStatus: z.enum(['idle', 'submitting', 'succeeded', 'failed', 'unknown']),
  planStatus: z.enum(['idle', 'submitting', 'succeeded', 'failed', 'unknown']),
  goalDirty: z.boolean(),
  planDirty: z.boolean(),
  error: z.string().nullable(),
})
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.goal-plan-workspace',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  category: 'agent.goal.plan',
  scope: 'client' as const,
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})

export const goalPlanWorkspaceCommands = {
  'goalPlanWorkspace.refresh': defineCommand(
    metadata('goalPlanWorkspace.refresh'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'goalPlanWorkspace.showOverview': defineCommand(
    metadata('goalPlanWorkspace.showOverview'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'goalPlanWorkspace.showGoalEditor': defineCommand(
    metadata('goalPlanWorkspace.showGoalEditor'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'goalPlanWorkspace.showPlanEditor': defineCommand(
    metadata('goalPlanWorkspace.showPlanEditor'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'goalPlanWorkspace.setGoalField': defineCommand(
    metadata('goalPlanWorkspace.setGoalField'),
    z.strictObject({
      instanceId,
      field: z.enum(['objective', 'tokenBudget', 'status']),
      value: z.string().max(4_000),
    }),
    summary,
  ),
  'goalPlanWorkspace.saveGoal': defineCommand(
    metadata('goalPlanWorkspace.saveGoal'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'goalPlanWorkspace.discardGoalEdits': defineCommand(
    metadata('goalPlanWorkspace.discardGoalEdits'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'goalPlanWorkspace.clearGoal': defineCommand(
    metadata('goalPlanWorkspace.clearGoal'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'goalPlanWorkspace.setExplanation': defineCommand(
    metadata('goalPlanWorkspace.setExplanation'),
    z.strictObject({ instanceId, value: z.string().max(4_000) }),
    summary,
  ),
  'goalPlanWorkspace.setNewStep': defineCommand(
    metadata('goalPlanWorkspace.setNewStep'),
    z.strictObject({ instanceId, value: z.string().max(4_000) }),
    summary,
  ),
  'goalPlanWorkspace.addStep': defineCommand(
    metadata('goalPlanWorkspace.addStep'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'goalPlanWorkspace.setStep': defineCommand(
    metadata('goalPlanWorkspace.setStep'),
    z.strictObject({
      instanceId,
      stepId: idSchema,
      step: z.string().min(1).max(4_000).optional(),
      status: planStepStatusSchema.optional(),
    }),
    summary,
  ),
  'goalPlanWorkspace.moveStep': defineCommand(
    metadata('goalPlanWorkspace.moveStep'),
    z.strictObject({ instanceId, stepId: idSchema, direction: z.union([z.literal(-1), z.literal(1)]) }),
    summary,
  ),
  'goalPlanWorkspace.removeStep': defineCommand(
    metadata('goalPlanWorkspace.removeStep'),
    z.strictObject({ instanceId, stepId: idSchema }),
    summary,
  ),
  'goalPlanWorkspace.savePlan': defineCommand(
    metadata('goalPlanWorkspace.savePlan'),
    z.strictObject({ instanceId }),
    summary,
  ),
  'goalPlanWorkspace.clearPlan': defineCommand(
    metadata('goalPlanWorkspace.clearPlan'),
    z.strictObject({ instanceId }),
    summary,
  ),
}
