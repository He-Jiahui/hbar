import { useCallback, useEffect } from 'react'
import { ListTodo, RefreshCw } from 'lucide-react'
import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenOption,
  LumenText,
  LumenButton,
  LumenCompactMetrics,
  LumenFormField,
  LumenIcon,
  LumenIconButton,
  LumenInput,
  LumenSelect,
  LumenStatus,
  LumenTextarea,
  LumenToolPane,
  type LumenPlanEditorLabels,
} from '@lumen/app-ui'
import type { GoalPlanGoalDraftState, GoalPlanStepDraftState } from '@hbar/app-runtime'
import { goalControlStatusSchema } from '@hbar/contracts'
import { HbarGoalExecutionState, type HbarGoalExecutionLabels } from './goal-execution-state'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarWorkflowOverview, type HbarWorkflowOverviewLabels } from './workflow-overview'
import './goal-plan-workspace.css'

type GoalStatus = GoalPlanGoalDraftState['status']
type PlanStepStatus = GoalPlanStepDraftState['status']

export interface HbarGoalPlanWorkspaceLabels {
  readonly title: string
  readonly description: string
  readonly close: string
  readonly refresh: string
  readonly loading: string
  readonly back: string
  readonly unavailable: string
  readonly goal: {
    readonly execution: HbarGoalExecutionLabels
    readonly title: string
    readonly objective: string
    readonly objectivePlaceholder: string
    readonly tokenBudget: string
    readonly status: string
    readonly statuses: Readonly<Record<GoalStatus, string>>
    readonly create: string
    readonly edit: string
    readonly empty: string
    readonly save: string
    readonly saving: string
    readonly clear: string
    readonly reconcile: string
    readonly saved: string
    readonly cleared: string
    readonly remaining: string
    readonly used: string
    readonly elapsed: string
  }
  readonly plan: LumenPlanEditorLabels & {
    readonly explanation: string
    readonly explanationPlaceholder: string
    readonly edit: string
    readonly clear: string
    readonly reconcile: string
    readonly saved: string
    readonly cleared: string
    readonly count: (count: number) => string
    readonly stepTitle: (index: number) => string
    readonly stepStatus: (index: number) => string
    readonly statuses: Readonly<Record<PlanStepStatus, string>>
  }
  readonly workflow: HbarWorkflowOverviewLabels
  readonly number: (value: number) => string
  readonly duration: (seconds: number) => string
  readonly issue: (field: string) => string
  readonly error: (code: string) => string
}

function goalTone(status: GoalStatus): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'complete') return 'success'
  if (status === 'blocked' || status === 'budget_limited' || status === 'usage_limited') return 'warning'
  return 'neutral'
}

function stepTone(status: PlanStepStatus): 'neutral' | 'success' | 'warning' {
  if (status === 'completed') return 'success'
  if (status === 'in_progress') return 'warning'
  return 'neutral'
}

