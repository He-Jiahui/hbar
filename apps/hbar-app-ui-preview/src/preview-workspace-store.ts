import { createStore } from 'zustand/vanilla'
import type { HbarAppUiEvent, HbarAppUiRegistryEntry, HbarAppUiCategory } from 'hbar-app-ui/catalog'

export const PREVIEW_VIEWPORTS = ['desktop', 'tablet', 'mobile'] as const
export type PreviewViewport = (typeof PREVIEW_VIEWPORTS)[number]
export type PreviewTheme = 'dark' | 'light'
export const previewViewportWidths: Readonly<Record<PreviewViewport, string>> = {
  desktop: '100%',
  tablet: '48rem',
  mobile: '24.375rem',
}
interface PreviewWorkspaceState {
  readonly selectedId: string
  readonly query: string
  readonly theme: PreviewTheme
  readonly viewport: PreviewViewport
  readonly eventLog: readonly HbarAppUiEvent[]
  readonly setQuery: (query: string) => void
  readonly chooseEntry: (entry: HbarAppUiRegistryEntry) => void
  readonly chooseCategory: (category: HbarAppUiCategory) => void
  readonly setViewport: (viewport: PreviewViewport) => void
  readonly toggleTheme: () => void
  readonly recordAction: (event: HbarAppUiEvent) => void
  readonly reset: () => void
}
export function filterPreviewEntries(entries: readonly HbarAppUiRegistryEntry[], query: string) {
  const normalized = query.trim().toLowerCase()
  return normalized
    ? entries.filter(({ spec }) =>
        `${spec.title} ${spec.category} ${spec.description} ${spec.id}`.toLowerCase().includes(normalized),
      )
    : entries
}
export function createPreviewWorkspaceStore(entries: readonly HbarAppUiRegistryEntry[], parameters: URLSearchParams) {
  const first = entries[0]
  if (!first) throw new Error('The preview catalog requires at least one registered component.')
  const ids = new Set(entries.map((entry) => entry.spec.id))
  const requestedId = parameters.get('variant')
  const selectedId = requestedId && ids.has(requestedId) ? requestedId : first.spec.id
  return createStore<PreviewWorkspaceState>((set, get) => ({
    selectedId,
    query: '',
    theme: parameters.get('theme') === 'light' ? 'light' : 'dark',
    viewport: 'desktop',
    eventLog: [],
    setQuery: (query) => set({ query }),
    chooseEntry: (entry) => {
      if (ids.has(entry.spec.id)) set({ selectedId: entry.spec.id, eventLog: [] })
    },
    chooseCategory: (category) => {
      const entry =
        filterPreviewEntries(entries, get().query).find((item) => item.spec.category === category) ??
        entries.find((item) => item.spec.category === category)
      if (entry) set({ selectedId: entry.spec.id, eventLog: [] })
    },
    setViewport: (viewport) => set({ viewport }),
    toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
    recordAction: (event) =>
      set((state) =>
        event.variantId === state.selectedId ? { eventLog: [event, ...state.eventLog].slice(0, 12) } : {},
      ),
    reset: () => set({ selectedId: first.spec.id, query: '', theme: 'dark', viewport: 'desktop', eventLog: [] }),
  }))
}
