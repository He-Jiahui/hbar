import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema, thinkingLevelSchema } from '../index'

export const DEFAULT_COMPACTION_PERCENT = 80
export const MIN_COMPACTION_PERCENT = 30
export const MAX_COMPACTION_PERCENT = 95
export const COMPACTION_PERCENT_SETTING = 'context.compactionPercent'

/** Current retained context, never cumulative usage accounting. Counts are Host estimates. */
export const sessionContextUsageSchema = z.strictObject({
  sessionId: idSchema,
  modelId: idSchema.nullable(),
  status: z.enum(['available', 'no-model']),
  estimated: z.literal(true),
  inputTokens: z.number().int().nonnegative().nullable(),
  contextWindow: z.number().int().positive().nullable(),
  outputReserve: z.number().int().nonnegative().nullable(),
  compactionPercent: z.number().min(MIN_COMPACTION_PERCENT).max(MAX_COMPACTION_PERCENT),
  /** Input threshold after allowing room for the model's maximum output. */
  compactionTokens: z.number().int().nonnegative().nullable(),
  remainingTokens: z.number().int().nonnegative().nullable(),
  observedAt: z.number().int().nonnegative(),
})

export const modelDescriptorSchema = z.strictObject({
  id: idSchema,
  providerId: idSchema,
  providerName: z.string().min(1).max(100),
  modelId: idSchema,
  modelName: z.string().min(1).max(160),
  description: z.string().max(160).optional(),
  contextWindow: z.number().int().positive(),
  maxOutput: z.number().int().positive(),
  imageInput: z.boolean(),
  reasoning: z.boolean(),
  thinkingLevels: z.array(thinkingLevelSchema).min(1).max(7),
  defaultThinkingLevel: thinkingLevelSchema,
  hasKey: z.boolean(),
  /** True only for the provider's configured primary model. */
  primary: z.boolean().optional(),
  /** Provider readiness for executing a new run. Mock/demo providers are executable without credentials. */
  canExecute: z.boolean().optional(),
})
/** Preserve a legacy provider-only setting only when the catalog identifies its primary model. */
export function canonicalModelDescriptorId(models: readonly ModelDescriptor[], selectionId: string): string {
  if (models.some((model) => model.id === selectionId)) return selectionId
  return models.find((model) => model.providerId === selectionId && model.primary === true)?.id ?? selectionId
}
export const modelConfigurationSchema = z.strictObject({
  sessionId: idSchema,
  status: z.enum(['unset', 'configured', 'unavailable']),
  modelId: idSchema.nullable(),
  model: modelDescriptorSchema.nullable(),
  thinkingLevel: thinkingLevelSchema.nullable(),
  revisions: z.record(z.string(), z.number().int().nonnegative()),
  sources: z.strictObject({ model: z.string(), thinkingLevel: z.string() }),
})
export const modelWriteResultSchema = modelConfigurationSchema.extend({
  commitId: idSchema,
  revision: z.number().int().positive(),
})
/** Historical settings receipt, not the current catalog/configuration projection. */
export const modelReceiptSchema = z.strictObject({
  sessionId: idSchema,
  idempotencyKey: idSchema,
  commitId: idSchema,
  revision: z.number().int().positive(),
  modelId: idSchema.nullable(),
  thinkingLevel: thinkingLevelSchema.nullable(),
  revisions: z.record(z.string(), z.number().int().nonnegative()),
})
const metadata = (id: string, kind: 'command' | 'query', scope: 'global' | 'session') => ({
  id,
  version: 1,
  owner: 'hbar.models',
  kind,
  execution: 'host' as const,
  stateEffect: kind === 'query' ? ('none' as const) : ('persistent' as const),
  category: 'model.configuration',
  scope,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
  ...(kind === 'command' ? { idempotency: 'required' as const } : {}),
})

export const modelCommands = {
  'model.list': defineCommand(
    metadata('model.list', 'query', 'global'),
    z.strictObject({}),
    z.array(modelDescriptorSchema).max(4096),
  ),
  'session.getModel': defineCommand(
    {
      ...metadata('session.getModel', 'query', 'session'),
      cli: { arguments: [{ field: 'sessionId', type: 'string' as const, flag: 'session' }] },
    },
    z.strictObject({ sessionId: idSchema }),
    modelConfigurationSchema,
  ),
  'session.getContextUsage': defineCommand(
    {
      ...metadata('session.getContextUsage', 'query', 'session'),
      cli: { arguments: [{ field: 'sessionId', type: 'string' as const, flag: 'session' }] },
    },
    z.strictObject({ sessionId: idSchema }),
    sessionContextUsageSchema,
  ),
  'session.getModelReceipt': defineCommand(
    {
      ...metadata('session.getModelReceipt', 'query', 'session'),
      visibility: 'internal' as const,
      surfaces: ['api'] as ('cli' | 'tui' | 'api' | 'palette')[],
    },
    z.strictObject({ sessionId: idSchema, idempotencyKey: idSchema }),
    modelReceiptSchema.nullable(),
  ),
  'session.setModel': defineCommand(
    {
      ...metadata('session.setModel', 'command', 'session'),
      cli: {
        arguments: [
          { field: 'sessionId', type: 'string' as const, flag: 'session' },
          { field: 'modelId', type: 'string' as const, position: 0 },
        ],
      },
    },
    z.strictObject({
      sessionId: idSchema,
      modelId: idSchema,
      baselineRevisions: z.record(z.string(), z.number().int().nonnegative()),
    }),
    modelWriteResultSchema,
  ),
  'session.setThinkingLevel': defineCommand(
    {
      ...metadata('session.setThinkingLevel', 'command', 'session'),
      cli: {
        arguments: [
          { field: 'sessionId', type: 'string' as const, flag: 'session' },
          { field: 'thinkingLevel', type: 'string' as const, position: 0 },
        ],
      },
    },
    z.strictObject({
      sessionId: idSchema,
      thinkingLevel: thinkingLevelSchema,
      baselineRevisions: z.record(z.string(), z.number().int().nonnegative()),
    }),
    modelWriteResultSchema,
  ),
}

export type ModelDescriptor = z.output<typeof modelDescriptorSchema>
export type ModelConfiguration = z.output<typeof modelConfigurationSchema>
export type ModelWriteResult = z.output<typeof modelWriteResultSchema>
export type ModelReceipt = z.output<typeof modelReceiptSchema>
export type SessionContextUsage = z.output<typeof sessionContextUsageSchema>
