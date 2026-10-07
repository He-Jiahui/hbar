import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { LoaderCircle, Search, X } from 'lucide-react'
import {
  sessionSearchScopeSchema,
  sessionSearchInputSchema,
  type SessionSearchScope,
  type SessionSearchSource,
} from '@hbar/contracts/commands/session-search'
import {
  LumenButton,
  LumenFrame,
  LumenIcon,
  LumenIconButton,
  LumenInput,
  LumenContentText,
  LumenToggleGroup,
} from '@lumen/app-ui'
import './chat-search-view.css'

export interface HbarChatSearchHighlight {
  readonly start: number
  readonly end: number
}

export interface HbarChatSearchSnippet {
  readonly messageId: string | null
  readonly role: 'user' | 'assistant' | 'tool'
  readonly text: string
  readonly highlights: readonly HbarChatSearchHighlight[]
}

export interface HbarChatSearchRow {
  readonly resultId?: string | undefined
  readonly source?: SessionSearchSource | undefined
  readonly target?:
    | { readonly messageId: string | null; readonly blockIndex: number | null; readonly callId: string | null }
    | undefined
  readonly sessionId: string
  readonly workspaceId: string
  readonly title: string
  readonly workspaceName: string
  readonly updatedAt: number
  readonly matchCount: number
  readonly matchCountCapped?: boolean | undefined
  readonly snippets: readonly HbarChatSearchSnippet[]
}

export type HbarChatSearchStatus = 'recent' | 'loading' | 'indexing' | 'ready' | 'empty' | 'error' | 'disconnected'

export interface HbarChatSearchLabels {
  readonly category: string
  readonly enterQuery: string
  readonly scopes: Readonly<Record<SessionSearchScope, string>>
  readonly sources: Readonly<Record<SessionSearchSource, string>>
  readonly openResult: (source: SessionSearchSource, title: string, workspaceName: string, preview: string) => string
  readonly search: string
  readonly recent: string
  readonly close: string
  readonly loading: string
  readonly indexing: string
  readonly searchFailed: string
  readonly empty: string
  readonly noRecent: string
  readonly disconnected: string
  readonly retry: string
  readonly truncated: string
  readonly navigateKey: string
  readonly navigate: string
  readonly selectKey: string
  readonly select: string
  readonly closeKey: string
  readonly closeHint: string
  readonly role: (role: HbarChatSearchSnippet['role']) => string
  readonly time: (updatedAt: number) => string
  readonly matches: (count: number, capped?: boolean) => string
  readonly openSession: (title: string, workspaceName: string) => string
  readonly opening: (title: string) => string
}

/**
 * Bounded, pane-owned result view. The host supplies canonical session rows and
 * owns fetching, selection, debouncing, IME state, and opening a session tab.
 */
export interface HbarChatSearchViewProps {
  readonly source?: SessionSearchScope | undefined
  readonly onSourceChange: (source: SessionSearchScope) => void
  readonly inputRef: RefObject<HTMLInputElement | null>
  readonly query: string
  readonly status: HbarChatSearchStatus
  readonly rows: readonly HbarChatSearchRow[]
  readonly selectedResultId: string | null
  readonly truncated: boolean
  readonly error: string | null
  readonly openingResultId?: string | null | undefined
  readonly openError?: { readonly sessionId: string; readonly message: string } | null | undefined
  readonly labels: HbarChatSearchLabels
  readonly onQueryChange: (query: string) => void
  readonly onMove: (direction: 'up' | 'down') => void
  readonly onSelect: (sessionId: string) => void
  readonly onOpen: (sessionId: string, workspaceId: string) => void
  readonly onClose: () => void
  readonly onCompositionStart: () => void
  readonly onCompositionEnd: (query: string) => void
  readonly onRetry: () => void
}

