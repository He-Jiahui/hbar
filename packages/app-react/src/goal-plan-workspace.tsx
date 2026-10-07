import { useCallback, useEffect } from 'react'
import { ListTodo, RefreshCw } from 'lucide-react'
import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenContentText,
  LumenButton,
  LumenCompactMetrics,
  LumenFormField,
  LumenIcon,
  LumenIconButton,
  LumenInput,
  LumenStatus,
  LumenTextarea,
  LumenToolPane,
  LumenAgentPlan01,
  LumenAgentPlan02,
  type LumenPlanEditorLabels,
} from '@lumen/app-ui'
import type { GoalPlanGoalDraftState, GoalPlanStepDraftState } from '@hbar/app-runtime'
import { MAX_GOAL_OBJECTIVE_LENGTH } from '@hbar/contracts'
import { navigationCommands, surfaceCommands } from '@hbar/contracts/commands'
import { goalPlanWorkspaceCommands } from '@hbar/contracts/commands/goal-plan-workspace'
import { workflowWorkspaceCommands } from '@hbar/contracts/commands/workflow-workspace'
import { HbarLumenDisclosure } from './lumen-disclosure'
import { HbarGoalExecutionState, type HbarGoalExecutionLabels } from './goal-execution-state'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarWorkflowOverview, type HbarWorkflowOverviewLabels } from './workflow-overview'
import './goal-plan-workspace.css'
import { sessionPreparationStatus } from './session-execution-notice'

type GoalStatus = GoalPlanGoalDraftState['status']
type PlanStepStatus = GoalPlanStepDraftState['status']
const goalPaneCommands = {
  ...goalPlanWorkspaceCommands,
  ...workflowWorkspaceCommands,
  'app.closePanel': surfaceCommands['app.closePanel'],
  'app.setSession': navigationCommands['app.setSession'],
}

