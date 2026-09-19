import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'

const editorIdSchema = z.string().min(1).max(512)
const summarySchema = z.strictObject({
  status: z.enum(['idle', 'loading', 'ready', 'error']),
  editorId: editorIdSchema.nullable(),
  providerId: z.string().nullable(),
  formStatus: z.enum(['idle', 'submitting', 'succeeded', 'failed', 'unknown']).nullable(),
  revision: z.number().int().nonnegative(),
  dirty: z.array(z.string()),
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

export const providerEditorCommands = {
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
}
