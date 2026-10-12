'use client'

import * as React from 'react'
import { LumenInput, LumenTextarea } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus } from './primitives'
import './editor.css'
import { LumenRichEditorReference, type LumenRichEditorReferenceContent } from './editor-rich-reference'
import { LumenMarkdownReference, type LumenMarkdownReferenceContent } from './editor-markdown-reference'
import { LumenCodeReference, type LumenCodeReferenceContent } from './editor-code-reference'
import { LumenSuggestionsReference, type LumenSuggestionsReferenceContent } from './editor-suggestions-reference'
import { LumenReaderReference, type LumenReaderReferenceContent } from './editor-reader-reference'
import { LumenBadge, LumenTabs } from './ui-controls'

export type LumenEditorFormattingAction = 'bold' | 'italic' | 'strikethrough' | 'inline-code' | 'link'

export type LumenMarkdownMode = 'write' | 'split' | 'preview'

export type LumenSuggestionAction = 'accept' | 'resolve'

export interface LumenEditorListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenRichTextEditorLabels {
  readonly blockMenuLabel: string
  readonly formattingToolbarLabel: string
  readonly historyToolbarLabel: string
  readonly formatActionLabel: (action: LumenEditorFormattingAction) => string
  readonly undoLabel: string
  readonly redoLabel: string
  readonly savedLabel: string
  readonly unsavedLabel: string
  readonly documentEditorLabel: string
  readonly documentTitleLabel: string
  readonly documentBodyLabel: string
}

export interface LumenRichTextDocument {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly metadata: string
  readonly statistics: readonly string[]
  readonly footerNote: string
}

export interface LumenRichTextChange {
  readonly documentId: string
  readonly field: 'title' | 'body'
  readonly value: string
}

export interface LumenRichTextEditorContent {
  readonly labels: LumenRichTextEditorLabels
  readonly document: LumenRichTextDocument
  readonly saved: boolean
  readonly onChange?: ((change: LumenRichTextChange) => void) | undefined
}

export interface LumenMarkdownWorkspaceLabels {
  readonly modeTabsLabel: string
  readonly modeLabel: (mode: LumenMarkdownMode) => string
  readonly sourcePanelLabel: string
  readonly previewPanelLabel: string
  readonly sourceInputLabel: string
}

export interface LumenMarkdownDocument {
  readonly id: string
  readonly fileName: string
  readonly summary: string
  readonly source: string
  readonly preview: React.ReactNode
}

export interface LumenMarkdownWorkspaceContent {
  readonly labels: LumenMarkdownWorkspaceLabels
  readonly document: LumenMarkdownDocument
  readonly initialMode: LumenMarkdownMode
  readonly onSourceChange?: ((documentId: string, value: string) => void) | undefined
  readonly onModeChange?: ((mode: LumenMarkdownMode) => void) | undefined
}

export interface LumenCodeFile {
  readonly id: string
  readonly name: string
  readonly source: string
  readonly dirty?: boolean | undefined
}

export interface LumenCodeWorkspaceLabels {
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

export interface LumenCodeWorkspaceFooter {
  readonly cursor: string
  readonly language: string
  readonly encoding: string
  readonly indentation: string
  readonly warningCount: number
}

export interface LumenCodeWorkspaceContent {
  readonly labels: LumenCodeWorkspaceLabels
  readonly files: readonly LumenCodeFile[]
  readonly activeFileId?: string | undefined
  readonly currentLine?: number | undefined
  readonly footer: LumenCodeWorkspaceFooter
  readonly listStrategy: LumenEditorListStrategy & { readonly kind: 'content-grown' }
  readonly onSelectFile?: ((fileId: string) => void) | undefined
  readonly onCloseFile?: ((fileId: string) => void) | undefined
  readonly onRunChange?: ((running: boolean) => void) | undefined
}

export type LumenEditorInlineSegment =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'strong'; readonly value: string }
  | { readonly kind: 'emphasis'; readonly value: string }
  | { readonly kind: 'suggestion'; readonly suggestionId: string; readonly value: string }

export interface LumenSuggestionDocumentParagraph {
  readonly id: string
  readonly segments: readonly LumenEditorInlineSegment[]
}

export interface LumenSuggestion {
  readonly id: string
  readonly initials: string
  readonly author: string
  readonly age: string
  readonly selected: string
  readonly replacement?: string | undefined
  readonly detail: string
  readonly primaryAction: LumenSuggestionAction
}

