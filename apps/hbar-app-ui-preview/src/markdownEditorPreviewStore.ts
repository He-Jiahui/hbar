import { createStore } from 'zustand/vanilla'
import type { HbarAppUiMarkdownMode, HbarAppUiMarkdownReferenceContent } from 'hbar-app-ui/catalog'

interface MarkdownEditorState {
  readonly document: HbarAppUiMarkdownReferenceContent['document'] | undefined
  readonly mode: HbarAppUiMarkdownMode
  readonly edit: (documentId: string, source: string) => void
  readonly selectMode: (documentId: string, mode: HbarAppUiMarkdownMode) => void
  readonly reset: (content: HbarAppUiMarkdownReferenceContent | undefined) => void
}

function projection(content: HbarAppUiMarkdownReferenceContent | undefined) {
  return { document: content?.document, mode: content?.mode ?? 'split' } as const
}

/** Document-ID-bound source and mode, with preview/statistics derived rather than separately stored. */
export function createMarkdownEditorPreviewStore(content: HbarAppUiMarkdownReferenceContent | undefined) {
  return createStore<MarkdownEditorState>((set) => ({
    ...projection(content),
    reset: (next) => set(projection(next)),
    edit: (documentId, source) =>
      set((state) => (state.document?.id === documentId ? { document: { ...state.document, source } } : {})),
    selectMode: (documentId, mode) => set((state) => (state.document?.id === documentId ? { mode } : {})),
  }))
}
