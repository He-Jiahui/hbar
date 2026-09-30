import { createStore } from 'zustand/vanilla'
import type { LumenAppShellDocumentsContent, LumenDocumentFormat } from '@lumen/app-ui'

function isValidId(id: string): boolean {
  return id.trim().length > 0
}
function stableValidItems<T extends { readonly id: string }>(items: readonly T[]): T[] {
  return [...new Map(items.filter((item) => isValidId(item.id)).map((item) => [item.id, item])).values()]
}

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
    select: (selectedId) => {
      if (isValidId(selectedId)) set({ selectedId })
    },
    title: (id, value) => {
      if (isValidId(id)) set((state) => ({ titles: { ...state.titles, [id]: value } }))
    },
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
  const sourceFolders = stableValidItems(content.folders).map((folder) => ({
    ...folder,
    documents: stableValidItems(folder.documents),
  }))
  const records = new Map(sourceFolders.flatMap((folder) => folder.documents).map((record) => [record.id, record]))
  const seen = new Set<string>()
  const folders = sourceFolders.map((folder) => ({
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
    menu: stableValidItems(content.menu),
    moreFormatting: stableValidItems(content.moreFormatting),
    selectedId: records.has(state.selectedId ?? '') ? state.selectedId : null,
    formats: state.formats,
    onSelect: (id) => {
      if (isValidId(id) && records.has(id)) {
        state.select(id)
        content.onSelect(id)
      }
    },
    onTitle: (id, value) => {
      if (isValidId(id) && records.has(id)) {
        state.title(id, value)
        content.onTitle(id, value)
      }
    },
    onFormat: (format) => {
      state.format(format)
      content.onFormat(format)
    },
    onAction: (action, documentId, actionId) => {
      if (action === 'new' || action === 'trash') {
        if (documentId === undefined && actionId === undefined) content.onAction(action)
        return
      }
      if (!documentId || !isValidId(documentId) || !records.has(documentId)) return
      if (action === 'menu' && actionId !== undefined) {
        if (isValidId(actionId) && content.menu.some((item) => item.id === actionId))
          content.onAction(action, documentId, actionId)
        return
      }
      if (action === 'format-menu' && actionId !== undefined) {
        if (isValidId(actionId) && content.moreFormatting.some((item) => item.id === actionId))
          content.onAction(action, documentId, actionId)
        return
      }
      if (action === 'share' || action === 'link') content.onAction(action, documentId)
    },
  }
}
