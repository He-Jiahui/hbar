import { z } from 'zod'
import { commandExecutionExpectationSchema, invocationSchema } from '@hbar/commands'
import { artifactSchema, idSchema } from './index'
import { runtimeOwnerSchema } from './runtime'

export const COMMAND_RECEIPT_INLINE_BYTES = 65_536
export const COMMAND_RECEIPT_RESULT_BYTES = 33_554_432
export const COMMAND_RECEIPT_RECORD_BYTES = 1_572_864
export const COMMAND_RECEIPT_INTENT_BYTES = 1_179_648
const errorSchema = z.strictObject({ code: z.string().min(1).max(128), message: z.string().min(1).max(8_192) })
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const timestamp = z.number().int().nonnegative().safe()

/** Full JSON is stored inline or as ordered, content-addressed artifact chunks. */
export const commandReceiptPayloadSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('inline'),
    json: z
      .string()
      .min(1)
      .max(COMMAND_RECEIPT_INLINE_BYTES)
      .superRefine((value, context) => {
        if (new TextEncoder().encode(value).byteLength > COMMAND_RECEIPT_INLINE_BYTES)
          context.addIssue({ code: 'custom', message: 'Command receipt exceeds inline byte capacity' })
        try {
          const parsed: unknown = JSON.parse(value)
          const pending: { value: unknown; depth: number }[] = [{ value: parsed, depth: 0 }]
          let visited = 0
          while (pending.length) {
            const item = pending.pop()
            if (!item) break
            if (++visited > 65_536 || item.depth > 64) throw new Error('Command receipt exceeds its structural bound')
            if (typeof item.value === 'number' && !Number.isFinite(item.value))
              throw new Error('Command receipt numbers must be finite')
            if (item.value && typeof item.value === 'object')
              for (const child of Object.values(item.value)) pending.push({ value: child, depth: item.depth + 1 })
          }
        } catch {
          context.addIssue({ code: 'custom', message: 'Command receipt must contain complete JSON' })
        }
      }),
  }),
  z
    .strictObject({
      kind: z.literal('artifacts'),
      sha256: hash,
      bytes: z.number().int().min(1).max(COMMAND_RECEIPT_RESULT_BYTES),
      chunks: z
        .array(
          artifactSchema.extend({
            mime: z.literal('application/octet-stream'),
            size: z.number().int().min(1).max(10_485_760),
          }),
        )
        .min(1)
        .max(4),
    })
    .refine(
      (value) => value.chunks.reduce((sum, item) => sum + item.size, 0) === value.bytes,
      'Command receipt chunks differ from their declared size',
    ),
  z.strictObject({ kind: z.literal('unavailable'), error: errorSchema }),
])
export type CommandReceiptPayload = z.infer<typeof commandReceiptPayloadSchema>

/** A model never provides this identity. The Host derives it from its authenticated source Run. */
export const commandExecutionIdentitySchema = z.strictObject({
  sessionId: idSchema,
  actorId: idSchema,
  operationKey: z.string().min(1).max(160),
})
export const commandExecutionIntentSchema = commandExecutionIdentitySchema.extend({
  runId: idSchema,
  callId: idSchema,
  invocation: invocationSchema,
  expectation: commandExecutionExpectationSchema,
  target: z.strictObject({ clientId: idSchema, generation: idSchema }).optional(),
})
export type CommandExecutionIntent = z.infer<typeof commandExecutionIntentSchema>
export const commandExecutionOwnerSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('runtime'), owner: runtimeOwnerSchema, jobId: idSchema }),
  z.strictObject({ kind: z.literal('host'), instanceId: idSchema, jobId: idSchema }),
  z.strictObject({ kind: z.literal('client'), clientId: idSchema, generation: idSchema, jobId: idSchema }),
])
export type CommandExecutionOwner = z.infer<typeof commandExecutionOwnerSchema>
const physicalSchema = z
  .strictObject({
    status: z.enum(['succeeded', 'failed']),
    executionStarted: z.boolean(),
    payload: commandReceiptPayloadSchema,
  })
  .refine(
    (value) => value.status !== 'succeeded' || value.executionStarted,
    'A successful command must have entered its handler',
  )
export const commandExecutionReceiptSchema = commandExecutionIntentSchema.extend({
  version: z.literal(1),
  revision: z.number().int().positive().safe(),
  inputHash: hash,
  createdAt: timestamp,
  updatedAt: timestamp,
  owner: commandExecutionOwnerSchema.nullable(),
  logical: commandReceiptPayloadSchema.nullable(),
  physical: physicalSchema.nullable(),
  uncertainty: errorSchema.nullable(),
  acknowledgedAt: timestamp.nullable(),
})
export type CommandExecutionReceipt = z.infer<typeof commandExecutionReceiptSchema>
export const commandExecutionUpdateSchema = commandExecutionIdentitySchema.extend({
  expectedRevision: z.number().int().positive().safe(),
  change: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('bind'), owner: commandExecutionOwnerSchema }),
    z.strictObject({ kind: z.literal('logical'), payload: commandReceiptPayloadSchema }),
    z.strictObject({ kind: z.literal('settled'), physical: physicalSchema }),
    z.strictObject({ kind: z.literal('uncertain'), error: errorSchema }),
    z.strictObject({ kind: z.literal('acknowledged') }),
  ]),
})
export type CommandExecutionUpdate = z.infer<typeof commandExecutionUpdateSchema>
export type CommandExecutionIdentity = z.infer<typeof commandExecutionIdentitySchema>
