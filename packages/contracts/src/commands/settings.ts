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
