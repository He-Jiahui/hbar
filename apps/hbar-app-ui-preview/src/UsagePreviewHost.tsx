import { useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiUsageProvider, type HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { USAGE_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-usage-fixtures'
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

export function UsagePreviewHost({
  spec,
  onAction,
  children,
}: HbarAppUiVariantProps & { readonly children: ReactNode }) {
  const base = USAGE_FIXTURES
  const mode = new URLSearchParams(location.search).get('usageFixture')
  const [overviewStore] = useState(() => createUsageOverviewPreviewStore(usageOverviewDatasets(mode)))
  const overview = projectUsageOverviewPreview(useStore(overviewStore), mode === 'localized' ? 'Zeitraum' : 'Range')
  const [modelFixture] = useState(() => modelSpendFixture(mode))
  const [modelStore] = useState(() => createUsageModelPreviewStore(modelFixture.records))
  const modelSpend = projectUsageModelPreview(useStore(modelStore), modelFixture.content, modelFixture.pagination)
  const [limitFixture] = useState(() => usageLimitFixture(mode))
  const [limitStore] = useState(() => createUsageLimitPreviewStore(limitFixture.tiers, limitFixture.metrics))
  const rateLimits = projectUsageLimitPreview(useStore(limitStore), limitFixture.copy, (tierId) =>
    report('request-increase', tierId),
  )
  const [memberFixture] = useState(() => usageMemberFixture(mode))
  const [memberStore] = useState(() => createUsageMemberPreviewStore(memberFixture.teams, memberFixture.records))
  const seats = projectUsageMemberPreview(useStore(memberStore), memberFixture.copy)
  const [budgetFixture] = useState(() => usageBudgetFixture(mode))
  const [budgetStore] = useState(() =>
    createUsageBudgetPreviewStore(budgetFixture.facts, budgetFixture.thresholds, budgetFixture.settings),
  )
  const budget = projectUsageBudgetPreview(useStore(budgetStore), budgetFixture.copy)
  const [overageFixture] = useState(() => usageOverageFixture(mode))
  const [overageStore] = useState(() => createUsageOveragePreviewStore(overageFixture.plans))
  const overage = projectUsageOveragePreview(useStore(overageStore), overageFixture.copy, (action, id) =>
    report(action, id ?? undefined),
  )
  const [requestFixture] = useState(() => usageRequestFixture(mode))
  const [requestStore] = useState(() =>
    createUsageRequestPreviewStore(requestFixture.records, requestFixture.expandedId),
  )
  const requests = projectUsageRequestPreview(useStore(requestStore), requestFixture.copy)
  function report(actionId: string, value?: string) {
    onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) })
  }
  return (
    <HbarAppUiUsageProvider
      content={{
        overview,
        modelSpend,
        rateLimits,
        seats,
        budget,
        overage,
        requests,
        compact: { ...base.compact, action: { label: 'Upgrade', onInvoke: () => report('upgrade') } },
      }}
    >
      {children}
    </HbarAppUiUsageProvider>
  )
}
