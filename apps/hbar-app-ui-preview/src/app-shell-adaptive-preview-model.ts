import { createStore } from 'zustand/vanilla'
import type { LumenAppShellAdaptiveContent } from '@lumen/app-ui'

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
    select: (selectedQueueId) => set({ selectedQueueId }),
    search: (query) => set({ query }),
    order: (sort) => set({ sort }),
    toggle: (id, initiallyFlagged) =>
      set((state) => ({
        flagged: {
          ...state.flagged,
          [id]: !(state.flagged[id] ?? initiallyFlagged),
        },
      })),
  }))
}
export function projectAppShellAdaptivePreview(
  state: ReturnType<ReturnType<typeof createAppShellAdaptivePreviewStore>['getState']>,
  content: LumenAppShellAdaptiveContent,
): LumenAppShellAdaptiveContent {
  return {
    ...content,
    selectedQueueId: content.queues.some((item) => item.id === state.selectedQueueId)
      ? state.selectedQueueId
      : (content.queues[0]?.id ?? ''),
    query: state.query,
    sort: state.sort,
    jobs: content.jobs.map((job) => ({
      ...job,
      ...(state.flagged[job.id] === undefined ? {} : { flagged: Boolean(state.flagged[job.id]) }),
    })),
    onQueue: (id) => {
      if (content.queues.some((item) => item.id === id)) {
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
      if (content.jobs.some((job) => job.id === id)) {
        // Store only an override: the reference fixture starts with one flagged job.
        const initiallyFlagged = Boolean(content.jobs.find((job) => job.id === id)?.flagged)
        state.toggle(id, initiallyFlagged)
        content.onFlag(id)
      }
    },
  }
}
