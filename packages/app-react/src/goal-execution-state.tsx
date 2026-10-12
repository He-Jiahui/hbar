import type { GoalPlanWorkspaceEntryState } from '@hbar/app-runtime'
import { LumenContentText, LumenCompactMetrics, LumenFrame } from '@lumen/app-ui'
import { createMessageScope } from './messages'

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
const goalExecutionMessages = createMessageScope<HbarGoalExecutionLabels>()

/** A bounded, content-grown summary of Host facts; no local budget inference. */
export function HbarGoalExecutionState(props: {
  readonly goal: ThreadGoal
  readonly remainingTokens: number | null
  readonly labels: HbarGoalExecutionLabels
}) {
  const { labels, ...viewProps } = props
  return (
    <goalExecutionMessages.Provider messages={labels}>
      <GoalExecutionContent {...viewProps} />
    </goalExecutionMessages.Provider>
  )
}

function GoalExecutionContent({ goal, remainingTokens }: Omit<Parameters<typeof HbarGoalExecutionState>[0], 'labels'>) {
  const { t } = goalExecutionMessages.useMessages()
  const budget = goal.executionBudget
  const continuation = goal.continuation
  const value = (remaining: number | null | undefined) =>
    remaining === undefined ? t('unknown') : remaining === null ? t('unlimited') : t('number')(remaining)
  return (
    <LumenFrame className="hbar-app-react-goal-execution" aria-live="polite">
      <LumenCompactMetrics
        label={t('title')}
        metrics={[
          {
            id: 'goal-remaining',
            label: t('goalRemaining'),
            value: value(budget ? budget.goalRemainingTokens : remainingTokens),
          },
          { id: 'session-remaining', label: t('sessionRemaining'), value: value(budget?.sessionRemainingTokens) },
          {
            id: 'effective-remaining',
            label: t('effectiveRemaining'),
            value: value(budget?.effectiveRemainingTokens),
          },
          {
            id: 'limiting-source',
            label: t('limitingSource'),
            value: budget
              ? budget.limitingSource
                ? t('sources')[budget.limitingSource]
                : t('unlimited')
              : t('unknown'),
          },
        ]}
      />
      <LumenContentText context="section.description">
        {continuation
          ? t('state')(t('phases')[continuation.phase], t('reasons')[continuation.reason])
          : t('noIntent')}
      </LumenContentText>
      {continuation?.phase === 'waiting' &&
        continuation.reason === 'retry_wait' &&
        continuation.retryAt !== undefined && (
          <LumenContentText context="section.description">{t('retryAt')(continuation.retryAt)}</LumenContentText>
        )}
      {goal.blockerAudit && (
        <LumenContentText context="section.description">
          {t('blocker')(
            goal.blockerAudit.reason,
            goal.blockerAudit.consecutiveTurns,
            goal.blockerAudit.requiredTurns,
          )}
        </LumenContentText>
      )}
    </LumenFrame>
  )
}
