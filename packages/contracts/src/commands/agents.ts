import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { approvalModeSchema, idSchema, thinkingLevelSchema } from '../index'
import { sandboxSnapshotRefSchema } from '../sandbox'
import { agentPatchSchema, workflowAcceptanceDefinitionSchema, workflowScopeSchema } from '../workflow'

export const agentStatusSchema = z.enum([
  'created',
  'queued',
  'running',
  'waiting_approval',
  'cancelRequested',
  'completed',
  'cancelled',
  'failed',
  'interrupted',
])
export const agentProfileIdSchema = z.enum(['explore'])
export type AgentProfileId = z.output<typeof agentProfileIdSchema>
/** Persisted model-tool output identity; navigation must recheck the current Agent record. */
export const agentToolResultSchema = z.strictObject({
  agentId: idSchema,
  parentSessionId: idSchema,
  sessionId: idSchema,
  requestId: idSchema,
  profileId: agentProfileIdSchema,
  objective: z.string().min(1).max(4_000),
  modelId: idSchema,
  status: agentStatusSchema,
})
export type AgentToolResult = z.output<typeof agentToolResultSchema>
/** Host-advertised invocation types; the bare Agent form also supports an unprofiled general child. */
export const agentProfileCatalogSchema = z.array(agentProfileIdSchema).max(32)
export const agentRecordSchema = z.strictObject({
  agentId: idSchema,
  parentSessionId: idSchema,
  sessionId: idSchema,
  runId: idSchema.nullable(),
  requestId: idSchema,
  objective: z.string().min(1).max(4_000),
  profileId: agentProfileIdSchema.optional(),
  modelId: idSchema,
  tokenBudget: z.number().int().positive().max(1_000_000_000).nullable(),
  status: agentStatusSchema,
  error: z.string().max(4_000).nullable(),
  patch: agentPatchSchema.nullable().optional(),
  resultSummary: z.string().max(4_000).nullable().optional(),
  isolated: z.boolean().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export const agentPatchTaskSchema = z.strictObject({
  itemId: idSchema,
  planRevision: z.number().int().positive(),
  scope: workflowScopeSchema,
  acceptanceChecks: z.array(workflowAcceptanceDefinitionSchema).max(32),
})
export const agentReviewTaskSchema = z.strictObject({
  reviewId: idSchema,
  planRevision: z.number().int().positive(),
  stepTextHash: z.string().regex(/^[a-f0-9]{64}$/),
  workspaceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  scope: workflowScopeSchema,
})
export const agentCreateInputSchema = z
  .strictObject({
    parentSessionId: idSchema,
    objective: z.string().trim().min(1).max(4_000),
    profileId: agentProfileIdSchema.optional(),
    modelId: idSchema,
    title: z.string().trim().min(1).max(160).optional(),
    tokenBudget: z.number().int().positive().max(1_000_000_000).optional(),
    thinkingLevel: thinkingLevelSchema.optional(),
    approval: approvalModeSchema.default('deny'),
    /** Pin the parent Run's sandbox rules instead of resolving the child session's settings. */
    sandbox: sandboxSnapshotRefSchema.optional(),
    patchTask: agentPatchTaskSchema.optional(),
    reviewTask: agentReviewTaskSchema.optional(),
  })
  .refine((value) => !(value.patchTask && value.reviewTask), {
    message: 'patchTask and reviewTask are mutually exclusive',
  })
  .refine((value) => !(value.profileId && (value.patchTask || value.reviewTask)), {
    message: 'profileId cannot be combined with workflow-scoped tasks',
  })
export const agentListInputSchema = z.strictObject({
  parentSessionId: idSchema,
  after: idSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
})
export const agentPageSchema = z.strictObject({
  items: z.array(agentRecordSchema).max(100),
  nextCursor: idSchema.nullable(),
})

const metadata = (id: string, kind: 'command' | 'query') => ({
  id,
  version: 1,
  owner: 'hbar.agents',
  kind,
  execution: 'host' as const,
  stateEffect: kind === 'query' ? ('none' as const) : ('persistent' as const),
  category: 'agent.goal.plan',
  scope: 'session' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
})

export const agentCommands = {
  'agent.profiles.list': defineCommand(
    metadata('agent.profiles.list', 'query'),
    z.strictObject({}),
    agentProfileCatalogSchema,
  ),
  'agent.create': defineCommand(
    {
      ...metadata('agent.create', 'command'),
      idempotency: 'required',
      cli: {
        arguments: [
          { field: 'objective', type: 'string' as const, position: 0 },
          { field: 'parentSessionId', type: 'string' as const, flag: 'session' },
          { field: 'modelId', type: 'string' as const, flag: 'model' },
          { field: 'title', type: 'string' as const, flag: 'title' },
          { field: 'profileId', type: 'string' as const, flag: 'profile' },
          { field: 'tokenBudget', type: 'number' as const, flag: 'token-budget' },
          { field: 'thinkingLevel', type: 'string' as const, flag: 'thinking' },
          { field: 'approval', type: 'string' as const, flag: 'approval' },
        ],
      },
    },
    agentCreateInputSchema,
    agentRecordSchema,
  ),
  'agent.list': defineCommand(
    {
      ...metadata('agent.list', 'query'),
      cli: {
        arguments: [
          { field: 'parentSessionId', type: 'string' as const, flag: 'session' },
          { field: 'after', type: 'string' as const, flag: 'after' },
          { field: 'limit', type: 'number' as const, flag: 'limit' },
        ],
      },
    },
    agentListInputSchema,
    agentPageSchema,
  ),
  'agent.cancel': defineCommand(
    {
      ...metadata('agent.cancel', 'command'),
      cli: {
        arguments: [
          { field: 'agentId', type: 'string' as const, position: 0 },
          { field: 'parentSessionId', type: 'string' as const, flag: 'session' },
        ],
      },
    },
    z.strictObject({ parentSessionId: idSchema, agentId: idSchema }),
    agentRecordSchema,
  ),
  'agent.result.get': defineCommand(
    {
      ...metadata('agent.result.get', 'query'),
      cli: {
        arguments: [
          { field: 'agentId', type: 'string' as const, position: 0 },
          { field: 'parentSessionId', type: 'string' as const, flag: 'session' },
        ],
      },
    },
    z.strictObject({ parentSessionId: idSchema, agentId: idSchema }),
    agentRecordSchema,
  ),
  'agent.patch.apply': defineCommand(
    {
      ...metadata('agent.patch.apply', 'command'),
      idempotency: 'required',
      stateEffect: 'external',
      cli: {
        arguments: [
          { field: 'agentId', type: 'string' as const, position: 0 },
          { field: 'parentSessionId', type: 'string' as const, flag: 'session' },
          { field: 'planRevision', type: 'number' as const, flag: 'plan-revision' },
        ],
      },
    },
    z.strictObject({ parentSessionId: idSchema, agentId: idSchema, planRevision: z.number().int().positive() }),
    agentRecordSchema,
  ),
}

export type AgentRecord = z.output<typeof agentRecordSchema>
export type AgentCreateInput = z.output<typeof agentCreateInputSchema>
export type AgentPatchTask = z.output<typeof agentPatchTaskSchema>
export type AgentReviewTask = z.output<typeof agentReviewTaskSchema>
export type AgentPage = z.output<typeof agentPageSchema>
