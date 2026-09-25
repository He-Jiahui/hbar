import { createStore } from 'zustand/vanilla'
import type { LumenAppShellSidebarContent } from '@lumen/app-ui'

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
  return { ...content, searchValue: state.query, onSearchChange: state.setQuery }
}
