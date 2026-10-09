import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { settingsScopeSchema } from './settings'

const formIdSchema = z.string().min(1).max(512)
const fieldNameSchema = z.string().min(1).max(1_024)
const fieldValueSchema = z.union([
  z.string().max(8_192),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string().max(8_192), z.number().finite(), z.boolean()])).max(256),
])
const summarySchema = z.strictObject({
  formId: formIdSchema,
  scope: settingsScopeSchema,
  status: z.enum(['loading', 'ready', 'error']),
  formStatus: z.enum(['idle', 'submitting', 'succeeded', 'failed', 'unknown']).nullable(),
  revision: z.number().int().nonnegative(),
  dirty: z.array(z.string()),
  unsets: z.array(z.string()),
  issues: z.array(z.strictObject({ field: z.string(), code: z.enum(['required', 'invalid']) })),
  error: z.string().nullable(),
  selectedGroup: z.string().nullable(),
})
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.settings-form',
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

export const settingsEditorCommands = {
  'settingsForm.batch': defineCommand(
    metadata('settingsForm.batch'),
    z
      .strictObject({
        formId: formIdSchema,
        changes: z
          .array(
            z.discriminatedUnion('op', [
              z.strictObject({ op: z.literal('set'), field: fieldNameSchema, value: fieldValueSchema }),
              z.strictObject({ op: z.literal('reset'), field: fieldNameSchema }),
              z.strictObject({ op: z.literal('inherit'), field: fieldNameSchema }),
            ]),
          )
          .min(1)
          .max(8),
      })
      .superRefine((input, context) => {
        if (new Set(input.changes.map((change) => change.field)).size !== input.changes.length)
          context.addIssue({ code: 'custom', message: 'Batch setting fields must be unique' })
      }),
    summarySchema,
  ),
  'settingsForm.selectGroup': defineCommand(
    metadata('settingsForm.selectGroup'),
    z.strictObject({ formId: formIdSchema, groupId: z.string().min(1).max(128) }),
    summarySchema,
  ),
  'settingsForm.refresh': defineCommand(
    metadata('settingsForm.refresh'),
    z.strictObject({ formId: formIdSchema }),
    summarySchema,
  ),
  'settingsForm.refreshContent': defineCommand(
    metadata('settingsForm.refreshContent'),
    z.strictObject({
      formId: formIdSchema,
      // A user retry belongs to the failed field's original view. Background
      // provider invalidation omits this guard and can refresh retained forms.
      retry: z
        .strictObject({
          field: z.string().min(1).max(1_024),
          revision: z.number().int().nonnegative(),
          groupId: z.string().min(1).max(128),
        })
        .optional(),
    }),
    summarySchema,
  ),
  'settingsForm.setField': defineCommand(
    metadata('settingsForm.setField'),
    z.strictObject({
      formId: formIdSchema,
      field: z.string().min(1).max(1_024),
      value: z.union([
        z.string().max(8_192),
        z.number().finite(),
        z.boolean(),
        z.null(),
        z.array(z.union([z.string().max(8_192), z.number().finite(), z.boolean()])).max(256),
      ]),
    }),
    summarySchema,
  ),
  'settingsForm.pickResource': defineCommand(
    {
      ...metadata('settingsForm.pickResource'),
      cancelMode: 'cooperative',
      timeoutMs: 5 * 60_000,
      maxConcurrent: 1,
    },
    z.strictObject({ formId: formIdSchema, field: z.string().min(1).max(1_024) }),
    summarySchema,
  ),
  'settingsForm.resetField': defineCommand(
    metadata('settingsForm.resetField'),
    z.strictObject({ formId: formIdSchema, field: z.string().min(1).max(1_024) }),
    summarySchema,
  ),
  'settingsForm.restoreInheritance': defineCommand(
    metadata('settingsForm.restoreInheritance'),
    z.strictObject({ formId: formIdSchema, field: z.string().min(1).max(1_024) }),
    summarySchema,
  ),
  'settingsForm.submit': defineCommand(
    metadata('settingsForm.submit'),
    z.strictObject({ formId: formIdSchema }),
    summarySchema,
  ),
  'settingsForm.reconcile': defineCommand(
    metadata('settingsForm.reconcile'),
    z.strictObject({ formId: formIdSchema }),
    summarySchema,
  ),
}
