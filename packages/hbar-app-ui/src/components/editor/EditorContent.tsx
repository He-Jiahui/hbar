import {createContext, useContext, type ReactNode} from 'react'

export type HbarAppUiEditorFormattingAction = 'bold' | 'italic' | 'strikethrough' | 'inline-code' | 'link'
export type HbarAppUiMarkdownMode = 'write' | 'split' | 'preview'
export type HbarAppUiSuggestionAction = 'accept' | 'resolve'

/** A bounded component list; hosts page or virtualize before exceeding its contract. */
export interface HbarAppUiEditorListStrategy {
    readonly kind: 'content-grown' | 'pane-scroll'
    readonly expectedMaximum: number
}

export interface HbarAppUiRichTextEditorLabels {
    readonly blockMenuLabel: string
    readonly formattingToolbarLabel: string
    readonly historyToolbarLabel: string
    readonly formatActionLabel: (action: HbarAppUiEditorFormattingAction) => string
    readonly undoLabel: string
    readonly redoLabel: string
    readonly savedLabel: string
    readonly unsavedLabel: string
    readonly documentEditorLabel: string
    readonly documentTitleLabel: string
    readonly documentBodyLabel: string
}

export interface HbarAppUiRichTextDocument {
    readonly id: string
    readonly title: string
    readonly body: string
    readonly metadata: string
    readonly statistics: readonly string[]
    readonly footerNote: string
}

export interface HbarAppUiRichTextChange {
    readonly documentId: string
    readonly field: 'title' | 'body'
    readonly value: string
}

export interface HbarAppUiRichTextEditorContent {
    readonly labels: HbarAppUiRichTextEditorLabels
    readonly document: HbarAppUiRichTextDocument
    readonly saved: boolean
    readonly onChange?: ((change: HbarAppUiRichTextChange) => void) | undefined
}

export interface HbarAppUiMarkdownWorkspaceLabels {
    readonly modeTabsLabel: string
    readonly modeLabel: (mode: HbarAppUiMarkdownMode) => string
    readonly sourcePanelLabel: string
    readonly previewPanelLabel: string
    readonly sourceInputLabel: string
}

export interface HbarAppUiMarkdownDocument {
    readonly id: string
    readonly fileName: string
    readonly summary: string
    readonly source: string
    readonly preview: ReactNode
}

export interface HbarAppUiMarkdownWorkspaceContent {
    readonly labels: HbarAppUiMarkdownWorkspaceLabels
    readonly document: HbarAppUiMarkdownDocument
    readonly initialMode: HbarAppUiMarkdownMode
    readonly onSourceChange?: ((documentId: string, value: string) => void) | undefined
    readonly onModeChange?: ((mode: HbarAppUiMarkdownMode) => void) | undefined
}

export interface HbarAppUiCodeFile {
    readonly id: string
    readonly name: string
    readonly source: string
    readonly dirty?: boolean | undefined
}

export interface HbarAppUiCodeWorkspaceLabels {
    readonly openFilesLabel: string
    readonly closeFileLabel: (fileName: string) => string
    readonly unsavedLabel: string
    readonly runLabel: string
    readonly stopLabel: string
    readonly codeEditorLabel: string
    readonly codeOverviewLabel: string
    readonly warningLabel: (count: number) => string
    readonly emptyFilesLabel: string
}

export interface HbarAppUiCodeWorkspaceFooter {
    readonly cursor: string
    readonly language: string
    readonly encoding: string
    readonly indentation: string
    readonly warningCount: number
}

export interface HbarAppUiCodeWorkspaceContent {
    readonly labels: HbarAppUiCodeWorkspaceLabels
    readonly files: readonly HbarAppUiCodeFile[]
    readonly activeFileId?: string | undefined
    readonly currentLine?: number | undefined
    readonly footer: HbarAppUiCodeWorkspaceFooter
    /** Code tabs are a short, content-grown set; a host owns any file search. */
    readonly listStrategy: HbarAppUiEditorListStrategy & {readonly kind: 'content-grown'}
    readonly onSelectFile?: ((fileId: string) => void) | undefined
    readonly onCloseFile?: ((fileId: string) => void) | undefined
    readonly onRunChange?: ((running: boolean) => void) | undefined
}

export type HbarAppUiEditorInlineSegment =
    | {readonly kind: 'text'; readonly value: string}
    | {readonly kind: 'strong'; readonly value: string}
    | {readonly kind: 'emphasis'; readonly value: string}
    | {readonly kind: 'suggestion'; readonly suggestionId: string; readonly value: string}

