import { CheckCircle2, Circle, LoaderCircle } from 'lucide-react'
import {
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenContentText,
  LumenProgress,
} from '@lumen/app-ui'
import type { ComposerIntentState } from '@hbar/app-runtime'
import type { PlanStepStatus } from '@hbar/contracts'
import { projectActivityTasks } from './activity-tasks-model'
import './activity-tasks-view.css'

export interface ActivityTaskLabels {
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
  const { steps, revision, completed, loading, failed } = projectActivityTasks(facts, sessionId)
  if (!loading && !failed && steps.length === 0) return null
  return (
    <LumenFrame as="section" className="hbar-activity-tasks" aria-label={labels.title}>
      <LumenFrame className="hbar-activity-section-heading">
        <LumenContentText context="section.title" level={3}>
          {labels.title}
        </LumenContentText>
        {steps.length > 0 && (
          <LumenFrame
            className="hbar-activity-reader hbar-activity-task-progress"
            role="region"
            aria-label={labels.progress(completed, steps.length)}
            tabIndex={0}
          >
            <LumenProgress
              maximum={steps.length}
              value={completed}
              label={labels.progress(completed, steps.length)}
              tone="success"
            />
            <LumenContentText context="metadata">{labels.progress(completed, steps.length)}</LumenContentText>
          </LumenFrame>
        )}
      </LumenFrame>
      {loading && (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {failed && (
        <LumenFrame className="hbar-session-activity-recovery">
          <LumenContentText context="feedback.paragraph" role="alert">
            {labels.error(facts.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          <LumenFrame className="hbar-activity-reader" role="group" aria-label={labels.retry} tabIndex={0}>
            <LumenButton size="s" disabled={!connected} onClick={onRefresh}>
              {labels.retry}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
      )}
      {steps.length > 0 && (
        <LumenCollection as="ol" className="hbar-activity-task-list" tabIndex={0} aria-label={labels.title}>
          {steps.map((step, index) => (
            <LumenCollectionItem
              key={`${revision}:${index}`}
              className="hbar-activity-task-row"
              data-activity-task-status={step.status}
              aria-label={labels.step(step.step, step.status)}
              title={labels.step(step.step, step.status)}
            >
              <LumenIcon
                icon={
                  step.status === 'completed' ? CheckCircle2 : step.status === 'in_progress' ? LoaderCircle : Circle
                }
                tier="md"
              />
              <LumenContentText context="collection.title">{step.step}</LumenContentText>
            </LumenCollectionItem>
          ))}
        </LumenCollection>
      )}
    </LumenFrame>
  )
}
