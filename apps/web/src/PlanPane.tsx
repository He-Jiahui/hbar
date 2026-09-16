import { planDraftModel, changePlanMode } from './plan-actions'
import { useEffect } from 'react'
import { useStore } from 'zustand'
import { MAX_PLAN_STEPS, type PlanStepStatus } from '@hbar/contracts'
import { HbarAppUiPlanEditor, type HbarAppUiAgentPlanState } from 'hbar-app-ui'
import { useConnection } from './stores'
import { useSessionCapabilities } from './session-capabilities'
import { planSnapshotKey } from './plan-draft-model'
import { getPlanCopy } from './plan-locale'
import { useLocale } from './locale'
import './plan-pane.css'

const uiStatus: Record<PlanStepStatus, HbarAppUiAgentPlanState> = {
  pending: 'queued',
  in_progress: 'running',
  completed: 'done',
}
const domainStatus: Partial<Record<HbarAppUiAgentPlanState, PlanStepStatus>> = {
  queued: 'pending',
  running: 'in_progress',
  done: 'completed',
}
export function PlanPane({ sessionId }: { readonly sessionId: string }) {
  const { locale } = useLocale(),
    copy = getPlanCopy(locale)
  const connection = useConnection((state) => state.client)
  const state = useSessionCapabilities((value) => value.sessions[sessionId])
  const draft = useStore(planDraftModel.store, (value) => value.drafts[sessionId])
  useEffect(() => {
    planDraftModel.sync(sessionId)
  }, [sessionId, connection, state?.plan])
  if (!draft || draft.source !== connection) return <p role="status">{copy.loading}</p>
  const stale = draft.stale || draft.base !== planSnapshotKey(state?.plan ?? null)
  const busy = draft.saving || Boolean(state?.loading || state?.saving)
  const statuses = [
    { id: 'queued' as const, label: copy.pending },
    { id: 'running' as const, label: copy.running },
    { id: 'done' as const, label: copy.completed },
  ]
  return (
    <section className="session-capability-pane session-plan-pane" aria-label={copy.title}>
      <HbarAppUiPlanEditor
        labels={copy.labels}
        steps={draft.steps.map((step) => ({
          id: step.id,
          title: step.step,
          state: uiStatus[step.status],
          stateLabel: statuses.find((item) => item.id === uiStatus[step.status])!.label,
        }))}
        listStrategy={{ kind: 'pane-scroll', expectedMaximum: MAX_PLAN_STEPS }}
        draft={draft.newStep}
        busy={busy}
        canAdd={draft.steps.length < MAX_PLAN_STEPS}
        canSubmit={!stale && draft.steps.length > 0}
        error={draft.error ? (draft.detail ?? copy.errors[draft.error]) : state?.error || undefined}
        onDraftChange={(value) => planDraftModel.setNewStep(sessionId, value)}
        onAdd={() => planDraftModel.add(sessionId)}
        onMove={(id, direction) => planDraftModel.move(sessionId, id, direction)}
        onRemove={(id) => planDraftModel.remove(sessionId, id)}
        onSubmit={() => {
          void planDraftModel.save(sessionId)
        }}
        editing={{
          titleLabel: copy.step,
          statusLabel: copy.status,
          statuses,
          onTitleChange: (id, value) => planDraftModel.update(sessionId, id, { step: value }),
          onStatusChange: (id, value) => {
            const status = domainStatus[value]
            if (status) planDraftModel.update(sessionId, id, { status })
          },
        }}
        before={
          <>
            <div className="session-capability-mode segmented" aria-label={copy.mode}>
              <button
                type="button"
                disabled={busy}
                className={state?.mode !== 'plan' ? 'selected' : ''}
                onClick={() => changePlanMode(sessionId, 'default')}
              >
                {copy.defaultMode}
              </button>
              <button
                type="button"
                disabled={busy}
                className={state?.mode === 'plan' ? 'selected' : ''}
                onClick={() => changePlanMode(sessionId, 'plan')}
              >
                {copy.planMode}
              </button>
            </div>
            {draft.saving && <p role="status">{copy.saving}</p>}
            {stale && (
              <div className="session-plan-stale" role="status">
                <p>{copy.stale}</p>
                <details>
                  <summary>{copy.latest}</summary>
                  <ol>
                    {state?.plan?.plan.map((step, index) => (
                      <li key={index}>{step.step}</li>
                    ))}
                  </ol>
                  {state?.plan?.explanation}
                </details>
                <button type="button" disabled={busy} onClick={() => planDraftModel.acknowledge(sessionId)}>
                  {copy.acknowledged}
                </button>
                <button type="button" disabled={busy} onClick={() => planDraftModel.reset(sessionId)}>
                  {copy.reset}
                </button>
              </div>
            )}
          </>
        }
        after={
          <label className="session-plan-note">
            {copy.note}
            <textarea
              rows={2}
              value={draft.explanation}
              disabled={busy}
              placeholder={copy.optional}
              onChange={(event) => planDraftModel.setExplanation(sessionId, event.target.value)}
            />
          </label>
        }
        actions={
          state?.plan && (
            <button
              type="button"
              className="hbar-app-ui-agent-plan-button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(copy.clearConfirm)) void planDraftModel.clear(sessionId)
              }}
            >
              {copy.clear}
            </button>
          )
        }
      />
    </section>
  )
}
