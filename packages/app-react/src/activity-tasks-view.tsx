import { CheckCircle2, Circle, LoaderCircle } from 'lucide-react'
import {
  LumenContentText,
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
} from '@lumen/app-ui'
import type { ComposerIntentState } from '@hbar/app-runtime'
import type { PlanStepStatus } from '@hbar/contracts'
import { projectActivityTasks } from './activity-tasks-model'
import { ActivityText, type ActivityTextLabels } from './activity-text'
import './activity-tasks-view.css'

export interface ActivityTaskLabels {
  readonly text: ActivityTextLabels
  readonly title: string
  readonly loading: string
  readonly retry: string
  readonly error: (code: string) => string
  readonly progress: (completed: number, total: number) => string
  readonly step: (text: string, status: PlanStepStatus) => string
}

/** Read-only, at most MAX_PLAN_STEPS (100). The containing Activity pane owns scrolling. */
export function ActivityTasksView({
  facts,
  sessionId,
  connected,
  labels,
  onRefresh,
}: {
  readonly facts: ComposerIntentState['facts']
  readonly sessionId: string
  readonly connected: boolean
  readonly labels: ActivityTaskLabels
  readonly onRefresh: () => void
}) {
  const { steps, completed, loading, failed } = projectActivityTasks(facts, sessionId)
  if (!loading && !failed && steps.length === 0) return null
  return (
    <LumenFrame as="section" className="hbar-activity-tasks" aria-label={labels.title}>
      <LumenFrame className="hbar-activity-section-heading">
        <LumenContentText context="section.subtitle">{labels.title}</LumenContentText>
        {steps.length > 0 && (
          <LumenFrame className="hbar-activity-task-progress">
            <progress max={steps.length} value={completed} aria-label={labels.progress(completed, steps.length)} />
            <LumenContentText context="message.inline">{labels.progress(completed, steps.length)}</LumenContentText>
          </LumenFrame>
        )}
      </LumenFrame>
      {loading && (
        <LumenContentText context="feedback.message" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {connected && failed && (
        <LumenFrame className="hbar-session-activity-recovery">
          <LumenContentText context="feedback.message" role="alert">
            {labels.error(facts.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          <LumenButton size="s" disabled={!connected} onClick={onRefresh}>
            {labels.retry}
          </LumenButton>
        </LumenFrame>
      )}
      {steps.length > 0 && (
        <LumenCollection as="ol" className="hbar-activity-task-list" tabIndex={0} aria-label={labels.title}>
          {steps.map((step, index) => (
            <LumenCollectionItem
              key={`${sessionId}:${index}:${step.step}`}
              className="hbar-activity-task-row"
              data-activity-task-status={step.status}
              aria-label={labels.step(step.step, step.status)}
              title={labels.step(step.step, step.status)}
            >
              <LumenIcon
                icon={
                  step.status === 'completed' ? CheckCircle2 : step.status === 'in_progress' ? LoaderCircle : Circle
                }
                tier="sm"
              />
              <ActivityText text={step.step} labels={labels.text} />
            </LumenCollectionItem>
          ))}
        </LumenCollection>
      )}
    </LumenFrame>
  )
}
