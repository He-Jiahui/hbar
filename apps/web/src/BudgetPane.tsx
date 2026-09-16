import { useEffect } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiBudgetSettings, HbarAppUiUsageOverview } from 'hbar-app-ui'
import { useConnection } from './stores'
import { useSessionCapabilities } from './session-capabilities'
import { budgetDraftModel } from './budget-actions'
import { getBudgetCopy } from './budget-locale'
import { useLocale } from './locale'

export function BudgetPane({ sessionId }: { readonly sessionId: string }) {
  const { locale } = useLocale(),
    copy = getBudgetCopy(locale)
  const connection = useConnection((state) => state.client)
  const state = useSessionCapabilities((value) => value.sessions[sessionId])
  const draft = useStore(budgetDraftModel.store, (value) => value.drafts[sessionId])
  useEffect(() => {
    budgetDraftModel.sync(sessionId)
  }, [sessionId, connection, state?.budget])
  if (!draft || draft.source !== connection) return <p role="status">{copy.loading}</p>
  const budget = state?.budget,
    busy = draft.busy || Boolean(state?.loading || state?.saving)
  return (
    <section className="session-capability-pane" aria-label={copy.title}>
      {budget ? (
        <HbarAppUiUsageOverview
          title={budget.phase === 'exhausted' ? copy.exhausted : copy.usage}
          description={copy.description}
          metrics={[
            { label: copy.used, value: budget.usedTokens.toLocaleString(locale) },
            { label: copy.remaining, value: budget.remainingTokens.toLocaleString(locale) },
          ]}
          meters={[
            {
              id: budget.budgetId,
              label: copy.limit,
              value: budget.limit.toLocaleString(locale),
              progress: (budget.usedTokens / budget.limit) * 100,
              progressLabel: copy.usage,
              detail: '',
              tone: budget.phase === 'exhausted' ? 'warning' : 'accent',
            },
          ]}
        />
      ) : (
        <p>{copy.empty}</p>
      )}
      {draft.stale && (
        <div role="status">
          <p>{copy.stale}</p>
          <button type="button" disabled={busy} onClick={() => budgetDraftModel.reset(sessionId)}>
            {copy.reset}
          </button>
        </div>
      )}
      <HbarAppUiBudgetSettings
        title={copy.title}
        description={copy.description}
        labels={{ cap: copy.cap, save: budget ? copy.increase : copy.save, saving: copy.saving }}
        cap={{ value: draft.value, display: '', input: 'number', minimum: 1, step: 1 }}
        busy={busy}
        canSave={!draft.stale && Boolean(draft.value.trim())}
        error={draft.error ? (draft.detail ?? copy[draft.error]) : state?.error || undefined}
        onCapChange={(value) => budgetDraftModel.setValue(sessionId, value)}
        onSave={() => {
          void budgetDraftModel.save(sessionId)
        }}
        clear={
          budget
            ? {
                label: copy.clear,
                disabled: busy || draft.stale,
                onInvoke: () => {
                  if (window.confirm(copy.confirmClear)) void budgetDraftModel.clear(sessionId)
                },
              }
            : undefined
        }
      />
    </section>
  )
}
