import { z } from 'zod'
import { runtimeOwnerSchema } from './runtime'

const id = z.string().min(1).max(160)
export const sessionWakeEntrySchema = z
  .strictObject({
    sessionId: id,
    goalId: id,
    intentId: id,
    requestId: id,
    dueAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    goalRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .refine((value) => value.requestId === `goal-${value.intentId}`, 'Continuation identity mismatch')
export type SessionWakeEntry = z.infer<typeof sessionWakeEntrySchema>
export const sessionWakeManifestSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    owner: runtimeOwnerSchema,
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    entries: z.array(sessionWakeEntrySchema).max(128),
  })
  .refine(
    (value) => new Set(value.entries.map((entry) => entry.sessionId)).size === value.entries.length,
    'Duplicate session wake',
  )
export type SessionWakeManifest = z.infer<typeof sessionWakeManifestSchema>
export const sessionWakeAckSchema = z.strictObject({
  token: id,
  manifest: sessionWakeManifestSchema,
})
export type SessionWakeAck = z.infer<typeof sessionWakeAckSchema>
export const sessionWakeTransferSchema = z.strictObject({ ack: sessionWakeAckSchema })
export const sessionWakeStatusSchema = z.strictObject({
  token: id,
  revision: z.number().int().nonnegative(),
  phase: z.enum(['quiesced', 'committed', 'aborted', 'restored']),
})
export const sessionWakeDeliverySchema = z.strictObject({ token: id, entry: sessionWakeEntrySchema })
export const sessionWakeDeliveryResultSchema = z.strictObject({ status: z.enum(['notified', 'stale']) })
export const goalWakeRequestSchema = z.strictObject({
  action: z.enum(['describe', 'validate', 'commit', 'abort', 'deliver', 'coverage']),
  sessionId: id,
  entry: sessionWakeEntrySchema.optional(),
  token: id.optional(),
  entries: z.array(sessionWakeEntrySchema).max(128).optional(),
})
export type GoalWakeRequest = z.infer<typeof goalWakeRequestSchema>
export const goalWakeReplySchema = z.strictObject({
  accepted: z.boolean(),
  entry: sessionWakeEntrySchema.nullable(),
  resources: z.number().int().nonnegative().max(128).optional(),
})
export type GoalWakeReply = z.infer<typeof goalWakeReplySchema>
export const SESSION_WAKE_CONTROL_METHODS = [
  'kernel.sessionWakes.preview',
  'kernel.sessionWakes.quiesce',
  'kernel.sessionWakes.commit',
  'kernel.sessionWakes.abort',
  'kernel.sessionWakes.restore',
  'kernel.sessionWakes.deliver',
] as const
export function sameSessionWake(left: SessionWakeEntry, right: SessionWakeEntry): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.goalId === right.goalId &&
    left.intentId === right.intentId &&
    left.requestId === right.requestId &&
    left.dueAt === right.dueAt &&
    left.goalRevision === right.goalRevision
  )
}
