import { useId, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Target } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import type { GoalHistoryProjection, GoalHistorySnapshot } from '@hbar/app-runtime'
import type { GoalLifecycleAction, GoalLifecycleRow } from './goal-lifecycle-model'
import { excerptGoalObjective, goalObjectiveDiff, type GoalObjectiveFragment } from './goal-objective-diff'
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
  readonly comparison: string
  readonly previousObjective: string
  readonly nextObjective: string
  readonly removed: string
  readonly added: string
  readonly omission: string
  readonly omitted: string
  readonly showComparison: string
  readonly hideComparison: string
}

function GoalReplacementObjectives({
  previous,
  current,
  labels,
}: {
  readonly previous: string
  readonly current: string
  readonly labels: HbarGoalLifecycleLabels
}) {
  const [full, setFull] = useState(false)
  const id = useId()
  const difference = useMemo(() => goalObjectiveDiff(previous, current), [previous, current])
  const long = Math.max(previous.length, current.length) > 240
  const renderFragments = (fragments: readonly GoalObjectiveFragment[], before: boolean) =>
    (long && !full ? excerptGoalObjective(fragments) : fragments).map((fragment, index) => {
      const key = `${fragment.from}:${index}`
      if (fragment.kind === 'omitted')
        return (
          <LumenText as="span" key={key} className="hbar-goal-diff-omission" title={labels.omitted}>
            {labels.omission}
          </LumenText>
        )
      if (fragment.kind === 'unchanged' || !fragment.text)
        return (
          <LumenText as="span" key={key}>
            {fragment.text}
          </LumenText>
        )
      return before ? (
        <del key={key} title={labels.removed}>
          {fragment.text}
        </del>
      ) : (
        <ins key={key} title={labels.added}>
          {fragment.text}
        </ins>
      )
    })
  return (
    <LumenFrame className="hbar-goal-replacement" role="group" aria-label={labels.comparison}>
      <LumenFrame id={id} className="hbar-goal-replacement-objectives">
        <LumenFrame className="hbar-goal-diff-side">
          <LumenText as="p" className="hbar-goal-diff-label">
            <LumenText as="span">{labels.previousObjective}</LumenText>
            {difference.previous.some((fragment) => fragment.kind === 'changed' && fragment.text) && (
              <LumenText as="span" className="hbar-goal-diff-removed-label">
                {labels.removed}
              </LumenText>
            )}
          </LumenText>
          <LumenText as="p" className="hbar-goal-diff-objective">
            {renderFragments(difference.previous, true)}
          </LumenText>
        </LumenFrame>
        <LumenFrame className="hbar-goal-diff-side">
          <LumenText as="p" className="hbar-goal-diff-label">
            <LumenText as="span">{labels.nextObjective}</LumenText>
            {difference.current.some((fragment) => fragment.kind === 'changed' && fragment.text) && (
              <LumenText as="span" className="hbar-goal-diff-added-label">
                {labels.added}
              </LumenText>
            )}
          </LumenText>
          <LumenText as="p" className="hbar-goal-diff-objective">
            {renderFragments(difference.current, false)}
          </LumenText>
        </LumenFrame>
      </LumenFrame>
      {long && (
        <LumenButton
          type="button"
          size="s"
          variant="text"
          indicator="none"
          className="hbar-goal-lifecycle-objective-toggle"
          aria-expanded={full}
          aria-controls={id}
          onClick={() => setFull((value) => !value)}
        >
          {full ? labels.hideComparison : labels.showComparison}
        </LumenButton>
      )}
    </LumenFrame>
  )
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
  const previousObjective = row.previousGoal?.objective
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
        {row.action === 'replaced' && typeof previousObjective === 'string' && goal ? (
          <GoalReplacementObjectives previous={previousObjective} current={goal.objective} labels={labels} />
        ) : (
          <>
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
          </>
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
