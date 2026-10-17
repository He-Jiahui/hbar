import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema, runStatusSchema, userInputResponseSchema } from '../index'
import { nodeExecutionTargetSchema } from '../node-execution-target'
import { userInputStateSchema } from '../user-input-state'

export const decisionKindSchema = z.enum(['questionnaire', 'approval', 'plan_exit'])
export const decisionIdentitySchema = z.strictObject({ sessionId: idSchema, kind: decisionKindSchema, id: idSchema })
export const decisionPageInputSchema = z.strictObject({
  sessionId: idSchema,
  kind: decisionKindSchema,
  status: z.enum(['pending', 'all']).default('pending'),
  after: z.string().min(1).max(256).optional(),
  limit: z.number().int().min(1).max(50).default(20),
})
export const decisionSummarySchema = decisionIdentitySchema.extend({
  runId: idSchema,
  callId: idSchema,
  revision: z.number().int().positive().safe(),
  status: z.enum(['pending', 'answered', 'allowed', 'denied', 'cancelled']),
  sourceRunStatus: runStatusSchema,
  createdAt: z.number().int().nonnegative().safe(),
})
export const decisionPageSchema = z.strictObject({
  items: z.array(decisionSummarySchema).max(50),
  nextCursor: z.string().max(256).nullable(),
})
export const decisionDetailSchema = z.discriminatedUnion('kind', [
  decisionSummarySchema.extend({ kind: z.literal('questionnaire'), state: userInputStateSchema }),
  decisionSummarySchema.extend({
    kind: z.enum(['approval', 'plan_exit']),
    tool: z.string().min(1).max(160),
    args: z.record(z.string().max(256), z.json()),
    feedback: z.string().max(4_000).optional(),
    decidedBy: idSchema.optional(),
    executionTarget: nodeExecutionTargetSchema.optional(),
  }),
])
export const decisionResolveSchema = z.strictObject({
  sessionId: idSchema,
  id: idSchema,
  expectedRevision: z.number().int().positive().safe(),
  resolution: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('questionnaire'), response: userInputResponseSchema }),
    z.strictObject({ kind: z.literal('approval'), decision: z.enum(['allowed', 'denied']) }),
    z.strictObject({
      kind: z.literal('plan_exit'),
      decision: z.enum(['implement', 'continue']),
      feedback: z.string().trim().max(4_000).optional(),
    }),
  ]),
})
export const decisionResolveResultSchema = z.strictObject({ accepted: z.boolean(), decision: decisionDetailSchema })
/** Authenticated owner identity. This is supplied by the command boundary, never by command input. */
export const decisionOperationIdentitySchema = z.strictObject({
  actorId: idSchema,
  idempotencyKey: z.string().min(1).max(128),
  input: decisionResolveSchema,
})
const decisionOperationTerminalSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('succeeded'), result: decisionResolveResultSchema }),
  z.strictObject({
    status: z.literal('failed'),
    error: z.strictObject({ code: z.string().min(1).max(128), message: z.string().max(512) }),
  }),
])
export const decisionOperationOutcomeSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('pending') }),
  ...decisionOperationTerminalSchema.options,
])
export const decisionOperationSchema = decisionOperationIdentitySchema.extend({
  version: z.literal(1),
  outcome: decisionOperationOutcomeSchema,
})
export const decisionOperationCompleteSchema = decisionOperationIdentitySchema.extend({
  outcome: decisionOperationTerminalSchema,
})
export type DecisionOperationIdentity = z.output<typeof decisionOperationIdentitySchema>
export type DecisionOperationComplete = z.output<typeof decisionOperationCompleteSchema>
export type DecisionOperation = z.output<typeof decisionOperationSchema>
const metadata = (id: string, write = false) => ({
  id,
  version: 1,
  owner: 'hbar.decisions',
  kind: write ? ('command' as const) : ('query' as const),
  execution: 'host' as const,
  stateEffect: write ? ('persistent' as const) : ('none' as const),
  scope: 'session' as const,
  category: 'run.decisions',
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
})
export const decisionCommands = {
  'decision.list': defineCommand(metadata('decision.list'), decisionPageInputSchema, decisionPageSchema),
  'decision.get': defineCommand(metadata('decision.get'), decisionIdentitySchema, decisionDetailSchema),
  'decision.resolve': defineCommand(
    { ...metadata('decision.resolve', true), idempotency: 'required' },
    decisionResolveSchema,
    decisionResolveResultSchema,
  ),
}
export type DecisionIdentity = z.output<typeof decisionIdentitySchema>
export type DecisionDetail = z.output<typeof decisionDetailSchema>
export type DecisionPageInput = z.input<typeof decisionPageInputSchema>
