import type { ExecutionBudget, SessionBudget, ThreadGoal } from '@hbar/contracts'

/** The two ledgers keep their scopes; only admission uses their minimum. */
export function executionBudget(goal: ThreadGoal, session: SessionBudget | null): ExecutionBudget {
  const goalRemainingTokens = goal.tokenBudget === null ? null : Math.max(0, goal.tokenBudget - goal.tokensUsed)
  const sessionRemainingTokens = session === null ? null : session.remainingTokens
  const effectiveRemainingTokens =
    goalRemainingTokens === null
      ? sessionRemainingTokens
      : sessionRemainingTokens === null
        ? goalRemainingTokens
        : Math.min(goalRemainingTokens, sessionRemainingTokens)
  const limitingSource =
    effectiveRemainingTokens === null
      ? null
      : goalRemainingTokens === sessionRemainingTokens
        ? 'both'
        : effectiveRemainingTokens === goalRemainingTokens
          ? 'goal'
          : 'session'
  return { goalRemainingTokens, sessionRemainingTokens, effectiveRemainingTokens, limitingSource }
}

export function withExecutionBudget<T extends ThreadGoal & { budgetResumeIntent: boolean }>(
  goal: T,
  session: SessionBudget | null,
): T {
  const budget = executionBudget(goal, session)
  const limited = budget.effectiveRemainingTokens === 0
  const status =
    goal.status === 'active' && limited
      ? 'budget_limited'
      : goal.status === 'budget_limited' && goal.budgetResumeIntent && !limited
        ? 'active'
        : goal.status
  return {
    ...goal,
    executionBudget: budget,
    status,
    budgetResumeIntent: status === 'budget_limited' && (goal.status === 'active' || goal.budgetResumeIntent),
  }
}
