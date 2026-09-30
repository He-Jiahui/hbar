import { createStore, type StoreApi } from 'zustand/vanilla'

export interface AgentActivityPreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly groupIds: readonly string[]
  readonly initialOpenGroupIds: readonly string[]
  readonly filterIds: readonly string[]
  readonly initialFilterId: string | null
  readonly entryIds: readonly string[]
  readonly initialVisibleCount: number
  readonly initiallyRunning: boolean
  readonly historyIds: readonly string[]
  readonly outputIds: readonly string[]
}

export type AgentActivityPreviewNotice = 'local' | 'intent' | null

export interface AgentActivityPreviewStoreState {
  readonly seed: AgentActivityPreviewSeed
  readonly openGroupIds: readonly string[]
  readonly filterId: string | null
  readonly visibleCount: number
  readonly running: boolean
  readonly deploymentStopped: boolean
  readonly retryQueued: boolean
  readonly notice: AgentActivityPreviewNotice
  readonly toggleGroup: (id: string) => boolean
  readonly selectFilter: (id: string) => boolean
  readonly advanceLog: () => boolean
  readonly stopLog: () => void
  readonly recordIntent: (actionId: string, targetId?: string) => boolean
  readonly reconcile: (seed: AgentActivityPreviewSeed) => void
}

export type AgentActivityPreviewStoreApi = StoreApi<AgentActivityPreviewStoreState>

