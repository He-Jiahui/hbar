import { Target } from 'lucide-react'
import { LumenContentText, LumenFrame, LumenIcon } from '@lumen/app-ui'
import type { GoalContinuationBoundary } from './session-message-model'
import { createMessageScope } from './messages'
import './goal-continuation.css'

export interface HbarGoalContinuationLabels {
  readonly title: string
  readonly statuses: Readonly<Record<GoalContinuationBoundary['status'], string>>
  readonly accessible: (title: string, status: string) => string
}
const goalContinuationMessages = createMessageScope<HbarGoalContinuationLabels>()

/** A read-only persisted Run boundary; not a user message or a live Goal status. */
export function HbarGoalContinuation(props: {
  readonly continuation: GoalContinuationBoundary
  readonly labels: HbarGoalContinuationLabels
}) {
  const { labels, ...viewProps } = props
  return (
    <goalContinuationMessages.Provider messages={labels}>
      <GoalContinuationContent {...viewProps} />
    </goalContinuationMessages.Provider>
  )
}

function GoalContinuationContent({ continuation }: { readonly continuation: GoalContinuationBoundary }) {
  const { t } = goalContinuationMessages.useMessages()
  const status = t('statuses')[continuation.status]
  return (
    <LumenFrame
      className="hbar-goal-continuation"
      role="separator"
      aria-label={t('accessible')(t('title'), status)}
      data-goal-continuation-run={continuation.runId}
      data-goal-continuation-session={continuation.sessionId}
      data-run-status={continuation.status}
    >
      <LumenFrame className="hbar-goal-continuation-rule" aria-hidden="true" />
      <LumenFrame className="hbar-goal-continuation-label">
        <LumenIcon icon={Target} tier="sm" />
        <LumenContentText context="message.inline" className="hbar-goal-continuation-title">
          {t('title')}
        </LumenContentText>
        <LumenContentText context="control.status" className="hbar-goal-continuation-status">
          {status}
        </LumenContentText>
      </LumenFrame>
      <LumenFrame className="hbar-goal-continuation-rule" aria-hidden="true" />
    </LumenFrame>
  )
}
