import { createStore } from 'zustand/vanilla'
import type { HbarAppUiFeedbackBoardReferenceContent } from 'hbar-app-ui/catalog'
import { uniqueHbarAppUiFeedbackBoardRequests } from 'hbar-app-ui/catalog'

type SortId = HbarAppUiFeedbackBoardReferenceContent['selectedSortId']
type Request = HbarAppUiFeedbackBoardReferenceContent['requests'][number]
interface BoardState {
  readonly boardId: string | undefined
  readonly sorts: HbarAppUiFeedbackBoardReferenceContent['sorts']
  readonly requests: readonly Request[]
  readonly selectedSortId: SortId
  readonly searchQuery: string
  readonly votedIds: readonly string[]
  readonly reset: (content: HbarAppUiFeedbackBoardReferenceContent | undefined) => void
  readonly sort: (boardId: string, sortId: SortId) => void
  readonly search: (boardId: string, query: string) => void
  readonly vote: (boardId: string, requestId: string) => void
}

function projection(content: HbarAppUiFeedbackBoardReferenceContent | undefined) {
  const requests = uniqueHbarAppUiFeedbackBoardRequests(content?.requests ?? [])
  const sorts = [...new Map((content?.sorts ?? []).map((sort) => [sort.id, sort])).values()]
  return {
    boardId: content?.boardId,
    sorts,
    requests,
    selectedSortId: sorts.some((sort) => sort.id === content?.selectedSortId)
      ? (content?.selectedSortId ?? 'top')
      : (sorts[0]?.id ?? 'top'),
    searchQuery: content?.searchQuery ?? '',
    votedIds: [...new Set(content?.votedIds ?? [])].filter((id) => requests.some((request) => request.id === id)),
  }
}

/** The source demo retains search input without filtering, and New request has no visible result. */
export function createFeedbackBoardPreviewStore(content: HbarAppUiFeedbackBoardReferenceContent | undefined) {
  return createStore<BoardState>((set) => ({
    ...projection(content),
    reset: (next) => set(projection(next)),
    sort: (boardId, sortId) =>
      set((state) =>
        state.boardId === boardId && state.sorts.some((sort) => sort.id === sortId) ? { selectedSortId: sortId } : {},
      ),
    search: (boardId, query) => set((state) => (state.boardId === boardId ? { searchQuery: query } : {})),
    vote: (boardId, requestId) =>
      set((state) =>
        state.boardId === boardId && state.requests.some((request) => request.id === requestId)
          ? {
              votedIds: state.votedIds.includes(requestId)
                ? state.votedIds.filter((id) => id !== requestId)
                : [...state.votedIds, requestId],
            }
          : {},
      ),
  }))
}
