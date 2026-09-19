import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'

const commandIdSchema = z.string().min(1).max(128)
const summarySchema = z.strictObject({
  status: z.enum(['idle', 'loading', 'ready', 'error']),
  query: z.string().max(256),
  selectedId: commandIdSchema.nullable(),
  itemCount: z.number().int().nonnegative(),
  selectionLost: z.boolean(),
  executionStatus: z.enum(['idle', 'submitting', 'succeeded', 'failed', 'unknown']),
  error: z.string().nullable(),
})

function metadata(id: string) {
  return {
    id,
    version: 1,
    owner: 'hbar.command-palette',
    kind: 'command' as const,
    execution: 'client' as const,
    stateEffect: 'application' as const,
    category: 'app.navigation',
    scope: 'client' as const,
    visibility: 'internal' as const,
    titleKey: `commands.${id}.title`,
    descriptionKey: `commands.${id}.description`,
    surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
  }
}

export const commandPaletteCommands = {
  'commandPalette.refresh': defineCommand(metadata('commandPalette.refresh'), z.strictObject({}), summarySchema),
  'commandPalette.setQuery': defineCommand(
    metadata('commandPalette.setQuery'),
    z.strictObject({ query: z.string().max(256) }),
    summarySchema,
  ),
  'commandPalette.select': defineCommand(
    metadata('commandPalette.select'),
    z.strictObject({ commandId: commandIdSchema }),
    summarySchema,
  ),
  'commandPalette.move': defineCommand(
    metadata('commandPalette.move'),
    z.strictObject({ direction: z.union([z.literal(-1), z.literal(1)]) }),
    summarySchema,
  ),
  'commandPalette.setParameter': defineCommand(
    metadata('commandPalette.setParameter'),
    z.strictObject({
      field: z.string().min(1).max(128),
      value: z.union([z.string().max(65_536), z.boolean()]),
    }),
    summarySchema,
  ),
  'commandPalette.unsetParameter': defineCommand(
    metadata('commandPalette.unsetParameter'),
    z.strictObject({ field: z.string().min(1).max(128) }),
    summarySchema,
  ),
  'commandPalette.resetParameters': defineCommand(
    metadata('commandPalette.resetParameters'),
    z.strictObject({}),
    summarySchema,
  ),
  'commandPalette.execute': defineCommand(metadata('commandPalette.execute'), z.strictObject({}), summarySchema),
}

export type CommandPaletteSummary = z.output<typeof summarySchema>
