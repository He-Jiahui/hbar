import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'

export const schemaPathSchema = z
  .array(
    z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('field'), name: z.string().min(1).max(256) }),
      z.strictObject({ kind: z.literal('item'), id: z.string().min(1).max(256) }),
    ]),
  )
  .min(1)
  .max(32)
export const settingsScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('global') }),
  z.strictObject({ kind: z.literal('workspace'), targetId: z.string().min(1).max(160) }),
  z.strictObject({ kind: z.literal('session'), targetId: z.string().min(1).max(160) }),
])
export const settingsChangeSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('set'), path: schemaPathSchema, value: z.unknown() }),
  z.strictObject({ op: z.literal('unset'), path: schemaPathSchema }),
])
const settingTypeSchema = z.enum(['string', 'integer', 'number', 'boolean'])
const settingValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
const settingsFieldSchema = z
  .strictObject({
    path: schemaPathSchema,
    type: settingTypeSchema,
    nullable: z.boolean(),
    defaultValue: settingValueSchema,
    minimum: z.number().finite().optional(),
    maximum: z.number().finite().optional(),
    choices: z.array(settingValueSchema).max(256).optional(),
    allowedScopes: z
      .array(z.enum(['global', 'workspace', 'session']))
      .min(1)
      .max(3),
    applyMode: z.enum(['immediate', 'nextRequest', 'nextRun', 'restart']),
    labelKey: z.string().startsWith('i18n:').max(256),
    helpKey: z.string().startsWith('i18n:').max(256).optional(),
    group: z.string().min(1).max(128),
    order: z.number().int().nonnegative(),
    component: z.string().regex(/^[A-Z][A-Za-z0-9.]{0,127}$/),
    multiple: z.literal(false),
    content: z
      .strictObject({
        kind: z.literal('options'),
        callbackId: z.string().regex(/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/),
        callbackVersion: z.number().int().positive(),
        dependsOn: z.array(schemaPathSchema).max(64),
      })
      .optional(),
  })
  .superRefine((field, context) => {
    const valid = (value: unknown): boolean =>
      value === null
        ? field.nullable
        : field.type === 'string'
          ? typeof value === 'string'
          : field.type === 'boolean'
            ? typeof value === 'boolean'
            : typeof value === 'number' &&
              Number.isFinite(value) &&
              (field.type !== 'integer' || Number.isSafeInteger(value)) &&
              (field.minimum === undefined || value >= field.minimum) &&
              (field.maximum === undefined || value <= field.maximum)
    if (!valid(field.defaultValue))
      context.addIssue({ code: 'custom', message: 'Setting default does not match its declared type' })
    if (
      (field.type === 'string' || field.type === 'boolean') &&
      (field.minimum !== undefined || field.maximum !== undefined)
    )
      context.addIssue({ code: 'custom', message: 'Only numeric settings accept numeric bounds' })
    if (field.minimum !== undefined && field.maximum !== undefined && field.minimum > field.maximum)
      context.addIssue({ code: 'custom', message: 'Setting minimum cannot exceed maximum' })
    if (
      field.choices &&
      (field.choices.some((choice) => choice === null || !valid(choice)) ||
        new Set(field.choices.map((choice) => `${typeof choice}:${String(choice)}`)).size !== field.choices.length)
    )
      context.addIssue({ code: 'custom', message: 'Setting choices must be unique values of the declared type' })
    if (new Set(field.allowedScopes).size !== field.allowedScopes.length)
      context.addIssue({ code: 'custom', message: 'Allowed setting scopes must be unique' })
  })
