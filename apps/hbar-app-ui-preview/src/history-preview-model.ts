import { createStore } from 'zustand/vanilla'
import type { HbarAppUiAgentApprovalHistoryContent } from 'hbar-app-ui/catalog'

type Content = HbarAppUiAgentApprovalHistoryContent | undefined

export interface HistoryPreviewState {
  readonly content: Content
  readonly query: string
  readonly activeFilterId: string
  readonly replace: (content: Content) => void
  readonly search: (historyId: string, query: string) => void
  readonly filter: (historyId: string, filterId: string) => void
  readonly clear: (historyId: string) => void
}

function validFilter(content: Content, id: string): string {
  return content?.filters.find((filter) => filter.id === id)?.id ?? content?.filters[0]?.id ?? ''
}

export function createHistoryPreviewStore(content: Content) {
  return createStore<HistoryPreviewState>((set, get) => ({
    content,
    query: content?.query ?? '',
    activeFilterId: validFilter(content, content?.activeFilterId ?? ''),
    replace(next) {
      const current = get()
      if (current.content === next) return
      const same = next?.historyId === current.content?.historyId
      set({
        content: next,
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
      if (get().content?.historyId === historyId) set({ query })
    },
    filter(historyId, filterId) {
      const current = get()
      if (current.content?.historyId === historyId && current.content.filters.some((filter) => filter.id === filterId))
        set({ activeFilterId: filterId })
    },
    clear(historyId) {
      const current = get()
      if (current.content?.historyId === historyId)
        set({ query: '', activeFilterId: validFilter(current.content, current.content.activeFilterId) })
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
  }
}
