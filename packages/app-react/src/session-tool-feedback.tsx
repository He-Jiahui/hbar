import { LumenFrame, LumenContentText } from '@lumen/app-ui'
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
  if (progress.total <= 0) return null
  const percentage = Math.floor((progress.completed / progress.total) * 1000) / 10
  return (
    <LumenContentText
      context="control.status"
      className="hbar-tool-percentage"
      data-tool-progress={percentage}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.completed}
      aria-label={labels.progressAccessible(progress.completed, progress.total)}
    >
      {labels.progress(percentage)}
    </LumenContentText>
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
    <LumenFrame as="span" className="hbar-tool-timing" data-tool-elapsed={elapsed} data-tool-active={activity.active}>
      <LumenContentText context="metadata">
        {labels.duration(
          elapsed,
          activity.active ? 'running' : activity.execution?.endedAt !== undefined ? 'settled' : 'lastKnown',
        )}
      </LumenContentText>
      {activity.execution?.progress ? <Percentage progress={activity.execution.progress} labels={labels} /> : null}
    </LumenFrame>
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
      <LumenContentText context="collection.detail" className="hbar-tool-batch-counts">
        {labels.counts(counts)}
      </LumenContentText>
      {totalDuration !== undefined || counts.total > 0 ? (
        <LumenFrame
          as="span"
          className="hbar-tool-batch-metrics"
          role="group"
          aria-label={labels.counts(counts)}
          tabIndex={0}
        >
          {totalDuration !== undefined ? (
            <LumenContentText context="metadata" data-tool-total-elapsed={totalDuration}>
              {labels.cumulativeDuration(totalDuration)}
            </LumenContentText>
          ) : null}
          <Percentage progress={{ completed: counts.settled, total: counts.total }} labels={labels} />
        </LumenFrame>
      ) : null}
    </LumenFrame>
  )
}
