import { z } from 'zod'
import { workflowCheckpointInputSchema, workflowExpandScopeInputSchema } from '@hbar/contracts/commands/workflows'

// Keep action validation authoritative, but advertise an object with visible
// properties: root unions are not portable function parameter schemas.
export const workflowUpdateActionSchema = z.discriminatedUnion('action', [
  workflowExpandScopeInputSchema
    .omit({ sessionId: true })
    .extend({ action: z.literal('expand_scope') })
    .strip(),
  workflowCheckpointInputSchema
    .omit({ sessionId: true })
    .extend({ action: z.literal('checkpoint') })
    .strip(),
  z.object({ action: z.literal('complete'), expectedRevision: z.number().int().positive() }),
])

const scopeFields = workflowExpandScopeInputSchema.shape
const checkpointFields = workflowCheckpointInputSchema.shape

export const workflowExpandScopeToolSchema = workflowExpandScopeInputSchema.omit({ sessionId: true })
export const workflowCheckpointToolSchema = workflowCheckpointInputSchema
  .omit({ sessionId: true, expectedRevision: true, nextItemId: true })
  .extend({
    evidenceIds: checkpointFields.evidenceIds.unwrap().optional(),
    expectedFocusRevision: z.number().int().positive(),
    expectedPlanRevision: z.number().int().positive(),
  })

export const workflowUpdateToolSchema = z
  .strictObject({
    action: z.enum(['expand_scope', 'checkpoint', 'complete']),
    expectedRevision: scopeFields.expectedRevision,
    itemId: scopeFields.itemId.optional().describe('Required for expand_scope and checkpoint.'),
    scope: scopeFields.scope.optional().describe('Required for expand_scope; only authorized paths and tools.'),
    reason: scopeFields.reason.optional().describe('Required for expand_scope.'),
    outcome: checkpointFields.outcome.optional().describe('Required for checkpoint.'),
    summary: checkpointFields.summary.optional().describe('Required for checkpoint.'),
    evidenceIds: checkpointFields.evidenceIds.unwrap().optional().describe('For checkpoint; defaults to [].'),
    nextItemId: checkpointFields.nextItemId.describe('Optional for checkpoint only.'),
  })
  // Some compatible providers fill every advertised property. Validate all
  // known fields, then select only the chosen action; never forward fields
  // from another action or relax the strict public command contracts.
  .superRefine((value, context) => {
    const parsed = workflowUpdateActionSchema.safeParse(value)
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        context.addIssue({ code: 'custom', path: issue.path, message: issue.message })
  })
