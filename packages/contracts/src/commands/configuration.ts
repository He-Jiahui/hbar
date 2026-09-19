import { z } from 'zod'
import { defineCommand, type CommandMetadataInput } from '@hbar/commands/protocol'
import { approvalModeSchema, idSchema, providerInputSchema, runModeSchema, thinkingLevelSchema } from '../index'
import { modelDescriptorSchema } from './models'

const permissionResultSchema = z.strictObject({ mode: approvalModeSchema })
const modeResultSchema = z.strictObject({ mode: runModeSchema })
const providerIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
const deleteResultSchema = z.strictObject({ deleted: z.boolean() })
const providerProfileSchema = z.strictObject({ provider: providerInputSchema, hasKey: z.boolean() })
const providerPresetProtocolSchema = z.enum(['openai-completions', 'openai-responses', 'anthropic-messages'])
const providerPresetSummarySchema = z.strictObject({
  id: z.string().min(1).max(160),
  providerId: providerIdSchema,
  name: z.string().min(1).max(160),
  protocol: providerPresetProtocolSchema,
  baseUrl: z.string().min(1).max(2_048),
  requiresBaseUrlConfiguration: z.boolean(),
  modelCount: z.number().int().nonnegative().max(10_000),
})
const providerPresetModelSchema = z.strictObject({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  contextWindow: z.number().int().min(1_024).max(10_000_000),
  maxOutput: z.number().int().min(64).max(10_000_000),
  imageInput: z.boolean(),
  reasoning: z.boolean(),
  inputPrice: z.number().nonnegative(),
  outputPrice: z.number().nonnegative(),
  thinkingLevels: z.array(thinkingLevelSchema).min(1).max(7),
  defaultThinkingLevel: thinkingLevelSchema,
})
const providerPresetListInputSchema = z.strictObject({
  query: z.string().trim().max(100).optional(),
  cursor: z.string().regex(/^\d+$/).max(12).optional(),
  limit: z.number().int().min(1).max(100).default(50),
})
const providerPresetModelsInputSchema = z.strictObject({
  presetId: z.string().min(1).max(160),
  query: z.string().trim().max(100).optional(),
  cursor: z.string().regex(/^\d+$/).max(12).optional(),
  limit: z.number().int().min(1).max(100).default(50),
})
const providerPresetListResultSchema = z.strictObject({
  items: z.array(providerPresetSummarySchema).max(100),
  nextCursor: z.string().regex(/^\d+$/).max(12).nullable(),
  catalogGeneratedAt: z.number().int().nonnegative().nullable(),
})
const providerPresetModelsResultSchema = z.strictObject({
  preset: providerPresetSummarySchema,
  items: z.array(providerPresetModelSchema).max(100),
  nextCursor: z.string().regex(/^\d+$/).max(12).nullable(),
  catalogGeneratedAt: z.number().int().nonnegative().nullable(),
})
const providerEditorDescriptionSchema = z.strictObject({
  id: z.string().min(1).max(160),
  version: z.number().int().positive(),
  fields: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(128),
        type: z.enum(['string', 'integer', 'number', 'boolean']),
        required: z.boolean(),
        nullable: z.boolean(),
        labelKey: z.string().startsWith('i18n:').max(256),
        helpKey: z.string().startsWith('i18n:').max(256).optional(),
        component: z.string().regex(/^[A-Z][A-Za-z0-9.]{0,127}$/),
        order: z.number().int().nonnegative(),
        readOnlyOnEdit: z.boolean(),
        sensitive: z.boolean(),
        minimum: z.number().finite().optional(),
        maximum: z.number().finite().optional(),
        minLength: z.number().int().nonnegative().optional(),
        maxLength: z.number().int().positive().optional(),
        choices: z
          .array(z.union([z.string(), z.number(), z.boolean()]))
          .max(64)
          .optional(),
        defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
      }),
    )
    .min(1)
    .max(64),
})

