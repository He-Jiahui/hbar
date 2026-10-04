import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
)
const jsonObjectSchema = z.record(z.string(), jsonValueSchema)
const revisionSchema = z.number().int().nonnegative()
const metadata = (id: string, category: string) => ({
  id,
  version: 1,
  owner: 'hbar.app-runtime',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  category,
  scope: 'client' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
})

const layoutResultSchema = z.strictObject({
  revision: revisionSchema,
  source: z.enum(['default', 'saved', 'current']),
  persisted: z.boolean(),
  description: jsonObjectSchema,
})
const preferencesResultSchema = z.strictObject({
  revision: revisionSchema,
  persisted: z.boolean(),
  values: jsonObjectSchema,
})

export const clientPersistenceCommands = {
  'layout.commit': defineCommand(
    {
      ...metadata('layout.commit', 'app.layout'),
      cli: {
        arguments: [
          { field: 'description', type: 'json', position: 0, flag: 'description' },
          { field: 'expectedRevision', type: 'number', flag: 'revision' },
        ],
      },
    },
    z.strictObject({ description: jsonObjectSchema, expectedRevision: revisionSchema.optional() }),
    layoutResultSchema,
  ),
  'layout.restore': defineCommand(
    {
      ...metadata('layout.restore', 'app.layout'),
      cli: { arguments: [{ field: 'source', type: 'string', position: 0, flag: 'source' }] },
    },
    z.strictObject({ source: z.enum(['saved', 'default']).default('saved') }),
    layoutResultSchema,
  ),
  'preferences.set': defineCommand(
    {
      ...metadata('preferences.set', 'app.preferences'),
      cli: {
        arguments: [
          { field: 'key', type: 'string', position: 0 },
          { field: 'value', type: 'json', position: 1, flag: 'value' },
          { field: 'expectedRevision', type: 'number', flag: 'revision' },
        ],
      },
    },
    z.strictObject({
      key: z
        .string()
        .min(1)
        .max(160)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
      value: jsonValueSchema,
      expectedRevision: revisionSchema.optional(),
    }),
    preferencesResultSchema,
  ),
  'preferences.unset': defineCommand(
    {
      ...metadata('preferences.unset', 'app.preferences'),
      cli: {
        arguments: [
          { field: 'key', type: 'string', position: 0 },
          { field: 'expectedRevision', type: 'number', flag: 'revision' },
        ],
      },
    },
    z.strictObject({
      key: z
        .string()
        .min(1)
        .max(160)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
      expectedRevision: revisionSchema.optional(),
    }),
    preferencesResultSchema,
  ),
}