export const settingsDescriptionSchema = z
  .strictObject({
    id: z.string().min(1).max(160),
    schemaVersion: z.number().int().positive(),
    groups: z
      .array(
        z.strictObject({
          id: z.string().min(1).max(128),
          labelKey: z.string().startsWith('i18n:').max(256),
          order: z.number().int().nonnegative(),
        }),
      )
      .min(1)
      .max(64),
    fields: z.array(settingsFieldSchema).min(1).max(2_000),
  })
  .superRefine((description, context) => {
    const groupIds = description.groups.map((group) => group.id)
    if (new Set(groupIds).size !== groupIds.length)
      context.addIssue({ code: 'custom', message: 'Setting group IDs must be unique' })
    const paths = description.fields.map((field) => JSON.stringify(field.path))
    if (new Set(paths).size !== paths.length)
      context.addIssue({ code: 'custom', message: 'Setting paths must be unique' })
    const known = new Set(paths)
    const dependenciesByPath = new Map<string, readonly string[]>()
    for (const field of description.fields) {
      if (!groupIds.includes(field.group))
        context.addIssue({ code: 'custom', message: 'Every setting field must reference a declared group' })
      const dependencies = field.content?.dependsOn.map((path) => JSON.stringify(path)) ?? []
      dependenciesByPath.set(JSON.stringify(field.path), dependencies)
      if (new Set(dependencies).size !== dependencies.length || dependencies.some((path) => !known.has(path)))
        context.addIssue({ code: 'custom', message: 'Dynamic setting dependencies must be unique declared fields' })
    }
    const visited = new Set<string>()
    const active = new Set<string>()
    const visit = (path: string): boolean => {
      if (active.has(path)) return false
      if (visited.has(path)) return true
      active.add(path)
      for (const dependency of dependenciesByPath.get(path) ?? []) if (!visit(dependency)) return false
      active.delete(path)
      visited.add(path)
      return true
    }
    if (paths.some((path) => !visit(path)))
      context.addIssue({ code: 'custom', message: 'Dynamic setting dependencies cannot contain cycles' })
  })
const snapshotSchema = z.strictObject({
  schemaVersion: z.number().int().positive(),
  scope: settingsScopeSchema,
  revisions: z.record(z.string(), z.number().int().nonnegative()),
  resolution: z.strictObject({
    layers: z.array(z.strictObject({ id: z.string(), kind: z.string(), revision: z.number().int().nonnegative() })),
    reports: z.record(z.string(), z.unknown()),
  }),
})
const receiptSchema = z.strictObject({
  commitId: z.string().min(1),
  layerId: z.string().min(1),
  revision: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  values: z.record(z.string(), z.unknown()),
  resolution: snapshotSchema.shape.resolution,
})
const queryMetadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.settings',
  kind: 'query' as const,
  execution: 'host' as const,
  stateEffect: 'none' as const,
  scope: 'global' as const,
  category: 'settings.providers',
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
})
const commandMetadata = (id: string) => ({
  ...queryMetadata(id),
  kind: 'command' as const,
  stateEffect: 'persistent' as const,
  idempotency: 'required' as const,
})
const applyInput = z.strictObject({
  schemaVersion: z.number().int().positive(),
  scope: settingsScopeSchema,
  changes: z.array(settingsChangeSchema).min(1).max(1000),
  baselineRevisions: z.record(z.string(), z.number().int().nonnegative()),
})

export const settingsCommands = {
  'settings.describe': defineCommand(queryMetadata('settings.describe'), z.strictObject({}), settingsDescriptionSchema),
  'settings.get': defineCommand(
    queryMetadata('settings.get'),
    z.strictObject({ scope: settingsScopeSchema, path: schemaPathSchema.optional() }),
    snapshotSchema,
  ),
  'settings.apply': defineCommand(commandMetadata('settings.apply'), applyInput, receiptSchema),
  'settings.set': defineCommand(
    commandMetadata('settings.set'),
    z.strictObject({
      schemaVersion: z.number().int().positive(),
      scope: settingsScopeSchema,
      path: schemaPathSchema,
      value: z.unknown(),
      baselineRevisions: z.record(z.string(), z.number().int().nonnegative()),
    }),
    receiptSchema,
  ),
  'settings.unset': defineCommand(
    commandMetadata('settings.unset'),
    z.strictObject({
      schemaVersion: z.number().int().positive(),
      scope: settingsScopeSchema,
      path: schemaPathSchema,
      baselineRevisions: z.record(z.string(), z.number().int().nonnegative()),
    }),
    receiptSchema,
  ),
}

export type SettingsGetInput = z.input<(typeof settingsCommands)['settings.get']['input']>
export type SettingsApplyInput = z.input<(typeof settingsCommands)['settings.apply']['input']>
export type SettingsDescription = z.output<typeof settingsDescriptionSchema>
export type SettingsFieldDescription = z.output<typeof settingsFieldSchema>
