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

export function UsagePreviewHost({
  spec,
  onAction,
  children,
}: HbarAppUiVariantProps & { readonly children: ReactNode }) {
  const [query, setQuery] = useState(''),
    [teamOnly, setTeamOnly] = useState(false),
    [cap, setCap] = useState('60'),
    [threshold, setThreshold] = useState('80'),
    [hardStop, setHardStop] = useState(true),
    [saved, setSaved] = useState(false),
    [plan, setPlan] = useState('pro'),
    [filtered, setFiltered] = useState(false)
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
  function collection<T extends { readonly id: string }>(rows: readonly T[]): readonly T[] {
    return mode === 'empty'
      ? []
      : mode === 'overflow'
        ? Array.from({ length: 200 }, (_, index) => ({ ...rows[index % rows.length]!, id: `record-${index}` }))
        : rows
  }
  function report(actionId: string, value?: string) {
    onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) })
  }
  return (
    <HbarAppUiUsageProvider
      content={{
        overview,
        modelSpend,
        rateLimits,
        seats: {
          ...base.seats,
          strategy: mode === 'overflow' ? 'virtual' : 'content-grown',
          query,
          onQueryChange: setQuery,
          rows: collection(base.seats.rows).filter(
            (row) =>
              row.name.toLowerCase().includes(query.toLowerCase()) &&
              (!teamOnly || row.detail.startsWith('Engineering')),
          ),
          filter: { label: teamOnly ? 'All teams' : 'Team filter', onInvoke: () => setTeamOnly(!teamOnly) },
        },
        budget: {
          ...base.budget,
          cap: { ...base.budget.cap, value: cap, display: `$${cap}` },
          onCapChange: (value) => {
            setCap(value)
            setSaved(false)
          },
          threshold: { ...base.budget.threshold!, value: threshold, onChange: setThreshold },
          hardStop: { ...base.budget.hardStop!, checked: hardStop, onChange: setHardStop },
          status: {
            label: saved ? 'Budget saved' : Number(cap) > 80 ? 'Near cap' : 'Within budget',
            tone: Number(cap) > 80 ? 'warning' : 'positive',
          },
          onSave: () => {
            setSaved(true)
            report('save', cap)
          },
        },
        overage: {
          ...base.overage,
          plan: { ...base.overage.plan!, value: plan, onChange: setPlan },
          review: {
            label: `Review ${base.overage.plan!.options.find((item) => item.id === plan)?.label ?? ''}`,
            onInvoke: () => report('review', plan),
          },
        },
        requests: {
          ...base.requests,
          strategy: mode === 'overflow' ? 'virtual' : 'content-grown',
          rows: collection(base.requests.rows).filter((_, index) => !filtered || index % 2 === 0),
          filter: { label: filtered ? 'Show all requests' : 'Filter log', onInvoke: () => setFiltered(!filtered) },
        },
        compact: { ...base.compact, action: { label: 'Upgrade', onInvoke: () => report('upgrade') } },
      }}
    >
      {children}
    </HbarAppUiUsageProvider>
  )
}
