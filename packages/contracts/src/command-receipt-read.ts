import { z } from 'zod'
import { commandIdSchema } from '@hbar/commands/protocol'
import { idSchema } from './index'
import {
  COMMAND_RECEIPT_INLINE_BYTES,
  COMMAND_RECEIPT_RESULT_BYTES,
  commandExecutionIdentitySchema,
  commandExecutionOwnerSchema,
  commandResultPageRequestSchema,
  commandResultPageSchema,
} from './command-execution'

const sequence = z.number().int().nonnegative().safe()
export const commandReadErrorSchema = z.strictObject({
  code: z.string().min(1).max(128),
  message: z.string().min(1).max(512),
  truncated: z.boolean(),
})
export const commandPayloadSummarySchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('inline'),
    bytes: z.number().int().positive().max(COMMAND_RECEIPT_INLINE_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({
    kind: z.literal('artifacts'),
    bytes: z.number().int().positive().max(COMMAND_RECEIPT_RESULT_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({ kind: z.literal('unavailable'), error: commandReadErrorSchema }),
])
export const commandReceiptReadInputSchema = commandExecutionIdentitySchema.omit({ actorId: true })
export type CommandReceiptReadInput = z.input<typeof commandReceiptReadInputSchema>
/** A discovery hint for the original command, never an arbitrary artifact download capability. */
export const commandResultReferenceSchema = commandReceiptReadInputSchema.extend({
  kind: z.literal('command_result'),
  channel: z.enum(['logical', 'physical']),
  bytes: z.number().int().positive().max(COMMAND_RECEIPT_RESULT_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})
export type CommandResultReference = z.output<typeof commandResultReferenceSchema>
export const commandReceiptViewSchema = z
  .strictObject({
    version: z.literal(1),
    ...commandExecutionIdentitySchema.shape,
    runId: idSchema,
    callId: idSchema,
    commandId: commandIdSchema,
    commandVersion: z.number().int().positive(),
    revision: z.number().int().positive().safe(),
    createdAt: sequence,
    updatedAt: sequence,
    owner: commandExecutionOwnerSchema.nullable(),
    logical: commandPayloadSummarySchema.nullable(),
    physical: z
      .strictObject({
        status: z.enum(['succeeded', 'failed']),
        executionStarted: z.boolean(),
        payload: commandPayloadSummarySchema,
      })
      .refine(
        (value) => value.status !== 'succeeded' || value.executionStarted,
        'A successful command must have entered its handler',
      )
      .nullable(),
    uncertainty: commandReadErrorSchema.nullable(),
    acknowledgedAt: sequence.nullable(),
  })
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= 24_576,
    'Receipt view exceeds its byte capacity',
  )
export type CommandReceiptView = z.output<typeof commandReceiptViewSchema>
export const commandResultReadInputSchema = commandReceiptReadInputSchema
  .extend({
    channel: z.enum(['logical', 'physical']).default('logical'),
    ...commandResultPageRequestSchema.shape,
  })
  .refine(
    (value) => value.offset === 0 || value.expectedSha256 !== undefined,
    'A continued page requires its view hash',
  )
export type CommandResultReadInput = z.input<typeof commandResultReadInputSchema>
export const commandResultReadOutputSchema = z
  .strictObject({
    ...commandExecutionIdentitySchema.shape,
    commandId: commandIdSchema,
    commandVersion: z.number().int().positive(),
    revision: z.number().int().positive().safe(),
    channel: z.enum(['logical', 'physical']),
    physicalStatus: z.enum(['succeeded', 'failed']).nullable(),
    acknowledged: z.boolean(),
    uncertainty: commandReadErrorSchema.nullable(),
    page: commandResultPageSchema,
  })
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= COMMAND_RECEIPT_INLINE_BYTES - 1024,
    'Result page envelope must remain inline',
  )
export type CommandResultReadOutput = z.output<typeof commandResultReadOutputSchema>