export function visibleChatSearchRows(
  rows: readonly HbarChatSearchRow[],
  status: HbarChatSearchStatus,
): readonly HbarChatSearchRow[] {
  if (status !== 'recent' && status !== 'ready' && status !== 'indexing') return []
  const seen = new Set<string>()
  const visible: HbarChatSearchRow[] = []
  const limit = status === 'recent' ? 8 : 50
  for (const row of rows) {
    const resultId = row.resultId ?? row.sessionId
    if (!resultId || !row.sessionId || !row.workspaceId || seen.has(resultId)) continue
    seen.add(resultId)
    visible.push(row)
    if (visible.length === limit) break
  }
  return visible
}

/** UTF-16 offsets are validated before display; malformed ranges render plain text. */
export function highlightedChatSearchText(text: string, highlights: readonly HbarChatSearchHighlight[]): ReactNode {
  const valid = highlights
    .filter(
      ({ start, end }) =>
        Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end > start && end <= text.length,
    )
    .slice(0, 256)
    .sort((left, right) => left.start - right.start || left.end - right.end)
  if (valid.length === 0) return text
  const segments: ReactNode[] = []
  let cursor = 0
  for (const { start, end } of valid) {
    if (start < cursor) continue
    if (start > cursor) segments.push(text.slice(cursor, start))
    segments.push(
      <LumenContentText
        context="inline.text"
        role="mark"
        className="hbar-chat-search-highlight"
        key={`${start}:${end}`}
      >
        {text.slice(start, end)}
      </LumenContentText>,
    )
    cursor = end
  }
  if (cursor < text.length) segments.push(text.slice(cursor))
  return segments
}

