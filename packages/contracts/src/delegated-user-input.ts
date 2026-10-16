import { z } from 'zod'
import { userInputRequestSchema, userInputResponseSchema, approvalModeSchema } from './index'
import { autonomyPolicyResolutionSchema } from './autonomy'

export const DELEGATED_INPUT_DEFAULT_TIMEOUT_MS = 300_000
export const DELEGATED_INPUT_MAX_PENDING = 128
export const DELEGATED_INPUT_MAX_STATE_BYTES = 262_144
const id = z.string().min(1).max(160).regex(/\S/)
const timestamp = z.number().int().nonnegative().safe()
export const delegatedInputIdentitySchema = z.strictObject({ sessionId: id, requestId: id })
export type DelegatedInputIdentity = z.output<typeof delegatedInputIdentitySchema>
export const delegatedInputAcceptSchema = delegatedInputIdentitySchema.extend({
  expectedQuestionRevision: z.number().int().positive().safe(),
  policy: autonomyPolicyResolutionSchema,
  timeoutMs: z.number().int().min(1_000).max(3_600_000).default(DELEGATED_INPUT_DEFAULT_TIMEOUT_MS),
})
export type DelegatedInputAccept = z.input<typeof delegatedInputAcceptSchema>
export const delegatedInputReplySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('answered'), response: userInputResponseSchema }),
  z.strictObject({ kind: z.literal('human'), reason: z.enum(['missing_information', 'target_declined']) }),
])
export const delegatedInputRecordSchema = delegatedInputIdentitySchema
  .extend({
    version: z.literal(1),
    delegationId: id,
    revision: z.number().int().positive().safe(),
    sourceRunId: id,
    sourceCallId: id,
    sourceActorId: id,
    questionRevision: z.number().int().positive().safe(),
    request: userInputRequestSchema,
    policy: autonomyPolicyResolutionSchema,
    targetSessionId: id,
    targetRunId: id.nullable(),
    delivery: z.enum(['dedicated', 'guidance']).nullable(),
    status: z.enum(['pending', 'delivered', 'answered', 'human', 'cancelled', 'closed']),
    reply: delegatedInputReplySchema.nullable(),
    repliedBy: z.strictObject({ runId: id, callId: id, actorId: id }).nullable(),
    reason: z.string().min(1).max(128).nullable(),
    createdAt: timestamp,
    expiresAt: timestamp,
    updatedAt: timestamp,
  })
  .superRefine((state, context) => {
    if (
      state.request.sessionId !== state.sessionId ||
      state.request.requestId !== state.requestId ||
      state.request.runId !== state.sourceRunId ||
      state.request.callId !== state.sourceCallId ||
      state.policy.sessionId !== state.sessionId ||
      state.policy.policy.mode !== 'delegate' ||
      state.policy.policy.targetSessionId !== state.targetSessionId
    )
      context.addIssue({ code: 'custom', message: 'The delegation must retain its original source and policy target' })
    if (
      state.expiresAt <= state.createdAt ||
      state.expiresAt - state.createdAt > 3_600_000 ||
      state.updatedAt < state.createdAt
    )
      context.addIssue({ code: 'custom', message: 'The delegation requires a bounded original deadline' })
    if (['delivered', 'answered'].includes(state.status) && (!state.targetRunId || !state.delivery))
      context.addIssue({ code: 'custom', message: 'A delivered delegation requires its actual target Run' })
    if (
      (state.status === 'answered' || state.reply?.kind === 'answered') &&
      (state.reply?.kind !== 'answered' || !state.repliedBy || state.repliedBy.runId !== state.targetRunId)
    )
      context.addIssue({
        code: 'custom',
        message: 'A delegated answer requires its original structured target receipt',
      })
  })
export type DelegatedInputRecord = z.output<typeof delegatedInputRecordSchema>
const mutation = delegatedInputIdentitySchema.extend({
  delegationId: id,
  expectedRevision: z.number().int().positive().safe(),
})
export const delegatedInputDeliverSchema = mutation.extend({ targetPermission: approvalModeSchema })
export type DelegatedInputDeliver = z.output<typeof delegatedInputDeliverSchema>
export const delegatedInputRunSchema = delegatedInputIdentitySchema.extend({
  delegationId: id,
  targetSessionId: id,
  targetRunId: id,
})
export type DelegatedInputRun = z.output<typeof delegatedInputRunSchema>
/** Reply arguments contain only the grant and answer; the actual target comes from the tool context. */
export const delegatedInputToolReplySchema = mutation.extend({ reply: delegatedInputReplySchema })
export const delegatedInputToolInboxSchema = z.strictObject({
  after: id.optional(),
  limit: z.number().int().min(1).max(32).default(16),
})
export const delegatedInputBindSchema = mutation.extend({
  targetSessionId: id,
  targetRunId: id,
  delivery: z.enum(['dedicated', 'guidance']),
})
export type DelegatedInputBind = z.output<typeof delegatedInputBindSchema>
/** The target identity is supplied by its real tool context; it is absent from model reply arguments. */
export const delegatedInputCompleteSchema = mutation.extend({
  targetSessionId: id,
  targetRunId: id,
  targetCallId: id,
  reply: delegatedInputReplySchema,
})
export type DelegatedInputComplete = z.output<typeof delegatedInputCompleteSchema>
export const delegatedInputFinishSchema = mutation.extend({
  reason: z.enum([
    'source_cancelled',
    'manual_takeover',
    'policy_changed',
    'target_unavailable',
    'timeout',
    'source_resolved',
    'cancelled',
  ]),
})
export type DelegatedInputFinish = z.output<typeof delegatedInputFinishSchema>
export const delegatedInputInboxSchema = z.strictObject({
  sessionId: id,
  runId: id,
  after: id.optional(),
  limit: z.number().int().min(1).max(32).default(16),
})
export type DelegatedInputInbox = z.input<typeof delegatedInputInboxSchema>
