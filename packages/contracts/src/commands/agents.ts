import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { approvalModeSchema, idSchema, thinkingLevelSchema } from '../index'

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
export const agentRecordSchema = z.strictObject({
  agentId: idSchema,
  parentSessionId: idSchema,
  sessionId: idSchema,
  runId: idSchema.nullable(),
  requestId: idSchema,
  objective: z.string().min(1).max(4_000),
  modelId: idSchema,
  tokenBudget: z.number().int().positive().max(1_000_000_000).nullable(),
  status: agentStatusSchema,
  error: z.string().max(4_000).nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export const agentCreateInputSchema = z.strictObject({
  parentSessionId: idSchema,
  objective: z.string().trim().min(1).max(4_000),
  modelId: idSchema,
  title: z.string().trim().min(1).max(160).optional(),
  tokenBudget: z.number().int().positive().max(1_000_000_000).optional(),
  thinkingLevel: thinkingLevelSchema.optional(),
  approval: approvalModeSchema.default('deny'),
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
}

export type AgentRecord = z.output<typeof agentRecordSchema>
export type AgentCreateInput = z.output<typeof agentCreateInputSchema>
export type AgentPage = z.output<typeof agentPageSchema>
