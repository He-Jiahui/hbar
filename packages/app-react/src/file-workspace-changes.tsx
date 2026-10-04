import { Fragment, useRef, useState, type ReactNode } from 'react'
import { FileDiff, Folder, MessageCircle, RefreshCw } from 'lucide-react'
import {
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenInput,
  LumenText,
} from '@lumen/app-ui'
import {
  filteredFileChanges,
  FILE_CHANGES_PAGE_SIZE,
  projectWorkspaceDiffRows,
  selectWorkspaceDiffRange,
  type FileComposerContextSelection,
  type FileWorkspaceEntryState,
} from '@hbar/app-runtime'
import { clampFileDiffPage, FILE_DIFF_LINES_PER_PAGE, type FileDiffPagination } from './file-preview-pagination'
import { HbarFileCommentEditor, type HbarFileContextLabels } from './file-context-surfaces'

type Changes = FileWorkspaceEntryState['changes']
type Diff = NonNullable<FileWorkspaceEntryState['diff']>
type Change = Changes['items'][number]

export interface HbarFileChangesLabels {
  readonly mode: string
  readonly all: string
  readonly changed: string
  readonly filter: string
  readonly loading: string
  readonly refresh: string
  readonly noChanges: string
  readonly noMatches: string
  readonly notRepository: string
  readonly limit: string
  readonly previous: string
  readonly next: string
  readonly page: (from: number, to: number, total: number) => string
  readonly status: (index: string, worktree: string) => string
  readonly open: (path: string) => string
  readonly openFolder: (path: string) => string
  readonly renamedFrom: (path: string) => string
  readonly error: (code: string) => string
  readonly workingTree: string
  readonly staged: string
  readonly readOnlyDiff: string
  readonly noDiff: string
  readonly truncated: string
  readonly diffContent: (path: string) => string
  readonly previousLines: string
  readonly nextLines: string
  readonly linePage: (from: number, to: number, total: number) => string
  readonly openFile: string
}

