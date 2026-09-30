import { createStore } from 'zustand/vanilla'
import type { HbarAppUiUsageOverviewContent } from 'hbar-app-ui/catalog'

export interface UsageOverviewPreviewDataset {
  readonly id: string
  readonly label: string
  readonly content: HbarAppUiUsageOverviewContent
}
export interface UsageOverviewPreviewState {
  readonly datasets: readonly UsageOverviewPreviewDataset[]
  readonly activeId: string | null
  readonly replace: (datasets: readonly UsageOverviewPreviewDataset[]) => void
  readonly select: (id: string) => void
}
function unique(datasets: readonly UsageOverviewPreviewDataset[]): readonly UsageOverviewPreviewDataset[] {
  return [...new Map(datasets.filter((entry) => entry.id.trim()).map((entry) => [entry.id, entry])).values()]
}
export function createUsageOverviewPreviewStore(datasets: readonly UsageOverviewPreviewDataset[], activeId = '7d') {
  const initial = unique(datasets)
  return createStore<UsageOverviewPreviewState>((set, get) => ({
    datasets: initial,
    activeId: initial.find((entry) => entry.id === activeId)?.id ?? initial[0]?.id ?? null,
    select(id) {
      if (get().datasets.some((entry) => entry.id === id)) set({ activeId: id })
    },
    replace(next) {
      const items = unique(next)
      const previous = get().activeId
      set({ datasets: items, activeId: items.find((entry) => entry.id === previous)?.id ?? items[0]?.id ?? null })
    },
  }))
}
export function projectUsageOverviewPreview(
  state: UsageOverviewPreviewState,
  rangeLabel: string,
): HbarAppUiUsageOverviewContent | undefined {
  const entry = state.datasets.find((item) => item.id === state.activeId)
  if (!entry) return undefined
  return {
    ...entry.content,
    range: {
      label: rangeLabel,
      value: entry.id,
      options: state.datasets.map(({ id, label }) => ({ id, label })),
      onChange: state.select,
    },
  }
}
