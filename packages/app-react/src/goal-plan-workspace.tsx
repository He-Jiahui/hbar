import { useCallback, useEffect } from 'react'
import {
  HbarAppUiButton,
  HbarAppUiMetricStrip,
  HbarAppUiPlanEditor,
  HbarAppUiSurface,
  type HbarAppUiAgentPlanEditableContent,
  type HbarAppUiAgentPlanState,
} from 'hbar-app-ui'
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
  readonly goal: {
    readonly title: string
    readonly objective: string
    readonly objectivePlaceholder: string
    readonly tokenBudget: string
    readonly status: string
    readonly statuses: Readonly<Record<GoalStatus, string>>
    readonly save: string
    readonly saving: string
    readonly clear: string
    readonly reconcile: string
    readonly saved: string
    readonly remaining: string
    readonly used: string
    readonly elapsed: string
  }
  readonly plan: HbarAppUiAgentPlanEditableContent['labels'] & {
    readonly explanation: string
    readonly explanationPlaceholder: string
    readonly clear: string
    readonly reconcile: string
    readonly saved: string
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
  const setGoalField = (field: string, value: string) =>
    invoke('goalPlanWorkspace.setGoalField', { instanceId, field, value })
  const steps =
    entry?.planDraft.steps.map((step) => ({
      id: step.id,
      title: step.step,
      state: toUiState[step.status],
      stateLabel: labels.plan.statuses[step.status],
    })) ?? []

  return (
    <HbarAppUiSurface className="hbar-app-react-goal-plan-workspace">
      <header>
        <div>
          <h1>{labels.title}</h1>
          <p>{labels.description}</p>
        </div>
        <div>
          <HbarAppUiButton
            disabled={!connected || entry?.status === 'loading'}
            onClick={() => invoke('goalPlanWorkspace.refresh', { instanceId })}
          >
            {labels.refresh}
          </HbarAppUiButton>
          <HbarAppUiButton onClick={() => invoke('app.closePanel', { instanceId })}>{labels.close}</HbarAppUiButton>
        </div>
      </header>
      {!entry || entry.status === 'loading' ? (
        <p className="hbar-app-react-goal-plan-loading">{labels.loading}</p>
      ) : entry.error ? (
        <p className="hbar-app-react-goal-plan-loading" role="alert">
          {labels.error(entry.error)}
        </p>
      ) : (
        <main>
          <form
            className="hbar-app-react-goal-editor"
            onSubmit={(event) => {
              event.preventDefault()
              invoke('goalPlanWorkspace.saveGoal', { instanceId })
            }}
          >
            <h2>{labels.goal.title}</h2>
            <fieldset disabled={!connected || goalBusy}>
              <label>
                <span>{labels.goal.objective}</span>
                <textarea
                  required
                  value={entry.goalDraft.objective}
                  placeholder={labels.goal.objectivePlaceholder}
                  aria-invalid={Boolean(entry.goalDraft.issues.objective)}
                  onChange={(event) => setGoalField('objective', event.currentTarget.value)}
                />
                {entry.goalDraft.issues.objective && <small>{labels.issue('objective')}</small>}
              </label>
              <label>
                <span>{labels.goal.tokenBudget}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1_000_000_000}
                  value={entry.goalDraft.tokenBudget}
                  aria-invalid={Boolean(entry.goalDraft.issues.tokenBudget)}
                  onChange={(event) => setGoalField('tokenBudget', event.currentTarget.value)}
                />
                {entry.goalDraft.issues.tokenBudget && <small>{labels.issue('tokenBudget')}</small>}
              </label>
              {entry.goal && (
                <label>
                  <span>{labels.goal.status}</span>
                  <select
                    value={entry.goalDraft.status}
                    onChange={(event) => setGoalField('status', event.currentTarget.value)}
                  >
                    {(Object.keys(labels.goal.statuses) as GoalStatus[]).map((status) => (
                      <option key={status} value={status}>
                        {labels.goal.statuses[status]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </fieldset>
            {entry.goal && (
              <HbarAppUiMetricStrip
                metrics={[
                  {
                    label: labels.goal.remaining,
                    value: entry.remainingTokens === null ? '—' : labels.number(entry.remainingTokens),
                  },
                  { label: labels.goal.used, value: labels.number(entry.goal.tokensUsed) },
                  { label: labels.goal.elapsed, value: labels.duration(entry.goal.timeUsedSeconds) },
                ]}
              />
            )}
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
          </form>
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
              <label className="hbar-app-react-plan-explanation">
                <span>{labels.plan.explanation}</span>
                <textarea
                  value={entry.planDraft.explanation}
                  placeholder={labels.plan.explanationPlaceholder}
                  disabled={!connected || planBusy}
                  onChange={(event) =>
                    invoke('goalPlanWorkspace.setExplanation', { instanceId, value: event.currentTarget.value })
                  }
                />
              </label>
            }
            after={entry.planAction.status === 'succeeded' ? <p role="status">{labels.plan.saved}</p> : undefined}
            actions={
              <>
                {entry.planAction.status === 'unknown' && (
                  <HbarAppUiButton onClick={() => invoke('goalPlanWorkspace.refresh', { instanceId })}>
                    {labels.plan.reconcile}
                  </HbarAppUiButton>
                )}
                {entry.plan && (
                  <HbarAppUiButton
                    disabled={!connected || planBusy}
                    tone="warning"
                    onClick={() => invoke('goalPlanWorkspace.clearPlan', { instanceId })}
                  >
                    {labels.plan.clear}
                  </HbarAppUiButton>
                )}
              </>
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
      )}
    </HbarAppUiSurface>
  )
}