export interface HbarAppUiSuggestionDocumentParagraph {
    readonly id: string
    readonly segments: readonly HbarAppUiEditorInlineSegment[]
}

export interface HbarAppUiSuggestion {
    readonly id: string
    readonly initials: string
    readonly author: string
    readonly age: string
    readonly selected: string
    readonly replacement?: string | undefined
    readonly detail: string
    readonly primaryAction: HbarAppUiSuggestionAction
}

export interface HbarAppUiSuggestionReviewLabels {
    readonly suggestionPanelLabel: string
    readonly acceptAllLabel: string
    readonly acceptLabel: string
    readonly resolveLabel: string
    readonly dismissLabel: string
    readonly resolvedLabel: string
    readonly openCountLabel: (count: number) => string
    readonly remainingCountLabel: (count: number) => string
    readonly emptySuggestionsLabel: string
}

export interface HbarAppUiSuggestionReviewDocument {
    readonly id: string
    readonly title: string
    readonly summary: string
    readonly paragraphs: readonly HbarAppUiSuggestionDocumentParagraph[]
}

export interface HbarAppUiSuggestionReviewContent {
    readonly labels: HbarAppUiSuggestionReviewLabels
    readonly document: HbarAppUiSuggestionReviewDocument
    readonly suggestions: readonly HbarAppUiSuggestion[]
    /** Review cards belong to the bounded workbench panel and scroll inside it. */
    readonly listStrategy: HbarAppUiEditorListStrategy & {readonly kind: 'pane-scroll'}
    readonly onResolve?: ((suggestionId: string, action: HbarAppUiSuggestionAction | 'dismiss') => void) | undefined
    readonly onOpenSuggestion?: ((suggestionId: string) => void) | undefined
}

export interface HbarAppUiReaderSection {
    readonly id: string
    readonly label: string
    readonly title: string
    readonly paragraphs: readonly string[]
}

export interface HbarAppUiLongDocumentReaderLabels {
    readonly outlineLabel: string
    readonly documentOutlineLabel: string
    readonly sectionCountLabel: (count: number) => string
    readonly toggleOutlineLabel: string
    readonly focusLabel: string
    readonly emptyOutlineLabel: string
    readonly breadcrumbSeparator: string
}

export interface HbarAppUiLongDocumentReaderContent {
    readonly labels: HbarAppUiLongDocumentReaderLabels
    readonly workspaceLabel: string
    readonly documentLabel: string
    readonly sections: readonly HbarAppUiReaderSection[]
    readonly initialFocusSectionId?: string | undefined
    readonly initialFocusMode: boolean
    readonly initialOutlineOpen: boolean
    /** The outline is a pane-owned scroll region for long documents. */
    readonly listStrategy: HbarAppUiEditorListStrategy & {readonly kind: 'pane-scroll'}
    readonly onSelectSection?: ((sectionId: string) => void) | undefined
    readonly onFocusModeChange?: ((enabled: boolean) => void) | undefined
    readonly onOutlineOpenChange?: ((open: boolean) => void) | undefined
}

export interface HbarAppUiEditorContent {
    readonly richText?: HbarAppUiRichTextEditorContent | undefined
    readonly markdown?: HbarAppUiMarkdownWorkspaceContent | undefined
    readonly code?: HbarAppUiCodeWorkspaceContent | undefined
    readonly suggestions?: HbarAppUiSuggestionReviewContent | undefined
    readonly reader?: HbarAppUiLongDocumentReaderContent | undefined
}

export interface HbarAppUiEditorProviderProps {
    readonly content: HbarAppUiEditorContent
    readonly children: ReactNode
}

const editorContentContext = createContext<HbarAppUiEditorContent | undefined>(undefined)

/**
 * The package owns no locale catalog or demo records. Hosts and the preview
 * harness pass resolved labels and data through this provider instead.
 */
export function HbarAppUiEditorProvider({content, children}: HbarAppUiEditorProviderProps) {
    return <editorContentContext.Provider value={content}>{children}</editorContentContext.Provider>
}

export function useHbarAppUiEditorContent(): HbarAppUiEditorContent | undefined {
    return useContext(editorContentContext)
}

export function uniqueHbarAppUiEditorItems<T extends {readonly id: string}>(items: readonly T[]): readonly T[] {
    const seen = new Set<string>()
    return items.filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
    })
}

export function selectHbarAppUiEditorItem<T extends {readonly id: string}>(
    items: readonly T[],
    selectedId: string | undefined,
): T | undefined {
    return items.find((item) => item.id === selectedId) ?? items[0]
}
