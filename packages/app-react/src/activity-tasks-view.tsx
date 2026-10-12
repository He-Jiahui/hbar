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
import { createMessageScope } from './messages'
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
export const activityTaskMessages = createMessageScope<ActivityTaskLabels>()

interface ActivityTasksViewProps {
  readonly facts: ComposerIntentState['facts']
  readonly sessionId: string
  readonly connected: boolean
  readonly labels: ActivityTaskLabels
  readonly onRefresh: () => void
}

/** Read-only, at most MAX_PLAN_STEPS (100). The containing Activity pane owns scrolling. */
export function ActivityTasksView(props: ActivityTasksViewProps) {
  const { labels, ...contentProps } = props
  return (
    <activityTaskMessages.Provider messages={labels}>
      <ActivityTasksContent {...contentProps} />
    </activityTaskMessages.Provider>
  )
}

type ActivityTasksContentProps = Omit<ActivityTasksViewProps, 'labels'>

function ActivityTasksContent({
  facts,
  sessionId,
  connected,
  onRefresh,
}: ActivityTasksContentProps) {
  const { t } = activityTaskMessages.useMessages()
  const { steps, completed, loading, failed } = projectActivityTasks(facts, sessionId)
  if (!loading && !failed && steps.length === 0) return null
  return (
    <LumenFrame as="section" className="hbar-activity-tasks" aria-label={t('title')}>
      <LumenFrame className="hbar-activity-section-heading">
        <LumenContentText context="section.subtitle">{t('title')}</LumenContentText>
        {steps.length > 0 && (
          <LumenFrame className="hbar-activity-task-progress">
            <progress max={steps.length} value={completed} aria-label={t('progress')(completed, steps.length)} />
            <LumenContentText context="message.inline">{t('progress')(completed, steps.length)}</LumenContentText>
          </LumenFrame>
        )}
      </LumenFrame>
      {loading && (
        <LumenContentText context="feedback.message" role="status">
          {t('loading')}
        </LumenContentText>
      )}
      {failed && (
        <LumenFrame className="hbar-session-activity-recovery">
          <LumenContentText context="feedback.message" role="alert">
            {t('error')(facts.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          <LumenButton size="s" disabled={!connected} onClick={onRefresh}>
            {t('retry')}
          </LumenButton>
        </LumenFrame>
      )}
      {steps.length > 0 && (
        <LumenCollection as="ol" className="hbar-activity-task-list" tabIndex={0} aria-label={t('title')}>
          {steps.map((step, index) => (
            <LumenCollectionItem
              key={`${sessionId}:${index}:${step.step}`}
              className="hbar-activity-task-row"
              data-activity-task-status={step.status}
              aria-label={t('step')(step.step, step.status)}
              title={t('step')(step.step, step.status)}
            >
              <LumenIcon
                icon={
                  step.status === 'completed' ? CheckCircle2 : step.status === 'in_progress' ? LoaderCircle : Circle
                }
                tier="sm"
              />
              <ActivityText text={step.step} labels={t('text')} />
            </LumenCollectionItem>
          ))}
        </LumenCollection>
      )}
    </LumenFrame>
  )
}
