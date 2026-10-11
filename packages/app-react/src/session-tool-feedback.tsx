import { LumenContentText, LumenFrame } from '@lumen/app-ui'
import type { ToolProgress } from '@hbar/contracts'
import { useSessionClock } from './session-tool-clock'
import { toolElapsed, type SessionToolActivity, type ToolActivityCounts } from './session-tool-activity-model'
import type { ToolDisplayOutcome } from './session-tool-outcome-model'
import './session-tool-feedback.css'

export interface SessionToolFeedbackLabels {
  readonly pending: string
  readonly duration: (milliseconds: number, state: 'running' | 'settled' | 'lastKnown') => string
  readonly cumulativeDuration: (milliseconds: number) => string
  readonly counts: (counts: ToolActivityCounts) => string
  readonly progress: (percentage: number) => string
  readonly progressAccessible: (completed: number, total: number) => string
}
type ProgressState = 'succeeded' | 'running' | 'failed' | 'pending'
function ProgressBar({
  progress,
  segments,
  labels,
  counts,
}: {
  readonly progress: ToolProgress
  readonly segments: readonly { readonly state: ProgressState; readonly value: number }[]
  readonly labels: SessionToolFeedbackLabels
  readonly counts?: ToolActivityCounts
}) {
  const percentage = Math.floor((progress.completed / progress.total) * 1000) / 10
  const description = [labels.progress(percentage), ...(counts ? [labels.counts(counts)] : [])].join(' · ')
  return (
    <LumenFrame
      className="hbar-tool-progress"
      data-tool-progress={percentage}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.completed}
      aria-label={labels.progressAccessible(progress.completed, progress.total)}
      aria-valuetext={description}
      title={description}
    >
      {segments
        .filter((segment) => segment.value > 0)
        .map((segment) => (
          <LumenFrame
            key={segment.state}
            className="hbar-tool-progress-segment"
            data-progress-state={segment.state}
            aria-hidden="true"
            style={{ flexGrow: segment.value }}
          />
        ))}
    </LumenFrame>
  )
}

export function ToolProgressFeedback({
  progress,
  outcome,
  active,
  labels,
}: {
  readonly progress: ToolProgress
  readonly outcome: ToolDisplayOutcome
  readonly active: boolean
  readonly labels: SessionToolFeedbackLabels
}) {
  if (outcome !== 'pending') return null
  const state: ProgressState = active ? 'running' : 'pending'
  return (
    <LumenFrame className="hbar-tool-progress-feedback">
      <ProgressBar
        progress={progress}
        segments={
          state === 'pending'
            ? [{ state, value: progress.total }]
            : [
                { state, value: progress.completed },
                { state: 'pending', value: progress.total - progress.completed },
              ]
        }
        labels={labels}
      />
    </LumenFrame>
  )
}
export function ToolTiming({
  activity,
  labels,
}: {
  readonly activity: SessionToolActivity
  readonly labels: SessionToolFeedbackLabels
}) {
  const now = useSessionClock(activity.active)
  const elapsed = toolElapsed(activity, now)
  if (elapsed === undefined) return null
  return (
    <LumenContentText
      context="metadata"
      className="hbar-tool-timing"
      data-tool-elapsed={elapsed}
      data-tool-active={activity.active}
    >
      <LumenContentText context="message.inline">
        {labels.duration(
          elapsed,
          activity.active ? 'running' : activity.execution?.endedAt !== undefined ? 'settled' : 'lastKnown',
        )}
      </LumenContentText>
    </LumenContentText>
  )
}
export function ToolBatchFeedback({
  counts,
  activities,
  finished = false,
  labels,
}: {
  readonly counts: ToolActivityCounts
  readonly activities?: readonly (SessionToolActivity | undefined)[]
  readonly finished?: boolean
  readonly labels: SessionToolFeedbackLabels
}) {
  const now = useSessionClock(activities?.some((activity) => activity?.active) ?? false)
  const durations = activities?.map((activity) => (activity ? toolElapsed(activity, now) : undefined))
  const totalDuration =
    durations?.length && durations.every((duration) => duration !== undefined)
      ? durations.reduce((sum, duration) => sum + (duration ?? 0), 0)
      : undefined
  if (counts.total === 0) return null
  const showProgress = !finished && (counts.running > 0 || counts.pending > 0)
  if (!showProgress && totalDuration === undefined) return null
  const succeeded = counts.outcomes?.succeeded ?? 0
  const failed = counts.outcomes?.failed ?? 0
  return (
    <LumenFrame className="hbar-tool-batch-feedback" data-tool-batch="true">
      {totalDuration !== undefined ? (
        <LumenContentText
          context="message.inline"
          className="hbar-tool-batch-metrics"
          data-tool-total-elapsed={totalDuration}
        >
          {labels.cumulativeDuration(totalDuration)}
        </LumenContentText>
      ) : null}
      {showProgress ? (
        <ProgressBar
          progress={{ completed: counts.settled, total: counts.total }}
          segments={[
            { state: 'succeeded', value: succeeded },
            { state: 'failed', value: failed },
            { state: 'running', value: counts.running },
            { state: 'pending', value: counts.total - succeeded - failed - counts.running },
          ]}
          counts={counts}
          labels={labels}
        />
      ) : null}
    </LumenFrame>
  )
}
