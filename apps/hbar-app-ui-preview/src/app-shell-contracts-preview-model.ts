import { createStore } from 'zustand/vanilla'
import type { LumenAppShellContractsContent } from '@lumen/app-ui'
import type { ContractsPreviewFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-contracts-fixtures'

function isValidId(id: string): boolean {
  return id.trim().length > 0
}

function stableValidItems<T extends { readonly id: string }>(items: readonly T[]): T[] {
  return [...new Map(items.filter((item) => isValidId(item.id)).map((item) => [item.id, item])).values()]
}

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
    setFilter: (filterId) => {
      if (isValidId(filterId)) set({ filterId })
    },
    setExpanded: (sidebarExpanded) => set({ sidebarExpanded }),
    clear: () => set({ query: '', filterId: 'all' }),
  }))
}
export function projectAppShellContractsPreview(
  state: ReturnType<ReturnType<typeof createAppShellContractsPreviewStore>['getState']>,
  content: ContractsPreviewFixture,
): LumenAppShellContractsContent {
  const inventory = stableValidItems(content.inventory)
  const filters = stableValidItems(content.filters)
  const sections = stableValidItems(content.sections).map((section) => ({
    ...section,
    links: stableValidItems(section.links),
  }))
  const footerLinks = stableValidItems(content.footerLinks)
  const metrics = content.metrics.every((metric) => isValidId(metric.id))
    ? content.metrics
    : content.metrics.filter((metric) => isValidId(metric.id))
  const navigationIds = new Set([
    ...sections.flatMap((section) => section.links.map((link) => link.id)),
    ...footerLinks.map((link) => link.id),
  ])
  const query = state.query.trim().toLocaleLowerCase()
  const validFilter = filters.some((filter) => filter.id === state.filterId)
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
    sections,
    footerLinks,
    metrics,
    accountActions: stableValidItems(content.accountActions),
    currentLinkId: content.currentLinkId && isValidId(content.currentLinkId) ? content.currentLinkId : null,
    filters,
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
      if (isValidId(id) && filters.some((filter) => filter.id === id)) {
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
    onNavigate: (id) => {
      if (isValidId(id) && navigationIds.has(id)) content.onNavigate(id)
    },
    onRecord: (id) => {
      if (isValidId(id) && records.some((record) => record.id === id)) content.onRecord(id)
    },
  }
}
