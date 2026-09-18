import { z } from 'zod'
import { defineCommand, type CommandMetadataInput } from '@hbar/commands/protocol'
import { approvalModeSchema, idSchema, providerInputSchema, runModeSchema } from '../index'
import { modelDescriptorSchema } from './models'

const permissionResultSchema = z.strictObject({ mode: approvalModeSchema })
const modeResultSchema = z.strictObject({ mode: runModeSchema })
const providerIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
const deleteResultSchema = z.strictObject({ deleted: z.boolean() })
const providerProfileSchema = z.strictObject({ provider: providerInputSchema, hasKey: z.boolean() })
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
