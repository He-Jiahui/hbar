import { useState } from 'react'
import { FileDiff, Folder, RefreshCw } from 'lucide-react'
import {
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenInput,
  LumenText,
} from '@lumen/app-ui'
import { filteredFileChanges, FILE_CHANGES_PAGE_SIZE, type FileWorkspaceEntryState } from '@hbar/app-runtime'

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
  onRefresh,
  onFilter,
  onPage,
  onOpen,
}: {
  readonly changes: Changes
  readonly labels: HbarFileChangesLabels
  readonly connected: boolean
  readonly onRefresh: () => void
  readonly onFilter: (filter: string) => void
  readonly onPage: (page: number) => void
  readonly onOpen: (path: string) => void
}) {
  const filtered = filteredFileChanges(changes)
  const start = changes.page * FILE_CHANGES_PAGE_SIZE
  const items = filtered.slice(start, start + FILE_CHANGES_PAGE_SIZE)
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
      {changes.status === 'ready' && !changes.root && <LumenText as="p">{labels.notRepository}</LumenText>}
      {changes.status === 'ready' && changes.root && items.length === 0 && (
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

const DIFF_LINES_PER_PAGE = 400
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
}: {
  readonly diff: Diff
  readonly change: Change | undefined
  readonly labels: HbarFileChangesLabels
  readonly connected: boolean
  readonly onOpen: (cached: boolean) => void
  readonly onFile: () => void
}) {
  const [requestedPage, setPage] = useState(0)
  const lines = diff.text.split('\n')
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(lines.length / DIFF_LINES_PER_PAGE) - 1))
  const start = page * DIFF_LINES_PER_PAGE
  return (
    <LumenFrame className="hbar-file-diff">
      <LumenFrame className="hbar-file-diff-toolbar">
        <LumenText as="span" className="hbar-file-diff-path" title={diff.path}>
          {diff.path}
        </LumenText>
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
      </LumenFrame>
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
          <LumenButton disabled={!connected} onClick={() => onOpen(diff.cached)}>
            {labels.refresh}
          </LumenButton>
        </LumenFrame>
      )}
      {diff.truncated && (
        <LumenText as="p" role="status">
          {labels.truncated}
        </LumenText>
      )}
      {diff.status === 'ready' &&
        (diff.text ? (
          <LumenText
            as="pre"
            className="hbar-file-diff-content"
            aria-label={labels.diffContent(diff.path)}
            tabIndex={0}
          >
            {lines.slice(start, start + DIFF_LINES_PER_PAGE).map((line, index) => (
              <LumenText as="span" data-kind={lineKind(line)} key={start + index}>
                {line || '\n'}
              </LumenText>
            ))}
          </LumenText>
        ) : (
          <LumenText as="p">{labels.noDiff}</LumenText>
        ))}
      {diff.status === 'ready' && lines.length > DIFF_LINES_PER_PAGE && (
        <LumenFrame className="hbar-file-changes-pagination">
          <LumenText as="span">
            {labels.linePage(start + 1, Math.min(start + DIFF_LINES_PER_PAGE, lines.length), lines.length)}
          </LumenText>
          <LumenButton disabled={page === 0} onClick={() => setPage(page - 1)}>
            {labels.previousLines}
          </LumenButton>
          <LumenButton disabled={start + DIFF_LINES_PER_PAGE >= lines.length} onClick={() => setPage(page + 1)}>
            {labels.nextLines}
          </LumenButton>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
