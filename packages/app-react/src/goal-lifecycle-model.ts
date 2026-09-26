import type { GoalHistoryFact, GoalHistorySnapshot } from '@hbar/app-runtime'

export type GoalLifecycleAction =
  'created' | 'replaced' | 'updated' | 'status' | 'paused' | 'resumed' | 'completed' | 'cleared'
export interface GoalLifecycleRow {
  readonly id: string
  readonly eventId: string
  readonly sessionId: string
  readonly seq: number
  readonly time: number
  readonly runId: string | null
  readonly action: GoalLifecycleAction
  readonly goal: Readonly<GoalHistorySnapshot> | null
  readonly previousGoal: Readonly<GoalHistorySnapshot> | null
}

/** Event-time facts only. Current Goal, Run settlement and assistant text are not evidence. */
export function projectGoalLifecycleRows(input: {
  readonly sessionId: string
  readonly facts: readonly GoalHistoryFact[]
  readonly preceding: { readonly seq: number; readonly goal: GoalHistorySnapshot | null }
}): readonly GoalLifecycleRow[] {
  let previous = input.preceding.goal
  const seenIds = new Set<string>()
  const seenSeqs = new Set<number>()
  const rows: GoalLifecycleRow[] = []
  for (const fact of [...input.facts].sort((left, right) => left.seq - right.seq)) {
    if (
      fact.sessionId !== input.sessionId ||
      fact.seq <= input.preceding.seq ||
      seenIds.has(fact.eventId) ||
      seenSeqs.has(fact.seq)
    )
      continue
    seenIds.add(fact.eventId)
    seenSeqs.add(fact.seq)
    const goal = fact.goal
    let action: GoalLifecycleAction | null = null
    if (goal === null) action = 'cleared'
    else if (!previous) action = 'created'
    else if (previous.goalId !== goal.goalId) action = previous.status === 'complete' ? 'created' : 'replaced'
    else if (previous.status !== goal.status) {
      action =
        goal.status === 'complete'
          ? 'completed'
          : goal.status === 'paused'
            ? 'paused'
            : goal.status === 'active'
              ? 'resumed'
              : 'status'
    } else if (previous.objective !== goal.objective || previous.tokenBudget !== goal.tokenBudget) action = 'updated'
    if (action)
      rows.push({
        id: `goal-lifecycle:${JSON.stringify([input.sessionId, fact.eventId])}`,
        eventId: fact.eventId,
        sessionId: fact.sessionId,
        seq: fact.seq,
        time: fact.time,
        runId: fact.runId,
        action,
        goal,
        previousGoal: previous,
      })
    // Accounting may update the next event's baseline, never an already emitted snapshot.
    previous = goal
  }
  return rows
}
