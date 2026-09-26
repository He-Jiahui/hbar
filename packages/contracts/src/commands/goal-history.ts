import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import {
  HbarError,
  executionBudgetSchema,
  goalStatusSchema,
  idSchema,
  MAX_GOAL_OBJECTIVE_LENGTH,
  sessionEventSchema,
  type SessionEvent,
} from '../index'

export const GOAL_HISTORY_EVENT_TYPES = ['goal.created', 'goal.updated', 'goal.accounted', 'goal.cleared'] as const
const sequence = z.number().int().nonnegative()
export const goalHistorySnapshotSchema = z.strictObject({
  goalId: idSchema,
  objective: z.string().min(1).max(MAX_GOAL_OBJECTIVE_LENGTH),
  status: goalStatusSchema,
  tokenBudget: z.number().int().positive().nullable(),
  tokensUsed: z.number().int().nonnegative(),
  timeUsedSeconds: z.number().int().nonnegative(),
  createdAt: sequence,
  updatedAt: sequence,
  continuationCount: z.number().int().nonnegative().optional(),
  executionBudget: executionBudgetSchema.strict().optional(),
})
const fact = {
  eventId: idSchema,
  sessionId: idSchema,
  seq: z.number().int().positive(),
  time: sequence,
  runId: idSchema.nullable(),
}
export const goalHistoryFactSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...fact, type: z.literal('goal.created'), goal: goalHistorySnapshotSchema }),
  z.strictObject({ ...fact, type: z.literal('goal.updated'), goal: goalHistorySnapshotSchema }),
  z.strictObject({ ...fact, type: z.literal('goal.accounted'), goal: goalHistorySnapshotSchema }),
  z.strictObject({ ...fact, type: z.literal('goal.cleared'), goal: z.null() }),
])
export const goalHistoryInputSchema = z.strictObject({
  sessionId: idSchema,
  anchorSeq: sequence.optional(),
  beforeSeq: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).default(50),
})
export const goalHistoryPageSchema = z
  .strictObject({
    sessionId: idSchema,
    anchorSeq: sequence,
    items: z.array(goalHistoryFactSchema).max(100),
    preceding: z.strictObject({ seq: sequence, goal: goalHistorySnapshotSchema.nullable() }),
    nextBeforeSeq: z.number().int().positive().nullable(),
  })
  .superRefine((page, context) => {
    const ids = new Set<string>()
    let prior = page.preceding.seq
    for (const item of page.items) {
      if (item.sessionId !== page.sessionId || item.seq <= prior || item.seq > page.anchorSeq || ids.has(item.eventId))
        context.addIssue({ code: 'custom', message: 'Goal history item identity/order does not match its page' })
      ids.add(item.eventId)
      prior = item.seq
    }
    if (
      page.preceding.seq > page.anchorSeq ||
      (page.preceding.seq === 0 && page.preceding.goal !== null) ||
      (page.items.length === 0 && (page.preceding.seq !== 0 || page.nextBeforeSeq !== null)) ||
      (page.nextBeforeSeq !== null && page.nextBeforeSeq !== page.items[0]?.seq)
    )
      context.addIssue({ code: 'custom', message: 'Goal history boundary does not match its page' })
  })
export type GoalHistorySnapshot = z.output<typeof goalHistorySnapshotSchema>
export type GoalHistoryFact = z.output<typeof goalHistoryFactSchema>
export type GoalHistoryInput = z.input<typeof goalHistoryInputSchema>
export type GoalHistoryPage = z.output<typeof goalHistoryPageSchema>

export const goalHistoryCommands = {
  'goal.history': defineCommand(
    {
      id: 'goal.history',
      version: 1,
      owner: 'hbar.goal',
      kind: 'query',
      execution: 'host',
      stateEffect: 'none',
      category: 'agent.goal.plan',
      scope: 'session',
      titleKey: 'commands.goal.history.title',
      descriptionKey: 'commands.goal.history.description',
      surfaces: ['api'],
      maxConcurrent: 8,
      cancelMode: 'cooperative',
    },
    goalHistoryInputSchema,
    goalHistoryPageSchema,
  ),
}

const persistedSnapshot = goalHistorySnapshotSchema
  .extend({ threadId: idSchema, executionBudget: executionBudgetSchema.optional() })
  .strip()
/** Canonical events only. Malformed Goal facts fail closed; private accounting/repair data never leaves this parser. */
export function parseGoalHistoryEvent(event: SessionEvent): GoalHistoryFact | null {
  if (!GOAL_HISTORY_EVENT_TYPES.some((type) => type === event.type)) return null
  const envelope = sessionEventSchema.safeParse(event)
  if (!envelope.success) throw new HbarError('INVALID_OUTPUT', 'Invalid Goal history event')
  const value = envelope.data
  const identity = {
    eventId: value.eventId,
    sessionId: value.sessionId,
    seq: value.seq,
    time: value.time,
    runId: value.runId,
  }
  if (value.type === 'goal.cleared') {
    const data = z.object({ sessionId: idSchema }).safeParse(value.data)
    if (!data.success || data.data.sessionId !== value.sessionId)
      throw new HbarError('INVALID_OUTPUT', 'Goal history clear target is invalid')
    return { ...identity, type: 'goal.cleared', goal: null }
  }
  const data = z
    .object({ goal: persistedSnapshot, goalId: idSchema.optional(), sessionId: idSchema.optional() })
    .safeParse(value.data)
  if (
    !data.success ||
    data.data.goal.threadId !== value.sessionId ||
    (data.data.goalId !== undefined && data.data.goalId !== data.data.goal.goalId) ||
    (data.data.sessionId !== undefined && data.data.sessionId !== value.sessionId)
  )
    throw new HbarError('INVALID_OUTPUT', 'Goal history snapshot target is invalid')
  const goal = goalHistorySnapshotSchema.strip().parse(data.data.goal)
  // Validated canonical type, without assertions or copying arbitrary event payload fields.
  const parsed = goalHistoryFactSchema.safeParse({ ...identity, type: value.type, goal })
  if (!parsed.success) throw new HbarError('INVALID_OUTPUT', 'Invalid Goal history fact')
  return parsed.data
}
