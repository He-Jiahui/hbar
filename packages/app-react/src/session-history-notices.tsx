import type { HbarSessionWorkspaceProps } from './session-workspace-contract'
import { useMemo } from 'react'
import { LumenContentText, LumenFrame, LumenButton } from '@lumen/app-ui'
import { getGoalHistoryProjection, GOAL_HISTORY_MAX_FACTS } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeSelector, useHbarRuntimeState } from './runtime'

import './lumen-session-workspace.css'
import { memo } from 'react'
import { useSessionHistoryMessages } from './session-workspace-messages'
export const SessionHistoryNotices = memo(function SessionHistoryNotices({
  connected,
}: Pick<HbarSessionWorkspaceProps, 'connected'>) {
  const { t } = useSessionHistoryMessages()
  const runtime = useHbarRuntime()
  const sessionId = useHbarRuntimeSelector(runtime.state.navigation, (state) => state.sessionId)
  const timeline = useHbarRuntimeState(runtime.state.timeline)
  const goalHistoryAvailable = useHbarRuntimeSelector(runtime.state.goalHistory, (state) => state.available)
  const goalHistoryEntry = useHbarRuntimeSelector(runtime.state.goalHistory, (state) =>
    sessionId ? state.sessions[sessionId] : undefined,
  )
  const goalHistoryProjection = useMemo(
    () => (goalHistoryEntry ? getGoalHistoryProjection(goalHistoryEntry) : null),
    [goalHistoryEntry],
  )
  const goal = useHbarRuntimeSelector(runtime.state.composerIntent, (state) =>
    state.facts.sessionId === sessionId ? state.facts.snapshot?.goal : undefined,
  )
  const invoke = (
    name: 'timeline.retry' | 'timeline.loadOlder' | 'goalHistory.refresh' | 'goalHistory.loadOlder',
    input: { readonly sessionId: string },
  ) => void runtime.commands.execute(name, input).catch(() => undefined)
  const retryTimeline = () => sessionId && invoke('timeline.retry', { sessionId })
  const loadOlder = () => sessionId && invoke('timeline.loadOlder', { sessionId })
  const historyNotices =
    connected && sessionId ? (
      <LumenFrame className="hbar-app-react-session-history-controls">
        {timeline.status === 'loading' && timeline.messages.length > 0 && (
          <LumenContentText context="feedback.message" role="status">
            {t('refreshing')}
          </LumenContentText>
        )}
        {timeline.status === 'error' && timeline.messages.length > 0 && (
          <LumenFrame className="hbar-app-react-session-history-error" role="alert">
            <LumenContentText context="message.inline">
              {t('error')(timeline.error ?? 'EXECUTION_FAILED')}
            </LumenContentText>
            {connected && (
              <LumenButton size="s" onClick={retryTimeline}>
                {t('retryTimeline')}
              </LumenButton>
            )}
          </LumenFrame>
        )}
        {timeline.olderStatus === 'limit' ? (
          <LumenContentText context="feedback.message" role="status">
            {t('historyLimit')}
          </LumenContentText>
        ) : timeline.olderStatus === 'loading' ? (
          <LumenContentText context="feedback.message" role="status">
            {t('loadingOlder')}
          </LumenContentText>
        ) : timeline.olderStatus === 'error' ? (
          <LumenFrame className="hbar-app-react-session-history-page">
            <LumenContentText context="message.inline" role="alert">
              {t('error')(timeline.olderError ?? 'EXECUTION_FAILED')}
            </LumenContentText>
            <LumenButton size="s" disabled={!connected} onClick={loadOlder}>
              {t('retryHistory')}
            </LumenButton>
          </LumenFrame>
        ) : timeline.hasOlder ? (
          <LumenContentText context="feedback.message" role="status">
            {t('loadOlder')}
          </LumenContentText>
        ) : null}
        {(goalHistoryAvailable || goal) && goalHistoryProjection && (
          <LumenFrame
            className="hbar-app-react-session-history-page"
            data-goal-history-gap={goalHistoryProjection.gapReason ?? undefined}
          >
            {goalHistoryProjection.status === 'loading' ? (
              <LumenContentText context="message.inline" role="status">
                {t('goalHistory').loading}
              </LumenContentText>
            ) : goalHistoryProjection.gapReason ? (
              <LumenContentText
                context="message.inline"
                role={goalHistoryProjection.gapReason === 'error' ? 'alert' : 'status'}
              >
                {t('goalHistory').gap(goalHistoryProjection.gapReason)}
              </LumenContentText>
            ) : null}
            {goalHistoryProjection.limit && (
              <LumenContentText context="message.inline" role="status">
                {t('goalHistory').limit(GOAL_HISTORY_MAX_FACTS)}
              </LumenContentText>
            )}
            {goalHistoryAvailable &&
              goalHistoryProjection.gap &&
              goalHistoryProjection.status !== 'loading' &&
              goalHistoryProjection.gapReason !== 'limit' && (
                <LumenButton
                  size="s"
                  disabled={
                    !connected || timeline.status !== 'ready' || goalHistoryProjection.olderStatus === 'loading'
                  }
                  onClick={() => invoke('goalHistory.refresh', { sessionId })}
                >
                  {t('goalHistory').refresh}
                </LumenButton>
              )}
            {goalHistoryAvailable &&
              !goalHistoryProjection.stale &&
              !goalHistoryProjection.limit &&
              goalHistoryProjection.hasOlder &&
              (!timeline.hasOlder || goalHistoryProjection.gap) && (
                <LumenButton
                  size="s"
                  disabled={
                    !connected ||
                    timeline.status !== 'ready' ||
                    goalHistoryProjection.status === 'loading' ||
                    goalHistoryProjection.olderStatus === 'loading'
                  }
                  onClick={() => invoke('goalHistory.loadOlder', { sessionId })}
                >
                  {goalHistoryProjection.olderStatus === 'loading'
                    ? t('goalHistory').loadingOlder
                    : goalHistoryProjection.olderStatus === 'error'
                      ? t('goalHistory').retryOlder
                      : t('goalHistory').loadOlder}
                </LumenButton>
              )}
          </LumenFrame>
        )}
      </LumenFrame>
    ) : null
  return historyNotices
})
