import { useId, useMemo, useState } from 'react'
import { ChartNoAxesColumnIncreasing } from 'lucide-react'
import { LumenButton, LumenFrame, LumenToolPane, LumenTabs, LumenContentText } from '@lumen/app-ui'
import { projectSessionDecisions } from '@hbar/app-runtime'
import type { ThreadGoal } from '@hbar/contracts'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarLumenDisclosure } from './lumen-disclosure'
import { HbarSessionRunHistory, type HbarSessionRunHistoryLabels } from './session-run-history'
import { HbarSessionRequestDetails, type HbarSessionRequestLabels } from './session-request-details'
import { sessionMonitoringUsageMessages, SessionMonitoringUsageView, type HbarSessionMonitoringUsageLabels } from './session-monitoring-usage'
import { HbarGoalExecutionState, type HbarGoalExecutionLabels } from './goal-execution-state'
import { HbarSessionDecisionHistory, type HbarSessionDecisionHistoryLabels } from './session-decision-history'
import { HbarSessionDecision, type HbarSessionDecisionLabels } from './session-interactions'
import { monitoringDecisions } from './session-monitoring-decisions'
import './session-monitoring.css'
import { HbarSessionObservability, type HbarSessionObservabilityLabels } from './session-observability'
import { createMessageScope } from './messages'

export interface HbarSessionMonitoringLabels extends HbarSessionMonitoringUsageLabels {
  readonly observability: HbarSessionObservabilityLabels
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
  readonly tabs: Readonly<Record<'overview' | 'requests' | 'messages', string>>
  readonly description: string
  readonly close: string
  readonly empty: string
  readonly gap: string
}

const sessionMonitoringMessages = createMessageScope<HbarSessionMonitoringLabels>()

