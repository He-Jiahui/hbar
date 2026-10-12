import { isSessionWorkspaceMoveLocked } from '@hbar/app-runtime'
import { LumenContentText, LumenButton, LumenFrame } from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarSessionRunActivity, type HbarSessionRunLabels } from './session-run-activity'
import { sessionPreparationStatus } from './session-execution-notice'
import { firstSendIsLocked } from './pre-session-launch-status'
import { useSessionStopAction } from './session-stop'
import { sessionStopCanCancel } from './session-stop-model'
import type { Run } from '@hbar/contracts'
import { runObservedEnd, type SessionClockSample } from './session-elapsed-model'
import { useSessionClock } from './session-tool-clock'
import { monitoringRuns } from './session-monitoring-model'
import { HbarSessionRunOverview, type HbarSessionRunOverviewLabels } from './session-run-overview'
import { createMessageScope } from './messages'

function RunTiming({
  run,
  clock,
  connected,
  format,
}: {
  readonly run: Run
  readonly clock: SessionClockSample | undefined
  readonly connected: boolean
  readonly format: HbarSessionRunHistoryLabels['duration']
}) {
  const now = useSessionClock(connected && Boolean(clock) && ['running', 'waiting_approval'].includes(run.status))
  const end = runObservedEnd(run, clock, now, connected)
  return (
    <LumenContentText
      context="message.inline"
      data-run-elapsed={end === null ? undefined : Math.max(0, end - (run.startedAt ?? run.createdAt))}
    >
      {format(run.startedAt ?? run.createdAt, end)}
    </LumenContentText>
  )
}

export interface HbarSessionRunHistoryLabels {
  readonly runs: HbarSessionRunLabels
  readonly loading: string
  readonly empty: string
  readonly retry: string
  readonly detail: (modelId: string) => string
  readonly duration: (startedAt: number, endedAt: number | null) => string
  readonly timestamp: (value: number) => string
  readonly error: (code: string) => string
  readonly source: (source: Run['input']['source']) => string
  readonly overview: HbarSessionRunOverviewLabels
}
type SessionRunHistoryMessages = Pick<
  HbarSessionRunHistoryLabels,
  'loading' | 'empty' | 'retry' | 'detail' | 'duration' | 'timestamp' | 'error' | 'source'
>
const { Provider: SessionRunHistoryMessagesProvider, useMessages: useSessionRunHistoryMessages } =
  createMessageScope<SessionRunHistoryMessages>()