export function HbarGoalPlanWorkspace({
  labels,
  connected,
  instanceId: requestedInstanceId,
  targetLabel,
}: {
  readonly labels: HbarGoalPlanWorkspaceLabels
  readonly connected: boolean
  readonly instanceId?: string
  readonly targetLabel?: string | undefined
}) {
  const runtime = useHbarRuntime()
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const goals = useHbarRuntimeState(runtime.state.goals)
  const workflows = useHbarRuntimeState(runtime.state.workflows)
  const instanceId = requestedInstanceId ?? presentation.toolInstanceId
  const panel = instanceId ? surfaces.panels[instanceId] : undefined
  const entry = instanceId ? goals.entries[instanceId] : undefined
  const workflowEntry = instanceId ? workflows.entries[instanceId] : undefined
  const invoke = useCallback(
    (name: string, input: unknown) =>
      void (runtime.commands.execute as (command: string, value: unknown) => Promise<unknown>)(name, input).catch(
        () => {},
      ),
    [runtime.commands],
  )
  useEffect(() => {
    if (!instanceId || panel?.panelId !== 'goals' || !panel.sessionId) return
    if (entry?.sessionId !== panel.sessionId) invoke('goalPlanWorkspace.refresh', { instanceId })
    if (workflowEntry?.sessionId !== panel.sessionId) invoke('workflowWorkspace.refresh', { instanceId })
  }, [entry?.sessionId, instanceId, invoke, panel?.panelId, panel?.sessionId, workflowEntry?.sessionId])
  if (!instanceId || panel?.panelId !== 'goals') return null

  const goalBusy = entry?.goalAction.status === 'submitting' || entry?.goalAction.status === 'unknown'
  const planBusy = entry?.planAction.status === 'submitting' || entry?.planAction.status === 'unknown'
  const workflowBusy = Object.values(workflowEntry?.actions ?? {}).some(
    (action) => action.status === 'submitting' || action.status === 'unknown',
  )
  const view = entry?.view ?? 'overview'
  const setGoalField = (field: string, value: string) =>
    invoke('goalPlanWorkspace.setGoalField', { instanceId, field, value })
  const back = () => invoke('goalPlanWorkspace.showOverview', { instanceId })

  return (
    <LumenToolPane
      title={labels.title}
      targetLabel={targetLabel}
      description={labels.description}
      icon={ListTodo}
      backLabel={view === 'overview' ? undefined : labels.back}
      closeLabel={labels.close}
      onBack={view === 'overview' ? undefined : back}
      onClose={() => invoke('app.closePanel', { instanceId })}
      busy={Boolean(!entry || entry.status === 'loading' || goalBusy || planBusy || workflowBusy)}
      actions={
        <>
          <LumenIconButton
            label={labels.refresh}
            disabled={!connected || entry?.status === 'loading'}
            onClick={() => {
              invoke('goalPlanWorkspace.refresh', { instanceId })
              invoke('workflowWorkspace.refresh', { instanceId })
            }}
          >
            <LumenIcon icon={RefreshCw} tier="sm" />
          </LumenIconButton>
        </>
      }
      className="hbar-app-react-goal-plan-workspace"
    >
      {!entry || entry.status === 'loading' ? (
        <LumenText as="p" className="hbar-app-react-goal-plan-loading">
          {labels.loading}
        </LumenText>
      ) : entry.error ? (
        <LumenText as="p" className="hbar-app-react-goal-plan-loading" role="alert">
          {labels.error(entry.error)}
        </LumenText>
      ) : view === 'goal' ? (
        <LumenFrame as="main" className="hbar-app-react-goal-editor-view">
          <LumenFrame
            as="form"
            className="hbar-app-react-goal-editor"
            onSubmit={(event) => {
              event.preventDefault()
              invoke('goalPlanWorkspace.saveGoal', { instanceId })
            }}
          >
            <LumenText as="h2">{labels.goal.title}</LumenText>
            <LumenFrame as="fieldset" disabled={!connected || goalBusy}>
              <LumenFormField
                controlId={`${instanceId}-goal-objective`}
                label={labels.goal.objective}
                required
                {...(entry.goalDraft.issues.objective ? { error: labels.issue('objective') } : {})}
              >
                <LumenTextarea
                  id={`${instanceId}-goal-objective`}
                  required
                  value={entry.goalDraft.objective}
                  placeholder={labels.goal.objectivePlaceholder}
                  onChange={(event) => setGoalField('objective', event.currentTarget.value)}
                />
              </LumenFormField>
              <LumenFormField
                controlId={`${instanceId}-goal-budget`}
                label={labels.goal.tokenBudget}
                {...(entry.goalDraft.issues.tokenBudget ? { error: labels.issue('tokenBudget') } : {})}
              >
                <LumenInput
                  id={`${instanceId}-goal-budget`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1_000_000_000}
                  value={entry.goalDraft.tokenBudget}
                  onChange={(event) => setGoalField('tokenBudget', event.currentTarget.value)}
                />
              </LumenFormField>
              {entry.goal && (
                <LumenFormField controlId={`${instanceId}-goal-status`} label={labels.goal.status}>
                  <LumenSelect
                    id={`${instanceId}-goal-status`}
                    value={entry.goalDraft.status}
                    onChange={(event) => setGoalField('status', event.currentTarget.value)}
                  >
                    {!goalControlStatusSchema.safeParse(entry.goalDraft.status).success && (
                      <LumenOption value={entry.goalDraft.status} disabled>
                        {labels.goal.statuses[entry.goalDraft.status]}
                      </LumenOption>
                    )}
                    {goalControlStatusSchema.options.map((status) => (
                      <LumenOption key={status} value={status}>
                        {labels.goal.statuses[status]}
                      </LumenOption>
                    ))}
                  </LumenSelect>
                </LumenFormField>
              )}
            </LumenFrame>
            {entry.goalAction.error && (
              <LumenText as="p" role="alert">
                {labels.error(entry.goalAction.error)}
              </LumenText>
            )}
            {entry.goalAction.status === 'succeeded' && (
              <LumenText as="p" role="status">
                {labels.goal.saved}
              </LumenText>
            )}
            <LumenFrame as="footer">
              {entry.goalAction.status === 'unknown' ? (
                <LumenButton onClick={() => invoke('goalPlanWorkspace.refresh', { instanceId })}>
                  {labels.goal.reconcile}
                </LumenButton>
              ) : (
                <LumenButton
                  type="submit"
                  tone="primary"
                  disabled={!connected || !entry.goalDirty || entry.goalAction.status === 'submitting'}
                >
                  {entry.goalAction.status === 'submitting' ? labels.goal.saving : labels.goal.save}
                </LumenButton>
              )}
            </LumenFrame>
          </LumenFrame>
        </LumenFrame>
      ) : (
        <LumenFrame as="main" className="hbar-app-react-goal-plan-overview">
          <LumenFrame as="section">
            <LumenFrame as="header">
              <LumenText as="h2">{labels.goal.title}</LumenText>
              {entry.goal && (
                <LumenStatus value={labels.goal.statuses[entry.goal.status]} tone={goalTone(entry.goal.status)} />
              )}
            </LumenFrame>
            {entry.goal ? (
              <>
                <LumenText as="p" className="hbar-app-react-goal-objective">
                  {entry.goal.objective}
                </LumenText>
                <LumenCompactMetrics
                  label={labels.goal.title}
                  metrics={[
                    { id: 'used', label: labels.goal.used, value: labels.number(entry.goal.tokensUsed) },
                    { id: 'elapsed', label: labels.goal.elapsed, value: labels.duration(entry.goal.timeUsedSeconds) },
                    {
                      id: 'budget',
                      label: labels.goal.tokenBudget,
                      value:
                        entry.goal.tokenBudget === null ? labels.unavailable : labels.number(entry.goal.tokenBudget),
                    },
                  ]}
                />
                <HbarGoalExecutionState
                  goal={entry.goal}
                  remainingTokens={entry.remainingTokens}
                  labels={labels.goal.execution}
                />
              </>
            ) : (
              <LumenText as="p" className="hbar-app-react-goal-plan-empty">
                {labels.goal.empty}
              </LumenText>
            )}
            {entry.goalAction.status === 'succeeded' && (
              <LumenText as="p" role="status">
                {entry.goal ? labels.goal.saved : labels.goal.cleared}
              </LumenText>
            )}
            {entry.goalAction.error && (
              <LumenText as="p" role="alert">
                {labels.error(entry.goalAction.error)}
              </LumenText>
            )}
            <LumenFrame as="footer">
              <LumenButton
                tone={entry.goal ? 'neutral' : 'primary'}
                onClick={() => invoke('goalPlanWorkspace.showGoalEditor', { instanceId })}
              >
                {entry.goal ? labels.goal.edit : labels.goal.create}
              </LumenButton>
              {entry.goal && (
                <LumenButton
                  disabled={!connected || goalBusy}
                  tone="warning"
                  onClick={() => invoke('goalPlanWorkspace.clearGoal', { instanceId })}
                >
                  {labels.goal.clear}
                </LumenButton>
              )}
            </LumenFrame>
          </LumenFrame>
          <LumenFrame as="section">
            <LumenFrame as="header">
              <LumenText as="h2">{labels.plan.title}</LumenText>
              <LumenText as="span" className="hbar-app-react-plan-count">
                {labels.plan.count(entry.plan?.plan.length ?? 0)}
              </LumenText>
            </LumenFrame>
            {entry.plan ? (
              <>
                {entry.plan.explanation && (
                  <LumenText as="p" className="hbar-app-react-plan-explanation">
                    {entry.plan.explanation}
                  </LumenText>
                )}
                <LumenCollection as="ol" className="hbar-app-react-plan-summary">
                  {entry.plan.plan.map((step, index) => (
                    <LumenCollectionItem key={`${index}-${step.step}`}>
                      <LumenText as="span" aria-hidden="true">
                        {index + 1}
                      </LumenText>
                      <LumenText as="strong">{step.step}</LumenText>
                      <LumenStatus value={labels.plan.statuses[step.status]} tone={stepTone(step.status)} />
                    </LumenCollectionItem>
                  ))}
                </LumenCollection>
              </>
            ) : (
              <LumenText as="p" className="hbar-app-react-goal-plan-empty">
                {labels.plan.empty}
              </LumenText>
            )}
            {entry.planAction.status === 'succeeded' && (
              <LumenText as="p" role="status">
                {entry.plan ? labels.plan.saved : labels.plan.cleared}
              </LumenText>
            )}
            {entry.planAction.error && (
              <LumenText as="p" role="alert">
                {labels.error(entry.planAction.error)}
              </LumenText>
            )}
          </LumenFrame>
          <HbarWorkflowOverview
            entry={workflowEntry}
            labels={labels.workflow}
            connected={connected}
            instanceId={instanceId}
            invoke={invoke}
          />
        </LumenFrame>
      )}
    </LumenToolPane>
  )
}