/** One captured session owns execution, goal, request and usage details; the pane owns their scrolling. */
function SessionMonitoringView({
  instanceId: requestedInstanceId,
  targetLabel,
  connected = false,
}: {
  readonly instanceId?: string
  readonly targetLabel?: string | undefined
  readonly connected?: boolean
}) {
  const { t } = sessionMonitoringMessages.useMessages()
  const runtime = useHbarRuntime()
  const controls = useHbarRuntimeState(runtime.state.controls)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const timeline = useHbarRuntimeState(runtime.state.timeline)
  const intent = useHbarRuntimeState(runtime.state.composerIntent)
  const interactions = useHbarRuntimeState(runtime.state.interactions)
  const namespace = useId()
  const [view, setView] = useState<{
    readonly sessionId: string | null
    readonly selected: 'overview' | 'requests' | 'messages'
    readonly requests: boolean
    readonly messages: boolean
  } | null>(null)
  const instanceId = requestedInstanceId ?? presentation.toolInstanceId
  const sessionId = instanceId ? (surfaces.panels[instanceId]?.sessionId ?? null) : navigation.sessionId
  const selected = view?.sessionId === sessionId ? view.selected : 'overview'
  const tabs = (['overview', 'requests', 'messages'] as const).map((id) => ({
    id,
    label: t('tabs')[id],
    tabId: `${namespace}-${id}-tab`,
    panelId: `${namespace}-${id}-panel`,
  }))
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
      title={t('title')}
      targetLabel={targetLabel}
      description={t('description')}
      icon={ChartNoAxesColumnIncreasing}
      closeLabel={t('close')}
      onClose={close}
      className="hbar-app-react-session-monitoring"
    >
      <LumenFrame as="main" key={sessionId} className="hbar-monitoring-content">
        <LumenTabs
          label={t('title')}
          items={tabs}
          selectedId={selected}
          onChange={(id) => {
            if (id !== 'overview' && id !== 'requests' && id !== 'messages') return
            setView((previous) => ({
              sessionId,
              selected: id,
              requests: id === 'requests' || (previous?.sessionId === sessionId && previous.requests),
              messages: id === 'messages' || (previous?.sessionId === sessionId && previous.messages),
            }))
          }}
        />
        <LumenFrame
          role="tabpanel"
          id={`${namespace}-overview-panel`}
          aria-labelledby={`${namespace}-overview-tab`}
          hidden={selected !== 'overview'}
          className="hbar-monitoring-overview"
        >
          <HbarSessionRunHistory sessionId={sessionId} connected={connected} labels={t('history')} />
          {connected && facts?.status === 'error' && (
            <LumenFrame className="hbar-monitoring-context-recovery">
              <LumenContentText context="feedback.message" role="alert">
                {t('goal').error(facts.error ?? 'EXECUTION_FAILED')}
              </LumenContentText>
              <LumenButton
                size="s"
                variant="text"
                indicator="none"
                disabled={!connected}
                onClick={() => {
                  if (sessionId) void runtime.commands.execute('composerIntent.refresh', { sessionId }).catch(() => {})
                }}
              >
                {t('goal').refresh}
              </LumenButton>
            </LumenFrame>
          )}
          {goal && (
            <HbarLumenDisclosure
              className="hbar-monitoring-goal"
              label={
                <LumenFrame as="span" className="hbar-monitoring-section-heading">
                  <LumenContentText context="control.label">{t('goal').title}</LumenContentText>
                  <LumenContentText context="control.label" tone="muted">
                    {t('goal').status(goal.status)}
                  </LumenContentText>
                </LumenFrame>
              }
            >
              <LumenContentText context="section.description" className="hbar-monitoring-objective">
                {goal.objective}
              </LumenContentText>
              <HbarGoalExecutionState
                goal={goal}
                remainingTokens={snapshot?.remainingTokens ?? null}
                labels={t('goal').execution}
              />
            </HbarLumenDisclosure>
          )}
          {report?.gap && !runtime.state.sessionObservability.available && (
            <LumenContentText context="feedback.message" className="hbar-app-react-monitoring-gap" role="status">
              {t('gap')}
            </LumenContentText>
          )}
          {sessionId && runtime.state.sessionObservability.available ? (
            <HbarSessionObservability
              sessionId={sessionId}
              connected={connected}
              active={selected === 'overview'}
              labels={t('observability')}
            />
          ) : report ? (
            <SessionMonitoringUsageView key={`usage:${sessionId}`} report={report} />
          ) : (
            <LumenContentText context="section.description" className="hbar-app-react-monitoring-empty">
              {t('empty')}
            </LumenContentText>
          )}
          <HbarSessionDecisionHistory
            key={`decisions:${sessionId}`}
            decisions={settled}
            labels={t('decisionHistory')}
            renderDecision={(decision) => (
              <HbarSessionDecision
                copyOwner={runtime}
                decision={decision}
                labels={t('decisions')}
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
        {(['requests', 'messages'] as const).map((id) => (
          <LumenFrame
            key={id}
            role="tabpanel"
            id={`${namespace}-${id}-panel`}
            aria-labelledby={`${namespace}-${id}-tab`}
            hidden={selected !== id}
            className="hbar-monitoring-detail-panel"
          >
            {sessionId && view?.sessionId === sessionId && view[id] ? (
              <HbarSessionRequestDetails
                sessionId={sessionId}
                connected={connected}
                labels={t('requests')}
                view={id}
              />
            ) : !sessionId ? (
              <LumenContentText context="feedback.detail">{t('empty')}</LumenContentText>
            ) : null}
          </LumenFrame>
        ))}
      </LumenFrame>
    </LumenToolPane>
  )
}

export function HbarSessionMonitoring({
  labels,
  ...props
}: {
  readonly labels: HbarSessionMonitoringLabels
  readonly instanceId?: string
  readonly targetLabel?: string | undefined
  readonly connected?: boolean
}) {
  return (
    <sessionMonitoringMessages.Provider messages={labels}>
      <sessionMonitoringUsageMessages.Provider messages={labels}>
        <SessionMonitoringView {...props} />
      </sessionMonitoringUsageMessages.Provider>
    </sessionMonitoringMessages.Provider>
  )
}
