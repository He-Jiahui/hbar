import { LumenFrame, LumenText } from '@lumen/app-ui'
import type { ToolProgress } from '@hbar/contracts'
import { useToolClock } from './session-tool-clock'
import { toolElapsed, type SessionToolActivity, type ToolActivityCounts } from './session-tool-activity-model'
import './session-tool-feedback.css'

export interface SessionToolFeedbackLabels {
  readonly pending: string
  readonly duration: (milliseconds: number, state: 'running' | 'settled' | 'lastKnown') => string
  readonly cumulativeDuration: (milliseconds: number) => string
  readonly counts: (counts: ToolActivityCounts) => string
  readonly progress: (percentage: number) => string
  readonly progressAccessible: (completed: number, total: number) => string
}
function Percentage({
  progress,
  labels,
}: {
  readonly progress: ToolProgress
  readonly labels: SessionToolFeedbackLabels
}) {
  const percentage = Math.floor((progress.completed / progress.total) * 1000) / 10
  return (
    <LumenText
      as="span"
      className="hbar-tool-percentage"
      data-tool-progress={percentage}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.completed}
      aria-label={labels.progressAccessible(progress.completed, progress.total)}
    >
      {labels.progress(percentage)}
    </LumenText>
  )
}
export function ToolTiming({
  activity,
  labels,
}: {
  readonly activity: SessionToolActivity
  readonly labels: SessionToolFeedbackLabels
}) {
  const now = useToolClock(activity.active)
  const elapsed = toolElapsed(activity, now)
  if (elapsed === undefined) return null
  return (
    <LumenText as="span" className="hbar-tool-timing" data-tool-elapsed={elapsed} data-tool-active={activity.active}>
      <LumenText as="span">
        {labels.duration(
          elapsed,
          activity.active ? 'running' : activity.execution?.endedAt !== undefined ? 'settled' : 'lastKnown',
        )}
      </LumenText>
      {activity.execution?.progress ? <Percentage progress={activity.execution.progress} labels={labels} /> : null}
    </LumenText>
  )
}
export function ToolBatchFeedback({
  counts,
  activities,
  labels,
}: {
  readonly counts: ToolActivityCounts
  readonly activities?: readonly (SessionToolActivity | undefined)[]
  readonly labels: SessionToolFeedbackLabels
}) {
  const now = useToolClock(activities?.some((activity) => activity?.active) ?? false)
  const durations = activities?.map((activity) => (activity ? toolElapsed(activity, now) : undefined))
  const totalDuration =
    durations?.length && durations.every((duration) => duration !== undefined)
      ? durations.reduce((sum, duration) => sum + (duration ?? 0), 0)
      : undefined
  return (
    <LumenFrame className="hbar-tool-batch-feedback" data-tool-batch="true">
      <LumenText as="span" className="hbar-tool-batch-counts">
        {labels.counts(counts)}
      </LumenText>
      <LumenText as="span" className="hbar-tool-batch-metrics">
        {totalDuration !== undefined ? (
          <LumenText as="span" data-tool-total-elapsed={totalDuration}>
            {labels.cumulativeDuration(totalDuration)}
          </LumenText>
        ) : null}
        <Percentage progress={{ completed: counts.settled, total: counts.total }} labels={labels} />
      </LumenText>
    </LumenFrame>
  )
}
