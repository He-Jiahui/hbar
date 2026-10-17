import { z } from 'zod'
import { userInputRequestSchema, userInputResponseSchema, userInputAutomaticDecisionSchema } from './index'
import { autonomyPolicyResolutionSchema } from './autonomy'

export const USER_INPUT_STATE_BYTES = 131_072
const identity = z.string().min(1).max(160)
export const userInputIdentitySchema = z.strictObject({ sessionId: identity, requestId: identity })
export const userInputSettlementSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('answered'),
    response: userInputResponseSchema,
    automatic: userInputAutomaticDecisionSchema.optional(),
  }),
  z.strictObject({ kind: z.literal('cancelled'), reason: z.string().min(1).max(128) }),
])
export const userInputStateSchema = z.strictObject({
  version: z.literal(1),
  revision: z.number().int().positive().safe(),
  request: userInputRequestSchema,
  policy: autonomyPolicyResolutionSchema,
  settlement: userInputSettlementSchema.nullable(),
  createdAt: z.number().int().nonnegative().safe(),
  updatedAt: z.number().int().nonnegative().safe(),
})
export const userInputAcceptSchema = z.strictObject({
  request: userInputRequestSchema,
  policy: autonomyPolicyResolutionSchema,
})
export const userInputCommitSchema = userInputIdentitySchema.extend({
  expectedRevision: z.number().int().positive().safe(),
  settlement: userInputSettlementSchema,
})
export type UserInputState = z.output<typeof userInputStateSchema>
export type UserInputSettlement = z.output<typeof userInputSettlementSchema>
export type UserInputIdentity = z.output<typeof userInputIdentitySchema>
export type UserInputAccept = z.output<typeof userInputAcceptSchema>
export type UserInputCommit = z.output<typeof userInputCommitSchema>
