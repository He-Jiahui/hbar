import { createStore } from 'zustand/vanilla'

export interface SupportBrowsePreviewSeed {
  readonly statusIds: readonly string[]
  readonly initialStatusId: string | null
}

export interface SupportBrowsePreviewState {
  readonly query: string
  readonly statusId: string | null
  readonly statusIds: readonly string[]
  readonly setQuery: (query: string) => void
  readonly selectStatus: (statusId: string) => boolean
  readonly reconcile: (seed: SupportBrowsePreviewSeed) => void
}

function currentIds(ids: readonly string[]): readonly string[] {
  return [...new Set(ids.filter((id) => id.trim().length > 0))]
}

function selectInitial(ids: readonly string[], preferred: string | null): string | null {
  return preferred && ids.includes(preferred) ? preferred : (ids[0] ?? null)
}

/** Domain query/filter state only; visible records and localized labels stay in the Host. */
export function createSupportBrowsePreviewStore(seed: SupportBrowsePreviewSeed) {
  const statusIds = currentIds(seed.statusIds)
  return createStore<SupportBrowsePreviewState>((set, get) => ({
    query: '',
    statusIds,
    statusId: selectInitial(statusIds, seed.initialStatusId),
    setQuery: (query) => {
      if (get().query !== query) set({ query })
    },
    selectStatus: (statusId) => {
      if (!get().statusIds.includes(statusId)) return false
      if (get().statusId !== statusId) set({ statusId })
      return true
    },
    reconcile: (nextSeed) => {
      const nextIds = currentIds(nextSeed.statusIds)
      const state = get()
      const statusId =
        state.statusId && nextIds.includes(state.statusId)
          ? state.statusId
          : selectInitial(nextIds, nextSeed.initialStatusId)
      if (
        state.statusId === statusId &&
        state.statusIds.length === nextIds.length &&
        state.statusIds.every((id, index) => id === nextIds[index])
      )
        return
      set({ statusIds: nextIds, statusId })
    },
  }))
}
