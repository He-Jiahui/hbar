import { createStore } from 'zustand/vanilla'
import type { LumenAppShellDocumentsContent, LumenDocumentFormat } from '@lumen/app-ui'

export function createAppShellDocumentsPreviewStore() {
  return createStore<{
    readonly selectedId: string | null
    readonly titles: Readonly<Record<string, string>>
    readonly formats: readonly LumenDocumentFormat[]
    readonly select: (id: string) => void
    readonly title: (id: string, value: string) => void
    readonly format: (format: LumenDocumentFormat) => void
  }>((set) => ({
    selectedId: 'webhook',
    titles: {},
    formats: ['bold'],
    select: (selectedId) => set({ selectedId }),
    title: (id, value) => set((state) => ({ titles: { ...state.titles, [id]: value } })),
    format: (format) =>
      set((state) => ({
        formats: state.formats.includes(format)
          ? state.formats.filter((item) => item !== format)
          : [...state.formats, format],
      })),
  }))
}
export function projectAppShellDocumentsPreview(
  state: ReturnType<ReturnType<typeof createAppShellDocumentsPreviewStore>['getState']>,
  content: LumenAppShellDocumentsContent,
): LumenAppShellDocumentsContent {
  const records = new Map(content.folders.flatMap((folder) => folder.documents).map((record) => [record.id, record]))
  const seen = new Set<string>()
  const folders = [...new Map(content.folders.map((folder) => [folder.id, folder])).values()].map((folder) => ({
    ...folder,
    documents: folder.documents.flatMap((record) => {
      if (seen.has(record.id)) return []
      seen.add(record.id)
      const current = records.get(record.id) ?? record
      return [{ ...current, title: state.titles[record.id] ?? current.title }]
    }),
  }))
  return {
    ...content,
    folders,
    selectedId: records.has(state.selectedId ?? '') ? state.selectedId : null,
    formats: state.formats,
    onSelect: (id) => {
      if (records.has(id)) {
        state.select(id)
        content.onSelect(id)
      }
    },
    onTitle: (id, value) => {
      if (records.has(id)) {
        state.title(id, value)
        content.onTitle(id, value)
      }
    },
    onFormat: (format) => {
      state.format(format)
      content.onFormat(format)
    },
  }
}
