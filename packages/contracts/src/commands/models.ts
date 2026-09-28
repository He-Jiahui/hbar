import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema, thinkingLevelSchema } from '../index'

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
})
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
