import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { LumenContentText, LumenButton, LumenFrame, LumenIcon } from '@lumen/app-ui'
import type { ComposerIntentState } from '@hbar/app-runtime'
import type { RunStatus } from '@hbar/contracts'
import { projectActivityTasks } from './activity-tasks-model'
import { ActivityTasksView, type ActivityTaskLabels } from './activity-tasks-view'
import './session-live-status.css'
import { HbarSessionExecutionStatus } from './session-execution-status'
import { HbarContextHistory, type HbarContextHistoryLabels } from './session-context-history'
import type { ContextHistoryPage } from '@hbar/contracts/context-history'
import { createMessageScope } from './messages'

export interface HbarSessionLiveStatusLabels {
  readonly label: string
  readonly offline: string
  readonly statusLabel: (status: RunStatus) => string
  readonly expand: string
  readonly collapse: string
  readonly goal: string
  readonly tasks: ActivityTaskLabels
  readonly history?: HbarContextHistoryLabels
}

export interface HbarSessionLiveStatusProps {
  readonly sessionId: string
  readonly timelineSessionId: string | null
  readonly owned: boolean
  readonly connected: boolean
  readonly run: Readonly<{ id: string; status: RunStatus }> | undefined
  readonly labels: HbarSessionLiveStatusLabels
  readonly context?: {
    readonly facts: ComposerIntentState['facts']
    readonly summary: ReactNode
    readonly onRefresh: () => void
  }
  readonly history?: {
    readonly page: ContextHistoryPage | undefined
    readonly status: 'idle' | 'loading' | 'error' | undefined
    readonly error: string | null | undefined
    readonly before: number | null | undefined
    readonly onLoad: (before?: number) => void
    readonly onRetry?: () => void
  }
}

const SessionLiveStatusMessages = createMessageScope<{ readonly liveStatus: HbarSessionLiveStatusLabels }>()

/** Docked session context. The expanded pane owns scrolling for the Host's bounded 100-step Plan. */
export function HbarSessionLiveStatus(props: HbarSessionLiveStatusProps) {
  return (
    <SessionLiveStatusMessages.Provider messages={{ liveStatus: props.labels }}>
      <HbarSessionLiveStatusContent {...props} />
    </SessionLiveStatusMessages.Provider>
  )
}

function HbarSessionLiveStatusContent({
  sessionId,
  timelineSessionId,
  owned,
  connected,
  run,
  context,
  history,
}: Omit<HbarSessionLiveStatusProps, 'labels'>) {
  const { t } = SessionLiveStatusMessages.useMessages()
  const labels = t('liveStatus')
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const contentId = useId()
  const expanded = expandedSession === sessionId
  const currentRun =
    timelineSessionId === sessionId && run && ['queued', 'running', 'waiting_approval'].includes(run.status)
      ? run
      : undefined
  const snapshot =
    context?.facts.sessionId === sessionId && context.facts.snapshot?.sessionId === sessionId
      ? context.facts.snapshot
      : null
  const goal = snapshot?.goal?.threadId === sessionId && snapshot.goal.status !== 'complete' ? snapshot.goal : null
  const tasks = context ? projectActivityTasks(context.facts, sessionId) : null
  const currentHistory = timelineSessionId === sessionId && history?.page?.sessionId === sessionId ? history : undefined
  const hasHistory = Boolean(
    labels.history &&
    currentHistory &&
    (currentHistory.page?.records.length ||
      currentHistory.page?.current.turns ||
      currentHistory.page?.current.tools.total ||
      currentHistory.page?.current.usage.recorded),
  )
  const hasDetails = Boolean(goal || tasks?.steps.length || tasks?.explanation || tasks?.failed || hasHistory)
  const visible = Boolean(currentRun || hasDetails)
  const summaryOwned = context?.facts.sessionId === sessionId
  if (!owned) return null
  // Keep pending/failed Goal commands reachable even when no Goal or Run has been saved yet.
  // Its component stays mounted when a clear event precedes the command acknowledgement (focus/recovery lease).
  if (!visible && !context) return null
  return (
    <LumenFrame
      as="section"
      className="hbar-session-live-status"
      data-session-live-status={visible ? (currentRun?.id ?? sessionId) : undefined}
      data-session-id={sessionId}
      data-run-status={connected ? currentRun?.status : 'unconfirmed'}
      data-expanded={hasDetails && expanded}
      data-visible={visible}
      aria-label={labels.label}
    >
      <LumenFrame className="hbar-session-live-status-header">
        {hasDetails ? (
          <LumenButton
            className="hbar-session-live-status-toggle"
            type="button"
            size="s"
            variant="text"
            indicator="none"
            aria-label={expanded ? labels.collapse : labels.expand}
            title={expanded ? labels.collapse : labels.expand}
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpandedSession(expanded ? null : sessionId)}
          >
            <LumenIcon icon={expanded ? ChevronDown : ChevronRight} tier="sm" />
            <LumenContentText context="choice.title">{labels.label}</LumenContentText>
            {Boolean(tasks?.steps.length) && (
              <LumenContentText context="control.status" className="hbar-session-live-status-progress">
                {labels.tasks.progress(tasks?.completed ?? 0, tasks?.steps.length ?? 0)}
              </LumenContentText>
            )}
          </LumenButton>
        ) : currentRun ? (
          <LumenContentText context="record.title">{labels.label}</LumenContentText>
        ) : null}
        {summaryOwned && (
          <LumenFrame key="goal" className="hbar-session-live-status-goal">
            {context.summary}
          </LumenFrame>
        )}
        {(currentRun || (visible && !connected)) && (
          <LumenFrame role="status" aria-live="polite" aria-atomic="true" className="hbar-session-live-status-badge">
            <HbarSessionExecutionStatus
              state={connected && currentRun ? currentRun.status : 'unconfirmed'}
              label={connected && currentRun ? labels.statusLabel(currentRun.status) : labels.offline}
              tone={
                !connected || currentRun?.status === 'waiting_approval'
                  ? 'warning'
                  : currentRun?.status === 'running'
                    ? 'info'
                    : 'neutral'
              }
            />
          </LumenFrame>
        )}
      </LumenFrame>
      {hasDetails && (
        <LumenFrame
          id={contentId}
          className="hbar-session-live-status-details"
          hidden={!expanded}
          tabIndex={0}
          role="region"
          aria-label={labels.label}
        >
          {context && (
            <ActivityTasksView
              facts={context.facts}
              sessionId={sessionId}
              connected={connected}
              labels={labels.tasks}
              onRefresh={context.onRefresh}
            />
          )}
          {tasks?.explanation && <LumenContentText context="section.description">{tasks.explanation}</LumenContentText>}
          {goal && (
            <LumenFrame as="section" className="hbar-session-live-status-objective" aria-label={labels.goal}>
              <LumenContentText context="section.subtitle">{labels.goal}</LumenContentText>
              <LumenContentText context="section.description">{goal.objective}</LumenContentText>
            </LumenFrame>
          )}
          {labels.history && hasHistory && currentHistory && (
            <HbarContextHistory
              sessionId={sessionId}
              page={currentHistory.page}
              status={currentHistory.status}
              error={currentHistory.error}
              before={currentHistory.before}
              onLoad={currentHistory.onLoad}
              {...(currentHistory.onRetry ? { onRetry: currentHistory.onRetry } : {})}
              labels={labels.history}
            />
          )}
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
