import { createStore } from 'zustand/vanilla'
import { uniqueHbarAppUiAgentApprovalItems, type HbarAppUiAgentApprovalHistoryContent } from 'hbar-app-ui/catalog'

type Content = HbarAppUiAgentApprovalHistoryContent | undefined

export interface HistoryPreviewState {
  readonly content: Content
  readonly query: string
  readonly activeFilterId: string
  readonly exportRequested: boolean
  readonly replace: (content: Content) => void
  readonly search: (historyId: string, query: string) => void
  readonly filter: (historyId: string, filterId: string) => void
  readonly clear: (historyId: string) => void
  readonly export: (historyId: string) => void
}

function validFilter(content: Content, id: string): string {
  const filters = uniqueHbarAppUiAgentApprovalItems(content?.filters ?? []).filter(
    (filter) => filter.id.trim().length > 0,
  )
  return filters.find((filter) => filter.id === id)?.id ?? filters[0]?.id ?? ''
}

function hasHistoryTarget(content: Content, historyId: string): boolean {
  return Boolean(historyId.trim() && content?.historyId === historyId)
}

export function createHistoryPreviewStore(content: Content) {
  return createStore<HistoryPreviewState>((set, get) => ({
    content,
    query: content?.query ?? '',
    activeFilterId: validFilter(content, content?.activeFilterId ?? ''),
    exportRequested: false,
    replace(next) {
      const current = get()
      if (current.content === next) return
      const same = next?.historyId === current.content?.historyId
      set({
        content: next,
        exportRequested: same && current.exportRequested,
        query: same && next?.query === current.content?.query ? current.query : (next?.query ?? ''),
        activeFilterId: validFilter(
          next,
          same && next?.activeFilterId === current.content?.activeFilterId
            ? current.activeFilterId
            : (next?.activeFilterId ?? ''),
        ),
      })
    },
    search(historyId, query) {
      if (hasHistoryTarget(get().content, historyId)) set({ query })
    },
    filter(historyId, filterId) {
      const current = get()
      const content = current.content
      if (
        hasHistoryTarget(current.content, historyId) &&
        content &&
        filterId.trim() &&
        uniqueHbarAppUiAgentApprovalItems(content.filters).some((filter) => filter.id === filterId && filter.id.trim())
      )
        set({ activeFilterId: filterId })
    },
    clear(historyId) {
      const current = get()
      if (current.content && hasHistoryTarget(current.content, historyId))
        set({ query: '', activeFilterId: validFilter(current.content, current.content.activeFilterId) })
    },
    export(historyId) {
      if (historyId.trim() && get().content?.historyId === historyId) set({ exportRequested: true })
    },
  }))
}

export function projectHistoryPreviewContent(state: HistoryPreviewState): Content {
  if (!state.content) return undefined
  return {
    ...state.content,
    query: state.query,
    activeFilterId: state.activeFilterId,
    onQueryChange: state.search,
    onFilterChange: state.filter,
    onClearFilters: state.clear,
    onExport: state.export,
  }
}