/** The session-status pane owns history; rows keep the original Run action identity. */
function SessionRunHistoryContent({
  sessionId,
  connected,
  labels,
}: {
  readonly sessionId: string | null
  readonly connected: boolean
  readonly labels: HbarSessionRunHistoryLabels
}) {
  const { t } = useSessionRunHistoryMessages()
  const runtime = useHbarRuntime()
  const stopRun = useSessionStopAction()
  const timeline = useHbarRuntimeState(runtime.state.timeline)
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const tabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const runActions = useHbarRuntimeState(runtime.state.runActions)
  const access = useHbarRuntimeState(runtime.state.sessionExecutionAccess)
  const firstSendDrafts = useHbarRuntimeState(runtime.state.preSessionDrafts)
  const workspaceMoves = useHbarRuntimeState(runtime.state.sessionWorkspaceMove)
  const intent = useHbarRuntimeState(runtime.state.composerIntent)
  const ownsTimeline = sessionId !== null && timeline.sessionId === sessionId
  const runs = ownsTimeline ? monitoringRuns(timeline.runs, sessionId) : []
  const cancel = (operationId: string) => {
    void runtime.commands.execute('operation.cancel', { operationId }).catch(() => undefined)
  }
  const retry = (operationId: string) => {
    if (sessionId) void runtime.commands.execute('run.retry', { sessionId, operationId }).catch(() => undefined)
  }
  const refresh = () => {
    if (sessionId) void runtime.commands.execute('timeline.retry', { sessionId }).catch(() => undefined)
  }
  const firstSend = Object.values(firstSendDrafts).find(
    (draft) =>
      draft.sessionId === sessionId &&
      draft.capturedWorkspaceId === navigation.workspaceId &&
      draft.error !== 'GOAL_PREPARED' &&
      draft.phase !== 'accepted' &&
      draft.phase !== 'idle',
  )
  const move = sessionId
    ? (workspaceMoves.entries[sessionId] ??
      Object.values(workspaceMoves.entries).find((entry) => entry.targetSessionId === sessionId))
    : undefined
  const moveLocked = isSessionWorkspaceMoveLocked(move)
  const canRetry =
    connected &&
    ownsTimeline &&
    sessionId === navigation.sessionId &&
    sessionPreparationStatus(
      access,
      sessionId && navigation.workspaceId ? { sessionId, workspaceId: navigation.workspaceId } : null,
    ) === 'ready' &&
    !firstSendIsLocked(firstSend) &&
    !moveLocked
  const errorAction = runs
    .map((run) => runActions[run.id])
    .find((action) => action?.error && (!stopRun || action.commandId !== 'operation.cancel'))
  const snapshot =
    intent.facts.sessionId === sessionId && intent.facts.snapshot?.sessionId === sessionId
      ? intent.facts.snapshot
      : null
  const plan = snapshot ? snapshot.plan : ownsTimeline && timeline.plan?.sessionId === sessionId ? timeline.plan : null
  return (
    <LumenFrame className="hbar-session-status-runs">
      {!ownsTimeline || timeline.status === 'loading' ? (
        <LumenContentText context="feedback.message" role="status">
          {t('loading')}
        </LumenContentText>
      ) : null}
      {connected && ownsTimeline && timeline.status === 'error' ? (
        <LumenFrame role="alert">
          <LumenContentText context="section.description">
            {t('error')(timeline.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          <LumenButton size="s" variant="text" indicator="none" disabled={!connected} onClick={refresh}>
            {t('retry')}
          </LumenButton>
        </LumenFrame>
      ) : null}
      {ownsTimeline && timeline.status === 'ready' && runs.length === 0 ? (
        <LumenContentText context="section.description">{t('empty')}</LumenContentText>
      ) : null}
      <HbarSessionRunActivity
        key={sessionId}
        overview={<HbarSessionRunOverview runs={runs} labels={labels.overview} />}
        executionConfirmed={connected}
        runs={runs.map((run) => ({
          id: run.id,
          label: t('timestamp')(run.createdAt),
          status: run.status,
          ...(run.error ? { detail: run.error } : {}),
          model: t('detail')(run.modelId),
          source: t('source')(run.input.source),
          duration: <RunTiming run={run} clock={timeline.toolClock} connected={connected} format={t('duration')} />,
        }))}
        labels={labels.runs}
        plan={
          plan && (plan.plan.length > 0 || plan.explanation)
            ? {
                runId: plan.turnId,
                explanation: plan.explanation ?? undefined,
                steps: plan.plan.map((step, index) => ({
                  id: `${plan.updatedAt}:${index}`,
                  title: step.step,
                  status: step.status,
                })),
              }
            : undefined
        }
        cancellingRunIds={runs
          .filter(
            (run) =>
              runActions[run.id]?.commandId === 'operation.cancel' &&
              (runActions[run.id]?.requestInFlight ||
                ['submitting', 'unknown', 'succeeded'].includes(runActions[run.id]?.status ?? '')),
          )
          .map((run) => run.id)}
        canCancelRun={(operationId) =>
          sessionStopCanCancel(
            {
              hostId: runtime.hostId,
              runtimeId: runtime.instanceId,
              connected,
              navigation,
              tabs,
              presentation,
              surfaces,
              timeline,
              actions: runActions,
            },
            operationId,
          )
        }
        retryingRunIds={runs.filter((run) => runActions[run.id]?.status === 'submitting').map((run) => run.id)}
        canRetryNewRun={canRetry}
        unknownRetryRunIds={
          connected
            ? runs
                .filter(
                  (run) =>
                    runActions[run.id]?.commandId === 'run.retry' &&
                    (runActions[run.id]?.status === 'unknown' ||
                      (runActions[run.id]?.status === 'submitting' && runActions[run.id]?.phase === 'receipt')),
                )
                .map((run) => run.id)
            : []
        }
        feedback={connected && errorAction?.error ? t('error')(errorAction.error) : undefined}
        onCancelRun={connected ? (operationId) => (stopRun ? stopRun(operationId) : cancel(operationId)) : undefined}
        onRetryRun={connected ? retry : undefined}
      />
    </LumenFrame>
  )
}

/** Preserve direct SDK labels as the adapter while the view reads its own messages. */
export function HbarSessionRunHistory(props: {
  readonly sessionId: string | null
  readonly connected: boolean
  readonly labels: HbarSessionRunHistoryLabels
}) {
  const { labels, ...history } = props
  const messages: SessionRunHistoryMessages = {
    loading: labels.loading,
    empty: labels.empty,
    retry: labels.retry,
    detail: labels.detail,
    duration: labels.duration,
    timestamp: labels.timestamp,
    error: labels.error,
    source: labels.source,
  }
  return (
    <SessionRunHistoryMessagesProvider messages={messages}>
      <SessionRunHistoryContent {...history} labels={labels} />
    </SessionRunHistoryMessagesProvider>
  )
}
