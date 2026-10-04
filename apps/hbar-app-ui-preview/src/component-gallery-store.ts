import { createStore } from 'zustand/vanilla'
import type { HbarAppUiCategory } from 'hbar-app-ui/types'
import type { ComponentGalleryLocale, ComponentGalleryState } from './component-gallery-model'

export interface ComponentGalleryViewModel extends ComponentGalleryState {
  readonly setQuery: (query: string) => void
  readonly chooseCategory: (category: HbarAppUiCategory | 'all') => void
  readonly goToPage: (page: number) => void
  readonly toggleTheme: () => void
  readonly setLocale: (locale: ComponentGalleryLocale) => void
  readonly resetFilters: () => void
  readonly restore: (state: ComponentGalleryState) => void
}

export function createComponentGalleryStore(initial: ComponentGalleryState) {
  return createStore<ComponentGalleryViewModel>((set) => ({
    ...initial,
    setQuery: (query) => set({ query, page: 1 }),
    chooseCategory: (category) => set({ category, page: 1 }),
    goToPage: (page) => set({ page: Number.isSafeInteger(page) ? Math.max(1, page) : 1 }),
    toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
    setLocale: (locale) => set({ locale }),
    resetFilters: () => set({ category: 'all', query: '', page: 1 }),
    restore: (state) => set(state),
  }))
}
