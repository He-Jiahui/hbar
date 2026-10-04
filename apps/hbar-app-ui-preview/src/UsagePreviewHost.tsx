import { useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenUsageProvider as HbarAppUiUsageProvider } from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { usageOverviewDatasets } from '../../../tests/fixtures/hbar-app-ui-usage-overview-fixtures'
import { createUsageOverviewPreviewStore, projectUsageOverviewPreview } from './usage-overview-preview-model'
import { modelSpendFixture } from '../../../tests/fixtures/hbar-app-ui-usage-model-fixtures'
import { createUsageModelPreviewStore, projectUsageModelPreview } from './usage-model-preview-model'
import { usageLimitFixture } from '../../../tests/fixtures/hbar-app-ui-usage-limit-fixtures'
import { createUsageLimitPreviewStore, projectUsageLimitPreview } from './usage-limit-preview-model'
import { usageMemberFixture } from '../../../tests/fixtures/hbar-app-ui-usage-member-fixtures'
import { createUsageMemberPreviewStore, projectUsageMemberPreview } from './usage-member-preview-model'
import { usageBudgetFixture } from '../../../tests/fixtures/hbar-app-ui-usage-budget-fixtures'
import { createUsageBudgetPreviewStore, projectUsageBudgetPreview } from './usage-budget-preview-model'
import { usageOverageFixture } from '../../../tests/fixtures/hbar-app-ui-usage-overage-fixtures'
import { createUsageOveragePreviewStore, projectUsageOveragePreview } from './usage-overage-preview-model'
import { usageRequestFixture } from '../../../tests/fixtures/hbar-app-ui-usage-request-fixtures'
import { createUsageRequestPreviewStore, projectUsageRequestPreview } from './usage-request-preview-model'
import { usageCompactFixture } from '../../../tests/fixtures/hbar-app-ui-usage-compact-fixtures'
import { createUsagePreviewCopy } from './usagePreviewCopy'
import {
  createUsageIntentPreviewStore,
  type UsageIntentPreviewSeed,
  type UsagePreviewAction,
} from './usageIntentPreviewStore'

type UsagePreviewHostProps = HbarAppUiVariantProps & { readonly children: ReactNode }

export function UsagePreviewHost(props: UsagePreviewHostProps) {
  if (props.spec.category !== 'ai-usage') return <>{props.children}</>
  const mode = new URLSearchParams(location.search).get('usageFixture')
  return <UsagePreviewOwner key={`${props.spec.id}:${mode ?? 'default'}`} {...props} mode={mode} />
}

function UsagePreviewOwner({
  spec,
  onAction,
  children,
  mode,
}: UsagePreviewHostProps & { readonly mode: string | null }) {
  const copy = createUsagePreviewCopy(mode === 'localized')
  const [overviewStore] = useState(() => createUsageOverviewPreviewStore(usageOverviewDatasets(mode)))
  const overview = projectUsageOverviewPreview(useStore(overviewStore), copy.range)
  const [modelFixture] = useState(() => modelSpendFixture(mode))
  const [modelStore] = useState(() => createUsageModelPreviewStore(modelFixture.records))
  const modelSpend = projectUsageModelPreview(useStore(modelStore), modelFixture.content, modelFixture.pagination)
  const [limitFixture] = useState(() => usageLimitFixture(mode))
  const [limitStore] = useState(() => createUsageLimitPreviewStore(limitFixture.tiers, limitFixture.metrics))
  const limitState = useStore(limitStore)
  const rateLimits = projectUsageLimitPreview(limitState, limitFixture.copy, (tierId) =>
    report('request-increase', tierId),
  )
  const [memberFixture] = useState(() => usageMemberFixture(mode))
  const [memberStore] = useState(() => createUsageMemberPreviewStore(memberFixture.teams, memberFixture.records))
  const seats = projectUsageMemberPreview(useStore(memberStore), memberFixture.copy)
  const [budgetFixture] = useState(() => usageBudgetFixture(mode))
  const [budgetStore] = useState(() =>
    createUsageBudgetPreviewStore(budgetFixture.facts, budgetFixture.thresholds, budgetFixture.settings),
  )
  const budgetState = useStore(budgetStore)
  const budget = projectUsageBudgetPreview(budgetState, budgetFixture.copy)
  const [overageFixture] = useState(() => usageOverageFixture(mode))
  const [overageStore] = useState(() => createUsageOveragePreviewStore(overageFixture.plans))
  const overageState = useStore(overageStore)
  const overage = projectUsageOveragePreview(overageState, overageFixture.copy, (action, id) =>
    report(action, id ?? undefined),
  )
  const [requestFixture] = useState(() => usageRequestFixture(mode))
  const [requestStore] = useState(() =>
    createUsageRequestPreviewStore(requestFixture.records, requestFixture.expandedId),
  )
  const requests = projectUsageRequestPreview(useStore(requestStore), requestFixture.copy)
  const ownerId = `usage-preview-${spec.id}`
  const [intentStore] = useState(() => {
    const targets: UsageIntentPreviewSeed['targets'] =
      spec.variant === 3
        ? limitFixture.tiers.map((tier) => ({ actionId: 'request-increase', targetId: tier.id }))
        : spec.variant === 6
          ? [
              { actionId: 'stay-on-overage', targetId: undefined },
              ...overageFixture.plans
                .filter((plan) => !plan.disabled)
                .flatMap((plan) => [
                  { actionId: 'upgrade' as const, targetId: plan.id },
                  { actionId: 'stay-on-overage' as const, targetId: plan.id },
                ]),
            ]
          : spec.variant === 8 && mode !== 'disabled'
            ? [
                { actionId: 'details', targetId: 'northwind-team' },
                { actionId: 'upgrade', targetId: 'northwind-team' },
              ]
            : []
    return createUsageIntentPreviewStore({ ownerId, targets })
  })
  const intent = useStore(intentStore, (state) => state.intent)
  const compact = usageCompactFixture(mode, report)
  function report(actionId: UsagePreviewAction, value?: string) {
    if (!intentStore.getState().request(ownerId, actionId, value)) return
    onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) })
  }
  const locallyChanged =
    (spec.variant === 3 && limitState.tierId !== (limitFixture.tiers[0]?.id ?? null)) ||
    (spec.variant === 5 &&
      (budgetState.facts.cap !== budgetFixture.facts.cap ||
        budgetState.thresholds.some(
          (row) => row.checked !== budgetFixture.thresholds.find((entry) => entry.id === row.id)?.checked,
        ) ||
        budgetState.settings.some(
          (row) => row.checked !== budgetFixture.settings.find((entry) => entry.id === row.id)?.checked,
        ))) ||
    (spec.variant === 6 &&
      overageState.selectedId !== (overageFixture.plans.find((plan) => !plan.disabled)?.id ?? null))
  return (
    <HbarAppUiUsageProvider
      content={{
        presentation: { ownerId, notice: intent ? copy.requestNotice : locallyChanged ? copy.notice : undefined },
        overview,
        modelSpend,
        rateLimits,
        seats,
        budget,
        overage,
        requests,
        compact,
      }}
    >
      {children}
    </HbarAppUiUsageProvider>
  )
}
