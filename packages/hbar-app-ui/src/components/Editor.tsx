import type {HbarAppUiVariantProps} from '../types'
import {
    HbarAppUiEditorProvider,
    useHbarAppUiEditorContent,
    type HbarAppUiEditorContent,
} from './editor/EditorContent'
import {CodeWorkspace} from './editor/CodeWorkspace'
import {LongDocumentReader} from './editor/LongDocumentReader'
import {MarkdownWorkspace} from './editor/MarkdownWorkspace'
import {EditorFrame} from './editor/EditorPrimitives'
import {RichTextEditor} from './editor/RichTextEditor'
import {SuggestionReview} from './editor/SuggestionReview'
import './editor/EditorSurface.css'

export type HbarAppUiEditorProps = HbarAppUiVariantProps & {
    /** Direct injection for a single mount; a provider supports catalog mounts. */
    readonly editorContent?: HbarAppUiEditorContent | undefined
}

export {HbarAppUiEditorProvider}
export type {
    HbarAppUiCodeFile,
    HbarAppUiCodeWorkspaceContent,
    HbarAppUiCodeWorkspaceFooter,
    HbarAppUiCodeWorkspaceLabels,
    HbarAppUiEditorContent,
    HbarAppUiEditorFormattingAction,
    HbarAppUiEditorInlineSegment,
    HbarAppUiEditorListStrategy,
    HbarAppUiEditorProviderProps,
    HbarAppUiLongDocumentReaderContent,
    HbarAppUiLongDocumentReaderLabels,
    HbarAppUiMarkdownDocument,
    HbarAppUiMarkdownMode,
    HbarAppUiMarkdownWorkspaceContent,
    HbarAppUiMarkdownWorkspaceLabels,
    HbarAppUiReaderSection,
    HbarAppUiRichTextChange,
    HbarAppUiRichTextDocument,
    HbarAppUiRichTextEditorContent,
    HbarAppUiRichTextEditorLabels,
    HbarAppUiSuggestion,
    HbarAppUiSuggestionAction,
    HbarAppUiSuggestionDocumentParagraph,
    HbarAppUiSuggestionReviewContent,
    HbarAppUiSuggestionReviewDocument,
    HbarAppUiSuggestionReviewLabels,
} from './editor/EditorContent'

function emptyEditorSurface({spec, onAction}: HbarAppUiVariantProps) {
    const className = {
        1: 'hbar-app-ui-editor-rich-text',
        2: 'hbar-app-ui-editor-markdown',
        3: 'hbar-app-ui-editor-code',
        4: 'hbar-app-ui-editor-suggestions',
        5: 'hbar-app-ui-editor-reader',
    }[spec.variant] ?? 'hbar-app-ui-editor-rich-text'
    return <EditorFrame spec={spec} onAction={onAction} className={className}>{null}</EditorFrame>
}

/** Category dispatcher; each editor workflow owns an independent TSX surface. */
export function Editor({spec, onAction, editorContent}: HbarAppUiEditorProps) {
    const providerContent = useHbarAppUiEditorContent()
    const content = editorContent ?? providerContent

    switch (spec.variant) {
        case 1:
            return content?.richText ? <RichTextEditor spec={spec} onAction={onAction} content={content.richText}/>
                : emptyEditorSurface({spec, onAction})
        case 2:
            return content?.markdown ? <MarkdownWorkspace spec={spec} onAction={onAction} content={content.markdown}/>
                : emptyEditorSurface({spec, onAction})
        case 3:
            return content?.code ? <CodeWorkspace spec={spec} onAction={onAction} content={content.code}/>
                : emptyEditorSurface({spec, onAction})
        case 4:
            return content?.suggestions ? <SuggestionReview spec={spec} onAction={onAction} content={content.suggestions}/>
                : emptyEditorSurface({spec, onAction})
        case 5:
            return content?.reader ? <LongDocumentReader spec={spec} onAction={onAction} content={content.reader}/>
                : emptyEditorSurface({spec, onAction})
        default:
            return emptyEditorSurface({spec, onAction})
    }
}
