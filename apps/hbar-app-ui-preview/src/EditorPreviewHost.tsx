import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiEditorProvider, type HbarAppUiEditorContent } from 'hbar-app-ui/catalog'
import { createRichEditorPreviewStore } from './richEditorPreviewStore'
import { createMarkdownEditorPreviewStore } from './markdownEditorPreviewStore'
import { createCodeEditorPreviewStore } from './codeEditorPreviewStore'
import { createSuggestionsEditorPreviewStore } from './suggestionsEditorPreviewStore'

export function EditorPreviewHost({
  content,
  children,
}: {
  readonly content: HbarAppUiEditorContent
  readonly children: ReactNode
}) {
  const [store] = useState(() => createRichEditorPreviewStore(content.referenceRichText))
  const state = useStore(store)
  const [markdownStore] = useState(() => createMarkdownEditorPreviewStore(content.referenceMarkdown))
  const markdown = useStore(markdownStore)
  const [codeStore] = useState(() => createCodeEditorPreviewStore(content.referenceCode))
  const code = useStore(codeStore)
  const [suggestionsStore] = useState(() => createSuggestionsEditorPreviewStore(content.referenceSuggestions))
  const suggestions = useStore(suggestionsStore)
  useEffect(() => suggestionsStore.getState().reset(content.referenceSuggestions), [suggestionsStore, content.referenceSuggestions])
  useEffect(() => codeStore.getState().reset(content.referenceCode), [codeStore, content.referenceCode])
  useEffect(() => markdownStore.getState().reset(content.referenceMarkdown), [markdownStore, content.referenceMarkdown])
  useEffect(() => store.getState().reset(content.referenceRichText), [store, content.referenceRichText])
  const documentId = state.document?.id
  const saveRevision = state.saveRevision
  useEffect(() => {
    if (!documentId || !saveRevision) return undefined
    // Replays the observed delayed Saving→Saved label, not a remote/disk persistence promise.
    const begin = window.setTimeout(() => store.getState().beginSave(documentId, saveRevision), 100)
    const finish = window.setTimeout(() => store.getState().finishSave(documentId, saveRevision), 1000)
    return () => {
      window.clearTimeout(begin)
      window.clearTimeout(finish)
    }
  }, [store, documentId, saveRevision])
  return (
    <HbarAppUiEditorProvider
      content={{
        ...content,
        referenceSuggestions: content.referenceSuggestions && {
          ...content.referenceSuggestions,
          suggestions: suggestions.suggestions,
          decisions: suggestions.decisions,
          selectedSuggestionId: suggestions.selectedSuggestionId,
          onSelectSuggestion: suggestions.select,
          onResolve: suggestions.resolve,
          onAcceptAll: suggestions.acceptAll,
          onRestore: suggestions.restore,
        },
        referenceCode: content.referenceCode && {
          ...content.referenceCode,
          files: code.files,
          activeFileId: code.activeFileId,
          activeLine: code.cursor.line,
          cursor: code.cursor,
          onSelectFile: code.selectFile,
          onCloseFile: code.closeFile,
          onCursorChange: code.selectLine,
          onRun: () => undefined,
        },
        referenceMarkdown: content.referenceMarkdown &&
          markdown.document && {
            ...content.referenceMarkdown,
            document: markdown.document,
            mode: markdown.mode,
            onSourceChange: markdown.edit,
            onModeChange: markdown.selectMode,
          },
        referenceRichText: content.referenceRichText &&
          state.document && {
            ...content.referenceRichText,
            document: state.document,
            blockId: state.blockId,
            pressed: state.pressed,
            status:
              state.savePhase === 'saving' ? content.referenceRichText.labels.saving : content.referenceRichText.status,
            onChange: state.edit,
            onBlockChange: state.selectBlock,
            onFormatChange: state.toggleFormat,
          },
      }}
    >
      {children}
    </HbarAppUiEditorProvider>
  )
}
