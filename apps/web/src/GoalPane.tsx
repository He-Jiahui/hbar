import { useEffect } from 'react'
import { useStore } from 'zustand'
import { MAX_GOAL_OBJECTIVE_LENGTH } from '@hbar/contracts'
import { HbarAppUiButton, HbarAppUiUsageOverview } from 'hbar-app-ui'
import { HbarAppUiObjectiveForm } from 'hbar-app-ui/forms'
import { useConnection } from './stores'
import { useSessionCapabilities } from './session-capabilities'
import { goalDraftModel } from './goal-actions'
import { getGoalCopy } from './goal-locale'
import { useLocale } from './locale'
import { Modal } from './Modal'

export function GoalPane({ sessionId }: { readonly sessionId: string }) {
  const { locale } = useLocale(),
    copy = getGoalCopy(locale)
  const connection = useConnection((state) => state.client),
    state = useSessionCapabilities((state) => state.sessions[sessionId])
  const draft = useStore(goalDraftModel.store, (state) => state.drafts[sessionId])
  useEffect(() => {
    goalDraftModel.sync(sessionId)
  }, [sessionId, connection, state?.goal])
  if (!draft || draft.source !== connection) return <p role="status">{copy.loading}</p>
  const goal = state?.goal,
    busy = draft.busy || Boolean(state?.loading || state?.saving)
  const error = draft.error
    ? (draft.detail ??
      (draft.error === 'objective'
        ? copy.invalidObjective
        : draft.error === 'budget'
          ? copy.invalidBudget
          : copy.failed))
    : state?.error || undefined
  return (
    <section className="session-capability-pane">
      <HbarAppUiObjectiveForm
        labels={{ ...copy, save: busy ? copy.saving : goal ? copy.save : copy.create }}
        objective={draft.objective}
        objectiveMaximum={MAX_GOAL_OBJECTIVE_LENGTH}
        budget={draft.budget}
        busy={busy}
        canSave={Boolean(state) && !state?.loading}
        stale={draft.stale}
        error={error}
        onObjectiveChange={(value) => goalDraftModel.edit(sessionId, 'objective', value)}
        onBudgetChange={(value) => goalDraftModel.edit(sessionId, 'budget', value)}
        onSave={() => void goalDraftModel.save(sessionId)}
        onReset={() => goalDraftModel.reset(sessionId)}
        summary={
          goal && (
            <HbarAppUiUsageOverview
              title={copy.summary}
              description={copy.description}
              metrics={[
                { label: copy.status, value: copy.states[goal.status] },
                { label: copy.used, value: goal.tokensUsed.toLocaleString(locale) },
                {
                  label: copy.remaining,
                  value:
                    goal.tokenBudget === null
                      ? copy.unlimited
                      : Math.max(0, goal.tokenBudget - goal.tokensUsed).toLocaleString(locale),
                },
              ]}
              meters={[]}
            />
          )
        }
        actions={
          <>
            {goal?.goalId && ['active', 'paused'].includes(goal.status) && (
              <HbarAppUiButton
                disabled={busy || draft.stale}
                onClick={() => void goalDraftModel.togglePaused(sessionId)}
              >
                {goal.status === 'paused' ? copy.resume : copy.pause}
              </HbarAppUiButton>
            )}
            {goal && (
              <HbarAppUiButton
                tone="danger"
                disabled={busy || draft.stale}
                onClick={() => goalDraftModel.confirmClear(sessionId, true)}
              >
                {copy.clear}
              </HbarAppUiButton>
            )}
          </>
        }
      />
      {draft.confirmingClear && (
        <Modal title={copy.confirmTitle} onClose={() => goalDraftModel.confirmClear(sessionId, false)}>
          <p>{copy.confirmDescription}</p>
          {draft.stale && <p role="alert">{copy.stale}</p>}
          <div className="modal-footer">
            <HbarAppUiButton disabled={busy} onClick={() => goalDraftModel.confirmClear(sessionId, false)}>
              {copy.cancel}
            </HbarAppUiButton>
            <HbarAppUiButton
              tone="danger"
              disabled={busy || draft.stale}
              onClick={() => void goalDraftModel.clear(sessionId)}
            >
              {copy.clear}
            </HbarAppUiButton>
          </div>
        </Modal>
      )}
    </section>
  )
}
