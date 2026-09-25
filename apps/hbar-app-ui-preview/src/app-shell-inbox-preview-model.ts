import { createStore } from 'zustand/vanilla'
import type { LumenAppShellInboxContent } from '@lumen/app-ui'
import type { InboxPreviewFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-inbox-fixtures'

export function createAppShellInboxPreviewStore() {
  return createStore<{
    readonly selectedId: string | null
    readonly query: string
    readonly filterId: string
    readonly readIds: readonly string[]
    readonly stars: Readonly<Record<string, boolean>>
    readonly select: (id: string) => void
    readonly setQuery: (query: string) => void
    readonly setFilter: (id: string) => void
    readonly clear: () => void
    readonly toggleStar: (id: string, initial: boolean) => void
  }>((set) => ({
    selectedId: 'priya',
    query: '',
    filterId: 'all',
    readIds: [],
    stars: {},
    select: (id) => set((state) => ({ selectedId: id, readIds: [...new Set([...state.readIds, id])] })),
    setQuery: (query) => set({ query }),
    setFilter: (filterId) => set({ filterId }),
    clear: () => set({ query: '', filterId: 'all' }),
    toggleStar: (id, initial) => set((state) => ({ stars: { ...state.stars, [id]: !(state.stars[id] ?? initial) } })),
  }))
}
export function projectAppShellInboxPreview(
  state: ReturnType<ReturnType<typeof createAppShellInboxPreviewStore>['getState']>,
  content: InboxPreviewFixture,
): LumenAppShellInboxContent {
  const inventory = [...new Map(content.inventory.map((item) => [item.id, item])).values()].map((item) => ({
    ...item,
    unread: item.unread && !state.readIds.includes(item.id),
    starred: state.stars[item.id] ?? item.starred,
  }))
  const query = state.query.trim().toLocaleLowerCase()
  const filterValid = content.filters.some((item) => item.id === state.filterId)
  const conversations = inventory.filter(
    (item) =>
      filterValid &&
      (state.filterId === 'all' ||
        (state.filterId === 'unread' && item.unread) ||
        (state.filterId === 'assigned' && item.assigned) ||
        (state.filterId === 'escalated' && item.escalated)) &&
      `${item.sender} ${item.subject} ${item.preview}`.toLocaleLowerCase().includes(query),
  )
  const selected = inventory.find((item) => item.id === state.selectedId) ?? null
  return {
    ...content,
    selected,
    conversations,
    query: state.query,
    filterId: filterValid ? state.filterId : null,
    count: content.formatCount(conversations.length),
    onQuery: (query) => {
      state.setQuery(query)
      content.onQuery(query)
    },
    onFilter: (id) => {
      if (content.filters.some((item) => item.id === id)) {
        state.setFilter(id)
        content.onFilter(id)
      }
    },
    onClear: () => {
      state.clear()
      content.onClear()
    },
    onSelect: (id) => {
      if (inventory.some((item) => item.id === id)) {
        state.select(id)
        content.onSelect(id)
      }
    },
    onStar: (id) => {
      const item = inventory.find((item) => item.id === id)
      if (item) {
        state.toggleStar(id, item.starred)
        content.onStar(id)
      }
    },
  }
}
