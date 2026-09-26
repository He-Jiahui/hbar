import { useId, useState } from 'react'
import { ChevronDown, ChevronRight, Target } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import type { GoalHistoryProjection, GoalHistorySnapshot } from '@hbar/app-runtime'
import type { GoalLifecycleAction, GoalLifecycleRow } from './goal-lifecycle-model'
import './goal-lifecycle.css'

export interface HbarGoalLifecycleLabels {
  readonly titles: Readonly<Record<GoalLifecycleAction, string>>
  readonly statuses: Readonly<Record<GoalHistorySnapshot['status'], string>>
  readonly accessible: (title: string, time: string) => string
  readonly objective: (objective: string) => string
  readonly cleared: (objective: string | null) => string
  readonly budget: (used: number, limit: number | null) => string
  readonly continuations: (count: number) => string
  readonly timestamp: (time: number) => string
  readonly showObjective: string
  readonly hideObjective: string
}

export interface HbarGoalHistoryLabels {
  readonly loading: string
  readonly gap: (reason: NonNullable<GoalHistoryProjection['gapReason']>) => string
  readonly refresh: string
  readonly loadOlder: string
  readonly loadingOlder: string
  readonly retryOlder: string
  readonly limit: (count: number) => string
}

/** One immutable historical fact; disclosure is local, with no Goal mutation or message actions. */
export function HbarGoalLifecycleCard({
  row,
  labels,
}: {
  readonly row: GoalLifecycleRow
  readonly labels: HbarGoalLifecycleLabels
}) {
  const [expanded, setExpanded] = useState(true)
  const [fullObjective, setFullObjective] = useState(false)
  const bodyId = useId()
  const objectiveId = useId()
  const title = labels.titles[row.action]
  const goal = row.goal
  const objective =
    row.action === 'cleared'
      ? labels.cleared(row.previousGoal?.objective ?? null)
      : goal
        ? labels.objective(goal.objective)
        : ''
  const longObjective = objective.length > 240
  return (
    <LumenFrame
      as="section"
      className="hbar-goal-lifecycle"
      data-goal-event-id={row.eventId}
      data-goal-session-id={row.sessionId}
      data-goal-action={row.action}
      data-goal-seq={row.seq}
    >
      <LumenButton
        type="button"
        variant="text"
        indicator="none"
        className="hbar-goal-lifecycle-heading"
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-label={labels.accessible(title, labels.timestamp(row.time))}
        onClick={() => setExpanded((value) => !value)}
      >
        <LumenIcon icon={expanded ? ChevronDown : ChevronRight} tier="sm" />
        <LumenIcon icon={Target} tier="sm" />
        <LumenText as="span" className="hbar-goal-lifecycle-title">
          {title}
        </LumenText>
        {goal && (
          <LumenText as="span" className="hbar-goal-lifecycle-status">
            {labels.statuses[goal.status]}
          </LumenText>
        )}
      </LumenButton>
      <LumenFrame id={bodyId} className="hbar-goal-lifecycle-body" hidden={!expanded}>
        <LumenText
          as="p"
          id={objectiveId}
          className={longObjective && !fullObjective ? 'hbar-goal-lifecycle-objective-preview' : undefined}
        >
          {objective}
        </LumenText>
        {longObjective && (
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            className="hbar-goal-lifecycle-objective-toggle"
            aria-expanded={fullObjective}
            aria-controls={objectiveId}
            onClick={() => setFullObjective((value) => !value)}
          >
            {fullObjective ? labels.hideObjective : labels.showObjective}
          </LumenButton>
        )}
        {goal && (
          <LumenFrame className="hbar-goal-lifecycle-metadata">
            <LumenText as="span">{labels.statuses[goal.status]}</LumenText>
            <LumenText as="span">{labels.budget(goal.tokensUsed, goal.tokenBudget)}</LumenText>
            {goal.continuationCount !== undefined && (
              <LumenText as="span">{labels.continuations(goal.continuationCount)}</LumenText>
            )}
          </LumenFrame>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}
