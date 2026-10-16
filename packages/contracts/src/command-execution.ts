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

export const COMMAND_RESULT_PAGE_BYTES = 8192
export const commandResultPageRequestSchema = z
  .strictObject({
    offset: z.number().int().nonnegative().safe().max(COMMAND_RECEIPT_RESULT_BYTES).default(0),
    limit: z.number().int().min(4).max(COMMAND_RESULT_PAGE_BYTES).default(4096),
    expectedSha256: hash.optional(),
  })
  .refine(
    (value) => value.offset === 0 || value.expectedSha256 !== undefined,
    'A continued page requires its view hash',
  )
export type CommandResultPageRequest = z.input<typeof commandResultPageRequestSchema>
export type CommandResultPageInput = z.output<typeof commandResultPageRequestSchema>
export const commandResultPageSchema = z
  .strictObject({
    encoding: z.literal('utf8'),
    integrity: z.enum(['inline', 'selected_chunks']),
    offset: z.number().int().nonnegative().safe().max(COMMAND_RECEIPT_RESULT_BYTES),
    nextOffset: z.number().int().positive().safe().max(COMMAND_RECEIPT_RESULT_BYTES).nullable(),
    totalBytes: z.number().int().positive().max(COMMAND_RECEIPT_RESULT_BYTES),
    sha256: hash,
    content: z.string().max(COMMAND_RESULT_PAGE_BYTES),
  })
  .superRefine((value, context) => {
    const end = value.nextOffset ?? value.totalBytes
    const contentBytes = new TextEncoder().encode(value.content).byteLength
    if (
      contentBytes > COMMAND_RESULT_PAGE_BYTES ||
      value.offset > end ||
      end > value.totalBytes ||
      (value.nextOffset !== null && (value.nextOffset <= value.offset || value.nextOffset >= value.totalBytes)) ||
      contentBytes !== end - value.offset
    )
      context.addIssue({ code: 'custom', message: 'Result page text and cursor do not describe the same byte range' })
  })
export type CommandResultPage = z.output<typeof commandResultPageSchema>

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
  target: z.strictObject({ clientId: idSchema, generation: z.number().int().positive().safe() }).optional(),
})
export type CommandExecutionIntent = z.infer<typeof commandExecutionIntentSchema>
export const commandExecutionOwnerSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('runtime'), owner: runtimeOwnerSchema, jobId: idSchema }),
  z.strictObject({ kind: z.literal('host'), instanceId: idSchema, jobId: idSchema }),
  z.strictObject({
    kind: z.literal('client'),
    clientId: idSchema,
    generation: z.number().int().positive().safe(),
    jobId: idSchema,
  }),
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
/** These failures cannot prove the outcome of a nested side effect merely because its caller has returned. */
export const COMMAND_UNCONFIRMED_ERROR_CODES = [
  'RESULT_UNKNOWN',
  'EFFECT_UNKNOWN',
  'COMMAND_SOURCE_RESULT_UNKNOWN',
  'IPC_DISCONNECTED',
  'IPC_TIMEOUT',
  'IPC_CANCELLED',
  'IPC_PROTOCOL',
  'IPC_OWNER_CHANGED',
  'IPC_FRAGMENT_TIMEOUT',
  'RUNTIME_OWNER_REVOKED',
  'RUNTIME_PROCESS_EXITED',
  'RUNTIME_EXIT_UNKNOWN',
  'EXECUTION_OWNER_REVOKED',
  'STORAGE_RESULT_UNKNOWN',
  'STORAGE_INTEGRITY_UNKNOWN',
  'STORAGE_TIMEOUT',
  'STORAGE_WORKER_FAILED',
  'STORAGE_WORKER_EXITED',
  'DATABASE_WORKER_EXITED',
  'NODE_RESULT_UNKNOWN',
  'NODE_RECEIPT_UNKNOWN',
  'NODE_CONFIRMATION_UNKNOWN',
  'GIT_TIMEOUT',
] as const
export const commandExecutionPendingItemSchema = commandExecutionIdentitySchema.extend({
  runId: idSchema,
  commandId: z.string().min(1).max(128),
  revision: z.number().int().positive().safe(),
  reason: z.enum(['pending', 'unconfirmed_failure']),
})
/** Metadata only. Receipt bodies, command arguments and results are never included in this reconciliation read. */
export const commandExecutionPendingSchema = z.strictObject({
  sessionId: idSchema,
  items: z.array(commandExecutionPendingItemSchema).max(64),
  hasMore: z.boolean(),
})
export type CommandExecutionPending = z.infer<typeof commandExecutionPendingSchema>
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
