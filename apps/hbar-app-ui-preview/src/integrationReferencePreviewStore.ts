import { createStore } from 'zustand/vanilla'
import type {
  LumenIntegrationEndpointReferenceState,
  LumenIntegrationScopeReferenceState,
  LumenIntegrationSyncReferenceState,
} from '@lumen/app-ui'

export type IntegrationReferencePreviewKind =
  'marketplace' | 'connection' | 'api-keys' | 'webhooks' | 'consent' | 'sync'
export interface IntegrationReferencePreviewScope {
  readonly id: string
  readonly enabled: boolean
  readonly required: boolean
}
export interface IntegrationReferencePreviewSeed {
  readonly ownerId: string
  readonly kind: IntegrationReferencePreviewKind
  readonly targetIds: readonly string[]
  readonly initialSelectionId: string | null
  readonly scopes: readonly IntegrationReferencePreviewScope[]
  readonly keyIds: readonly string[]
  readonly endpoints: readonly LumenIntegrationEndpointReferenceState[]
  readonly deliveries: readonly { readonly id: string; readonly endpointId: string }[]
  readonly initialExpandedIds: readonly string[]
  readonly sources: readonly LumenIntegrationSyncReferenceState[]
}
export interface IntegrationReferencePreviewState {
  readonly seed: IntegrationReferencePreviewSeed
  readonly query: string
  readonly selectionId: string | null
  readonly scopes: readonly LumenIntegrationScopeReferenceState[]
  readonly revealedIds: readonly string[]
  readonly endpoints: readonly LumenIntegrationEndpointReferenceState[]
  readonly expandedIds: readonly string[]
  readonly sources: readonly LumenIntegrationSyncReferenceState[]
  readonly setQuery: (query: string) => void
  readonly select: (id: string) => boolean
  readonly setScope: (id: string, enabled: boolean) => boolean
  readonly toggleReveal: (id: string) => boolean
  readonly setEndpoint: (id: string, enabled: boolean) => boolean
  readonly toggleDelivery: (endpointId: string, deliveryId: string) => boolean
  readonly toggleSource: (id: string) => boolean
  readonly reconcile: (seed: IntegrationReferencePreviewSeed) => void
}

function ids(input: readonly string[]): readonly string[] {
  return [...new Set(input.filter((id) => id.trim().length > 0))]
}
function unique<T extends { readonly id: string }>(input: readonly T[]): readonly T[] {
  const known = new Set<string>()
  return input.filter(({ id }) => {
    if (!id.trim() || known.has(id)) return false
    known.add(id)
    return true
  })
}
function normalizeSeed(input: IntegrationReferencePreviewSeed): IntegrationReferencePreviewSeed {
  const endpoints = unique(input.endpoints.map((item) => ({ ...item, id: item.endpointId }))).map(
    ({ endpointId, enabled }) => ({ endpointId, enabled }),
  )
  const endpointIds = new Set(endpoints.map(({ endpointId }) => endpointId))
  const deliveries = unique(input.deliveries).filter(({ endpointId }) => endpointIds.has(endpointId))
  return {
    ...input,
    targetIds: ids(input.targetIds),
    scopes: unique(input.scopes),
    keyIds: ids(input.keyIds),
    endpoints,
    deliveries,
    initialExpandedIds: ids(input.initialExpandedIds).filter((id) => deliveries.some((item) => item.id === id)),
    sources: unique(input.sources.map((item) => ({ ...item, id: item.sourceId }))).map(({ sourceId, phase }) => ({
      sourceId,
      phase,
    })),
  }
}
function initialSelection(seed: IntegrationReferencePreviewSeed): string | null {
  return seed.initialSelectionId && seed.targetIds.includes(seed.initialSelectionId)
    ? seed.initialSelectionId
    : (seed.targetIds[0] ?? null)
}

