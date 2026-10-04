import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema, sessionBudgetSchema } from '../index'

export const setBudgetInputSchema = z.strictObject({
  sessionId: idSchema,
  tokens: z.number().int().positive().max(1_000_000_000),
  expectedRevision: z.number().int().positive().nullable().optional(),
})

export const budgetReceiptSchema = z.strictObject({
  status: z.literal('succeeded'),
  commandId: z.literal('session.setBudget'),
  commandVersion: z.literal(1),
  requestId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(128),
  eventId: idSchema,
  revision: z.number().int().positive(),
  committedAt: z.number().int().nonnegative(),
  budget: sessionBudgetSchema,
  accountingVersion: z.literal(1),
})
const budgetClearResultSchema = z.strictObject({ cleared: z.boolean() })

export type SetBudgetInput = z.output<typeof setBudgetInputSchema>
export type BudgetReceipt = z.output<typeof budgetReceiptSchema>

export const budgetCommands = {
  'session.setBudget': defineCommand(
    {
      id: 'session.setBudget',
      version: 1,
      owner: 'budget.codex',
      kind: 'command',
      execution: 'host',
      stateEffect: 'persistent',
      category: 'model.budget',
      scope: 'session',
      titleKey: 'commands.session.setBudget.title',
      descriptionKey: 'commands.session.setBudget.description',
      surfaces: ['cli', 'tui', 'api', 'palette'],
      idempotency: 'required',
      cli: {
        arguments: [
          { field: 'tokens', type: 'number', position: 0, flag: 'tokens' },
          { field: 'sessionId', type: 'string', flag: 'session' },
          { field: 'expectedRevision', type: 'number', flag: 'expected-revision' },
        ],
      },
    },
    setBudgetInputSchema,
    budgetReceiptSchema,
  ),
  'session.getBudget': defineCommand(
    {
      id: 'session.getBudget',
      version: 1,
      owner: 'budget.codex',
      kind: 'query',
      execution: 'host',
      stateEffect: 'none',
      category: 'model.budget',
      scope: 'session',
      titleKey: 'commands.session.getBudget.title',
      descriptionKey: 'commands.session.getBudget.description',
      surfaces: ['cli', 'tui', 'api', 'palette'],
      cli: { arguments: [{ field: 'sessionId', type: 'string', position: 0, flag: 'session' }] },
    },
    z.strictObject({ sessionId: idSchema }),
    sessionBudgetSchema.nullable(),
  ),
  'session.clearBudget': defineCommand(
    {
      id: 'session.clearBudget',
      version: 1,
      owner: 'budget.codex',
      kind: 'command',
      execution: 'host',
      stateEffect: 'persistent',
      category: 'model.budget',
      scope: 'session',
      titleKey: 'commands.session.clearBudget.title',
      descriptionKey: 'commands.session.clearBudget.description',
      surfaces: ['cli', 'tui', 'api', 'palette'],
      cli: { arguments: [{ field: 'sessionId', type: 'string', position: 0, flag: 'session' }] },
    },
    z.strictObject({ sessionId: idSchema }),
    budgetClearResultSchema,
  ),
}
