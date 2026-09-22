import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema, MAX_GOAL_OBJECTIVE_LENGTH } from '../index'
import {
  workflowCompletionPolicySchema,
  workflowPlanItemSchema,
  workflowPlanItemsSchema,
  workflowScopeSchema,
  workflowSnapshotSchema,
} from '../workflow'

const sessionArgument = { field: 'sessionId', type: 'string' as const, flag: 'session' }
const expectedRevisionSchema = z.number().int().positive()
const metadata = (id: string, kind: 'command' | 'query') => ({
  id,
  version: 1,
  owner: 'hbar.workflow',
  kind,
  execution: 'host' as const,
  stateEffect: kind === 'query' ? ('none' as const) : ('persistent' as const),
  category: 'agent.goal.plan',
  scope: 'session' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
})

export const workflowPlanSaveInputSchema = z.strictObject({
  sessionId: idSchema,
  objective: z.string().trim().min(1).max(MAX_GOAL_OBJECTIVE_LENGTH),
  items: workflowPlanItemsSchema,
  expectedRevision: expectedRevisionSchema.nullable().optional(),
})

export const workflowStartInputSchema = z.strictObject({
  sessionId: idSchema,
  objective: z.string().trim().min(1).max(MAX_GOAL_OBJECTIVE_LENGTH),
  items: workflowPlanItemsSchema,
  tokenBudget: z.number().int().positive().max(1_000_000_000).optional(),
})

export const workflowFocusInputSchema = z.strictObject({
  sessionId: idSchema,
  stepIndex: z.number().int().nonnegative().max(99),
  item: workflowPlanItemSchema,
  completionPolicy: workflowCompletionPolicySchema.default('agent'),
  expectedPlanRevision: expectedRevisionSchema,
})

export const workflowExpandScopeInputSchema = z.strictObject({
  sessionId: idSchema,
  itemId: idSchema,
  scope: workflowScopeSchema,
  reason: z.string().trim().min(1).max(4_000),
  expectedRevision: expectedRevisionSchema,
})

export const workflowCheckpointInputSchema = z.strictObject({
  sessionId: idSchema,
  itemId: idSchema,
  outcome: z.enum(['progress', 'revise', 'complete', 'blocked']),
  summary: z.string().trim().min(1).max(4_000),
  nextItemId: idSchema.nullable().optional(),
  expectedRevision: expectedRevisionSchema,
})

export const workflowDelegateInputSchema = z.strictObject({
  sessionId: idSchema,
  itemIds: z.array(idSchema).min(1).max(8),
  modelId: idSchema,
  tokenBudget: z.number().int().positive().max(1_000_000_000).optional(),
  expectedRevision: expectedRevisionSchema,
})

export const workflowAcceptCheckInputSchema = z.strictObject({
  sessionId: idSchema,
  itemId: idSchema,
  checkId: idSchema,
  decision: z.enum(['accepted', 'rejected']),
  note: z.string().max(4_000).nullable().optional(),
  expectedRevision: expectedRevisionSchema,
})

export const workflowCommands = {
  'workflow.get': defineCommand(
    { ...metadata('workflow.get', 'query'), cli: { arguments: [sessionArgument] } },
    z.strictObject({ sessionId: idSchema }),
    workflowSnapshotSchema,
  ),
  'workflow.focus.set': defineCommand(
    metadata('workflow.focus.set', 'command'),
    workflowFocusInputSchema,
    workflowSnapshotSchema,
  ),
  'workflow.plan.save': defineCommand(
    metadata('workflow.plan.save', 'command'),
    workflowPlanSaveInputSchema,
    workflowSnapshotSchema,
  ),
  'workflow.start': defineCommand(
    { ...metadata('workflow.start', 'command'), idempotency: 'required' },
    workflowStartInputSchema,
    workflowSnapshotSchema,
  ),
  'workflow.activate': defineCommand(
    metadata('workflow.activate', 'command'),
    z.strictObject({
      sessionId: idSchema,
      planRevision: expectedRevisionSchema,
      tokenBudget: z.number().int().positive().max(1_000_000_000).optional(),
    }),
    workflowSnapshotSchema,
  ),
  'workflow.expandScope': defineCommand(
    metadata('workflow.expandScope', 'command'),
    workflowExpandScopeInputSchema,
    workflowSnapshotSchema,
  ),
  'workflow.checkpoint': defineCommand(
    metadata('workflow.checkpoint', 'command'),
    workflowCheckpointInputSchema,
    workflowSnapshotSchema,
  ),
  'workflow.delegate': defineCommand(
    metadata('workflow.delegate', 'command'),
    workflowDelegateInputSchema,
    workflowSnapshotSchema,
  ),
  'workflow.acceptCheck': defineCommand(
    metadata('workflow.acceptCheck', 'command'),
    workflowAcceptCheckInputSchema,
    workflowSnapshotSchema,
  ),
  'workflow.complete': defineCommand(
    metadata('workflow.complete', 'command'),
    z.strictObject({ sessionId: idSchema, expectedRevision: expectedRevisionSchema }),
    workflowSnapshotSchema,
  ),
}

export const workflowCoreCommands = {
  'workflow.get': workflowCommands['workflow.get'],
  'workflow.focus.set': workflowCommands['workflow.focus.set'],
  'workflow.plan.save': workflowCommands['workflow.plan.save'],
  'workflow.start': workflowCommands['workflow.start'],
  'workflow.activate': workflowCommands['workflow.activate'],
  'workflow.expandScope': workflowCommands['workflow.expandScope'],
  'workflow.checkpoint': workflowCommands['workflow.checkpoint'],
  'workflow.acceptCheck': workflowCommands['workflow.acceptCheck'],
  'workflow.complete': workflowCommands['workflow.complete'],
}

export type WorkflowCommandId = keyof typeof workflowCommands
