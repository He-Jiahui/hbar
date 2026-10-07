import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarSessionRunActivity, type HbarSessionRunLabels } from './session-run-activity'
import { sessionPreparationStatus } from './session-execution-notice'
import { firstSendIsLocked } from './pre-session-launch-status'
import { useSessionStopAction } from './session-stop'
import { sessionStopCanCancel } from './session-stop-model'

export interface HbarSessionRunHistoryLabels {
  readonly runs: HbarSessionRunLabels
  readonly loading: string
  readonly empty: string
  readonly retry: string
  readonly detail: (modelId: string) => string
  readonly duration: (startedAt: number, endedAt: number | null) => string
  readonly timestamp: (value: number) => string
  readonly error: (code: string) => string
}

/** The session-status pane owns history; rows keep the original Run action identity. */
export function HbarSessionRunHistory({
  sessionId,
  connected,
  labels,
}: {
  readonly sessionId: string | null
  readonly connected: boolean
  readonly labels: HbarSessionRunHistoryLabels
}) {
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
  const ownsTimeline = sessionId !== null && timeline.sessionId === sessionId
  const runs = ownsTimeline ? timeline.runs.filter((run) => run.sessionId === sessionId) : []
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
  const moveLocked = Boolean(
    move &&
    move.status !== 'succeeded' &&
    (move.status === 'busy' || move.status === 'unknown' || move.status === 'paused' || move.targetSessionId !== null),
  )
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
  const plan = ownsTimeline ? timeline.plan : null
  return (
    <LumenFrame className="hbar-session-status-runs">
      {!ownsTimeline || timeline.status === 'loading' ? (
        <LumenText as="p" role="status">
          {labels.loading}
        </LumenText>
      ) : null}
      {ownsTimeline && timeline.status === 'error' ? (
        <LumenFrame role="alert">
          <LumenText as="p">{labels.error(timeline.error ?? 'EXECUTION_FAILED')}</LumenText>
          <LumenButton size="s" variant="text" indicator="none" disabled={!connected} onClick={refresh}>
            {labels.retry}
          </LumenButton>
        </LumenFrame>
      ) : null}
      {ownsTimeline && timeline.status === 'ready' && runs.length === 0 ? (
        <LumenText as="p">{labels.empty}</LumenText>
      ) : null}
      <HbarSessionRunActivity
        key={sessionId}
        runs={runs.map((run) => ({
          id: run.id,
          label: labels.timestamp(run.createdAt),
          status: run.status,
          detail: run.error ?? labels.detail(run.modelId),
          duration: labels.duration(run.startedAt ?? run.createdAt, run.endedAt),
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
        feedback={errorAction?.error ? labels.error(errorAction.error) : undefined}
        onCancelRun={connected ? (operationId) => (stopRun ? stopRun(operationId) : cancel(operationId)) : undefined}
        onRetryRun={connected ? retry : undefined}
      />
    </LumenFrame>
  )
}
