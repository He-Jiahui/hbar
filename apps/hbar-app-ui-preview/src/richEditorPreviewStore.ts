import { createStore } from 'zustand/vanilla'
import type {
  HbarAppUiEditorFormattingAction,
  HbarAppUiRichEditorReferenceContent,
  HbarAppUiRichTextChange,
} from 'hbar-app-ui/catalog'

type Document = HbarAppUiRichEditorReferenceContent['document']
type Pressed = HbarAppUiRichEditorReferenceContent['pressed']
interface RichEditorPreviewState {
  readonly document: Document | undefined
  readonly blockId: string
  readonly blocks: readonly string[]
  readonly pressed: Pressed
  readonly savePhase: 'saved' | 'pending' | 'saving'
  readonly saveRevision: number
  readonly beginSave: (documentId: string, revision: number) => void
  readonly finishSave: (documentId: string, revision: number) => void
  readonly reset: (content: HbarAppUiRichEditorReferenceContent | undefined) => void
  readonly edit: (change: HbarAppUiRichTextChange) => void
  readonly selectBlock: (documentId: string, blockId: string) => void
  readonly toggleFormat: (documentId: string, action: HbarAppUiEditorFormattingAction) => void
}

function projection(content: HbarAppUiRichEditorReferenceContent | undefined) {
  return {
    document: content?.document,
    blockId: content?.blockId ?? '',
    savePhase: 'saved' as const,
    saveRevision: 0,
    blocks: content?.blocks.map((block) => block.id) ?? [],
    pressed: content?.pressed ?? {
      bold: false,
      italic: false,
      strikethrough: false,
      'inline-code': false,
      link: false,
    },
  }
}

/** Preview-only source state; editing does not claim a remote/disk save or implement fake undo. */
export function createRichEditorPreviewStore(content: HbarAppUiRichEditorReferenceContent | undefined) {
  return createStore<RichEditorPreviewState>((set) => ({
    ...projection(content),
    reset: (next) => set(projection(next)),
    beginSave: (documentId, revision) =>
      set((state) =>
        state.document?.id === documentId && state.saveRevision === revision ? { savePhase: 'saving' } : {},
      ),
    finishSave: (documentId, revision) =>
      set((state) =>
        state.document?.id === documentId && state.saveRevision === revision ? { savePhase: 'saved' } : {},
      ),
    edit: (change) =>
      set((state) =>
        state.document?.id === change.documentId && state.document[change.field] !== change.value
          ? {
              document: { ...state.document, [change.field]: change.value },
              savePhase: 'pending',
              saveRevision: state.saveRevision + 1,
            }
          : {},
      ),
    selectBlock: (documentId, blockId) =>
      set((state) => (state.document?.id === documentId && state.blocks.includes(blockId) ? { blockId } : {})),
    toggleFormat: (documentId, action) =>
      set((state) =>
        state.document?.id === documentId ? { pressed: { ...state.pressed, [action]: !state.pressed[action] } } : {},
      ),
  }))
}