export interface HbarGoalPlanWorkspaceLabels {
  readonly title: string
  readonly description: string
  readonly close: string
  readonly refresh: string
  readonly loading: string
  readonly back: string
  readonly unavailable: string
  readonly executionAccess: { readonly archived: string; readonly unverified: string }
  readonly goal: {
    readonly execution: HbarGoalExecutionLabels
    readonly title: string
    readonly objective: string
    readonly document: string
    readonly advanced: string
    readonly cancel: string
    readonly replacementWarning: string
    readonly composerHint: string
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
  const directory = useHbarRuntimeState(runtime.state.directory)
  useHbarRuntimeState(runtime.state.sessionExecutionAccess)
  const instanceId = requestedInstanceId ?? presentation.toolInstanceId
  const panel = instanceId ? surfaces.panels[instanceId] : undefined
  const entry = instanceId ? goals.entries[instanceId] : undefined
  const workflowEntry = instanceId ? workflows.entries[instanceId] : undefined
  const workspaceId = panel?.workspaceId ?? (panel?.sessionId ? directory.sessions[panel.sessionId]?.workspaceId : null)
  const executionTarget = panel?.sessionId && workspaceId ? { sessionId: panel.sessionId, workspaceId } : null
  const preparationStatus = executionTarget
    ? sessionPreparationStatus(runtime.getSessionExecutionAccess(executionTarget), executionTarget)
    : 'unverified'
  const canPrepare = preparationStatus === 'ready'
  const commands = runtime.commands
  const invoke = useCallback(
    (name: keyof typeof goalPaneCommands, input: unknown) => {
      const request = goalPaneCommands[name].input.safeParse(input)
      if (request.success) void commands.execute(name, request.data).catch(() => {})
    },
    [commands],
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
  const PlanRecipe = view === 'goal' ? LumenAgentPlan02 : LumenAgentPlan01

  return (
    <LumenToolPane
      title={view === 'goal' ? labels.goal.document : labels.title}
      targetLabel={targetLabel}
      description={view === 'goal' ? undefined : labels.description}
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
      <PlanRecipe
        className="hbar-goal-plan-content"
        slots={{
          body: (
            <>
              {!canPrepare && (
                <LumenContentText
                  context="feedback.paragraph"
                  tone="warning"
                  role="status"
                  data-goal-execution-access={preparationStatus}
                >
                  {preparationStatus === 'archived'
                    ? labels.executionAccess.archived
                    : labels.executionAccess.unverified}
                </LumenContentText>
              )}
              {!entry || entry.status === 'loading' ? (
                <LumenContentText
                  context="feedback.paragraph"
                  tone="subtle"
                  role="status"
                  className="hbar-app-react-goal-plan-loading"
                >
                  {labels.loading}
                </LumenContentText>
              ) : entry.error ? (
                <LumenContentText
                  context="feedback.paragraph"
                  tone="danger"
                  className="hbar-app-react-goal-plan-loading"
                  role="alert"
                >
                  {labels.error(entry.error)}
                </LumenContentText>
              ) : view === 'goal' ? (
                <LumenFrame as="main" className="hbar-app-react-goal-editor-view">
                  <LumenFrame
                    as="form"
                    className="hbar-app-react-goal-editor"
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (!executionTarget || runtime.getSessionExecutionAccess(executionTarget).kind !== 'ready')
                        return
                      invoke('goalPlanWorkspace.saveGoal', { instanceId })
                    }}
                  >
                    <LumenFrame as="fieldset" disabled={!connected || !canPrepare || goalBusy}>
                      <LumenFormField
                        controlId={`${instanceId}-goal-objective`}
                        label={labels.goal.objective}
                        required
                        {...(entry.goalDraft.issues.objective ? { error: labels.issue('objective') } : {})}
                      >
                        <LumenTextarea
                          id={`${instanceId}-goal-objective`}
                          variant="plain"
                          rows={12}
                          maxLength={MAX_GOAL_OBJECTIVE_LENGTH}
                          required
                          value={entry.goalDraft.objective}
                          placeholder={labels.goal.objectivePlaceholder}
                          onChange={(event) => setGoalField('objective', event.currentTarget.value)}
                        />
                      </LumenFormField>
                      {entry.goal && entry.goalDraft.objective !== entry.goalDraft.baseline.objective && (
                        <LumenContentText context="form.help" role="note">
                          {labels.goal.replacementWarning}
                        </LumenContentText>
                      )}
                      <HbarLumenDisclosure
                        label={labels.goal.advanced}
                        defaultOpen={entry.goal?.status === 'budget_limited' || entry.goal?.status === 'usage_limited'}
                      >
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
                          <HbarGoalExecutionState
                            goal={entry.goal}
                            remainingTokens={entry.remainingTokens}
                            labels={labels.goal.execution}
                          />
                        )}
                      </HbarLumenDisclosure>
                    </LumenFrame>
                    {entry.goalAction.error && (
                      <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
                        {labels.error(entry.goalAction.error)}
                      </LumenContentText>
                    )}
                    {entry.goalAction.status === 'succeeded' && (
                      <LumenContentText context="feedback.paragraph" tone="success" role="status">
                        {labels.goal.saved}
                      </LumenContentText>
                    )}
                    <LumenFrame
                      as="footer"
                      className="hbar-goal-plan-actions"
                      role="group"
                      aria-label={labels.goal.title}
                      tabIndex={0}
                    >
                      <LumenButton
                        type="button"
                        variant="text"
                        indicator="none"
                        disabled={goalBusy || !entry.goalDirty}
                        onClick={() => invoke('goalPlanWorkspace.discardGoalEdits', { instanceId })}
                      >
                        {labels.goal.cancel}
                      </LumenButton>
                      {entry.goalAction.status === 'unknown' ? (
                        <LumenButton onClick={() => invoke('goalPlanWorkspace.refresh', { instanceId })}>
                          {labels.goal.reconcile}
                        </LumenButton>
                      ) : (
                        <LumenButton
                          type="submit"
                          tone="primary"
                          disabled={
                            !connected || !canPrepare || !entry.goalDirty || entry.goalAction.status === 'submitting'
                          }
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
                    <LumenFrame as="header" className="hbar-goal-plan-heading">
                      <LumenContentText context="section.title" level={3}>
                        {labels.goal.title}
                      </LumenContentText>
                      {entry.goal && (
                        <LumenFrame
                          className="hbar-goal-plan-metadata-reading"
                          role="group"
                          aria-label={labels.goal.status}
                          tabIndex={0}
                        >
                          <LumenStatus
                            value={labels.goal.statuses[entry.goal.status]}
                            tone={goalTone(entry.goal.status)}
                          />
                        </LumenFrame>
                      )}
                    </LumenFrame>
                    {entry.goal ? (
                      <>
                        <LumenContentText context="reading.paragraph" className="hbar-app-react-goal-objective">
                          {entry.goal.objective}
                        </LumenContentText>
                        <LumenCompactMetrics
                          label={labels.goal.title}
                          metrics={[
                            { id: 'used', label: labels.goal.used, value: labels.number(entry.goal.tokensUsed) },
                            {
                              id: 'elapsed',
                              label: labels.goal.elapsed,
                              value: labels.duration(entry.goal.timeUsedSeconds),
                            },
                            {
                              id: 'budget',
                              label: labels.goal.tokenBudget,
                              value:
                                entry.goal.tokenBudget === null
                                  ? labels.unavailable
                                  : labels.number(entry.goal.tokenBudget),
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
                      <LumenContentText context="empty.description" className="hbar-app-react-goal-plan-empty">
                        {labels.goal.composerHint}
                      </LumenContentText>
                    )}
                    {entry.goalAction.status === 'succeeded' && (
                      <LumenContentText context="feedback.paragraph" tone="success" role="status">
                        {entry.goal ? labels.goal.saved : labels.goal.cleared}
                      </LumenContentText>
                    )}
                    {entry.goalAction.error && (
                      <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
                        {labels.error(entry.goalAction.error)}
                      </LumenContentText>
                    )}
                    <LumenFrame
                      as="footer"
                      className="hbar-goal-plan-actions"
                      role="group"
                      aria-label={labels.goal.title}
                      tabIndex={0}
                    >
                      <LumenButton
                        tone="neutral"
                        disabled={!connected || !canPrepare || goalBusy}
                        onClick={() => invoke('goalPlanWorkspace.showGoalEditor', { instanceId })}
                      >
                        {entry.goal ? labels.goal.edit : labels.goal.create}
                      </LumenButton>
                    </LumenFrame>
                  </LumenFrame>
                  <LumenFrame as="section">
                    <LumenFrame as="header" className="hbar-goal-plan-heading">
                      <LumenContentText context="section.title" level={3}>
                        {labels.plan.title}
                      </LumenContentText>
                      <LumenFrame
                        className="hbar-goal-plan-metadata-reading"
                        role="group"
                        aria-label={labels.plan.title}
                        tabIndex={0}
                      >
                        <LumenContentText context="metadata" className="hbar-app-react-plan-count">
                          {labels.plan.count(entry.plan?.plan.length ?? 0)}
                        </LumenContentText>
                      </LumenFrame>
                    </LumenFrame>
                    {entry.plan ? (
                      <>
                        {entry.plan.explanation && (
                          <LumenContentText context="section.description" className="hbar-app-react-plan-explanation">
                            {entry.plan.explanation}
                          </LumenContentText>
                        )}
                        <LumenCollection as="ol" className="hbar-app-react-plan-summary" aria-label={labels.plan.title}>
                          {entry.plan.plan.map((step, index) => (
                            <LumenCollectionItem key={`${index}-${step.step}`}>
                              <LumenContentText
                                context="metadata"
                                className="hbar-app-react-plan-ordinal"
                                aria-hidden="true"
                              >
                                {labels.number(index + 1)}
                              </LumenContentText>
                              <LumenContentText context="collection.title">{step.step}</LumenContentText>
                              <LumenFrame
                                className="hbar-goal-plan-metadata-reading"
                                role="group"
                                aria-label={labels.plan.stepStatus(index + 1)}
                                tabIndex={0}
                              >
                                <LumenStatus value={labels.plan.statuses[step.status]} tone={stepTone(step.status)} />
                              </LumenFrame>
                            </LumenCollectionItem>
                          ))}
                        </LumenCollection>
                      </>
                    ) : (
                      <LumenContentText context="empty.description" className="hbar-app-react-goal-plan-empty">
                        {labels.plan.empty}
                      </LumenContentText>
                    )}
                    {entry.planAction.status === 'succeeded' && (
                      <LumenContentText context="feedback.paragraph" tone="success" role="status">
                        {entry.plan ? labels.plan.saved : labels.plan.cleared}
                      </LumenContentText>
                    )}
                    {entry.planAction.error && (
                      <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
                        {labels.error(entry.planAction.error)}
                      </LumenContentText>
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
            </>
          ),
        }}
      />
    </LumenToolPane>
  )
}