/** Preview-owned IDs/settings only: no tokens, payloads, clipboard or network side effects. */
export function createIntegrationReferencePreviewStore(input: IntegrationReferencePreviewSeed) {
  const seed = normalizeSeed(input)
  return createStore<IntegrationReferencePreviewState>((set, get) => ({
    seed,
    query: '',
    selectionId: initialSelection(seed),
    scopes: seed.scopes.map(({ id, enabled }) => ({ scopeId: id, enabled })),
    revealedIds: [],
    endpoints: seed.endpoints,
    expandedIds: seed.initialExpandedIds,
    sources: seed.sources,
    setQuery: (query) => {
      if (get().seed.kind === 'marketplace' && get().query !== query) set({ query })
    },
    select: (id) => {
      const state = get()
      if (!state.seed.targetIds.includes(id)) return false
      if (state.selectionId !== id) set({ selectionId: id })
      return true
    },
    setScope: (id, enabled) => {
      const state = get()
      const scope = state.seed.scopes.find((item) => item.id === id)
      if (state.seed.kind !== 'connection' || !scope || scope.required) return false
      set({ scopes: state.scopes.map((item) => (item.scopeId === id ? { ...item, enabled } : item)) })
      return true
    },
    toggleReveal: (id) => {
      const state = get()
      if (state.seed.kind !== 'api-keys' || !state.seed.keyIds.includes(id)) return false
      set({
        revealedIds: state.revealedIds.includes(id)
          ? state.revealedIds.filter((value) => value !== id)
          : [...state.revealedIds, id],
      })
      return true
    },
    setEndpoint: (id, enabled) => {
      const state = get()
      if (state.seed.kind !== 'webhooks' || !state.seed.endpoints.some((item) => item.endpointId === id)) return false
      set({ endpoints: state.endpoints.map((item) => (item.endpointId === id ? { ...item, enabled } : item)) })
      return true
    },
    toggleDelivery: (endpointId, deliveryId) => {
      const state = get()
      if (
        state.seed.kind !== 'webhooks' ||
        state.selectionId !== endpointId ||
        !state.seed.deliveries.some((item) => item.id === deliveryId && item.endpointId === endpointId)
      )
        return false
      set({
        expandedIds: state.expandedIds.includes(deliveryId)
          ? state.expandedIds.filter((value) => value !== deliveryId)
          : [...state.expandedIds, deliveryId],
      })
      return true
    },
    toggleSource: (id) => {
      const state = get()
      if (state.seed.kind !== 'sync' || !state.sources.some((item) => item.sourceId === id)) return false
      set({
        sources: state.sources.map((item) =>
          item.sourceId === id
            ? { ...item, phase: item.phase === 'paused' || item.phase === 'failed' ? 'syncing' : 'paused' }
            : item,
        ),
      })
      return true
    },
    reconcile: (inputSeed) => {
      const state = get()
      if (inputSeed.ownerId !== state.seed.ownerId || inputSeed.kind !== state.seed.kind) return
      const next = normalizeSeed(inputSeed)
      if (JSON.stringify(next) === JSON.stringify(state.seed)) return
      const oldScopes = new Map(state.scopes.map((item) => [item.scopeId, item.enabled]))
      const scopeSeed = new Map(state.seed.scopes.map((item) => [item.id, item]))
      const oldEndpoints = new Map(state.endpoints.map((item) => [item.endpointId, item.enabled]))
      const endpointSeed = new Map(state.seed.endpoints.map((item) => [item.endpointId, item.enabled]))
      const oldSources = new Map(state.sources.map((item) => [item.sourceId, item.phase]))
      const sourceSeed = new Map(state.seed.sources.map((item) => [item.sourceId, item.phase]))
      set({
        seed: next,
        selectionId:
          state.selectionId && next.targetIds.includes(state.selectionId) ? state.selectionId : initialSelection(next),
        scopes: next.scopes.map((item) => ({
          scopeId: item.id,
          enabled:
            !item.required && scopeSeed.get(item.id)?.enabled === item.enabled
              ? (oldScopes.get(item.id) ?? item.enabled)
              : item.enabled,
        })),
        revealedIds: state.revealedIds.filter((id) => next.keyIds.includes(id)),
        endpoints: next.endpoints.map((item) => ({
          ...item,
          enabled:
            endpointSeed.get(item.endpointId) === item.enabled
              ? (oldEndpoints.get(item.endpointId) ?? item.enabled)
              : item.enabled,
        })),
        expandedIds: state.expandedIds.filter((id) =>
          next.deliveries.some(
            (item) =>
              item.id === id &&
              state.seed.deliveries.some((previous) => previous.id === id && previous.endpointId === item.endpointId),
          ),
        ),
        sources: next.sources.map((item) => ({
          ...item,
          phase:
            sourceSeed.get(item.sourceId) === item.phase ? (oldSources.get(item.sourceId) ?? item.phase) : item.phase,
        })),
      })
    },
  }))
}