export function HbarFileChanges({
  changes,
  labels,
  connected,
  selectedPath,
  onRefresh,
  onFilter,
  onPage,
  onOpen,
}: {
  readonly changes: Changes
  readonly labels: HbarFileChangesLabels
  readonly connected: boolean
  readonly selectedPath?: string | null
  readonly onRefresh: () => void
  readonly onFilter: (filter: string) => void
  readonly onPage: (page: number) => void
  readonly onOpen: (path: string) => void
}) {
  const filtered = filteredFileChanges(changes)
  const start = changes.page * FILE_CHANGES_PAGE_SIZE
  const items = filtered.slice(start, start + FILE_CHANGES_PAGE_SIZE)
  const isRepository = changes.isRepository ?? Boolean(changes.root)
  const busy = changes.status === 'loading'
  return (
    <LumenFrame className="hbar-file-changes">
      <LumenFrame className="hbar-file-changes-controls">
        <LumenInput
          maxLength={4000}
          aria-label={labels.filter}
          placeholder={labels.filter}
          value={changes.filter}
          onChange={(event) => onFilter(event.currentTarget.value)}
        />
        <LumenButton
          type="button"
          size="s"
          variant="text"
          indicator="none"
          aria-label={labels.refresh}
          title={labels.refresh}
          disabled={!connected || busy}
          onClick={onRefresh}
        >
          <LumenIcon icon={RefreshCw} tier="sm" />
        </LumenButton>
      </LumenFrame>
      {busy && (
        <LumenText as="p" role="status">
          {labels.loading}
        </LumenText>
      )}
      {changes.error && (
        <LumenText as="p" role="alert">
          {labels.error(changes.error)}
        </LumenText>
      )}
      {changes.status === 'ready' && !isRepository && <LumenText as="p">{labels.notRepository}</LumenText>}
      {changes.status === 'ready' && isRepository && items.length === 0 && (
        <LumenText as="p">{changes.items.length === 0 ? labels.noChanges : labels.noMatches}</LumenText>
      )}
      {changes.limitReached && (
        <LumenText as="p" role="status">
          {labels.limit}
        </LumenText>
      )}
      <LumenCollection as="ul" className="hbar-file-changes-list" aria-label={labels.changed}>
        {items.map((item) => (
          <LumenCollectionItem as="li" key={item.path}>
            <LumenButton
              type="button"
              className="hbar-file-change"
              variant="text"
              indicator="none"
              disabled={!connected || busy || changes.status !== 'ready'}
              aria-label={item.directory ? labels.openFolder(item.path) : labels.open(item.path)}
              title={item.path}
              aria-current={selectedPath === item.path ? 'page' : undefined}
              onClick={() => onOpen(item.path)}
            >
              <LumenIcon icon={item.directory ? Folder : FileDiff} tier="sm" />
              <LumenFrame className="hbar-file-change-path">
                <LumenText as="span">{item.path}</LumenText>
                {item.originalPath && <LumenText as="small">{labels.renamedFrom(item.originalPath)}</LumenText>}
              </LumenFrame>
              <LumenText as="small" className="hbar-file-change-status">
                {labels.status(item.index, item.worktree)}
              </LumenText>
            </LumenButton>
          </LumenCollectionItem>
        ))}
      </LumenCollection>
      {filtered.length > FILE_CHANGES_PAGE_SIZE && (
        <LumenFrame className="hbar-file-changes-pagination">
          <LumenText as="span">
            {labels.page(start + 1, Math.min(start + FILE_CHANGES_PAGE_SIZE, filtered.length), filtered.length)}
          </LumenText>
          <LumenButton disabled={changes.page === 0} onClick={() => onPage(changes.page - 1)}>
            {labels.previous}
          </LumenButton>
          <LumenButton
            disabled={start + FILE_CHANGES_PAGE_SIZE >= filtered.length}
            onClick={() => onPage(changes.page + 1)}
          >
            {labels.next}
          </LumenButton>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}

const lineKind = (line: string) =>
  line.startsWith('@@')
    ? 'hunk'
    : line.startsWith('+') && !line.startsWith('+++')
      ? 'addition'
      : line.startsWith('-') && !line.startsWith('---')
        ? 'deletion'
        : 'context'

/** A bounded text diff, not a reconstructed file or editable source. Host truncation remains explicit. */
export function HbarFileDiff({
  diff,
  change,
  labels,
  connected,
  onOpen,
  onFile,
  addToChat,
  referenceHint,
  headerActions,
  onRefresh,
  pagination,
  context,
}: {
  readonly diff: Diff
  readonly change: Change | undefined
  readonly labels: HbarFileChangesLabels
  readonly connected: boolean
  readonly onOpen: (cached: boolean) => void
  readonly onFile: () => void
  readonly addToChat?:
    | {
        readonly label: string
        readonly disabled: boolean
        readonly onClick: () => void
        readonly feedback?: string | undefined
        readonly feedbackKind?: 'success' | 'error' | undefined
      }
    | undefined
  readonly referenceHint?: string | undefined
  readonly headerActions?: ReactNode
  readonly onRefresh?: (() => void) | undefined
  readonly pagination?: FileDiffPagination | undefined
  readonly context?:
    | {
        readonly labels: HbarFileContextLabels
        readonly disabled: boolean
        readonly onAdd: (selection: FileComposerContextSelection) => Promise<boolean>
        readonly captureCommentCompletion?: ((line: HTMLElement | null) => () => void) | undefined
      }
    | undefined
}) {
  const [requestedPage, setPage] = useState(0)
  const lines = diff.text.split('\n')
  const page = clampFileDiffPage(pagination?.page ?? requestedPage, lines.length)
  const changePage = pagination?.onChange ?? setPage
  const start = page * FILE_DIFF_LINES_PER_PAGE
  const rows = projectWorkspaceDiffRows(diff.text)
  const [review, setReview] = useState<{
    readonly text: string
    readonly cached: boolean
    readonly anchor: number
    readonly focus: number
    readonly note: string
  } | null>(null)
  const [incompatible, setIncompatible] = useState(false)
  const buttons = useRef(new Map<number, HTMLButtonElement>())
  const currentReview = review?.text === diff.text && review.cached === diff.cached ? review : null
  const range = currentReview ? selectWorkspaceDiffRange(rows, currentReview.anchor, currentReview.focus) : null
  const selected = new Set(range?.rowIndices)
  const closeReview = (restoreLine = true) => {
    const anchor = currentReview?.anchor
    setReview(null)
    setIncompatible(false)
    if (restoreLine && anchor !== undefined) requestAnimationFrame(() => buttons.current.get(anchor)?.focus())
  }
  const activate = (index: number, extend: boolean) => {
    const anchor = extend && currentReview ? currentReview.anchor : index
    const next = selectWorkspaceDiffRange(rows, anchor, index)
    setIncompatible(!next)
    setReview({
      text: diff.text,
      cached: diff.cached,
      anchor: next ? anchor : index,
      focus: index,
      note: extend && currentReview && next ? currentReview.note : '',
    })
  }
  const selectPage = (next: number) => {
    closeReview()
    changePage(next)
  }
  return (
    <LumenFrame className="hbar-file-diff">
      <LumenFrame className="hbar-file-diff-toolbar">
        <LumenFrame className="hbar-file-diff-heading">
          <LumenText as="span" className="hbar-file-diff-path" title={diff.path}>
            {diff.path}
          </LumenText>
          {headerActions}
        </LumenFrame>
        <LumenButton
          variant={diff.cached ? 'text' : 'outlined'}
          aria-pressed={!diff.cached}
          disabled={!connected || !change || diff.status === 'loading'}
          onClick={() => onOpen(false)}
        >
          {labels.workingTree}
        </LumenButton>
        <LumenButton
          variant={diff.cached ? 'outlined' : 'text'}
          aria-pressed={diff.cached}
          disabled={!connected || !change || diff.status === 'loading'}
          onClick={() => onOpen(true)}
        >
          {labels.staged}
        </LumenButton>
        <LumenButton disabled={!connected} onClick={onFile}>
          {labels.openFile}
        </LumenButton>
        {onRefresh && (
          <LumenButton
            variant="text"
            disabled={!connected || diff.status === 'loading'}
            onClick={onRefresh}
            aria-label={labels.refresh}
            title={labels.refresh}
          >
            <LumenIcon icon={RefreshCw} tier="sm" />
          </LumenButton>
        )}
        {addToChat && (
          <LumenButton
            className="hbar-file-add-to-chat"
            variant="text"
            disabled={addToChat.disabled}
            onClick={addToChat.onClick}
          >
            <LumenIcon icon={MessageCircle} tier="sm" />
            {addToChat.label}
          </LumenButton>
        )}
      </LumenFrame>
      {(addToChat?.feedback || referenceHint) && (
        <LumenText
          as="p"
          className="hbar-file-add-feedback"
          role={addToChat?.feedbackKind === 'error' ? 'alert' : 'status'}
        >
          {addToChat?.feedback ?? referenceHint}
        </LumenText>
      )}
      <LumenText as="small" className="hbar-file-diff-caption">
        {labels.readOnlyDiff}
      </LumenText>
      {diff.status === 'loading' && (
        <LumenText as="p" role="status">
          {labels.loading}
        </LumenText>
      )}
      {diff.status === 'error' && (
        <LumenFrame className="hbar-file-diff-feedback">
          <LumenText as="p" role="alert">
            {labels.error(diff.error ?? 'EXECUTION_FAILED')}
          </LumenText>
          <LumenButton disabled={!connected} onClick={onRefresh ?? (() => onOpen(diff.cached))}>
            {labels.refresh}
          </LumenButton>
        </LumenFrame>
      )}
      {diff.truncated && (
        <LumenText as="p" role="status">
          {labels.truncated}
        </LumenText>
      )}
      {(diff.status === 'ready' || Boolean(diff.text)) &&
        (diff.text ? (
          <LumenFrame className="hbar-file-diff-content" aria-label={labels.diffContent(diff.path)} tabIndex={0}>
            {rows.slice(start, start + FILE_DIFF_LINES_PER_PAGE).map((row) => (
              <Fragment key={row.index}>
                <LumenFrame
                  className="hbar-file-diff-row"
                  data-kind={lineKind(row.raw)}
                  data-selected={selected.has(row.index)}
                >
                  {context && row.side ? (
                    <LumenButton
                      ref={(element) => {
                        if (element) buttons.current.set(row.index, element)
                        else buttons.current.delete(row.index)
                      }}
                      className="hbar-file-line-control"
                      variant="text"
                      indicator="none"
                      aria-label={context.labels.commentLine(
                        diff.path,
                        (row.side === 'old' ? row.oldLine : row.newLine)!,
                        row.side,
                      )}
                      aria-pressed={selected.has(row.index)}
                      disabled={context.disabled || !row.text.trim()}
                      onClick={(event) => activate(row.index, event.shiftKey)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          closeReview()
                          return
                        }
                        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
                        event.preventDefault()
                        const step = event.key === 'ArrowDown' ? 1 : -1
                        for (
                          let index = row.index + step;
                          index >= start && index < Math.min(start + FILE_DIFF_LINES_PER_PAGE, rows.length);
                          index += step
                        ) {
                          if (!rows[index]?.side) continue
                          if (event.shiftKey) activate(index, true)
                          buttons.current.get(index)?.focus()
                          break
                        }
                      }}
                    >
                      {row.side === 'old' ? row.oldLine : row.newLine}
                    </LumenButton>
                  ) : (
                    <LumenText as="span" />
                  )}
                  <LumenText as="span" data-diff-code={row.index}>
                    {row.raw || '\u200b'}
                  </LumenText>
                </LumenFrame>
                {range?.rowEnd === row.index && context && (
                  <HbarFileCommentEditor
                    key={`${diff.cached}:${range.rowStart}:${range.rowEnd}`}
                    labels={context.labels}
                    rangeLabel={context.labels.range(range.lineStart, range.lineEnd, range.diffSide)}
                    disabled={context.disabled}
                    note={currentReview?.note ?? ''}
                    onNote={(note) => setReview((current) => (current ? { ...current, note } : null))}
                    onCancel={() => closeReview()}
                    onSubmit={async (note) => {
                      const completed = context.captureCommentCompletion?.(
                        buttons.current.get(currentReview?.anchor ?? range.rowStart) ?? null,
                      )
                      const added = await context.onAdd({
                        kind: 'diff-comment',
                        cached: diff.cached,
                        expectedText: diff.text,
                        rowStart: range.rowStart,
                        rowEnd: range.rowEnd,
                        diffSide: range.diffSide,
                        note,
                      })
                      if (added) {
                        closeReview(!completed)
                        completed?.()
                      }
                      return added
                    }}
                  />
                )}
              </Fragment>
            ))}
          </LumenFrame>
        ) : (
          <LumenText as="p">{labels.noDiff}</LumenText>
        ))}
      {incompatible && context && (
        <LumenText as="p" role="status">
          {context.labels.incompatible}
        </LumenText>
      )}
      {lines.length > FILE_DIFF_LINES_PER_PAGE && (
        <LumenFrame className="hbar-file-changes-pagination">
          <LumenText as="span">
            {labels.linePage(start + 1, Math.min(start + FILE_DIFF_LINES_PER_PAGE, lines.length), lines.length)}
          </LumenText>
          <LumenButton disabled={page === 0} onClick={() => selectPage(page - 1)}>
            {labels.previousLines}
          </LumenButton>
          <LumenButton disabled={start + FILE_DIFF_LINES_PER_PAGE >= lines.length} onClick={() => selectPage(page + 1)}>
            {labels.nextLines}
          </LumenButton>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
