import { z } from 'zod'
import { contentBlockSchema, idSchema, runSchema } from '../index'

export const queuedUserRunsCursorSchema = z.strictObject({
  afterOperationId: idSchema,
  sessionSeq: z.number().int().nonnegative(),
  totalQueued: z.number().int().nonnegative(),
})
export const queuedUserRunsInputSchema = z.strictObject({
  sessionId: idSchema,
  cursor: queuedUserRunsCursorSchema.optional(),
  limit: z.number().int().min(1).max(20).default(10),
})
export const queuedUserRunSchema = z.strictObject({
  operationId: idSchema,
  revision: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  textPreview: z.string().max(240),
  truncated: z.boolean(),
  attachmentCount: z.number().int().nonnegative(),
})
export const queuedUserRunsPageSchema = z.strictObject({
  sessionId: idSchema,
  sessionSeq: z.number().int().nonnegative(),
  totalQueued: z.number().int().nonnegative(),
  items: z.array(queuedUserRunSchema).max(20),
  nextCursor: queuedUserRunsCursorSchema.nullable(),
})
export type QueuedUserRunsInput = z.input<typeof queuedUserRunsInputSchema>
export type QueuedUserRunsPage = z.output<typeof queuedUserRunsPageSchema>

export const queuedRunRemoveInputSchema = z.strictObject({
  sessionId: idSchema,
  operationId: idSchema,
  expectedRevision: z.number().int().nonnegative(),
})
export const queuedRunRemoveReceiptSchema = z.strictObject({
  commandId: z.literal('queuedRun.remove'),
  commandVersion: z.literal(1),
  sessionId: idSchema,
  operationId: idSchema,
  idempotencyKey: z.string().min(1).max(128),
  status: z.literal('cancelled'),
  eventId: idSchema,
  sessionSeq: z.number().int().nonnegative(),
  removedAt: z.number().int().nonnegative(),
})
export type QueuedRunRemoveInput = z.output<typeof queuedRunRemoveInputSchema>
export type QueuedRunRemoveReceipt = z.output<typeof queuedRunRemoveReceiptSchema>

export const queuedRunEditableInputSchema = z.strictObject({ sessionId: idSchema, operationId: idSchema })
export const queuedRunEditableSchema = z.strictObject({
  sessionId: idSchema,
  operationId: idSchema,
  revision: z.number().int().nonnegative(),
  text: z.string().max(200_000),
  attachmentCount: z.number().int().nonnegative(),
})
export const queuedRunEditTextInputSchema = z.strictObject({
  sessionId: idSchema,
  operationId: idSchema,
  expectedRevision: z.number().int().nonnegative(),
  text: z.string().trim().min(1).max(200_000),
})
export const queuedRunEditTextReceiptSchema = z.strictObject({
  commandId: z.literal('queuedRun.editText'),
  commandVersion: z.literal(1),
  sessionId: idSchema,
  operationId: idSchema,
  idempotencyKey: z.string().min(1).max(128),
  revision: z.number().int().nonnegative(),
  eventId: idSchema,
  editedAt: z.number().int().nonnegative(),
})
export type QueuedRunEditableInput = z.output<typeof queuedRunEditableInputSchema>
export type QueuedRunEditable = z.output<typeof queuedRunEditableSchema>
export type QueuedRunEditTextInput = z.output<typeof queuedRunEditTextInputSchema>
export type QueuedRunEditTextReceipt = z.output<typeof queuedRunEditTextReceiptSchema>

/** Select one still-queued user Run to deliver into one already-running Run. */
export const queuedRunGuideInputSchema = z.strictObject({
  sessionId: idSchema,
  operationId: idSchema,
  activeRunId: idSchema,
  expectedRevision: z.number().int().nonnegative().safe(),
})
export const queuedRunGuideReceiptSchema = z.strictObject({
  commandId: z.literal('queuedRun.guide'),
  commandVersion: z.literal(1),
  sessionId: idSchema,
  operationId: idSchema,
  activeRunId: idSchema,
  idempotencyKey: z.string().min(1).max(128),
  status: z.literal('accepted'),
  operationStatus: z.literal('guided'),
  messageId: idSchema,
  eventId: idSchema,
  /** Session event sequence of the canonical message.committed event. */
  revision: z.number().int().nonnegative().safe(),
  sessionSeq: z.number().int().nonnegative().safe(),
  /** Content revision observed on the selected queued Run. */
  queueRevision: z.number().int().nonnegative().safe(),
  guidedAt: z.number().int().nonnegative().safe(),
})
export const queuedRunGuidanceSchema = z.strictObject({
  activeRunId: idSchema,
  guidedRun: runSchema,
  expectedRevision: z.number().int().nonnegative().safe(),
  receipt: queuedRunGuideReceiptSchema,
  actorId: z.string().min(1).max(160),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
})
export const runSteeringReadInputSchema = z.strictObject({
  sessionId: idSchema,
  runId: idSchema,
  afterSeq: z.number().int().nonnegative().safe(),
  closeWhenEmpty: z.boolean().default(false),
})
export const runSteeringMessageSchema = z.strictObject({
  id: idSchema,
  sessionId: idSchema,
  runId: idSchema,
  role: z.literal('user'),
  content: z.array(contentBlockSchema),
  seq: z.number().int().nonnegative().safe(),
  createdAt: z.number().int().nonnegative().safe(),
})
export const runSteeringReadResultSchema = z.strictObject({
  sessionId: idSchema,
  runId: idSchema,
  messages: z.array(runSteeringMessageSchema).max(20),
  nextSeq: z.number().int().nonnegative().safe(),
  closed: z.boolean(),
})
export type QueuedRunGuideInput = z.output<typeof queuedRunGuideInputSchema>
export type QueuedRunGuideReceipt = z.output<typeof queuedRunGuideReceiptSchema>
export type QueuedRunGuidance = z.output<typeof queuedRunGuidanceSchema>
export type RunSteeringReadInput = z.input<typeof runSteeringReadInputSchema>
export type RunSteeringMessage = z.output<typeof runSteeringMessageSchema>
export type RunSteeringReadResult = z.output<typeof runSteeringReadResultSchema>
