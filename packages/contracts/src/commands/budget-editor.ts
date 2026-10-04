import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'
import { budgetReceiptSchema } from './budget'

const formIdSchema = z.string().min(1).max(128)
const formSummarySchema = z.strictObject({
  formId: formIdSchema,
  sessionId: idSchema,
  revision: z.number().int().nonnegative(),
  status: z.enum(['idle', 'submitting', 'succeeded', 'failed', 'unknown']),
  dirty: z.array(z.string()),
  issues: z.array(z.strictObject({ field: z.string(), code: z.enum(['required', 'invalid']) })),
})
const metadata = (id: string, category = 'model.budget') => ({
  id,
  version: 1,
  owner: 'hbar.budget-editor',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'client' as const,
  category,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['tui', 'api', 'palette'] as ('tui' | 'api' | 'palette')[],
})

export const budgetEditorCommands = {
  'app.openCommandForm': defineCommand(
    metadata('app.openCommandForm', 'app.navigation'),
    z.strictObject({ commandId: z.literal('session.setBudget'), sessionId: idSchema, formId: formIdSchema }),
    formSummarySchema,
  ),
  'app.closeCommandForm': defineCommand(
    metadata('app.closeCommandForm', 'app.navigation'),
    z.strictObject({ formId: formIdSchema }),
    z.strictObject({ closed: z.boolean() }),
  ),
  'form.setField': defineCommand(
    metadata('form.setField'),
    z.strictObject({
      formId: formIdSchema,
      field: z.enum(['tokens', 'expectedRevision']),
      value: z.string().max(8192).nullable(),
    }),
    formSummarySchema,
  ),
  'form.resetField': defineCommand(
    metadata('form.resetField'),
    z.strictObject({ formId: formIdSchema, field: z.enum(['tokens', 'expectedRevision']) }),
    formSummarySchema,
  ),
  'form.submit': defineCommand(metadata('form.submit'), z.strictObject({ formId: formIdSchema }), budgetReceiptSchema),
  'form.reconcile': defineCommand(
    metadata('form.reconcile'),
    z.strictObject({ formId: formIdSchema }),
    budgetReceiptSchema.nullable(),
  ),
}
