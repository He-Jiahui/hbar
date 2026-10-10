import { useMemo, useState } from 'react'
import { ChartNoAxesColumnIncreasing } from 'lucide-react'
import { LumenButton, LumenFrame, LumenText, LumenToolPane } from '@lumen/app-ui'
import { projectSessionDecisions } from '@hbar/app-runtime'
import type { ThreadGoal } from '@hbar/contracts'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarLumenDisclosure } from './lumen-disclosure'
import { HbarSessionRunHistory, type HbarSessionRunHistoryLabels } from './session-run-history'
import { HbarSessionRequestDetails, type HbarSessionRequestLabels } from './session-request-details'
import { HbarSessionMonitoringUsage, type HbarSessionMonitoringUsageLabels } from './session-monitoring-usage'
import { HbarGoalExecutionState, type HbarGoalExecutionLabels } from './goal-execution-state'
import { HbarSessionDecisionHistory, type HbarSessionDecisionHistoryLabels } from './session-decision-history'
import { HbarSessionDecision, type HbarSessionDecisionLabels } from './session-interactions'
import { monitoringDecisions } from './session-monitoring-decisions'
import './session-monitoring.css'

export interface HbarSessionMonitoringLabels extends HbarSessionMonitoringUsageLabels {
  readonly history: HbarSessionRunHistoryLabels
  readonly requests: HbarSessionRequestLabels
  readonly decisions: HbarSessionDecisionLabels
  readonly decisionHistory: HbarSessionDecisionHistoryLabels
  readonly goal: {
    readonly title: string
    readonly status: (status: ThreadGoal['status']) => string
    readonly execution: HbarGoalExecutionLabels
    readonly error: (code: string) => string
    readonly refresh: string
  }
  readonly title: string
  readonly description: string
  readonly close: string
  readonly empty: string
  readonly gap: string
}

/** One captured session owns execution, goal, request and usage details; the pane owns their scrolling. */
export function HbarSessionMonitoring({
  labels,
  instanceId: requestedInstanceId,
  targetLabel,
  connected = false,
}: {
  readonly labels: HbarSessionMonitoringLabels
  readonly instanceId?: string
  readonly targetLabel?: string | undefined
  readonly connected?: boolean
}) {
  const runtime = useHbarRuntime()
  const controls = useHbarRuntimeState(runtime.state.controls)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const timeline = useHbarRuntimeState(runtime.state.timeline)
  const intent = useHbarRuntimeState(runtime.state.composerIntent)
  const interactions = useHbarRuntimeState(runtime.state.interactions)
  const [requestsOpen, setRequestsOpen] = useState(false)
  const instanceId = requestedInstanceId ?? presentation.toolInstanceId
  const sessionId = instanceId ? (surfaces.panels[instanceId]?.sessionId ?? null) : navigation.sessionId
  const report =
    controls.sessionId === sessionId &&
    controls.usage?.scope.kind === 'session' &&
    controls.usage.scope.sessionId === sessionId
      ? controls.usage
      : null
  const facts = intent.facts.sessionId === sessionId ? intent.facts : null
  const snapshot = facts?.snapshot?.sessionId === sessionId ? facts.snapshot : null
  const goal = snapshot?.goal?.threadId === sessionId ? snapshot.goal : null
  const settled = useMemo(
    () =>
      timeline.sessionId === sessionId
        ? monitoringDecisions(
            projectSessionDecisions({
              sessionId: timeline.sessionId,
              messages: timeline.messages,
              approvals: timeline.approvals,
              userInputs: timeline.userInputs,
              events: timeline.events,
              actions: interactions,
            }),
            interactions,
          )
        : [],
    [
      timeline.sessionId,
      timeline.messages,
      timeline.approvals,
      timeline.userInputs,
      timeline.events,
      interactions,
      sessionId,
    ],
  )
  const close = () => {
    if (instanceId) void runtime.commands.execute('app.closePanel', { instanceId }).catch(() => {})
  }
  const readOnly = () => {}
  return (
    <LumenToolPane
      title={labels.title}
      targetLabel={targetLabel}
      description={labels.description}
      icon={ChartNoAxesColumnIncreasing}
      closeLabel={labels.close}
      onClose={close}
      className="hbar-app-react-session-monitoring"
    >
      <LumenFrame as="main" className="hbar-monitoring-content">
        <HbarSessionRunHistory sessionId={sessionId} connected={connected} labels={labels.history} />
        {connected && facts?.status === 'error' && (
          <LumenFrame className="hbar-monitoring-context-recovery">
            <LumenText as="p" role="alert">
              {labels.goal.error(facts.error ?? 'EXECUTION_FAILED')}
            </LumenText>
            <LumenButton
              size="s"
              variant="text"
              indicator="none"
              disabled={!connected}
              onClick={() => {
                if (sessionId) void runtime.commands.execute('composerIntent.refresh', { sessionId }).catch(() => {})
              }}
            >
              {labels.goal.refresh}
            </LumenButton>
          </LumenFrame>
        )}
        {goal && (
          <HbarLumenDisclosure
            className="hbar-monitoring-goal"
            label={
              <LumenFrame as="span" className="hbar-monitoring-section-heading">
                <LumenText as="span">{labels.goal.title}</LumenText>
                <LumenText as="span" tone="muted">
                  {labels.goal.status(goal.status)}
                </LumenText>
              </LumenFrame>
            }
          >
            <LumenText as="p" className="hbar-monitoring-objective">
              {goal.objective}
            </LumenText>
            <HbarGoalExecutionState
              goal={goal}
              remainingTokens={snapshot?.remainingTokens ?? null}
              labels={labels.goal.execution}
            />
          </HbarLumenDisclosure>
        )}
        {report?.gap && (
          <LumenText as="p" className="hbar-app-react-monitoring-gap" role="status">
            {labels.gap}
          </LumenText>
        )}
        {report ? (
          <HbarSessionMonitoringUsage key={`usage:${sessionId}`} report={report} labels={labels} />
        ) : (
          <LumenText as="p" className="hbar-app-react-monitoring-empty">
            {labels.empty}
          </LumenText>
        )}
        {sessionId && (
          <HbarLumenDisclosure
            label={labels.requests.title}
            open={requestsOpen}
            onOpenChange={setRequestsOpen}
            className="hbar-monitoring-request-disclosure"
          >
            {requestsOpen && (
              <HbarSessionRequestDetails
                key={sessionId}
                sessionId={sessionId}
                connected={connected}
                labels={labels.requests}
              />
            )}
          </HbarLumenDisclosure>
        )}
        <HbarSessionDecisionHistory
          key={`decisions:${sessionId}`}
          decisions={settled}
          labels={labels.decisionHistory}
          renderDecision={(decision) => (
            <HbarSessionDecision
              copyOwner={runtime}
              decision={decision}
              labels={labels.decisions}
              connected={false}
              onDecision={readOnly}
              onPlanExit={readOnly}
              onAnswer={readOnly}
              onSubmit={readOnly}
              onReconcile={readOnly}
            />
          )}
        />
      </LumenFrame>
    </LumenToolPane>
  )
}
