import { createStore } from 'zustand/vanilla'
import type { LumenAppShellSidebarContent } from '@lumen/app-ui/catalog'

function isValidId(id: string): boolean {
  return id.trim().length > 0
}
function withoutBlankIds<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  return items.every((item) => isValidId(item.id)) ? items : items.filter((item) => isValidId(item.id))
}

export function createAppShellSidebarPreviewStore() {
  return createStore<{ readonly query: string; readonly setQuery: (query: string) => void }>((set) => ({
    query: '',
    setQuery: (query) => set({ query }),
  }))
}
export function projectAppShellSidebarPreview(
  state: ReturnType<ReturnType<typeof createAppShellSidebarPreviewStore>['getState']>,
  content: LumenAppShellSidebarContent,
): LumenAppShellSidebarContent {
  // The public demo accepts text without filtering records or changing navigation selection.
  const sections = withoutBlankIds(content.sections).map((section) => ({
    ...section,
    items: withoutBlankIds(section.items).map((item) =>
      'children' in item ? { ...item, children: withoutBlankIds(item.children) } : item,
    ),
  }))
  const footerLinks = withoutBlankIds(content.footerLinks)
  const breadcrumbs = withoutBlankIds(content.breadcrumbs)
  const navigationIds = new Set<string>()
  for (const section of sections) {
    for (const item of section.items) {
      if ('children' in item) {
        for (const child of item.children) if (isValidId(child.id)) navigationIds.add(child.id)
      } else if (isValidId(item.id)) navigationIds.add(item.id)
    }
  }
  for (const item of footerLinks) navigationIds.add(item.id)

  return {
    ...content,
    sections,
    footerLinks,
    breadcrumbs,
    accountActions: withoutBlankIds(content.accountActions),
    metrics: withoutBlankIds(content.metrics),
    records: withoutBlankIds(content.records),
    currentLinkId: content.currentLinkId && navigationIds.has(content.currentLinkId) ? content.currentLinkId : null,
    searchValue: state.query,
    onSearchChange: state.setQuery,
    onNavigate: (id) => {
      if (isValidId(id) && navigationIds.has(id)) content.onNavigate?.(id)
    },
  }
}
