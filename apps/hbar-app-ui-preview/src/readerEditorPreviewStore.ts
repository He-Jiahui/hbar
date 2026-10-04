import { createStore } from 'zustand/vanilla'
import type { HbarAppUiReaderReferenceContent } from 'hbar-app-ui/catalog'
import { uniqueHbarAppUiReaderReferenceSections } from 'hbar-app-ui/catalog'

type Section = HbarAppUiReaderReferenceContent['sections'][number]
interface ReaderEditorState {
  readonly documentId: string | undefined
  readonly sections: readonly Section[]
  readonly selectedSectionId: string | undefined
  readonly focusMode: boolean
  readonly outlineOpen: boolean
  readonly reset: (content: HbarAppUiReaderReferenceContent | undefined) => void
  readonly selectSection: (documentId: string, sectionId: string) => void
  readonly setFocusMode: (documentId: string, enabled: boolean) => void
  readonly setOutlineOpen: (documentId: string, open: boolean) => void
}

function projection(content: HbarAppUiReaderReferenceContent | undefined) {
  const sections = uniqueHbarAppUiReaderReferenceSections(content?.sections ?? [])
  return {
    documentId: content?.documentId,
    sections,
    selectedSectionId: sections.some((section) => section.id === content?.selectedSectionId)
      ? content?.selectedSectionId
      : sections[0]?.id,
    focusMode: content?.focusMode ?? false,
    outlineOpen: content?.outlineOpen ?? false,
  }
}

/** Navigation selection is independent of scroll position, as in the source preview. */
export function createReaderEditorPreviewStore(content: HbarAppUiReaderReferenceContent | undefined) {
  return createStore<ReaderEditorState>((set) => ({
    ...projection(content),
    reset: (next) => set(projection(next)),
    selectSection: (documentId, sectionId) =>
      set((state) =>
        state.documentId === documentId && state.sections.some((section) => section.id === sectionId)
          ? { selectedSectionId: sectionId }
          : {},
      ),
    setFocusMode: (documentId, enabled) =>
      set((state) => (state.documentId === documentId ? { focusMode: enabled } : {})),
    setOutlineOpen: (documentId, open) =>
      set((state) => (state.documentId === documentId ? { outlineOpen: open } : {})),
  }))
}
