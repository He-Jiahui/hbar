import { useCallback, useEffect } from 'react'
import { ArrowLeft, RefreshCw, X } from 'lucide-react'
import { HbarAppUiIcon } from 'hbar-app-ui/icon'
import {
  HbarAppUiPlanEditor,
  type HbarAppUiAgentPlanEditableContent,
  type HbarAppUiAgentPlanState,
} from 'hbar-app-ui/plan-editor'
import { HbarAppUiButton, HbarAppUiIconButton, HbarAppUiStatus, HbarAppUiSurface } from 'hbar-app-ui/primitives'
import { HbarAppUiField, HbarAppUiInput, HbarAppUiSelect, HbarAppUiTextarea } from 'hbar-app-ui/forms'
import { HbarAppUiCompactMetrics } from 'hbar-app-ui/workbench'
import type { GoalPlanGoalDraftState, GoalPlanStepDraftState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
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
  readonly plan: HbarAppUiAgentPlanEditableContent['labels'] & {
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
  readonly number: (value: number) => string
  readonly duration: (seconds: number) => string
  readonly issue: (field: string) => string
  readonly error: (code: string) => string
}

const toUiState: Readonly<Record<PlanStepStatus, HbarAppUiAgentPlanState>> = {
  pending: 'queued',
  in_progress: 'running',
  completed: 'done',
}
const fromUiState: Readonly<Partial<Record<HbarAppUiAgentPlanState, PlanStepStatus>>> = {
  queued: 'pending',
  running: 'in_progress',
  done: 'completed',
}

function goalTone(status: GoalStatus): 'neutral' | 'positive' | 'warning' | 'danger' {
  if (status === 'complete') return 'positive'
  if (status === 'blocked' || status === 'budget_limited' || status === 'usage_limited') return 'warning'
  return 'neutral'
}

function stepTone(status: PlanStepStatus): 'neutral' | 'positive' | 'warning' {
  if (status === 'completed') return 'positive'
  if (status === 'in_progress') return 'warning'
  return 'neutral'
}

export function HbarGoalPlanWorkspace({
  labels,
  connected,
  instanceId: requestedInstanceId,
}: {
  readonly labels: HbarGoalPlanWorkspaceLabels
  readonly connected: boolean
  readonly instanceId?: string
}) {
  const runtime = useHbarRuntime()
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const goals = useHbarRuntimeState(runtime.state.goals)
  const instanceId = requestedInstanceId ?? presentation.toolInstanceId
  const panel = instanceId ? surfaces.panels[instanceId] : undefined
  const entry = instanceId ? goals.entries[instanceId] : undefined
  const invoke = useCallback(
    (name: string, input: unknown) =>
      void (runtime.commands.execute as (command: string, value: unknown) => Promise<unknown>)(name, input).catch(
        () => {},
      ),
    [runtime.commands],
  )
  useEffect(() => {
    if (instanceId && panel?.panelId === 'goals' && panel.sessionId && entry?.sessionId !== panel.sessionId)
      invoke('goalPlanWorkspace.refresh', { instanceId })
  }, [entry?.sessionId, instanceId, invoke, panel?.panelId, panel?.sessionId])
  if (!instanceId || panel?.panelId !== 'goals') return null

  const goalBusy = entry?.goalAction.status === 'submitting' || entry?.goalAction.status === 'unknown'
  const planBusy = entry?.planAction.status === 'submitting' || entry?.planAction.status === 'unknown'
  const view = entry?.view ?? 'overview'
  const setGoalField = (field: string, value: string) =>
    invoke('goalPlanWorkspace.setGoalField', { instanceId, field, value })
  const steps =
    entry?.planDraft.steps.map((step) => ({
      id: step.id,
      title: step.step,
      state: toUiState[step.status],
      stateLabel: labels.plan.statuses[step.status],
    })) ?? []
  const back = () => invoke('goalPlanWorkspace.showOverview', { instanceId })

  return (
    <HbarAppUiSurface className="hbar-app-react-goal-plan-workspace">
      <header>
        <div>
          <h1>{labels.title}</h1>
          <p>{labels.description}</p>
        </div>
        <div className="hbar-app-react-goal-plan-header-actions">
          <HbarAppUiIconButton
            label={labels.refresh}
            disabled={!connected || entry?.status === 'loading'}
            onClick={() => invoke('goalPlanWorkspace.refresh', { instanceId })}
          >
            <HbarAppUiIcon icon={RefreshCw} tier="sm" />
          </HbarAppUiIconButton>
          <HbarAppUiIconButton label={labels.close} onClick={() => invoke('app.closePanel', { instanceId })}>
            <HbarAppUiIcon icon={X} tier="sm" />
          </HbarAppUiIconButton>
        </div>
      </header>
      {!entry || entry.status === 'loading' ? (
        <p className="hbar-app-react-goal-plan-loading">{labels.loading}</p>
      ) : entry.error ? (
        <p className="hbar-app-react-goal-plan-loading" role="alert">
          {labels.error(entry.error)}
        </p>
      ) : view === 'goal' ? (
        <main className="hbar-app-react-goal-editor-view">
          <HbarAppUiButton className="hbar-app-react-goal-plan-back" onClick={back}>
            <HbarAppUiIcon icon={ArrowLeft} tier="sm" />
            <span>{labels.back}</span>
          </HbarAppUiButton>
          <form
            className="hbar-app-react-goal-editor"
            onSubmit={(event) => {
              event.preventDefault()
              invoke('goalPlanWorkspace.saveGoal', { instanceId })
            }}
          >
            <h2>{labels.goal.title}</h2>
            <fieldset disabled={!connected || goalBusy}>
              <HbarAppUiField
                controlId={`${instanceId}-goal-objective`}
                label={labels.goal.objective}
                required
                {...(entry.goalDraft.issues.objective ? { error: labels.issue('objective') } : {})}
              >
                <HbarAppUiTextarea
                  id={`${instanceId}-goal-objective`}
                  required
                  value={entry.goalDraft.objective}
                  placeholder={labels.goal.objectivePlaceholder}
                  onChange={(event) => setGoalField('objective', event.currentTarget.value)}
                />
              </HbarAppUiField>
              <HbarAppUiField
                controlId={`${instanceId}-goal-budget`}
                label={labels.goal.tokenBudget}
                {...(entry.goalDraft.issues.tokenBudget ? { error: labels.issue('tokenBudget') } : {})}
              >
                <HbarAppUiInput
                  id={`${instanceId}-goal-budget`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1_000_000_000}
                  value={entry.goalDraft.tokenBudget}
                  onChange={(event) => setGoalField('tokenBudget', event.currentTarget.value)}
                />
              </HbarAppUiField>
              {entry.goal && (
                <HbarAppUiField controlId={`${instanceId}-goal-status`} label={labels.goal.status}>
                  <HbarAppUiSelect
                    id={`${instanceId}-goal-status`}
                    value={entry.goalDraft.status}
                    onChange={(event) => setGoalField('status', event.currentTarget.value)}
                  >
                    {(Object.keys(labels.goal.statuses) as GoalStatus[]).map((status) => (
                      <option key={status} value={status}>
                        {labels.goal.statuses[status]}
                      </option>
                    ))}
                  </HbarAppUiSelect>
                </HbarAppUiField>
              )}
            </fieldset>
            {entry.goalAction.error && <p role="alert">{labels.error(entry.goalAction.error)}</p>}
            {entry.goalAction.status === 'succeeded' && <p role="status">{labels.goal.saved}</p>}
            <footer>
              {entry.goalAction.status === 'unknown' ? (
                <HbarAppUiButton onClick={() => invoke('goalPlanWorkspace.refresh', { instanceId })}>
                  {labels.goal.reconcile}
                </HbarAppUiButton>
              ) : (
                <HbarAppUiButton
                  type="submit"
                  tone="accent"
                  disabled={!connected || !entry.goalDirty || entry.goalAction.status === 'submitting'}
                >
                  {entry.goalAction.status === 'submitting' ? labels.goal.saving : labels.goal.save}
                </HbarAppUiButton>
              )}
            </footer>
          </form>
        </main>
      ) : view === 'plan' ? (
        <main className="hbar-app-react-plan-editor-view">
          <HbarAppUiButton className="hbar-app-react-goal-plan-back" onClick={back}>
            <HbarAppUiIcon icon={ArrowLeft} tier="sm" />
            <span>{labels.back}</span>
          </HbarAppUiButton>
          <HbarAppUiPlanEditor
            labels={labels.plan}
            steps={steps}
            listStrategy={{ kind: 'pane-scroll', expectedMaximum: 100 }}
            draft={entry.planDraft.newStep}
            busy={!connected || planBusy}
            canAdd={entry.planDraft.steps.length < 100}
            canSubmit={entry.planDirty && entry.planDraft.steps.every((step) => step.step.trim().length > 0)}
            error={entry.planAction.error ? labels.error(entry.planAction.error) : undefined}
            before={
              <HbarAppUiField controlId={`${instanceId}-plan-explanation`} label={labels.plan.explanation}>
                <HbarAppUiTextarea
                  id={`${instanceId}-plan-explanation`}
                  value={entry.planDraft.explanation}
                  placeholder={labels.plan.explanationPlaceholder}
                  disabled={!connected || planBusy}
                  onChange={(event) =>
                    invoke('goalPlanWorkspace.setExplanation', { instanceId, value: event.currentTarget.value })
                  }
                />
              </HbarAppUiField>
            }
            after={entry.planAction.status === 'succeeded' ? <p role="status">{labels.plan.saved}</p> : undefined}
            actions={
              entry.planAction.status === 'unknown' ? (
                <HbarAppUiButton onClick={() => invoke('goalPlanWorkspace.refresh', { instanceId })}>
                  {labels.plan.reconcile}
                </HbarAppUiButton>
              ) : undefined
            }
            onDraftChange={(value) => invoke('goalPlanWorkspace.setNewStep', { instanceId, value })}
            onAdd={() => invoke('goalPlanWorkspace.addStep', { instanceId })}
            onMove={(stepId, direction) => invoke('goalPlanWorkspace.moveStep', { instanceId, stepId, direction })}
            onRemove={(stepId) => invoke('goalPlanWorkspace.removeStep', { instanceId, stepId })}
            onSubmit={() =>
              entry.planAction.status === 'unknown'
                ? invoke('goalPlanWorkspace.refresh', { instanceId })
                : invoke('goalPlanWorkspace.savePlan', { instanceId })
            }
            editing={{
              titleLabel: labels.plan.stepTitle,
              statusLabel: labels.plan.stepStatus,
              statuses: (['pending', 'in_progress', 'completed'] as const).map((status) => ({
                id: toUiState[status],
                label: labels.plan.statuses[status],
              })),
              onTitleChange: (stepId, value) =>
                invoke('goalPlanWorkspace.setStep', { instanceId, stepId, step: value }),
              onStatusChange: (stepId, value) => {
                const status = fromUiState[value]
                if (status) invoke('goalPlanWorkspace.setStep', { instanceId, stepId, status })
              },
            }}
          />
        </main>
      ) : (
        <main className="hbar-app-react-goal-plan-overview">
          <section>
            <header>
              <h2>{labels.goal.title}</h2>
              {entry.goal && (
                <HbarAppUiStatus value={labels.goal.statuses[entry.goal.status]} tone={goalTone(entry.goal.status)} />
              )}
            </header>
            {entry.goal ? (
              <>
                <p className="hbar-app-react-goal-objective">{entry.goal.objective}</p>
                <HbarAppUiCompactMetrics
                  label={labels.goal.title}
                  metrics={[
                    {
                      id: 'remaining',
                      label: labels.goal.remaining,
                      value: entry.remainingTokens === null ? labels.unavailable : labels.number(entry.remainingTokens),
                    },
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
              </>
            ) : (
              <p className="hbar-app-react-goal-plan-empty">{labels.goal.empty}</p>
            )}
            {entry.goalAction.status === 'succeeded' && (
              <p role="status">{entry.goal ? labels.goal.saved : labels.goal.cleared}</p>
            )}
            {entry.goalAction.error && <p role="alert">{labels.error(entry.goalAction.error)}</p>}
            <footer>
              <HbarAppUiButton
                tone={entry.goal ? 'neutral' : 'accent'}
                onClick={() => invoke('goalPlanWorkspace.showGoalEditor', { instanceId })}
              >
                {entry.goal ? labels.goal.edit : labels.goal.create}
              </HbarAppUiButton>
              {entry.goal && (
                <HbarAppUiButton
                  disabled={!connected || goalBusy}
                  tone="warning"
                  onClick={() => invoke('goalPlanWorkspace.clearGoal', { instanceId })}
                >
                  {labels.goal.clear}
                </HbarAppUiButton>
              )}
            </footer>
          </section>
          <section>
            <header>
              <h2>{labels.plan.title}</h2>
              <span>{labels.plan.count(entry.plan?.plan.length ?? 0)}</span>
            </header>
            {entry.plan ? (
              <>
                {entry.plan.explanation && <p className="hbar-app-react-plan-explanation">{entry.plan.explanation}</p>}
                <ol className="hbar-app-react-plan-summary">
                  {entry.plan.plan.map((step, index) => (
                    <li key={`${index}-${step.step}`}>
                      <span aria-hidden="true">{index + 1}</span>
                      <strong>{step.step}</strong>
                      <HbarAppUiStatus value={labels.plan.statuses[step.status]} tone={stepTone(step.status)} />
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="hbar-app-react-goal-plan-empty">{labels.plan.empty}</p>
            )}
            {entry.planAction.status === 'succeeded' && (
              <p role="status">{entry.plan ? labels.plan.saved : labels.plan.cleared}</p>
            )}
            {entry.planAction.error && <p role="alert">{labels.error(entry.planAction.error)}</p>}
            <footer>
              <HbarAppUiButton
                tone={entry.plan ? 'neutral' : 'accent'}
                onClick={() => invoke('goalPlanWorkspace.showPlanEditor', { instanceId })}
              >
                {labels.plan.edit}
              </HbarAppUiButton>
              {entry.plan && (
                <HbarAppUiButton
                  disabled={!connected || planBusy}
                  tone="warning"
                  onClick={() => invoke('goalPlanWorkspace.clearPlan', { instanceId })}
                >
                  {labels.plan.clear}
                </HbarAppUiButton>
              )}
            </footer>
          </section>
        </main>
      )}
    </HbarAppUiSurface>
  )
}