function metadata(
  id: string,
  kind: 'command' | 'query',
  scope: 'global' | 'session',
  category: string,
  owner: string,
): CommandMetadataInput {
  return {
    id,
    version: 1,
    owner,
    kind,
    execution: 'host',
    stateEffect: kind === 'query' ? 'none' : 'persistent',
    category,
    scope,
    titleKey: `commands.${id}.title`,
    descriptionKey: `commands.${id}.description`,
    surfaces: ['cli', 'tui', 'api', 'palette'],
  }
}

export const configurationCommands = {
  'provider.describe': defineCommand(
    metadata('provider.describe', 'query', 'global', 'settings.providers', 'hbar.providers'),
    z.strictObject({}),
    providerEditorDescriptionSchema,
  ),
  'provider.list': defineCommand(
    metadata('provider.list', 'query', 'global', 'settings.providers', 'hbar.providers'),
    z.strictObject({}),
    z.array(providerProfileSchema).max(256),
  ),
  'provider.preset.list': defineCommand(
    metadata('provider.preset.list', 'query', 'global', 'settings.providers', 'hbar.providers'),
    providerPresetListInputSchema,
    providerPresetListResultSchema,
  ),
  'provider.preset.models': defineCommand(
    metadata('provider.preset.models', 'query', 'global', 'settings.providers', 'hbar.providers'),
    providerPresetModelsInputSchema,
    providerPresetModelsResultSchema,
  ),
  'permission.get': defineCommand(
    metadata('permission.get', 'query', 'global', 'run.approval', 'hbar.permissions'),
    z.strictObject({}),
    permissionResultSchema,
  ),
  'permission.set': defineCommand(
    {
      ...metadata('permission.set', 'command', 'global', 'run.approval', 'hbar.permissions'),
      cli: { arguments: [{ field: 'mode', type: 'string', position: 0 }] },
    },
    z.strictObject({ mode: approvalModeSchema }),
    permissionResultSchema,
  ),
  'mode.get': defineCommand(
    {
      ...metadata('mode.get', 'query', 'session', 'agent.goal.plan', 'hbar.plan'),
      cli: { arguments: [{ field: 'sessionId', type: 'string', flag: 'session' }] },
    },
    z.strictObject({ sessionId: idSchema }),
    modeResultSchema,
  ),
  'mode.set': defineCommand(
    {
      ...metadata('mode.set', 'command', 'session', 'agent.goal.plan', 'hbar.plan'),
      cli: {
        arguments: [
          { field: 'mode', type: 'string', position: 0 },
          { field: 'sessionId', type: 'string', flag: 'session' },
        ],
      },
    },
    z.strictObject({ sessionId: idSchema, mode: runModeSchema }),
    modeResultSchema,
  ),
  'provider.save': defineCommand(
    metadata('provider.save', 'command', 'global', 'settings.providers', 'hbar.providers'),
    z.strictObject({ provider: providerInputSchema, apiKey: z.string().max(8192).optional() }),
    modelDescriptorSchema,
  ),
  'provider.delete': defineCommand(
    {
      ...metadata('provider.delete', 'command', 'global', 'settings.providers', 'hbar.providers'),
      cli: { arguments: [{ field: 'id', type: 'string', position: 0 }] },
    },
    z.strictObject({ id: providerIdSchema }),
    deleteResultSchema,
  ),
}

export type ProviderProfile = z.output<typeof providerProfileSchema>
export type ProviderEditorDescription = z.output<typeof providerEditorDescriptionSchema>
export type ProviderPresetSummary = z.output<typeof providerPresetSummarySchema>
export type ProviderPresetModel = z.output<typeof providerPresetModelSchema>
export type ProviderPresetListInput = z.input<typeof providerPresetListInputSchema>
export type ProviderPresetModelsInput = z.input<typeof providerPresetModelsInputSchema>
export type ProviderPresetListResult = z.output<typeof providerPresetListResultSchema>
export type ProviderPresetModelsResult = z.output<typeof providerPresetModelsResultSchema>
