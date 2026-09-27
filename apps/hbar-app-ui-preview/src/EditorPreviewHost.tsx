import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiEditorProvider, type HbarAppUiEditorContent } from 'hbar-app-ui/catalog'
import { createRichEditorPreviewStore } from './richEditorPreviewStore'

export function EditorPreviewHost({
  content,
  children,
}: {
  readonly content: HbarAppUiEditorContent
  readonly children: ReactNode
}) {
  const [store] = useState(() => createRichEditorPreviewStore(content.referenceRichText))
  const state = useStore(store)
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
