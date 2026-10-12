import { createStore } from 'zustand/vanilla'
import type { LumenAppShellInboxContent } from '@lumen/app-ui/catalog'
import type { InboxPreviewFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-inbox-fixtures'

function isValidId(id: string): boolean {
  return id.trim().length > 0
}
function stableValidItems<T extends { readonly id: string }>(items: readonly T[]): T[] {
  return [...new Map(items.filter((item) => isValidId(item.id)).map((item) => [item.id, item])).values()]
}

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
    select: (id) => {
      if (isValidId(id)) set((state) => ({ selectedId: id, readIds: [...new Set([...state.readIds, id])] }))
    },
    setQuery: (query) => set({ query }),
    setFilter: (filterId) => {
      if (isValidId(filterId)) set({ filterId })
    },
    clear: () => set({ query: '', filterId: 'all' }),
    toggleStar: (id, initial) => {
      if (isValidId(id)) set((state) => ({ stars: { ...state.stars, [id]: !(state.stars[id] ?? initial) } }))
    },
  }))
}
export function projectAppShellInboxPreview(
  state: ReturnType<ReturnType<typeof createAppShellInboxPreviewStore>['getState']>,
  content: InboxPreviewFixture,
): LumenAppShellInboxContent {
  const inventory = stableValidItems(content.inventory).map((item) => ({
    ...item,
    unread: item.unread && !state.readIds.includes(item.id),
    starred: state.stars[item.id] ?? item.starred,
    attachments: stableValidItems(item.attachments),
  }))
  const filters = stableValidItems(content.filters)
  const mailboxes = stableValidItems(content.mailboxes)
  const menu = stableValidItems(content.menu)
  const query = state.query.trim().toLocaleLowerCase()
  const filterValid = filters.some((item) => item.id === state.filterId)
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
    mailboxes,
    mailboxId: content.mailboxId && mailboxes.some((item) => item.id === content.mailboxId) ? content.mailboxId : null,
    filters,
    menu,
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
      if (isValidId(id) && filters.some((item) => item.id === id)) {
        state.setFilter(id)
        content.onFilter(id)
      }
    },
    onClear: () => {
      state.clear()
      content.onClear()
    },
    onSelect: (id) => {
      if (isValidId(id) && inventory.some((item) => item.id === id)) {
        state.select(id)
        content.onSelect(id)
      }
    },
    onMailbox: (id) => {
      if (isValidId(id) && mailboxes.some((item) => item.id === id)) content.onMailbox(id)
    },
    onStar: (id) => {
      const item = inventory.find((item) => item.id === id)
      if (isValidId(id) && item) {
        state.toggleStar(id, item.starred)
        content.onStar(id)
      }
    },
    onAction: (action, id, childId) => {
      if (action === 'account' || action === 'sort' || action === 'compose') {
        content.onAction(action)
        return
      }
      if (!id || !isValidId(id)) return
      const record = inventory.find((item) => item.id === id)
      if (!record) return
      if (action === 'menu') {
        if (childId && isValidId(childId) && menu.some((item) => item.id === childId))
          content.onAction(action, id, childId)
        return
      }
      if (action === 'download') {
        if (childId && isValidId(childId) && record.attachments.some((item) => item.id === childId))
          content.onAction(action, id, childId)
        return
      }
      if (action === 'reply' || action === 'archive' || action === 'delete') {
        if (childId === undefined) content.onAction(action, id)
      }
    },
  }
}
