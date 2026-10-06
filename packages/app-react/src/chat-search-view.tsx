import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { LoaderCircle, Search, X } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenIconButton, LumenInput, LumenText } from '@lumen/app-ui'
import './chat-search-view.css'

export interface HbarChatSearchHighlight {
  readonly start: number
  readonly end: number
}

export interface HbarChatSearchSnippet {
  readonly messageId: string
  readonly role: 'user' | 'assistant'
  readonly text: string
  readonly highlights: readonly HbarChatSearchHighlight[]
}

export interface HbarChatSearchRow {
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
  readonly inputRef: RefObject<HTMLInputElement | null>
  readonly query: string
  readonly status: HbarChatSearchStatus
  readonly rows: readonly HbarChatSearchRow[]
  readonly selectedSessionId: string | null
  readonly truncated: boolean
  readonly error: string | null
  readonly openingSessionId?: string | null | undefined
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
    if (!row.sessionId || !row.workspaceId || seen.has(row.sessionId)) continue
    seen.add(row.sessionId)
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
      <LumenText as="span" role="mark" className="hbar-chat-search-highlight" key={`${start}:${end}`}>
        {text.slice(start, end)}
      </LumenText>,
    )
    cursor = end
  }
  if (cursor < text.length) segments.push(text.slice(cursor))
  return segments
}

export function HbarChatSearchView({
  inputRef,
  query,
  status,
  rows,
  selectedSessionId,
  truncated,
  error,
  openingSessionId,
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
  const selectedIndex = visible.findIndex((row) => row.sessionId === selectedSessionId)
  const selected = selectedIndex >= 0 ? visible[selectedIndex] : undefined
  useEffect(() => {
    if (selectedIndex < 0) return
    listRef.current?.children.item(selectedIndex)?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, selectedSessionId])
  const pending = openingSessionId != null
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
                ? labels.noRecent
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
              onOpen(selected.sessionId, selected.workspaceId)
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
      <LumenFrame className="hbar-chat-search-pane">
        {status === 'recent' && visible.length > 0 && (
          <LumenText as="p" className="hbar-chat-search-recent">
            {labels.recent}
          </LumenText>
        )}
        {statusText && (
          <LumenFrame className="hbar-chat-search-feedback" role={status === 'error' ? 'alert' : 'status'}>
            <LumenText as="p">{statusText}</LumenText>
            {(status === 'error' || status === 'disconnected' || status === 'indexing') && (
              <LumenButton type="button" variant="text" indicator="none" onClick={onRetry}>
                {labels.retry}
              </LumenButton>
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
              key={row.sessionId}
              id={`${listId}-row-${index}`}
              type="button"
              variant="text"
              indicator="none"
              indicatorState={selectedIndex === index ? 'selected' : 'idle'}
              role="option"
              className="hbar-chat-search-row"
              aria-label={labels.openSession(row.title, row.workspaceName)}
              aria-selected={selectedIndex === index}
              data-session-id={row.sessionId}
              disabled={pending}
              onMouseEnter={() => onSelect(row.sessionId)}
              onFocus={() => onSelect(row.sessionId)}
              onClick={() => onOpen(row.sessionId, row.workspaceId)}
            >
              <LumenText as="span" className="hbar-chat-search-row-heading">
                <LumenText as="span" className="hbar-chat-search-row-title" title={row.title}>
                  {row.title}
                </LumenText>
                <LumenText
                  as="time"
                  dateTime={
                    Number.isFinite(row.updatedAt) && Number.isFinite(new Date(row.updatedAt).getTime())
                      ? new Date(row.updatedAt).toISOString()
                      : undefined
                  }
                  title={labels.time(row.updatedAt)}
                >
                  {labels.time(row.updatedAt)}
                </LumenText>
              </LumenText>
              <LumenText as="span" className="hbar-chat-search-row-context">
                <LumenText as="span" title={row.workspaceName}>
                  {row.workspaceName}
                </LumenText>
                {status !== 'recent' && (
                  <LumenText as="span">{labels.matches(row.matchCount, row.matchCountCapped)}</LumenText>
                )}
              </LumenText>
              {status !== 'recent' &&
                row.snippets.slice(0, 3).map((snippet) => (
                  <LumenText as="span" key={snippet.messageId} className="hbar-chat-search-snippet">
                    <LumenText as="span" className="hbar-chat-search-snippet-role" title={labels.role(snippet.role)}>
                      {labels.role(snippet.role)}
                    </LumenText>
                    <LumenText as="span" className="hbar-chat-search-snippet-text" title={snippet.text}>
                      {highlightedChatSearchText(snippet.text, snippet.highlights)}
                    </LumenText>
                  </LumenText>
                ))}
              {openingSessionId === row.sessionId && (
                <LumenText as="span" className="hbar-chat-search-row-status" role="status">
                  {labels.opening(row.title)}
                </LumenText>
              )}
              {openError?.sessionId === row.sessionId && (
                <LumenText as="span" className="hbar-chat-search-row-error" role="alert">
                  {openError.message}
                </LumenText>
              )}
            </LumenButton>
          ))}
        </LumenFrame>
      </LumenFrame>
      {(truncated || (status === 'ready' && rows.length > 50)) && (
        <LumenText as="p" className="hbar-chat-search-truncated" role="status">
          {labels.truncated}
        </LumenText>
      )}
      <LumenFrame as="footer" className="hbar-chat-search-footer">
        <LumenText as="span">
          <LumenText as="kbd">{labels.navigateKey}</LumenText> {labels.navigate}
        </LumenText>
        <LumenText as="span">
          <LumenText as="kbd">{labels.selectKey}</LumenText> {labels.select}
        </LumenText>
        <LumenText as="span">
          <LumenText as="kbd">{labels.closeKey}</LumenText> {labels.closeHint}
        </LumenText>
      </LumenFrame>
    </LumenFrame>
  )
}
