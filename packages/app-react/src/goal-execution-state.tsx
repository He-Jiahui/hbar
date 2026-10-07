import type { GoalPlanWorkspaceEntryState } from '@hbar/app-runtime'
import { LumenCompactMetrics, LumenFrame, LumenContentText } from '@lumen/app-ui'

type ThreadGoal = NonNullable<GoalPlanWorkspaceEntryState['goal']>
type ExecutionBudget = NonNullable<ThreadGoal['executionBudget']>
type GoalContinuation = NonNullable<ThreadGoal['continuation']>

export interface HbarGoalExecutionLabels {
  readonly title: string
  readonly goalRemaining: string
  readonly sessionRemaining: string
  readonly effectiveRemaining: string
  readonly limitingSource: string
  readonly sources: Readonly<Record<NonNullable<ExecutionBudget['limitingSource']>, string>>
  readonly unlimited: string
  readonly unknown: string
  readonly noIntent: string
  readonly phases: Readonly<Record<GoalContinuation['phase'], string>>
  readonly reasons: Readonly<Record<GoalContinuation['reason'], string>>
  readonly state: (phase: string, reason: string) => string
  readonly retryAt: (time: number) => string
  readonly blocker: (reason: string, turns: number, required: number) => string
  readonly number: (value: number) => string
}

/** A bounded, content-grown summary of Host facts; no local budget inference. */
export function HbarGoalExecutionState({
  goal,
  remainingTokens,
  labels,
}: {
  readonly goal: ThreadGoal
  readonly remainingTokens: number | null
  readonly labels: HbarGoalExecutionLabels
}) {
  const budget = goal.executionBudget
  const continuation = goal.continuation
  const value = (remaining: number | null | undefined) =>
    remaining === undefined ? labels.unknown : remaining === null ? labels.unlimited : labels.number(remaining)
  return (
    <LumenFrame className="hbar-app-react-goal-execution" aria-live="polite">
      <LumenCompactMetrics
        label={labels.title}
        metrics={[
          {
            id: 'goal-remaining',
            label: labels.goalRemaining,
            value: value(budget ? budget.goalRemainingTokens : remainingTokens),
          },
          { id: 'session-remaining', label: labels.sessionRemaining, value: value(budget?.sessionRemainingTokens) },
          {
            id: 'effective-remaining',
            label: labels.effectiveRemaining,
            value: value(budget?.effectiveRemainingTokens),
          },
          {
            id: 'limiting-source',
            label: labels.limitingSource,
            value: budget
              ? budget.limitingSource
                ? labels.sources[budget.limitingSource]
                : labels.unlimited
              : labels.unknown,
          },
        ]}
      />
      <LumenContentText context="section.description">
        {continuation
          ? labels.state(labels.phases[continuation.phase], labels.reasons[continuation.reason])
          : labels.noIntent}
      </LumenContentText>
      {continuation?.phase === 'waiting' &&
        continuation.reason === 'retry_wait' &&
        continuation.retryAt !== undefined && (
          <LumenContentText context="section.description">{labels.retryAt(continuation.retryAt)}</LumenContentText>
        )}
      {goal.blockerAudit && (
        <LumenContentText context="feedback.paragraph" tone="warning">
          {labels.blocker(
            goal.blockerAudit.reason,
            goal.blockerAudit.consecutiveTurns,
            goal.blockerAudit.requiredTurns,
          )}
        </LumenContentText>
      )}
    </LumenFrame>
  )
}
