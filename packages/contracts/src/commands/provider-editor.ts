import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { thinkingLevelSchema } from '../index'

const editorIdSchema = z.string().min(1).max(512)
const providerIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
const summarySchema = z.strictObject({
  status: z.enum(['idle', 'loading', 'ready', 'error']),
  editorId: editorIdSchema.nullable(),
  providerId: z.string().nullable(),
  formStatus: z.enum(['idle', 'submitting', 'succeeded', 'failed', 'unknown']).nullable(),
  revision: z.number().int().nonnegative(),
  dirty: z.array(z.string()),
  error: z.string().nullable(),
})
const globalDefaultActionSchema = z.strictObject({
  status: z.enum(['idle', 'submitting', 'succeeded', 'failed', 'unknown']),
  providerId: providerIdSchema.nullable(),
  modelSelectionId: z.string().min(1).max(512).nullable(),
  error: z.string().nullable(),
})
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.provider-editor',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'client' as const,
  category: 'settings.providers',
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})
const providerFieldSchema = z.enum(['id', 'name', 'visible', 'protocol', 'baseUrl'])
const modelFieldSchema = z.enum([
  'id',
  'name',
  'description',
  'visible',
  'contextWindow',
  'maxOutput',
  'imageInput',
  'reasoning',
  'inputPrice',
  'outputPrice',
  'defaultThinkingLevel',
])
const editorTargetSchema = z.strictObject({ editorId: editorIdSchema })
const contextTargetSchema = editorTargetSchema.extend({ modelId: z.string().min(1).max(160) })
const contextFieldSchema = z.enum([
  'contextWindow',
  'inputTokensAbove',
  'inputPrice',
  'outputPrice',
  'cacheReadPrice',
  'cacheWritePrice',
  'maxModePricingMultiplier',
])

export const providerEditorCommands = {
  'providerEditor.addContextTier': defineCommand(
    metadata('providerEditor.addContextTier'),
    contextTargetSchema,
    summarySchema,
  ),
  'providerEditor.removeContextTier': defineCommand(
    metadata('providerEditor.removeContextTier'),
    contextTargetSchema.extend({ tierId: z.string().min(1).max(64) }),
    summarySchema,
  ),
  'providerEditor.setContextField': defineCommand(
    metadata('providerEditor.setContextField'),
    contextTargetSchema.extend({
      tierId: z.string().min(1).max(64).optional(),
      field: contextFieldSchema,
      value: z.number().finite().nullable(),
    }),
    summarySchema,
  ),
  'providerEditor.refresh': defineCommand(metadata('providerEditor.refresh'), z.strictObject({}), summarySchema),
  'providerEditor.setField': defineCommand(
    metadata('providerEditor.setField'),
    z.strictObject({
      editorId: editorIdSchema,
      field: z.string().min(1).max(128),
      value: z.union([z.string().max(8_192), z.boolean(), z.null()]),
    }),
    summarySchema,
  ),
  'providerEditor.resetField': defineCommand(
    metadata('providerEditor.resetField'),
    z.strictObject({ editorId: editorIdSchema, field: z.string().min(1).max(128) }),
    summarySchema,
  ),
  'providerEditor.save': defineCommand(
    metadata('providerEditor.save'),
    z.strictObject({ editorId: editorIdSchema }),
    summarySchema,
  ),
  'providerEditor.reconcile': defineCommand(
    metadata('providerEditor.reconcile'),
    z.strictObject({ editorId: editorIdSchema }),
    summarySchema,
  ),
  'providerEditor.delete': defineCommand(
    metadata('providerEditor.delete'),
    z.strictObject({ providerId: z.string().min(1).max(64) }),
    summarySchema,
  ),
  'providerEditor.setProviderField': defineCommand(
    metadata('providerEditor.setProviderField'),
    z.strictObject({
      editorId: editorIdSchema,
      field: providerFieldSchema,
      value: z.union([z.string().max(2_048), z.boolean()]),
    }),
    summarySchema,
  ),
  'providerEditor.selectModel': defineCommand(
    metadata('providerEditor.selectModel'),
    z.strictObject({ editorId: editorIdSchema, modelId: z.string().min(1).max(160) }),
    summarySchema,
  ),
  'providerEditor.setDefaultModel': defineCommand(
    metadata('providerEditor.setDefaultModel'),
    z.strictObject({ editorId: editorIdSchema, modelId: z.string().min(1).max(160) }),
    summarySchema,
  ),
  'providerEditor.setGlobalDefault': defineCommand(
    metadata('providerEditor.setGlobalDefault'),
    z.strictObject({ providerId: providerIdSchema }),
    globalDefaultActionSchema,
  ),
  'providerEditor.reconcileGlobalDefault': defineCommand(
    metadata('providerEditor.reconcileGlobalDefault'),
    z.strictObject({}),
    globalDefaultActionSchema,
  ),
  'providerEditor.addModel': defineCommand(
    metadata('providerEditor.addModel'),
    z.strictObject({ editorId: editorIdSchema, modelId: z.string().min(1).max(160) }),
    summarySchema,
  ),
  'providerEditor.removeModel': defineCommand(
    metadata('providerEditor.removeModel'),
    z.strictObject({ editorId: editorIdSchema, modelId: z.string().min(1).max(160) }),
    summarySchema,
  ),
  'providerEditor.setModelField': defineCommand(
    metadata('providerEditor.setModelField'),
    z.strictObject({
      editorId: editorIdSchema,
      modelId: z.string().min(1).max(160),
      field: modelFieldSchema,
      value: z.union([z.string().max(512), z.number().finite(), z.boolean()]),
    }),
    summarySchema,
  ),
  'providerEditor.setModelThinkingLevels': defineCommand(
    metadata('providerEditor.setModelThinkingLevels'),
    z.strictObject({
      editorId: editorIdSchema,
      modelId: z.string().min(1).max(160),
      thinkingLevels: z.array(thinkingLevelSchema).min(1).max(7),
    }),
    summarySchema,
  ),
  'providerEditor.resetDraft': defineCommand(metadata('providerEditor.resetDraft'), editorTargetSchema, summarySchema),
  'providerEditor.loadPresets': defineCommand(
    metadata('providerEditor.loadPresets'),
    z.strictObject({
      editorId: editorIdSchema,
      query: z.string().trim().max(100).optional(),
      cursor: z.string().regex(/^\d+$/).max(12).optional(),
      append: z.boolean().default(false),
    }),
    summarySchema,
  ),
  'providerEditor.applyPreset': defineCommand(
    metadata('providerEditor.applyPreset'),
    z.strictObject({ editorId: editorIdSchema, presetId: z.string().min(1).max(160) }),
    summarySchema,
  ),
  'providerEditor.loadPresetModels': defineCommand(
    metadata('providerEditor.loadPresetModels'),
    z.strictObject({
      editorId: editorIdSchema,
      presetId: z.string().min(1).max(160),
      query: z.string().trim().max(100).optional(),
      cursor: z.string().regex(/^\d+$/).max(12).optional(),
      append: z.boolean().default(false),
    }),
    summarySchema,
  ),
  'providerEditor.addPresetModel': defineCommand(
    metadata('providerEditor.addPresetModel'),
    z.strictObject({
      editorId: editorIdSchema,
      presetId: z.string().min(1).max(160),
      modelId: z.string().min(1).max(160),
    }),
    summarySchema,
  ),
}

export type ProviderGlobalDefaultAction = z.output<typeof globalDefaultActionSchema>
