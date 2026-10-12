import { createStore } from 'zustand/vanilla'
import type { LumenAppShellAdaptiveContent } from '@lumen/app-ui/catalog'

function isValidId(id: string): boolean {
  return id.trim().length > 0
}
function stableValidItems<T extends { readonly id: string }>(items: readonly T[]): T[] {
  return [...new Map(items.filter((item) => isValidId(item.id)).map((item) => [item.id, item])).values()]
}

export function createAppShellAdaptivePreviewStore() {
  return createStore<{
    readonly selectedQueueId: string
    readonly query: string
    readonly sort: 'time' | 'customer'
    readonly flagged: Readonly<Record<string, boolean>>
    readonly select: (id: string) => void
    readonly search: (value: string) => void
    readonly order: (value: 'time' | 'customer') => void
    readonly toggle: (id: string, initiallyFlagged: boolean) => void
  }>((set) => ({
    selectedQueueId: 'today',
    query: '',
    sort: 'time',
    flagged: {},
    select: (selectedQueueId) => {
      if (isValidId(selectedQueueId)) set({ selectedQueueId })
    },
    search: (query) => set({ query }),
    order: (sort) => set({ sort }),
    toggle: (id, initiallyFlagged) => {
      if (isValidId(id))
        set((state) => ({
          flagged: {
            ...state.flagged,
            [id]: !(state.flagged[id] ?? initiallyFlagged),
          },
        }))
    },
  }))
}
export function projectAppShellAdaptivePreview(
  state: ReturnType<ReturnType<typeof createAppShellAdaptivePreviewStore>['getState']>,
  content: LumenAppShellAdaptiveContent,
): LumenAppShellAdaptiveContent {
  const queues = stableValidItems(content.queues)
  const jobs = stableValidItems(content.jobs).map((job) => ({
    ...job,
    queueIds: job.queueIds.filter(isValidId),
  }))
  return {
    ...content,
    queues,
    selectedQueueId: queues.some((item) => item.id === state.selectedQueueId)
      ? state.selectedQueueId
      : (queues[0]?.id ?? ''),
    query: state.query,
    sort: state.sort,
    jobs: jobs.map((job) => ({
      ...job,
      ...(state.flagged[job.id] === undefined ? {} : { flagged: Boolean(state.flagged[job.id]) }),
    })),
    onQueue: (id) => {
      if (isValidId(id) && queues.some((item) => item.id === id)) {
        state.select(id)
        content.onQueue(id)
      }
    },
    onQuery: (value) => {
      state.search(value)
      content.onQuery(value)
    },
    onSort: (value) => {
      state.order(value)
      content.onSort(value)
    },
    onFlag: (id) => {
      if (isValidId(id) && jobs.some((job) => job.id === id)) {
        // Store only an override: the reference fixture starts with one flagged job.
        const initiallyFlagged = Boolean(jobs.find((job) => job.id === id)?.flagged)
        state.toggle(id, initiallyFlagged)
        content.onFlag(id)
      }
    },
  }
}
