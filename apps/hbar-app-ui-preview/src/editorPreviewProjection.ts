import type { HbarAppUiEditorContent } from 'hbar-app-ui/catalog'
import type { createRichEditorPreviewStore } from './richEditorPreviewStore'
import type { createMarkdownEditorPreviewStore } from './markdownEditorPreviewStore'
import type { createCodeEditorPreviewStore } from './codeEditorPreviewStore'
import type { createSuggestionsEditorPreviewStore } from './suggestionsEditorPreviewStore'
import type { createReaderEditorPreviewStore } from './readerEditorPreviewStore'

export function projectRichEditorPreview(
  input: HbarAppUiEditorContent,
  state: ReturnType<ReturnType<typeof createRichEditorPreviewStore>['getState']>,
): HbarAppUiEditorContent {
  const content = input.referenceRichText
  return {
    richText: input.richText,
    referenceRichText:
      content && state.document
        ? {
            ...content,
            document: state.document,
            blockId: state.blockId,
            pressed: state.pressed,
            status: state.savePhase === 'saving' ? content.labels.saving : content.status,
            onChange: state.edit,
            onBlockChange: state.selectBlock,
            onFormatChange: state.toggleFormat,
          }
        : undefined,
  }
}
export function projectMarkdownEditorPreview(
  input: HbarAppUiEditorContent,
  state: ReturnType<ReturnType<typeof createMarkdownEditorPreviewStore>['getState']>,
): HbarAppUiEditorContent {
  const content = input.referenceMarkdown
  return {
    markdown: input.markdown,
    referenceMarkdown:
      content && state.document
        ? {
            ...content,
            document: state.document,
            mode: state.mode,
            onSourceChange: state.edit,
            onModeChange: state.selectMode,
          }
        : undefined,
  }
}
export function projectCodeEditorPreview(
  input: HbarAppUiEditorContent,
  state: ReturnType<ReturnType<typeof createCodeEditorPreviewStore>['getState']>,
): HbarAppUiEditorContent {
  const content = input.referenceCode
  return {
    code: input.code,
    referenceCode: content && {
      ...content,
      files: state.files,
      activeFileId: state.activeFileId,
      activeLine: state.cursor.line,
      cursor: state.cursor,
      onSelectFile: state.selectFile,
      onCloseFile: state.closeFile,
      onCursorChange: state.selectLine,
      onRun: () => undefined,
    },
  }
}
export function projectSuggestionsEditorPreview(
  input: HbarAppUiEditorContent,
  state: ReturnType<ReturnType<typeof createSuggestionsEditorPreviewStore>['getState']>,
): HbarAppUiEditorContent {
  const content = input.referenceSuggestions
  return {
    suggestions: input.suggestions,
    referenceSuggestions: content && {
      ...content,
      suggestions: state.suggestions,
      decisions: state.decisions,
      selectedSuggestionId: state.selectedSuggestionId,
      onSelectSuggestion: state.select,
      onResolve: state.resolve,
      onAcceptAll: state.acceptAll,
      onRestore: state.restore,
    },
  }
}
export function projectReaderEditorPreview(
  input: HbarAppUiEditorContent,
  state: ReturnType<ReturnType<typeof createReaderEditorPreviewStore>['getState']>,
): HbarAppUiEditorContent {
  const content = input.referenceReader
  return {
    reader: input.reader,
    referenceReader: content && {
      ...content,
      sections: state.sections,
      selectedSectionId: state.selectedSectionId,
      focusMode: state.focusMode,
      outlineOpen: state.outlineOpen,
      onSelectSection: state.selectSection,
      onFocusModeChange: state.setFocusMode,
      onOutlineOpenChange: state.setOutlineOpen,
    },
  }
}
