import { createStore, type StoreApi } from 'zustand/vanilla'
import type { LumenEmptyStateContent } from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'

export interface EmptyStatePreviewTarget {
  readonly variantId: string
  readonly variant: number
}

export interface EmptyStateSuggestionTarget {
  readonly id: string
  readonly query: string
}

export type EmptyStateChoiceCollection = 'first-run' | 'caught-up'

export interface EmptyStatePreviewSeed extends EmptyStatePreviewTarget {
  readonly query: string
  readonly firstRunChoiceIds: readonly string[]
  readonly caughtUpChoiceIds: readonly string[]
  readonly filterIds: readonly string[]
  readonly suggestions: readonly EmptyStateSuggestionTarget[]
}

export type EmptyStatePreviewOutcome = 'intent-only' | 'selection-only' | 'service-unverified'

export interface EmptyStatePreviewRequest extends EmptyStatePreviewTarget {
  readonly requestId: string
  readonly actionId: string
  readonly targetId?: string
  readonly value?: string
  readonly outcome: EmptyStatePreviewOutcome
}

export interface EmptyStateRetryTicket extends EmptyStatePreviewRequest {
  readonly actionId: 'retry-load'
  readonly outcome: 'service-unverified'
}

export interface EmptyStatePreviewStoreState extends EmptyStatePreviewSeed {
  readonly activeFilterIds: readonly string[]
  readonly retryOutcome: 'unverified' | null
  readonly pendingRetry: EmptyStateRetryTicket | null
  readonly selectedFileCount: number
  readonly setQuery: (query: string) => void
  readonly replaceFirstRunChoiceIds: (ids: readonly string[]) => boolean
  readonly replaceCaughtUpChoiceIds: (ids: readonly string[]) => boolean
  readonly replaceFilterIds: (ids: readonly string[]) => boolean
  readonly replaceSuggestions: (suggestions: readonly EmptyStateSuggestionTarget[]) => boolean
  readonly removeFilter: (id: string) => boolean
  readonly clearFilters: () => readonly string[]
  readonly chooseSuggestion: (id: string) => EmptyStatePreviewRequest | null
  readonly chooseItem: (collection: EmptyStateChoiceCollection, id: string) => EmptyStatePreviewRequest | null
  readonly createIntent: (
    actionId: string,
    targetId?: string,
    value?: string,
    outcome?: EmptyStatePreviewOutcome,
  ) => EmptyStatePreviewRequest
  readonly startRetry: () => EmptyStateRetryTicket | null
  readonly completeRetry: (requestId: string) => boolean
  readonly cancelRetry: (requestId: string) => boolean
  readonly setSelectedFileCount: (count: number) => void
  readonly clearOwner: () => void
}

export type EmptyStatePreviewStoreApi = StoreApi<EmptyStatePreviewStoreState>

const EMPTY_STATE_PREVIEW_OUTCOME: EmptyStatePreviewOutcome = 'intent-only'
let nextStoreId = 0

function normalizeIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const requestedId of ids) {
    const id = requestedId.trim()
    if (id.length === 0 || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

function normalizeSuggestions(suggestions: readonly EmptyStateSuggestionTarget[]): EmptyStateSuggestionTarget[] {
  const seen = new Set<string>()
  const result: EmptyStateSuggestionTarget[] = []
  for (const suggestion of suggestions) {
    const id = suggestion.id.trim()
    if (id.length === 0 || seen.has(id)) continue
    seen.add(id)
    result.push({ id, query: suggestion.query })
  }
  return result
}

export function createEmptyStatePreviewSeed(
  spec: Pick<HbarAppUiVariantProps['spec'], 'id' | 'variant'>,
  content: LumenEmptyStateContent,
): EmptyStatePreviewSeed {
  return {
    variantId: spec.id,
    variant: spec.variant,
    query: content.noResults?.query ?? '',
    firstRunChoiceIds: normalizeIds(content.firstRun?.choices.map(({ id }) => id) ?? []),
    caughtUpChoiceIds: normalizeIds(content.caughtUp?.choices.map(({ id }) => id) ?? []),
    filterIds: normalizeIds(content.noResults?.filters.map(({ id }) => id) ?? []),
    suggestions: normalizeSuggestions(content.noResults?.suggestions.map(({ id, query }) => ({ id, query })) ?? []),
  }
}

/** Keeps mutable domain values separate from localized copy and local demo timers. */
export function createEmptyStatePreviewStore(seed: EmptyStatePreviewSeed): EmptyStatePreviewStoreApi {
  const storeId = ++nextStoreId
  let requestSequence = 0
  const firstRunChoiceIds = normalizeIds(seed.firstRunChoiceIds)
  const caughtUpChoiceIds = normalizeIds(seed.caughtUpChoiceIds)
  const filterIds = normalizeIds(seed.filterIds)
  const suggestions = normalizeSuggestions(seed.suggestions)

  function nextRequestId(): string {
    requestSequence += 1
    return `empty-state:${storeId}:${requestSequence}`
  }

  function createRequest(
    actionId: string,
    targetId: string | undefined,
    value: string | undefined,
    outcome: EmptyStatePreviewOutcome,
  ): EmptyStatePreviewRequest {
    const base: EmptyStatePreviewRequest = {
      requestId: nextRequestId(),
      variantId: seed.variantId,
      variant: seed.variant,
      actionId,
      outcome,
    }
    return {
      ...base,
      ...(targetId === undefined ? {} : { targetId }),
      ...(value === undefined ? {} : { value }),
    }
  }

  return createStore<EmptyStatePreviewStoreState>((set, get) => ({
    ...seed,
    firstRunChoiceIds,
    caughtUpChoiceIds,
    filterIds,
    suggestions,
    activeFilterIds: filterIds,
    retryOutcome: null,
    pendingRetry: null,
    selectedFileCount: 0,
    setQuery: (query) => set({ query }),
    replaceFirstRunChoiceIds: (ids) => {
      const nextIds = normalizeIds(ids)
      const currentIds = get().firstRunChoiceIds
      if (currentIds.length === nextIds.length && currentIds.every((id, index) => id === nextIds[index])) return false
      set({ firstRunChoiceIds: nextIds })
      return true
    },
    replaceCaughtUpChoiceIds: (ids) => {
      const nextIds = normalizeIds(ids)
      const currentIds = get().caughtUpChoiceIds
      if (currentIds.length === nextIds.length && currentIds.every((id, index) => id === nextIds[index])) return false
      set({ caughtUpChoiceIds: nextIds })
      return true
    },
    replaceFilterIds: (ids) => {
      const nextIds = normalizeIds(ids)
      const state = get()
      const nextActiveIds = state.activeFilterIds.filter((id) => nextIds.includes(id))
      const unchanged =
        state.filterIds.length === nextIds.length &&
        state.filterIds.every((id, index) => id === nextIds[index]) &&
        state.activeFilterIds.length === nextActiveIds.length &&
        state.activeFilterIds.every((id, index) => id === nextActiveIds[index])
      if (unchanged) return false
      set({ filterIds: nextIds, activeFilterIds: nextActiveIds })
      return true
    },
    replaceSuggestions: (nextSuggestions) => {
      const normalized = normalizeSuggestions(nextSuggestions)
      const current = get().suggestions
      const unchanged =
        current.length === normalized.length &&
        current.every(
          (suggestion, index) =>
            suggestion.id === normalized[index]?.id && suggestion.query === normalized[index]?.query,
        )
      if (unchanged) return false
      set({ suggestions: normalized })
      return true
    },
    removeFilter: (requestedId) => {
      const id = requestedId.trim()
      const currentIds = get().activeFilterIds
      if (id.length === 0 || !currentIds.includes(id)) return false
      set({ activeFilterIds: currentIds.filter((candidate) => candidate !== id) })
      return true
    },
    clearFilters: () => {
      const removedIds = get().activeFilterIds
      if (removedIds.length > 0) set({ activeFilterIds: [] })
      return removedIds
    },
    chooseSuggestion: (requestedId) => {
      const id = requestedId.trim()
      const suggestion = get().suggestions.find((candidate) => candidate.id === id)
      if (!suggestion) return null
      set({ query: suggestion.query })
      return createRequest('select-suggestion', suggestion.id, suggestion.query, EMPTY_STATE_PREVIEW_OUTCOME)
    },
    chooseItem: (collection, requestedId) => {
      const id = requestedId.trim()
      const availableIds = collection === 'first-run' ? get().firstRunChoiceIds : get().caughtUpChoiceIds
      if (id.length === 0 || !availableIds.includes(id)) return null
      return createRequest('select-choice', id, undefined, EMPTY_STATE_PREVIEW_OUTCOME)
    },
    createIntent: (actionId, targetId, value, outcome = EMPTY_STATE_PREVIEW_OUTCOME) =>
      createRequest(actionId, targetId, value, outcome),
    startRetry: () => {
      if (get().pendingRetry !== null) return null
      const request: EmptyStateRetryTicket = {
        requestId: nextRequestId(),
        variantId: seed.variantId,
        variant: seed.variant,
        actionId: 'retry-load',
        outcome: 'service-unverified',
      }
      set({ pendingRetry: request, retryOutcome: null })
      return request
    },
    completeRetry: (requestId) => {
      const pending = get().pendingRetry
      if (pending === null || pending.requestId !== requestId) return false
      set({ pendingRetry: null, retryOutcome: 'unverified' })
      return true
    },
    cancelRetry: (requestId) => {
      const pending = get().pendingRetry
      if (pending === null || pending.requestId !== requestId) return false
      set({ pendingRetry: null })
      return true
    },
    setSelectedFileCount: (count) =>
      set({ selectedFileCount: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0 }),
    clearOwner: () => set({ pendingRetry: null }),
  }))
}
