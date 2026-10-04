import { useEffect, useMemo, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiEditorProvider, type HbarAppUiEditorContent, type HbarAppUiVariantSpec } from 'hbar-app-ui/catalog'
import { createRichEditorPreviewStore } from './richEditorPreviewStore'
import { createMarkdownEditorPreviewStore } from './markdownEditorPreviewStore'
import { createCodeEditorPreviewStore } from './codeEditorPreviewStore'
import { createSuggestionsEditorPreviewStore } from './suggestionsEditorPreviewStore'
import { createReaderEditorPreviewStore } from './readerEditorPreviewStore'
import {
  projectRichEditorPreview,
  projectMarkdownEditorPreview,
  projectCodeEditorPreview,
  projectSuggestionsEditorPreview,
  projectReaderEditorPreview,
} from './editorPreviewProjection'

interface HostProps {
  readonly spec: HbarAppUiVariantSpec
  readonly content: HbarAppUiEditorContent
  readonly children: ReactNode
}
export function EditorPreviewHost(props: HostProps) {
  if (props.spec.category !== 'editor') return <>{props.children}</>
  const key = props.spec.id
  switch (props.spec.variant) {
    case 1:
      return <RichEditorOwner key={key} {...props} />
    case 2:
      return <MarkdownEditorOwner key={key} {...props} />
    case 3:
      return <CodeEditorOwner key={key} {...props} />
    case 4:
      return <SuggestionsEditorOwner key={key} {...props} />
    case 5:
      return <ReaderEditorOwner key={key} {...props} />
    default:
      return <>{props.children}</>
  }
}
function RichEditorOwner({ content, children }: HostProps) {
  const store = useMemo(() => createRichEditorPreviewStore(content.referenceRichText), [content])
  const state = useStore(store)
  const documentId = state.document?.id
  const saveRevision = state.saveRevision
  useEffect(() => {
    if (!documentId || !saveRevision) return undefined
    // Preview labels only; the active owner's timers do not promise remote/disk persistence.
    const begin = window.setTimeout(() => store.getState().beginSave(documentId, saveRevision), 100)
    const finish = window.setTimeout(() => store.getState().finishSave(documentId, saveRevision), 1000)
    return () => {
      window.clearTimeout(begin)
      window.clearTimeout(finish)
    }
  }, [store, documentId, saveRevision])
  return (
    <HbarAppUiEditorProvider content={projectRichEditorPreview(content, state)}>{children}</HbarAppUiEditorProvider>
  )
}
function MarkdownEditorOwner({ content, children }: HostProps) {
  const store = useMemo(() => createMarkdownEditorPreviewStore(content.referenceMarkdown), [content])
  const state = useStore(store)
  return (
    <HbarAppUiEditorProvider content={projectMarkdownEditorPreview(content, state)}>{children}</HbarAppUiEditorProvider>
  )
}
function CodeEditorOwner({ content, children }: HostProps) {
  const store = useMemo(() => createCodeEditorPreviewStore(content.referenceCode), [content])
  const state = useStore(store)
  return (
    <HbarAppUiEditorProvider content={projectCodeEditorPreview(content, state)}>{children}</HbarAppUiEditorProvider>
  )
}
function SuggestionsEditorOwner({ content, children }: HostProps) {
  const store = useMemo(() => createSuggestionsEditorPreviewStore(content.referenceSuggestions), [content])
  const state = useStore(store)
  return (
    <HbarAppUiEditorProvider content={projectSuggestionsEditorPreview(content, state)}>
      {children}
    </HbarAppUiEditorProvider>
  )
}
function ReaderEditorOwner({ content, children }: HostProps) {
  const store = useMemo(() => createReaderEditorPreviewStore(content.referenceReader), [content])
  const state = useStore(store)
  return (
    <HbarAppUiEditorProvider content={projectReaderEditorPreview(content, state)}>{children}</HbarAppUiEditorProvider>
  )
}
