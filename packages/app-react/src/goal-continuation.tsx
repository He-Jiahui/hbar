import { Target } from 'lucide-react'
import { LumenFrame, LumenIcon, LumenContentText } from '@lumen/app-ui'
import type { GoalContinuationBoundary } from './session-message-model'
import './goal-continuation.css'

export interface HbarGoalContinuationLabels {
  readonly title: string
  readonly statuses: Readonly<Record<GoalContinuationBoundary['status'], string>>
  readonly accessible: (title: string, status: string) => string
}

/** A read-only persisted Run boundary; not a user message or a live Goal status. */
export function HbarGoalContinuation({
  continuation,
  labels,
}: {
  readonly continuation: GoalContinuationBoundary
  readonly labels: HbarGoalContinuationLabels
}) {
  const status = labels.statuses[continuation.status]
  return (
    <LumenFrame
      className="hbar-goal-continuation"
      role="separator"
      aria-label={labels.accessible(labels.title, status)}
      data-goal-continuation-run={continuation.runId}
      data-goal-continuation-session={continuation.sessionId}
      data-run-status={continuation.status}
    >
      <LumenFrame className="hbar-goal-continuation-rule" aria-hidden="true" />
      <LumenFrame className="hbar-goal-continuation-label">
        <LumenIcon icon={Target} tier="sm" />
        <LumenContentText context="collection.title" className="hbar-goal-continuation-title">
          {labels.title}
        </LumenContentText>
        <LumenContentText context="collection.detail" className="hbar-goal-continuation-status">
          {status}
        </LumenContentText>
      </LumenFrame>
      <LumenFrame className="hbar-goal-continuation-rule" aria-hidden="true" />
    </LumenFrame>
  )
}
