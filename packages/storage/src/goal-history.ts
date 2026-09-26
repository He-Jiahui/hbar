import type { Database } from 'bun:sqlite'
import { HbarError, sessionEventSchema } from '@hbar/contracts'
import {
  goalHistoryInputSchema,
  goalHistoryPageSchema,
  parseGoalHistoryEvent,
  type GoalHistoryInput,
  type GoalHistoryPage,
} from '@hbar/contracts/commands/goal-history'

const types = "type IN ('goal.created','goal.updated','goal.accounted','goal.cleared')"
export const GOAL_HISTORY_INDEX_SQL = `CREATE INDEX IF NOT EXISTS events_goal_history ON events(sessionId,seq) WHERE ${types}`
export const GOAL_HISTORY_PAGE_SQL = `SELECT eventId,sessionId,seq,runId,stepId,type,data,time,version FROM events
  WHERE sessionId=? AND ${types} AND seq<=? AND seq<? ORDER BY seq DESC LIMIT ?`

/** Same Worker read transaction for anchor and at most limit+1 indexed rows. The extra row supplies preceding state. */
export function readGoalHistory(db: Database, input: GoalHistoryInput): GoalHistoryPage {
  const parsed = goalHistoryInputSchema.safeParse(input)
  if (!parsed.success) throw new HbarError('INVALID_INPUT', 'Invalid Goal history query')
  return db.transaction(() => {
    const { sessionId, beforeSeq, limit } = parsed.data
    const session = db.query<{ seq: number }, [string]>('SELECT seq FROM sessions WHERE id=?').get(sessionId)
    if (!session) throw new HbarError('NOT_FOUND', 'Session not found')
    const anchorSeq = parsed.data.anchorSeq ?? session.seq
    if (anchorSeq > session.seq || (beforeSeq !== undefined && beforeSeq > anchorSeq + 1))
      throw new HbarError('INVALID_CURSOR', 'Goal history cursor is outside its session anchor')
    const rows = db
      .query<Record<string, unknown>, [string, number, number, number]>(GOAL_HISTORY_PAGE_SQL)
      .all(sessionId, anchorSeq, beforeSeq ?? anchorSeq + 1, limit + 1)
    const facts = rows.map((row) => {
      try {
        const event = sessionEventSchema.safeParse({
          ...row,
          data: typeof row.data === 'string' ? (JSON.parse(row.data) as unknown) : row.data,
        })
        if (!event.success) throw new HbarError('INVALID_OUTPUT', 'Invalid stored Goal history event')
        const fact = parseGoalHistoryEvent(event.data)
        if (!fact) throw new HbarError('INVALID_OUTPUT', 'Invalid stored Goal history event type')
        return fact
      } catch {
        throw new HbarError('INVALID_OUTPUT', 'Invalid stored Goal history event')
      }
    })
    const predecessor = facts[limit]
    const items = facts.slice(0, limit).reverse()
    return goalHistoryPageSchema.parse({
      sessionId,
      anchorSeq,
      items,
      preceding: predecessor ? { seq: predecessor.seq, goal: predecessor.goal } : { seq: 0, goal: null },
      nextBeforeSeq: predecessor ? items[0]?.seq : null,
    })
  })()
}
