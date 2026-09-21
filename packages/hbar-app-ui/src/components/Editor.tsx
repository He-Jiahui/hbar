import {
  LumenEditor,
  LumenEditorProvider as HbarAppUiEditorProvider,
  type LumenEditorContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiEditorProps = HbarAppUiVariantProps & {
  readonly editorContent?: LumenEditorContent | undefined
}
export { HbarAppUiEditorProvider }
export type {
  LumenCodeFile as HbarAppUiCodeFile,
  LumenCodeWorkspaceContent as HbarAppUiCodeWorkspaceContent,
  LumenCodeWorkspaceFooter as HbarAppUiCodeWorkspaceFooter,
  LumenCodeWorkspaceLabels as HbarAppUiCodeWorkspaceLabels,
  LumenEditorContent as HbarAppUiEditorContent,
  LumenEditorFormattingAction as HbarAppUiEditorFormattingAction,
  LumenEditorInlineSegment as HbarAppUiEditorInlineSegment,
  LumenEditorListStrategy as HbarAppUiEditorListStrategy,
  LumenEditorProviderProps as HbarAppUiEditorProviderProps,
  LumenLongDocumentReaderContent as HbarAppUiLongDocumentReaderContent,
  LumenLongDocumentReaderLabels as HbarAppUiLongDocumentReaderLabels,
  LumenMarkdownDocument as HbarAppUiMarkdownDocument,
  LumenMarkdownMode as HbarAppUiMarkdownMode,
  LumenMarkdownWorkspaceContent as HbarAppUiMarkdownWorkspaceContent,
  LumenMarkdownWorkspaceLabels as HbarAppUiMarkdownWorkspaceLabels,
  LumenReaderSection as HbarAppUiReaderSection,
  LumenRichTextChange as HbarAppUiRichTextChange,
  LumenRichTextDocument as HbarAppUiRichTextDocument,
  LumenRichTextEditorContent as HbarAppUiRichTextEditorContent,
  LumenRichTextEditorLabels as HbarAppUiRichTextEditorLabels,
  LumenSuggestion as HbarAppUiSuggestion,
  LumenSuggestionAction as HbarAppUiSuggestionAction,
  LumenSuggestionDocumentParagraph as HbarAppUiSuggestionDocumentParagraph,
  LumenSuggestionReviewContent as HbarAppUiSuggestionReviewContent,
  LumenSuggestionReviewDocument as HbarAppUiSuggestionReviewDocument,
  LumenSuggestionReviewLabels as HbarAppUiSuggestionReviewLabels,
} from '@lumen/app-ui'

export function Editor({ spec, onAction, editorContent, className }: HbarAppUiEditorProps) {
  return <LumenEditor variant={spec.variant} variantId={spec.id} content={editorContent} className={className}
    density={spec.density} surface={spec.profile.surface} state={spec.profile.initialState} visualMode={spec.profile.visualMode}
    onAction={onAction ? ({actionId,value}) => onAction(value === undefined ? {variantId:spec.id,actionId} : {variantId:spec.id,actionId,value}) : undefined} />
}