export function HbarChatSearchView({
  source = 'all',
  onSourceChange,
  inputRef,
  query,
  status,
  rows,
  selectedResultId,
  truncated,
  error,
  openingResultId,
  openError,
  labels,
  onQueryChange,
  onMove,
  onSelect,
  onOpen,
  onClose,
  onCompositionStart,
  onCompositionEnd,
  onRetry,
}: HbarChatSearchViewProps) {
  const instanceId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const composing = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = `hbar-chat-search-${instanceId}`
  const visible = visibleChatSearchRows(rows, status)
  const selectedIndex = visible.findIndex((row) => (row.resultId ?? row.sessionId) === selectedResultId)
  const selected = selectedIndex >= 0 ? visible[selectedIndex] : undefined
  useEffect(() => {
    if (selectedIndex < 0) return
    listRef.current?.children.item(selectedIndex)?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, selectedResultId])
  const pending = openingResultId != null
  const showEmpty = !truncated && (status === 'empty' || (status === 'ready' && visible.length === 0))
  const statusText =
    status === 'loading'
      ? labels.loading
      : status === 'indexing'
        ? labels.indexing
        : status === 'error'
          ? error || labels.searchFailed
          : status === 'disconnected'
            ? labels.disconnected
            : showEmpty
              ? labels.empty
              : status === 'recent' && visible.length === 0
                ? source === 'all' || source === 'title'
                  ? labels.noRecent
                  : labels.enterQuery
                : null
  return (
    <LumenFrame as="section" className="hbar-chat-search-view" role="search" aria-label={labels.search}>
      <LumenFrame as="header" className="hbar-chat-search-header">
        <LumenIcon icon={Search} tier="md" aria-hidden="true" />
        <LumenInput
          ref={inputRef}
          type="search"
          variant="plain"
          value={query}
          maxLength={sessionSearchInputSchema.shape.query.maxLength ?? undefined}
          aria-label={labels.search}
          placeholder={labels.search}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={visible.length > 0}
          aria-controls={listId}
          aria-activedescendant={selected ? `${listId}-row-${selectedIndex}` : undefined}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onCompositionStart={() => {
            composing.current = true
            onCompositionStart()
          }}
          onCompositionEnd={(event) => {
            composing.current = false
            onCompositionEnd(event.currentTarget.value)
          }}
          onKeyDown={(event) => {
            if (composing.current || event.nativeEvent.isComposing || event.key === 'Process') return
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              onMove(event.key === 'ArrowDown' ? 'down' : 'up')
            } else if (event.key === 'Enter' && selected && !pending) {
              event.preventDefault()
              onOpen(selected.resultId ?? selected.sessionId, selected.workspaceId)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              onClose()
            }
          }}
        />
        {status === 'loading' && (
          <LumenIcon icon={LoaderCircle} tier="sm" className="hbar-chat-search-spinner" aria-hidden="true" />
        )}
        <LumenIconButton label={labels.close} onClick={onClose}>
          <LumenIcon icon={X} tier="md" />
        </LumenIconButton>
      </LumenFrame>
      <LumenFrame className="hbar-chat-search-scopes" role="group" aria-label={labels.category} tabIndex={0}>
        <LumenToggleGroup
          type="single"
          size="s"
          label={labels.category}
          value={source}
          options={(['all', 'title', 'conversation', 'file', 'patch', 'tool'] as const).map((id) => ({
            id,
            label: labels.scopes[id],
          }))}
          onValueChange={(value) => {
            const parsed = sessionSearchScopeSchema.safeParse(value)
            if (parsed.success) onSourceChange(parsed.data)
          }}
        />
      </LumenFrame>
      <LumenFrame className="hbar-chat-search-pane">
        {status === 'recent' && visible.length > 0 && (
          <LumenContentText context="section.title" className="hbar-chat-search-recent">
            {labels.recent}
          </LumenContentText>
        )}
        {statusText && (
          <LumenFrame className="hbar-chat-search-feedback" role={status === 'error' ? 'alert' : 'status'}>
            <LumenContentText context="feedback.paragraph" tone={status === 'error' ? 'danger' : 'subtle'}>
              {statusText}
            </LumenContentText>
            {(status === 'error' || status === 'disconnected' || status === 'indexing') && (
              <LumenFrame
                className="hbar-chat-search-actions-reading"
                role="group"
                aria-label={labels.retry}
                tabIndex={0}
              >
                <LumenButton type="button" variant="text" indicator="none" onClick={onRetry}>
                  {labels.retry}
                </LumenButton>
              </LumenFrame>
            )}
          </LumenFrame>
        )}
        <LumenFrame
          ref={listRef}
          id={listId}
          className="hbar-chat-search-list"
          role="listbox"
          aria-label={labels.search}
          aria-busy={status === 'loading'}
        >
          {visible.map((row, index) => (
            <LumenButton
              key={row.resultId ?? row.sessionId}
              id={`${listId}-row-${index}`}
              type="button"
              variant="text"
              indicator="none"
              indicatorState={selectedIndex === index ? 'selected' : 'idle'}
              role="option"
              className="hbar-chat-search-row"
              aria-label={labels.openResult(
                row.source ?? (status === 'recent' ? 'title' : 'conversation'),
                row.title,
                row.workspaceName,
                row.snippets[0]?.text ?? '',
              )}
              aria-selected={selectedIndex === index}
              data-session-id={row.sessionId}
              data-result-id={row.resultId ?? row.sessionId}
              data-result-source={row.source ?? (status === 'recent' ? 'title' : 'conversation')}
              disabled={pending}
              onPointerMove={(event) => {
                if (event.pointerType === 'mouse' && selectedResultId !== (row.resultId ?? row.sessionId))
                  onSelect(row.resultId ?? row.sessionId)
              }}
              onFocus={() => onSelect(row.resultId ?? row.sessionId)}
              onClick={() => onOpen(row.resultId ?? row.sessionId, row.workspaceId)}
            >
              <LumenContentText context="choice.description" className="hbar-chat-search-source">
                {labels.sources[row.source ?? (status === 'recent' ? 'title' : 'conversation')]}
              </LumenContentText>
              <LumenFrame className="hbar-chat-search-row-body">
                <LumenFrame as="span" className="hbar-chat-search-row-heading">
                  <LumenContentText context="collection.title" className="hbar-chat-search-row-title" title={row.title}>
                    {row.title}
                  </LumenContentText>
                  <LumenFrame
                    as="span"
                    className="hbar-chat-search-metadata-reading"
                    role="group"
                    aria-label={labels.time(row.updatedAt)}
                    tabIndex={0}
                  >
                    <LumenContentText
                      context="metadata.time"
                      tone="subtle"
                      dateTime={
                        Number.isFinite(row.updatedAt) && Number.isFinite(new Date(row.updatedAt).getTime())
                          ? new Date(row.updatedAt).toISOString()
                          : undefined
                      }
                      title={labels.time(row.updatedAt)}
                    >
                      {labels.time(row.updatedAt)}
                    </LumenContentText>
                  </LumenFrame>
                </LumenFrame>
                <LumenFrame as="span" className="hbar-chat-search-row-context">
                  <LumenContentText context="collection.detail" title={row.workspaceName}>
                    {row.workspaceName}
                  </LumenContentText>
                  {status !== 'recent' && (
                    <LumenContentText context="collection.detail">
                      {labels.matches(row.matchCount, row.matchCountCapped)}
                    </LumenContentText>
                  )}
                </LumenFrame>
                {status !== 'recent' &&
                  row.snippets.slice(0, 3).map((snippet) => (
                    <LumenFrame as="span" key={snippet.messageId ?? 'title'} className="hbar-chat-search-snippet">
                      {row.source !== 'title' && (
                        <LumenContentText
                          context="collection.detail"
                          className="hbar-chat-search-snippet-role"
                          title={labels.role(snippet.role)}
                        >
                          {labels.role(snippet.role)}
                        </LumenContentText>
                      )}
                      <LumenContentText
                        context="collection.detail"
                        className="hbar-chat-search-snippet-text"
                        title={snippet.text}
                      >
                        {highlightedChatSearchText(snippet.text, snippet.highlights)}
                      </LumenContentText>
                    </LumenFrame>
                  ))}
                {openingResultId === (row.resultId ?? row.sessionId) && (
                  <LumenContentText context="feedback.detail" className="hbar-chat-search-row-status" role="status">
                    {labels.opening(row.title)}
                  </LumenContentText>
                )}
                {openError?.sessionId === (row.resultId ?? row.sessionId) && (
                  <LumenContentText
                    context="feedback.detail"
                    tone="danger"
                    className="hbar-chat-search-row-error"
                    role="alert"
                  >
                    {openError.message}
                  </LumenContentText>
                )}
              </LumenFrame>
            </LumenButton>
          ))}
        </LumenFrame>
      </LumenFrame>
      {(truncated || (status === 'ready' && rows.length > 50)) && (
        <LumenContentText
          context="feedback.paragraph"
          tone="subtle"
          className="hbar-chat-search-truncated"
          role="status"
        >
          {labels.truncated}
        </LumenContentText>
      )}
      <LumenFrame as="footer" className="hbar-chat-search-footer" role="group" aria-label={labels.search} tabIndex={0}>
        <LumenFrame as="span">
          <LumenContentText context="shortcut.key">{labels.navigateKey}</LumenContentText>
          <LumenContentText context="inline.text">{labels.navigate}</LumenContentText>
        </LumenFrame>
        <LumenFrame as="span">
          <LumenContentText context="shortcut.key">{labels.selectKey}</LumenContentText>
          <LumenContentText context="inline.text">{labels.select}</LumenContentText>
        </LumenFrame>
        <LumenFrame as="span">
          <LumenContentText context="shortcut.key">{labels.closeKey}</LumenContentText>
          <LumenContentText context="inline.text">{labels.closeHint}</LumenContentText>
        </LumenFrame>
      </LumenFrame>
    </LumenFrame>
  )
}
