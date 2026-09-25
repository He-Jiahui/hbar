import { createStore } from 'zustand/vanilla'
import type { LumenAppShellContractsContent } from '@lumen/app-ui'
import type { ContractsPreviewFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-contracts-fixtures'

export function createAppShellContractsPreviewStore() {
  return createStore<{
    readonly query: string
    readonly filterId: string
    readonly sidebarExpanded: boolean
    readonly setQuery: (value: string) => void
    readonly setFilter: (id: string) => void
    readonly setExpanded: (expanded: boolean) => void
    readonly clear: () => void
  }>((set) => ({
    query: '',
    filterId: 'all',
    sidebarExpanded: true,
    setQuery: (query) => set({ query }),
    setFilter: (filterId) => set({ filterId }),
    setExpanded: (sidebarExpanded) => set({ sidebarExpanded }),
    clear: () => set({ query: '', filterId: 'all' }),
  }))
}
export function projectAppShellContractsPreview(
  state: ReturnType<ReturnType<typeof createAppShellContractsPreviewStore>['getState']>,
  content: ContractsPreviewFixture,
): LumenAppShellContractsContent {
  const inventory = [...new Map(content.inventory.map((record) => [record.id, record])).values()]
  const query = state.query.trim().toLocaleLowerCase()
  const validFilter = content.filters.some((filter) => filter.id === state.filterId)
  const records = validFilter
    ? inventory.filter(
        (record) =>
          (state.filterId === 'all' ||
            (state.filterId === 'signed'
              ? ['active', 'renewing'].includes(record.category)
              : state.filterId === 'attention' && ['approval', 'overdue'].includes(record.category))) &&
          `${record.title} ${record.counterparty}`.toLocaleLowerCase().includes(query),
      )
    : []
  return {
    ...content,
    records,
    labels: { ...content.labels, recordsCount: content.formatCount(records.length, inventory.length) },
    searchValue: state.query,
    filterId: validFilter ? state.filterId : null,
    sidebarExpanded: state.sidebarExpanded,
    onSearchChange: (value) => {
      state.setQuery(value)
      content.onSearchChange(value)
    },
    onFilterChange: (id) => {
      if (content.filters.some((filter) => filter.id === id)) {
        state.setFilter(id)
        content.onFilterChange(id)
      }
    },
    onClearSearch: () => {
      state.clear()
      content.onClearSearch()
    },
    onSidebarExpandedChange: (expanded) => {
      state.setExpanded(expanded)
      content.onSidebarExpandedChange(expanded)
    },
  }
}