function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    if (!id.trim() || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

function clampCount(count: number, maximum: number): number {
  if (!Number.isFinite(count)) return 0
  return Math.max(0, Math.min(maximum, Math.floor(count)))
}

function normalizeSeed(seed: AgentActivityPreviewSeed): AgentActivityPreviewSeed {
  const groupIds = uniqueIds(seed.groupIds)
  const filterIds = uniqueIds(seed.filterIds)
  const entryIds = uniqueIds(seed.entryIds)
  const historyIds = uniqueIds(seed.historyIds)
  const outputIds = uniqueIds(seed.outputIds)
  const requestedFilterId = seed.initialFilterId
  const initialFilterId =
    requestedFilterId !== null && filterIds.includes(requestedFilterId) ? requestedFilterId : (filterIds[0] ?? null)

  return {
    ownerId: seed.ownerId,
    variant: seed.variant,
    groupIds,
    initialOpenGroupIds: uniqueIds(seed.initialOpenGroupIds).filter((id) => groupIds.includes(id)),
    filterIds,
    initialFilterId,
    entryIds,
    initialVisibleCount: clampCount(seed.initialVisibleCount, entryIds.length),
    initiallyRunning: seed.initiallyRunning,
    historyIds,
    outputIds,
  }
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function sameSeed(left: AgentActivityPreviewSeed, right: AgentActivityPreviewSeed): boolean {
  return (
    left.ownerId === right.ownerId &&
    left.variant === right.variant &&
    sameIds(left.groupIds, right.groupIds) &&
    sameIds(left.initialOpenGroupIds, right.initialOpenGroupIds) &&
    sameIds(left.filterIds, right.filterIds) &&
    left.initialFilterId === right.initialFilterId &&
    sameIds(left.entryIds, right.entryIds) &&
    left.initialVisibleCount === right.initialVisibleCount &&
    left.initiallyRunning === right.initiallyRunning &&
    sameIds(left.historyIds, right.historyIds) &&
    sameIds(left.outputIds, right.outputIds)
  )
}

function allowsIntent(seed: AgentActivityPreviewSeed, actionId: string, targetId: string | undefined): boolean {
  switch (actionId) {
    case 'stop-live':
      return seed.variant === 1 && targetId === undefined
    case 'stop':
      return seed.variant === 3 && targetId === undefined
    case 'run-again':
      return seed.variant === 3 && targetId === undefined
    case 'rerun-history':
      return seed.variant === 4 && targetId !== undefined && seed.historyIds.includes(targetId)
    case 'retry-failure':
    case 'cancel-failure-retry':
    case 'view-failure-log':
      return seed.variant === 7 && targetId === undefined
    case 'download-failure-output':
      return seed.variant === 7 && targetId !== undefined && seed.outputIds.includes(targetId)
    default:
      return false
  }
}

/** A domain-only, non-persistent model for the Agent Activity preview interactions. */
export function createAgentActivityPreviewStore(input: AgentActivityPreviewSeed): AgentActivityPreviewStoreApi {
  const seed = normalizeSeed(input)
  const initialFilterId = seed.initialFilterId

  return createStore<AgentActivityPreviewStoreState>((set, get) => ({
    seed,
    openGroupIds: seed.initialOpenGroupIds,
    filterId: initialFilterId,
    visibleCount: seed.initialVisibleCount,
    running: seed.initiallyRunning && seed.initialVisibleCount < seed.entryIds.length,
    deploymentStopped: false,
    retryQueued: false,
    notice: null,
    toggleGroup: (id) => {
      const state = get()
      if (!state.seed.groupIds.includes(id)) return false
      const nextOpenGroupIds = state.openGroupIds.includes(id)
        ? state.openGroupIds.filter((openId) => openId !== id)
        : [...state.openGroupIds, id]
      set({ openGroupIds: nextOpenGroupIds, notice: 'local' })
      return true
    },
    selectFilter: (id) => {
      const state = get()
      if (!state.seed.filterIds.includes(id)) return false
      if (state.filterId !== id || state.notice !== 'local') {
        set({ filterId: id, notice: 'local' })
      }
      return true
    },
    advanceLog: () => {
      const state = get()
      if (!state.running || state.visibleCount >= state.seed.entryIds.length) return false
      const visibleCount = Math.min(state.seed.entryIds.length, state.visibleCount + 1)
      set({ visibleCount, running: visibleCount < state.seed.entryIds.length, notice: 'local' })
      return true
    },
    stopLog: () => {
      const state = get()
      if (!state.running) return
      set({ running: false, notice: 'local' })
    },
    recordIntent: (actionId, targetId) => {
      const state = get()
      if (!allowsIntent(state.seed, actionId, targetId)) return false
      if (actionId === 'stop') {
        set({ deploymentStopped: true, notice: 'intent' })
      } else if (actionId === 'run-again') {
        set({ deploymentStopped: false, notice: 'intent' })
      } else if (actionId === 'retry-failure') {
        set({ retryQueued: true, notice: 'intent' })
      } else if (actionId === 'cancel-failure-retry') {
        set({ retryQueued: false, notice: 'intent' })
      } else if (state.notice !== 'intent') {
        set({ notice: 'intent' })
      }
      return true
    },
    reconcile: (nextInput) => {
      const current = get()
      const nextSeed = normalizeSeed(nextInput)
      if (nextSeed.ownerId !== current.seed.ownerId || nextSeed.variant !== current.seed.variant) {
        return
      }

      const currentGroupIds = new Set(current.seed.groupIds)
      const nextOpenGroupIds = [
        ...current.openGroupIds.filter((id) => nextSeed.groupIds.includes(id)),
        ...nextSeed.initialOpenGroupIds.filter((id) => !currentGroupIds.has(id) && !current.openGroupIds.includes(id)),
      ]
      const filterId =
        current.filterId !== null && nextSeed.filterIds.includes(current.filterId)
          ? current.filterId
          : nextSeed.initialFilterId
      const visibleCount = clampCount(current.visibleCount, nextSeed.entryIds.length)
      const running = current.running && visibleCount < nextSeed.entryIds.length
      const unchanged =
        sameSeed(current.seed, nextSeed) &&
        sameIds(current.openGroupIds, nextOpenGroupIds) &&
        current.filterId === filterId &&
        current.visibleCount === visibleCount &&
        current.running === running
      if (unchanged) return
      set({
        seed: nextSeed,
        openGroupIds: nextOpenGroupIds,
        filterId,
        visibleCount,
        running,
      })
    },
  }))
}
