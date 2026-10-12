import { useId, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Target } from 'lucide-react'
import { LumenContentText, LumenButton, LumenFrame, LumenIcon } from '@lumen/app-ui'
import type { GoalHistoryProjection, GoalHistorySnapshot } from '@hbar/app-runtime'
import type { GoalLifecycleAction, GoalLifecycleRow } from './goal-lifecycle-model'
import { createMessageScope } from './messages'
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

const { Provider: GoalLifecycleMessagesProvider, useMessages: useGoalLifecycleMessages } =
  createMessageScope<HbarGoalLifecycleLabels>()

function GoalReplacementObjectives({
  previous,
  current,
}: {
  readonly previous: string
  readonly current: string
}) {
  const { t } = useGoalLifecycleMessages()
  const labels: HbarGoalLifecycleLabels = {
    titles: t('titles'),
    statuses: t('statuses'),
    accessible: t('accessible'),
    objective: t('objective'),
    cleared: t('cleared'),
    budget: t('budget'),
    continuations: t('continuations'),
    timestamp: t('timestamp'),
    showObjective: t('showObjective'),
    hideObjective: t('hideObjective'),
    comparison: t('comparison'),
    previousObjective: t('previousObjective'),
    nextObjective: t('nextObjective'),
    removed: t('removed'),
    added: t('added'),
    omission: t('omission'),
    omitted: t('omitted'),
    showComparison: t('showComparison'),
    hideComparison: t('hideComparison'),
  }
  const [full, setFull] = useState(false)
  const id = useId()
  const difference = useMemo(() => goalObjectiveDiff(previous, current), [previous, current])
  const long = Math.max(previous.length, current.length) > 240
  const renderFragments = (fragments: readonly GoalObjectiveFragment[], before: boolean) =>
    (long && !full ? excerptGoalObjective(fragments) : fragments).map((fragment, index) => {
      const key = `${fragment.from}:${index}`
      if (fragment.kind === 'omitted')
        return (
          <LumenContentText
            context="message.inline"
            key={key}
            className="hbar-goal-diff-omission"
            title={labels.omitted}
          >
            {labels.omission}
          </LumenContentText>
        )
      if (fragment.kind === 'unchanged' || !fragment.text)
        return (
          <LumenContentText context="message.inline" key={key}>
            {fragment.text}
          </LumenContentText>
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
          <LumenContentText context="section.description" className="hbar-goal-diff-label">
            <LumenContentText context="message.inline">{labels.previousObjective}</LumenContentText>
            {difference.previous.some((fragment) => fragment.kind === 'changed' && fragment.text) && (
              <LumenContentText context="metadata" className="hbar-goal-diff-removed-label">
                {labels.removed}
              </LumenContentText>
            )}
          </LumenContentText>
          <LumenContentText context="section.description" className="hbar-goal-diff-objective">
            {renderFragments(difference.previous, true)}
          </LumenContentText>
        </LumenFrame>
        <LumenFrame className="hbar-goal-diff-side">
          <LumenContentText context="section.description" className="hbar-goal-diff-label">
            <LumenContentText context="message.inline">{labels.nextObjective}</LumenContentText>
            {difference.current.some((fragment) => fragment.kind === 'changed' && fragment.text) && (
              <LumenContentText context="metadata" className="hbar-goal-diff-added-label">
                {labels.added}
              </LumenContentText>
            )}
          </LumenContentText>
          <LumenContentText context="section.description" className="hbar-goal-diff-objective">
            {renderFragments(difference.current, false)}
          </LumenContentText>
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
function GoalLifecycleCardView({
  row,
}: {
  readonly row: GoalLifecycleRow
}) {
  const { t } = useGoalLifecycleMessages()
  const labels: HbarGoalLifecycleLabels = {
    titles: t('titles'),
    statuses: t('statuses'),
    accessible: t('accessible'),
    objective: t('objective'),
    cleared: t('cleared'),
    budget: t('budget'),
    continuations: t('continuations'),
    timestamp: t('timestamp'),
    showObjective: t('showObjective'),
    hideObjective: t('hideObjective'),
    comparison: t('comparison'),
    previousObjective: t('previousObjective'),
    nextObjective: t('nextObjective'),
    removed: t('removed'),
    added: t('added'),
    omission: t('omission'),
    omitted: t('omitted'),
    showComparison: t('showComparison'),
    hideComparison: t('hideComparison'),
  }
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
        <LumenContentText context="control.label" className="hbar-goal-lifecycle-title">
          {title}
        </LumenContentText>
        {goal && (
          <LumenContentText context="control.status" className="hbar-goal-lifecycle-status">
            {labels.statuses[goal.status]}
          </LumenContentText>
        )}
      </LumenButton>
      <LumenFrame id={bodyId} className="hbar-goal-lifecycle-body" hidden={!expanded}>
        {row.action === 'replaced' && typeof previousObjective === 'string' && goal ? (
          <GoalReplacementObjectives previous={previousObjective} current={goal.objective} />
        ) : (
          <>
            <LumenContentText
              context="section.description"
              id={objectiveId}
              className={longObjective && !fullObjective ? 'hbar-goal-lifecycle-objective-preview' : undefined}
            >
              {objective}
            </LumenContentText>
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
            <LumenContentText context="message.inline">{labels.statuses[goal.status]}</LumenContentText>
            <LumenContentText context="message.inline">
              {labels.budget(goal.tokensUsed, goal.tokenBudget)}
            </LumenContentText>
            {goal.continuationCount !== undefined && (
              <LumenContentText context="message.inline">
                {labels.continuations(goal.continuationCount)}
              </LumenContentText>
            )}
          </LumenFrame>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}

/** The legacy labels prop remains the host adapter for existing SDK callers. */
export function HbarGoalLifecycleCard({
  row,
  labels,
}: {
  readonly row: GoalLifecycleRow
  readonly labels: HbarGoalLifecycleLabels
}) {
  return (
    <GoalLifecycleMessagesProvider messages={labels}>
      <GoalLifecycleCardView row={row} />
    </GoalLifecycleMessagesProvider>
  )
}