export interface LumenSuggestionReviewLabels {
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

export interface LumenSuggestionReviewDocument {
  readonly id: string
  readonly title: string
  readonly summary: string
  readonly paragraphs: readonly LumenSuggestionDocumentParagraph[]
}

export interface LumenSuggestionReviewContent {
  readonly labels: LumenSuggestionReviewLabels
  readonly document: LumenSuggestionReviewDocument
  readonly suggestions: readonly LumenSuggestion[]
  readonly listStrategy: LumenEditorListStrategy & { readonly kind: 'pane-scroll' }
  readonly onResolve?: ((suggestionId: string, action: LumenSuggestionAction | 'dismiss') => void) | undefined
  readonly onOpenSuggestion?: ((suggestionId: string) => void) | undefined
}

export interface LumenReaderSection {
  readonly id: string
  readonly label: string
  readonly title: string
  readonly paragraphs: readonly string[]
}

export interface LumenLongDocumentReaderLabels {
  readonly outlineLabel: string
  readonly documentOutlineLabel: string
  readonly sectionCountLabel: (count: number) => string
  readonly toggleOutlineLabel: string
  readonly focusLabel: string
  readonly emptyOutlineLabel: string
  readonly breadcrumbSeparator: string
}

export interface LumenLongDocumentReaderContent {
  readonly labels: LumenLongDocumentReaderLabels
  readonly workspaceLabel: string
  readonly documentLabel: string
  readonly sections: readonly LumenReaderSection[]
  readonly initialFocusSectionId?: string | undefined
  readonly initialFocusMode: boolean
  readonly initialOutlineOpen: boolean
  readonly listStrategy: LumenEditorListStrategy & { readonly kind: 'pane-scroll' }
  readonly onSelectSection?: ((sectionId: string) => void) | undefined
  readonly onFocusModeChange?: ((enabled: boolean) => void) | undefined
  readonly onOutlineOpenChange?: ((open: boolean) => void) | undefined
}

export interface LumenEditorContent {
  readonly referenceRichText?: LumenRichEditorReferenceContent | undefined
  readonly referenceMarkdown?: LumenMarkdownReferenceContent | undefined
  readonly referenceCode?: LumenCodeReferenceContent | undefined
  readonly referenceSuggestions?: LumenSuggestionsReferenceContent | undefined
  readonly referenceReader?: LumenReaderReferenceContent | undefined
  readonly richText?: LumenRichTextEditorContent | undefined
  readonly markdown?: LumenMarkdownWorkspaceContent | undefined
  readonly code?: LumenCodeWorkspaceContent | undefined
  readonly suggestions?: LumenSuggestionReviewContent | undefined
  readonly reader?: LumenLongDocumentReaderContent | undefined
}

export interface LumenEditorProviderProps {
  readonly content: LumenEditorContent
  readonly children: React.ReactNode
}

export interface LumenEditorAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenEditorProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenEditorContent | undefined
  readonly onAction?: ((event: LumenEditorAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  /** Host controlled production regions; preserves the numbered editor shell. */
  readonly slots?:
    | {
        readonly toolbar?: React.ReactNode | undefined
        readonly body?: React.ReactNode | undefined
        readonly footer?: React.ReactNode | undefined
      }
    | undefined
}

export type LumenEditorVariantProps = Omit<LumenEditorProps, 'variant' | 'variantId'>

const EditorContentContext = React.createContext<LumenEditorContent | undefined>(undefined)

export function LumenEditorProvider({ content, children }: LumenEditorProviderProps) {
  return <EditorContentContext.Provider value={content}>{children}</EditorContentContext.Provider>
}

export function useLumenEditorContent() {
  return React.useContext(EditorContentContext)
}

export function uniqueLumenEditorItems<Item extends { readonly id: string }>(items: readonly Item[]): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenEditorItem<Item extends { readonly id: string }>(
  items: readonly Item[],
  selectedId: string | undefined,
): Item | undefined {
  return items.find((item) => item.id === selectedId) ?? items[0]
}

function report(onAction: LumenEditorProps['onAction'], actionId: string, value?: string) {
  onAction?.(value === undefined ? { actionId } : { actionId, value })
}

function Glyph({ name }: { readonly name: keyof typeof glyphPaths }) {
  return (
    <svg className="lumen-editor-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d={glyphPaths[name]} />
    </svg>
  )
}

function Root({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  boundary = 'horizontal',
  children,
}: Omit<LumenEditorProps, 'content' | 'onAction'> & {
  readonly children: React.ReactNode
  readonly boundary?: 'none' | 'horizontal'
}) {
  const contentClassName = [
    'lumen-editor',
    'hbar-app-ui-editor-surface',
    `hbar-app-ui-editor-variant-${variant}`,
    density ? `hbar-app-ui-density-${density}` : '',
    surface ? `hbar-app-ui-surface-${surface}` : '',
    state ? `hbar-app-ui-state-${state}` : '',
    visualMode ? `hbar-app-ui-visual-${visualMode}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <LumenSurface
      as="section"
      boundary={boundary}
      className="lumen-editor-root-surface"
      contentClassName={contentClassName}
      data-lumen-component="editor"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
    >
      {children}
    </LumenSurface>
  )
}

function RichText(props: Omit<LumenEditorProps, 'content'> & { content: LumenRichTextEditorContent }) {
  const { content, onAction } = props
  const [draft, setDraft] = React.useState(() => ({
    title: content.document.title,
    body: content.document.body,
  }))
  const saved = content.saved && draft.title === content.document.title && draft.body === content.document.body
  const edit = (field: 'title' | 'body', value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
    content.onChange?.({ documentId: content.document.id, field, value })
  }
  const actions: readonly LumenEditorFormattingAction[] = ['bold', 'italic', 'strikethrough', 'inline-code', 'link']
  return (
    <Root {...props} className="hbar-app-ui-editor-rich-text">
      <header className="hbar-app-ui-editor-toolbar-surface hbar-app-ui-editor-rich-toolbar">
        <LumenButton
          variant="text"
          aria-label={content.labels.blockMenuLabel}
          onClick={() => report(onAction, 'block-menu')}
        >
          {content.labels.blockMenuLabel}
        </LumenButton>
        <div role="toolbar" aria-label={content.labels.formattingToolbarLabel}>
          {actions.map((action) => (
            <LumenButton
              variant="text"
              key={action}
              aria-label={content.labels.formatActionLabel(action)}
              onClick={() => report(onAction, action)}
            >
              {content.labels.formatActionLabel(action)}
            </LumenButton>
          ))}
        </div>
        <div role="toolbar" aria-label={content.labels.historyToolbarLabel}>
          <LumenButton variant="text" onClick={() => report(onAction, 'undo')}>
            {content.labels.undoLabel}
          </LumenButton>
          <LumenButton variant="text" onClick={() => report(onAction, 'redo')}>
            {content.labels.redoLabel}
          </LumenButton>
        </div>
        <LumenStatus
          value={saved ? content.labels.savedLabel : content.labels.unsavedLabel}
          tone={saved ? 'success' : 'warning'}
        />
      </header>
      <main className="hbar-app-ui-editor-rich-main">
        <section className="hbar-app-ui-editor-rich-document" aria-label={content.labels.documentEditorLabel}>
          <LumenInput
            aria-label={content.labels.documentTitleLabel}
            value={draft.title}
            readOnly={!content.onChange}
            onChange={(event) => edit('title', event.currentTarget.value)}
          />
          <p className="hbar-app-ui-editor-rich-meta">{content.document.metadata}</p>
          <LumenTextarea
            aria-label={content.labels.documentBodyLabel}
            value={draft.body}
            readOnly={!content.onChange}
            onChange={(event) => edit('body', event.currentTarget.value)}
            spellCheck={false}
          />
        </section>
      </main>
      <footer className="hbar-app-ui-editor-rich-footer">
        <div>
          {content.document.statistics.map((item, index) => (
            <span key={`${index}-${item}`}>{item}</span>
          ))}
        </div>
        <span>{content.document.footerNote}</span>
      </footer>
    </Root>
  )
}

function Markdown(props: Omit<LumenEditorProps, 'content'> & { content: LumenMarkdownWorkspaceContent }) {
  const { content, onAction } = props
  const [mode, setMode] = React.useState(content.initialMode)
  const [source, setSource] = React.useState(content.document.source)
  const modes: readonly LumenMarkdownMode[] = ['write', 'split', 'preview']
  return (
    <Root {...props} className={`hbar-app-ui-editor-markdown hbar-app-ui-editor-markdown-mode-${mode}`}>
      <header className="hbar-app-ui-editor-toolbar-surface hbar-app-ui-editor-markdown-header">
        <div>
          <h1>{content.document.fileName}</h1>
          <p>{content.document.summary}</p>
        </div>
        <LumenTabs
          label={content.labels.modeTabsLabel}
          items={modes.map((item) => ({ id: item, label: content.labels.modeLabel(item) }))}
          selectedId={mode}
          onChange={(id) => {
            const next = id as LumenMarkdownMode
            setMode(next)
            content.onModeChange?.(next)
            report(onAction, 'mode', next)
          }}
        />
      </header>
      <main className="hbar-app-ui-editor-markdown-main">
        {mode !== 'preview' ? (
          <section className="hbar-app-ui-editor-markdown-source">
            <header>{content.labels.sourcePanelLabel}</header>
            <LumenTextarea
              aria-label={content.labels.sourceInputLabel}
              value={source}
              readOnly={!content.onSourceChange}
              onChange={(event) => {
                setSource(event.currentTarget.value)
                content.onSourceChange?.(content.document.id, event.currentTarget.value)
              }}
            />
          </section>
        ) : null}
        {mode !== 'write' ? (
          <section className="hbar-app-ui-editor-markdown-preview">
            <header>{content.labels.previewPanelLabel}</header>
            <div>{content.document.preview}</div>
          </section>
        ) : null}
      </main>
    </Root>
  )
}

function Code(props: Omit<LumenEditorProps, 'content'> & { content: LumenCodeWorkspaceContent }) {
  const { content, onAction } = props
  const files = uniqueLumenEditorItems(content.files)
  const [activeId, setActiveId] = React.useState(content.activeFileId)
  const [closed, setClosed] = React.useState<ReadonlySet<string>>(() => new Set())
  const [running, setRunning] = React.useState(false)
  const open = files.filter((file) => !closed.has(file.id))
  const active = selectLumenEditorItem(open, activeId)
  const lines = active?.source.split('\n') ?? []
  const close = (file: LumenCodeFile) => {
    const next = open.filter((item) => item.id !== file.id)
    const selected =
      file.id === active?.id ? selectLumenEditorItem(next, undefined) : selectLumenEditorItem(next, active?.id)
    setClosed((current) => new Set(current).add(file.id))
    setActiveId(selected?.id)
    content.onCloseFile?.(file.id)
    report(onAction, 'close-file', file.id)
  }
  return (
    <Root {...props} className="hbar-app-ui-editor-code">
      <header className="hbar-app-ui-editor-code-tabs">
        <LumenTabs
          className="hbar-app-ui-editor-code-file-list"
          label={content.labels.openFilesLabel}
          items={open.map((file) => ({ id: file.id, label: file.name }))}
          selectedId={active?.id ?? null}
          onChange={(id) => {
            setActiveId(id)
            content.onSelectFile?.(id)
            report(onAction, 'file', id)
          }}
          renderLabel={(item) => {
            const file = open.find((candidate) => candidate.id === item.id)
            return (
              <React.Fragment>
                <span>{item.label}</span>
                {file?.dirty ? (
                  <LumenBadge
                    variant="dot"
                    value={content.labels.unsavedLabel}
                    aria-label={content.labels.unsavedLabel}
                  />
                ) : null}
              </React.Fragment>
            )
          }}
          renderTrailing={(item) => {
            const file = open.find((candidate) => candidate.id === item.id)
            return file ? (
              <LumenIconButton label={content.labels.closeFileLabel(file.name)} onClick={() => close(file)}>
                <Glyph name="close" />
              </LumenIconButton>
            ) : null
          }}
        />
        <LumenButton
          onClick={() =>
            setRunning((current) => {
              const next = !current
              content.onRunChange?.(next)
              report(onAction, next ? 'run' : 'stop')
              return next
            })
          }
        >
          <Glyph name="play" />
          {running ? content.labels.stopLabel : content.labels.runLabel}
        </LumenButton>
      </header>
      {active ? (
        <main className="hbar-app-ui-editor-code-main" aria-label={content.labels.codeEditorLabel}>
          <div className="hbar-app-ui-editor-code-gutter">
            {lines.map((_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <pre>
            <code>
              {lines.map((line, i) => (
                <span key={`${i}-${line}`}>
                  <span>{line}</span>
                </span>
              ))}
            </code>
          </pre>
          <aside aria-label={content.labels.codeOverviewLabel}>
            {lines.slice(0, 18).map((line, i) => (
              <i key={i} style={{ inlineSize: `${Math.max(18, Math.min(96, line.length * 2.1))}%` }} />
            ))}
          </aside>
        </main>
      ) : (
        <main className="hbar-app-ui-editor-code-main">
          <p>{content.labels.emptyFilesLabel}</p>
        </main>
      )}
      <footer className="hbar-app-ui-editor-code-footer">
        <span>{content.footer.cursor}</span>
        <span>{content.footer.language}</span>
        <span>{content.footer.encoding}</span>
        <span>{content.footer.indentation}</span>
        {content.footer.warningCount > 0 ? (
          <span>{content.labels.warningLabel(content.footer.warningCount)}</span>
        ) : null}
      </footer>
    </Root>
  )
}

function Inline({
  segments,
  onOpen,
}: {
  readonly segments: readonly LumenEditorInlineSegment[]
  readonly onOpen: (id: string) => void
}) {
  return (
    <React.Fragment>
      {segments.map((segment, index) => {
        const key = segment.kind === 'suggestion' ? segment.suggestionId : `${segment.kind}-${index}`
        if (segment.kind === 'strong') {
          return <strong key={key}>{segment.value}</strong>
        }
        if (segment.kind === 'emphasis') {
          return <em key={key}>{segment.value}</em>
        }
        if (segment.kind === 'suggestion') {
          return (
            <LumenButton
              variant="text"
              className="hbar-app-ui-editor-inline-suggestion"
              key={key}
              onClick={() => onOpen(segment.suggestionId)}
            >
              {segment.value}
            </LumenButton>
          )
        }
        return <span key={key}>{segment.value}</span>
      })}
    </React.Fragment>
  )
}

function Suggestions(props: Omit<LumenEditorProps, 'content'> & { content: LumenSuggestionReviewContent }) {
  const { content, onAction } = props
  const suggestions = uniqueLumenEditorItems(content.suggestions)
  const [resolved, setResolved] = React.useState<ReadonlySet<string>>(() => new Set())
  React.useEffect(() => {
    const ids = new Set(content.suggestions.map((item) => item.id))
    setResolved((current) => new Set([...current].filter((id) => ids.has(id))))
  }, [content.suggestions])
  const remaining = suggestions.filter((item) => !resolved.has(item.id))
  const resolve = (item: LumenSuggestion, action: LumenSuggestionAction | 'dismiss') => {
    setResolved((current) => new Set(current).add(item.id))
    content.onResolve?.(item.id, action)
    report(onAction, action, item.id)
  }
  return (
    <Root {...props} className="hbar-app-ui-editor-suggestions">
      <div className="hbar-app-ui-editor-suggestion-document">
        <header>
          <div>
            <h1>{content.document.title}</h1>
            <p>{content.document.summary}</p>
          </div>
          <span>
            <Glyph name="message" />
            {content.labels.openCountLabel(remaining.length)}
          </span>
        </header>
        <main className="hbar-app-ui-editor-suggestion-copy">
          {content.document.paragraphs.map((paragraph) => (
            <p key={paragraph.id}>
              <Inline
                segments={paragraph.segments}
                onOpen={(id) => {
                  content.onOpenSuggestion?.(id)
                  report(onAction, 'open-suggestion', id)
                }}
              />
            </p>
          ))}
        </main>
      </div>
      <aside
        className="hbar-app-ui-editor-suggestion-panel"
        data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
      >
        <header>
          <h2>{content.labels.suggestionPanelLabel}</h2>
          <LumenButton
            variant="text"
            onClick={() => {
              setResolved(new Set(suggestions.map((item) => item.id)))
              remaining.forEach((item) => content.onResolve?.(item.id, 'accept'))
              report(onAction, 'accept-all')
            }}
          >
            {content.labels.acceptAllLabel}
          </LumenButton>
        </header>
        <div className="hbar-app-ui-editor-suggestion-list">
          {suggestions.length ? (
            suggestions.map((item) => (
              <article className="hbar-app-ui-editor-suggestion-card" key={item.id}>
                <header>
                  <span>{item.initials}</span>
                  <strong>{item.author}</strong>
                  <time>{item.age}</time>
                </header>
                {item.replacement ? (
                  <div>
                    <p>
                      <s>{item.selected}</s>
                    </p>
                    <p>
                      <strong>{item.replacement}</strong>
                    </p>
                  </div>
                ) : (
                  <p>
                    <s>{item.selected}</s>
                  </p>
                )}
                <p>{item.detail}</p>
                <footer>
                  <LumenButton disabled={resolved.has(item.id)} onClick={() => resolve(item, item.primaryAction)}>
                    <Glyph name="check" />
                    {resolved.has(item.id)
                      ? content.labels.resolvedLabel
                      : item.primaryAction === 'resolve'
                        ? content.labels.resolveLabel
                        : content.labels.acceptLabel}
                  </LumenButton>
                  <LumenButton variant="text" disabled={resolved.has(item.id)} onClick={() => resolve(item, 'dismiss')}>
                    <Glyph name="close" />
                    {content.labels.dismissLabel}
                  </LumenButton>
                </footer>
              </article>
            ))
          ) : (
            <p>{content.labels.emptySuggestionsLabel}</p>
          )}
        </div>
        <p>{content.labels.remainingCountLabel(remaining.length)}</p>
      </aside>
    </Root>
  )
}

function Reader(props: Omit<LumenEditorProps, 'content'> & { content: LumenLongDocumentReaderContent }) {
  const { content, onAction } = props
  const sections = uniqueLumenEditorItems(content.sections)
  const [outline, setOutline] = React.useState(content.initialOutlineOpen)
  const [focusId, setFocusId] = React.useState(content.initialFocusSectionId)
  const [focus, setFocus] = React.useState(content.initialFocusMode)
  const outlineId = React.useId()
  const selected = selectLumenEditorItem(sections, focusId)
  return (
    <Root {...props} className={`hbar-app-ui-editor-reader${focus ? ' is-focus-mode' : ''}`}>
      {outline ? (
        <aside
          id={outlineId}
          className="hbar-app-ui-editor-reader-outline"
          data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        >
          <header>{content.labels.outlineLabel}</header>
          <nav aria-label={content.labels.documentOutlineLabel}>
            {sections.length ? (
              sections.map((section) => (
                <LumenButton
                  variant="text"
                  aria-current={selected?.id === section.id ? 'location' : undefined}
                  indicatorEdge="left"
                  indicatorState={selected?.id === section.id ? 'selected' : undefined}
                  key={section.id}
                  onClick={() => {
                    setFocusId(section.id)
                    content.onSelectSection?.(section.id)
                    report(onAction, 'section', section.id)
                  }}
                >
                  {section.label}
                </LumenButton>
              ))
            ) : (
              <p>{content.labels.emptyOutlineLabel}</p>
            )}
          </nav>
          <footer>{content.labels.sectionCountLabel(sections.length)}</footer>
        </aside>
      ) : null}
      <div className="hbar-app-ui-editor-reader-main">
        <header className="hbar-app-ui-editor-reader-toolbar">
          <LumenIconButton
            label={content.labels.toggleOutlineLabel}
            aria-expanded={outline}
            aria-controls={outline ? outlineId : undefined}
            onClick={() => {
              const next = !outline
              setOutline(next)
              content.onOutlineOpenChange?.(next)
              report(onAction, 'outline', next ? 'open' : 'closed')
            }}
          >
            <Glyph name="panel" />
          </LumenIconButton>
          <p>
            <span>{content.workspaceLabel}</span>
            <span>{content.labels.breadcrumbSeparator}</span>
            <strong>{content.documentLabel}</strong>
          </p>
          <LumenButton
            variant="outlined"
            aria-pressed={focus}
            onClick={() => {
              const next = !focus
              setFocus(next)
              content.onFocusModeChange?.(next)
              report(onAction, 'focus', next ? 'on' : 'off')
            }}
          >
            <Glyph name="focus" />
            {content.labels.focusLabel}
          </LumenButton>
        </header>
        <main className="hbar-app-ui-editor-reader-content">
          <article>
            {sections.map((section) => (
              <section className={focus && selected?.id !== section.id ? 'is-dimmed' : ''} key={section.id}>
                <h2>{section.title}</h2>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={`${index}-${paragraph}`}>{paragraph}</p>
                ))}
              </section>
            ))}
          </article>
        </main>
      </div>
    </Root>
  )
}

function empty(props: LumenEditorProps) {
  const names = [
    '',
    'hbar-app-ui-editor-rich-text',
    'hbar-app-ui-editor-markdown',
    'hbar-app-ui-editor-code',
    'hbar-app-ui-editor-suggestions',
    'hbar-app-ui-editor-reader',
  ]
  return (
    <Root {...props} className={names[props.variant] ?? names[1]}>
      {null}
    </Root>
  )
}

export function LumenEditor(props: LumenEditorProps) {
  const inheritedContent = useLumenEditorContent()
  if (props.slots) {
    return (
      <Root {...props} className="hbar-app-ui-editor-slot-surface">
        {props.slots.toolbar ? <header>{props.slots.toolbar}</header> : null}
        <main>{props.slots.body}</main>
        {props.slots.footer ? <footer>{props.slots.footer}</footer> : null}
      </Root>
    )
  }
  const content = props.content ?? inheritedContent
  if (props.variant === 1 && content?.referenceRichText)
    return (
      <Root {...props} boundary="none" className="hbar-app-ui-editor-rich-text lumen-rich-editor-reference">
        <LumenRichEditorReference content={content.referenceRichText} onAction={props.onAction} />
      </Root>
    )
  if (props.variant === 2 && content?.referenceMarkdown)
    return (
      <Root
        {...props}
        boundary="none"
        className={`hbar-app-ui-editor-markdown hbar-app-ui-editor-markdown-mode-${content.referenceMarkdown.mode} lumen-markdown-reference`}
      >
        <LumenMarkdownReference content={content.referenceMarkdown} onAction={props.onAction} />
      </Root>
    )
  if (props.variant === 3 && content?.referenceCode)
    return (
      <Root {...props} boundary="none" className="hbar-app-ui-editor-code lumen-code-reference">
        <LumenCodeReference content={content.referenceCode} onAction={props.onAction} />
      </Root>
    )
  if (props.variant === 4 && content?.referenceSuggestions)
    return (
      <Root {...props} boundary="none" className="hbar-app-ui-editor-suggestions lumen-suggestions-reference">
        <LumenSuggestionsReference content={content.referenceSuggestions} onAction={props.onAction} />
      </Root>
    )
  if (props.variant === 5 && content?.referenceReader)
    return (
      <Root {...props} boundary="none" className="hbar-app-ui-editor-reader lumen-reader-reference">
        <LumenReaderReference content={content.referenceReader} onAction={props.onAction} />
      </Root>
    )
  if (props.variant === 1) return content?.richText ? <RichText {...props} content={content.richText} /> : empty(props)
  if (props.variant === 2) return content?.markdown ? <Markdown {...props} content={content.markdown} /> : empty(props)
  if (props.variant === 3) return content?.code ? <Code {...props} content={content.code} /> : empty(props)
  if (props.variant === 4)
    return content?.suggestions ? <Suggestions {...props} content={content.suggestions} /> : empty(props)
  if (props.variant === 5) return content?.reader ? <Reader {...props} content={content.reader} /> : empty(props)
  return empty(props)
}

function variant(value: number, props: LumenEditorVariantProps) {
  return <LumenEditor {...props} variant={value} variantId={`hbar-app-ui-editor-${value}`} />
}

export function LumenEditor01(props: LumenEditorVariantProps) {
  return variant(1, props)
}

export function LumenEditor02(props: LumenEditorVariantProps) {
  return variant(2, props)
}

export function LumenEditor03(props: LumenEditorVariantProps) {
  return variant(3, props)
}

export function LumenEditor04(props: LumenEditorVariantProps) {
  return variant(4, props)
}

export function LumenEditor05(props: LumenEditorVariantProps) {
  return variant(5, props)
}

const glyphPaths = {
  close: 'm4 4 8 8m0-8-8 8',
  play: 'm5 3 8 5-8 5Z',
  panel: 'M2.5 3h11v10h-11zM6 3v10',
  focus: 'M6 3H3v3m7-3h3v3m0 4v3h-3m-4 0H3v-3',
  check: 'm3.5 8 3 3 6-6',
  message: 'M2.5 3.5h11v7h-6l-3.5 3v-3H2.5z',
  minus: 'M3 8h10',
} as const
