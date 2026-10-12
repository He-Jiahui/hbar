import { useEffect, useId } from 'react'
import { ChevronDown, ChevronUp, FileDiff, Undo2 } from 'lucide-react'
import {
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenContentText,
  LumenFrame,
  LumenIcon,
} from '@lumen/app-ui'
import type { RunFileChangesSummary, RunFileChangeDiff } from '@hbar/contracts/run-file-changes'
import { runFileChangeReviewKey, EMPTY_FILE_CHANGE_REVIEW, type RunFileChangeReview } from '@hbar/app-runtime'
import { createMessageScope } from './messages'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarRunFileChangeRendererSlot, type HbarRunFileChangeRenderer } from './run-file-change-renderer'
import './run-file-changes.css'

/** Three-file preview; expanded files are cursor-paged in groups of 50, differences in groups of 200 lines. */
export interface HbarRunFileChangesLabels {
  readonly edited: (count: number) => string
  readonly added: (lines: number | null) => string
  readonly removed: (lines: number | null) => string
  readonly delta: (added: number | null, removed: number | null) => string
  readonly undo: string
  readonly undoing: string
  readonly undone: string
  readonly undoUnavailable: string
  readonly view: string
  readonly hideDiff: string
  readonly more: (count: number) => string
  readonly less: string
  readonly loading: string
  readonly incomplete: string
  readonly retry: string
  readonly error: (code: string, action: 'files' | 'diff' | 'undo' | null) => string
  readonly openFile: (path: string) => string
  readonly fileKind: (kind: 'created' | 'modified' | 'deleted') => string
  readonly previousFiles: string
  readonly nextFiles: string
  readonly filePage: (from: number, to: number, total: number) => string
  readonly diff: (path: string) => string
  readonly diffCaption: string
  readonly noTextDiff: string
  readonly previousLines: string
  readonly nextLines: string
  readonly linePage: (from: number, to: number, total: number) => string
  readonly lineNumber: (value: number | null) => string
  readonly linePrefix: (kind: RunFileChangeDiff['items'][number]['kind']) => string
}

const { Provider: RunFileChangesMessagesProvider, useMessages: useRunFileChangesMessages } =
  createMessageScope<HbarRunFileChangesLabels>()

function RunFileChangesView({
  summary,
  review = EMPTY_FILE_CHANGE_REVIEW,
  disabled = false,
  onFiles,
  onCollapse,
  onDiff,
  onCloseDiff,
  onUndo,
  onRetry,
  renderer,
}: {
  readonly summary: RunFileChangesSummary
  readonly review?: RunFileChangeReview
  readonly disabled?: boolean
  readonly onFiles: (direction: 'expand' | 'next' | 'previous') => void
  readonly onCollapse: () => void
  readonly onDiff: (path: string, offset?: number) => void
  readonly onCloseDiff: () => void
  readonly onUndo: () => void
  readonly onRetry: () => void
  readonly renderer?: HbarRunFileChangeRenderer | undefined
}) {
  const { t } = useRunFileChangesMessages()
  const listId = useId(),
    diffId = useId()
  if (summary.totalFiles === 0) return null
  const receipt = review.page?.summary?.undoneAt ? review.page.summary : summary
  const busy = review.action !== null
  const unavailable = disabled || busy
  const files = review.expanded && review.page ? review.page.items : summary.preview
  const diff = review.diff
  return (
    <LumenFrame
      className="hbar-run-file-changes"
      role="region"
      aria-label={t('edited')(receipt.totalFiles)}
      data-run-file-change-summary
      data-undone={receipt.undoneAt !== null}
      aria-busy={busy}
    >
      <LumenFrame className="hbar-run-file-change-header">
        <LumenFrame className="hbar-run-file-change-icon">
          <LumenIcon icon={FileDiff} tier="xl" />
        </LumenFrame>
        <LumenFrame className="hbar-run-file-change-heading">
          <LumenContentText context="record.title">{t('edited')(receipt.totalFiles)}</LumenContentText>
          <LumenFrame
            className="hbar-run-file-change-counts"
            aria-label={t('delta')(receipt.addedLines, receipt.removedLines)}
          >
            <LumenContentText context="metadata" data-delta="added">
              {t('added')(receipt.addedLines)}
            </LumenContentText>
            <LumenContentText context="metadata" data-delta="removed">
              {t('removed')(receipt.removedLines)}
            </LumenContentText>
          </LumenFrame>
        </LumenFrame>
        <LumenFrame className="hbar-run-file-change-actions">
          {receipt.undoneAt !== null ? (
            <LumenContentText context="record.description" role="status">
              {t('undone')}
            </LumenContentText>
          ) : (
            <LumenButton
              type="button"
              variant="text"
              size="s"
              indicator="none"
              disabled={unavailable || !receipt.canUndo}
              title={receipt.canUndo ? t('undo') : t('undoUnavailable')}
              onClick={onUndo}
            >
              {review.action === 'undo' ? t('undoing') : t('undo')}
              <LumenIcon icon={Undo2} tier="sm" />
            </LumenButton>
          )}
          <LumenButton
            type="button"
            variant="outlined"
            size="s"
            indicator="none"
            disabled={unavailable || files.length === 0}
            aria-expanded={review.selectedPath !== null}
            aria-controls={diffId}
            onClick={() => (review.selectedPath ? onCloseDiff() : files[0] && onDiff(files[0].path))}
          >
            {review.selectedPath ? t('hideDiff') : t('view')}
          </LumenButton>
        </LumenFrame>
      </LumenFrame>
      <LumenCollection id={listId} className="hbar-run-file-change-list">
        {files.map((file) => {
          const index = file.path.lastIndexOf('/')
          return (
            <LumenCollectionItem key={file.path} className="hbar-run-file-change-row">
              <LumenButton
                type="button"
                variant="text"
                indicator="none"
                className="hbar-run-file-change-path"
                title={file.path}
                aria-label={t('openFile')(file.path)}
                disabled={unavailable}
                aria-pressed={review.selectedPath === file.path}
                onClick={() => onDiff(file.path)}
              >
                <LumenContentText context="code.inline" className="hbar-run-file-change-path-text">
                  <LumenFrame as="span" className="hbar-run-file-change-prefix">
                    {file.path.slice(0, index + 1)}
                  </LumenFrame>
                  {file.path.slice(index + 1)}
                </LumenContentText>
              </LumenButton>
              <LumenContentText
                context="metadata"
                className="hbar-run-file-change-counts"
                title={t('fileKind')(file.kind)}
                aria-label={t('delta')(file.addedLines, file.removedLines)}
              >
                <LumenContentText context="metadata" data-delta="added">
                  {t('added')(file.addedLines)}
                </LumenContentText>
                <LumenContentText context="metadata" data-delta="removed">
                  {t('removed')(file.removedLines)}
                </LumenContentText>
              </LumenContentText>
            </LumenCollectionItem>
          )
        })}
      </LumenCollection>
      {summary.totalFiles > summary.preview.length && (
        <LumenFrame className="hbar-run-file-change-footer">
          <LumenButton
            type="button"
            variant="text"
            size="s"
            indicator="none"
            disabled={unavailable}
            aria-expanded={review.expanded}
            aria-controls={listId}
            onClick={() => (review.expanded ? onCollapse() : onFiles('expand'))}
          >
            {review.expanded ? t('less') : t('more')(summary.totalFiles - summary.preview.length)}
            <LumenIcon icon={review.expanded ? ChevronUp : ChevronDown} tier="sm" />
          </LumenButton>
          {review.expanded && review.page && (
            <LumenFrame className="hbar-run-file-change-pagination">
              <LumenContentText context="record.description">
                {t('filePage')(
                  review.pageIndex * 50 + 1,
                  review.pageIndex * 50 + review.page.items.length,
                  summary.totalFiles,
                )}
              </LumenContentText>
              <LumenButton
                type="button"
                variant="text"
                size="s"
                indicator="none"
                disabled={unavailable || review.pageIndex === 0}
                onClick={() => onFiles('previous')}
              >
                {t('previousFiles')}
              </LumenButton>
              <LumenButton
                type="button"
                variant="text"
                size="s"
                indicator="none"
                disabled={unavailable || !review.page.nextCursor}
                onClick={() => onFiles('next')}
              >
                {t('nextFiles')}
              </LumenButton>
            </LumenFrame>
          )}
        </LumenFrame>
      )}
      {receipt.incomplete && (
        <LumenContentText context="feedback.message" className="hbar-run-file-change-feedback">
          {t('incomplete')}
        </LumenContentText>
      )}
      {busy && (
        <LumenContentText context="feedback.message" className="hbar-run-file-change-feedback" role="status">
          {review.action === 'undo' ? t('undoing') : t('loading')}
        </LumenContentText>
      )}
      {review.error && (
        <LumenFrame className="hbar-run-file-change-feedback" role="alert">
          <LumenContentText context="feedback.message">
            {t('error')(review.error, review.failedAction)}
          </LumenContentText>
          <LumenButton type="button" variant="text" size="s" indicator="none" disabled={unavailable} onClick={onRetry}>
            {t('retry')}
          </LumenButton>
        </LumenFrame>
      )}
      <LumenFrame id={diffId} className="hbar-run-file-change-review" hidden={review.selectedPath === null}>
        {review.selectedPath && (
          <LumenContentText context="record.title" className="hbar-run-file-change-review-title">
            {review.selectedPath}
          </LumenContentText>
        )}
        {diff && (
          <>
            <LumenContentText context="record.description">{t('diffCaption')}</LumenContentText>
            {diff.items.length === 0 && (
              <LumenContentText context="record.description">{t('noTextDiff')}</LumenContentText>
            )}
            <LumenFrame
              className="hbar-run-file-change-diff"
              role="region"
              aria-label={t('diff')(diff.path)}
              tabIndex={0}
            >
              <HbarRunFileChangeRendererSlot
                renderer={renderer}
                page={diff}
                fallback={diff.items.map((line, index) => (
                  <LumenFrame
                    key={diff.offset + index}
                    className="hbar-run-file-change-diff-line"
                    data-kind={line.kind}
                  >
                    <LumenContentText
                      context="metadata"
                      className="hbar-run-file-change-line-number"
                      aria-hidden="true"
                    >
                      {t('lineNumber')(line.beforeLine)}
                    </LumenContentText>
                    <LumenContentText
                      context="metadata"
                      className="hbar-run-file-change-line-number"
                      aria-hidden="true"
                    >
                      {t('lineNumber')(line.afterLine)}
                    </LumenContentText>
                    <LumenContentText context="code.inline">
                      {t('linePrefix')(line.kind)}
                      {line.text}
                    </LumenContentText>
                  </LumenFrame>
                ))}
              />
            </LumenFrame>
            {diff.totalLines > 200 && (
              <LumenFrame className="hbar-run-file-change-pagination">
                <LumenContentText context="record.description">
                  {t('linePage')(diff.offset + 1, diff.offset + diff.items.length, diff.totalLines)}
                </LumenContentText>
                <LumenButton
                  type="button"
                  variant="text"
                  size="s"
                  indicator="none"
                  disabled={unavailable || diff.offset === 0}
                  onClick={() => onDiff(diff.path, Math.max(0, diff.offset - 200))}
                >
                  {t('previousLines')}
                </LumenButton>
                <LumenButton
                  type="button"
                  variant="text"
                  size="s"
                  indicator="none"
                  disabled={unavailable || !diff.hasMore}
                  onClick={() => onDiff(diff.path, diff.offset + diff.items.length)}
                >
                  {t('nextLines')}
                </LumenButton>
              </LumenFrame>
            )}
          </>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}

/** The legacy labels prop remains the host adapter for existing SDK callers. */
export function HbarRunFileChanges({
  labels,
  ...props
}: {
  readonly summary: RunFileChangesSummary
  readonly review?: RunFileChangeReview
  readonly labels: HbarRunFileChangesLabels
  readonly disabled?: boolean
  readonly onFiles: (direction: 'expand' | 'next' | 'previous') => void
  readonly onCollapse: () => void
  readonly onDiff: (path: string, offset?: number) => void
  readonly onCloseDiff: () => void
  readonly onUndo: () => void
  readonly onRetry: () => void
  readonly renderer?: HbarRunFileChangeRenderer | undefined
}) {
  return (
    <RunFileChangesMessagesProvider messages={labels}>
      <RunFileChangesView {...props} />
    </RunFileChangesMessagesProvider>
  )
}

export function HbarRunFileChangesConnected({
  sessionId,
  runId,
  summary,
  labels,
  connected,
  renderer,
}: {
  readonly sessionId: string
  readonly runId: string
  readonly summary: RunFileChangesSummary
  readonly labels: HbarRunFileChangesLabels
  readonly connected: boolean
  readonly renderer?: HbarRunFileChangeRenderer | undefined
}) {
  const runtime = useHbarRuntime(),
    state = useHbarRuntimeState(runtime.state.runFileChanges)
  const key = runFileChangeReviewKey(sessionId, runId)
  const review =
    state.entries[key] ??
    (state.rejected?.key === key
      ? { ...EMPTY_FILE_CHANGE_REVIEW, error: 'BUSY', failedAction: state.rejected.action }
      : EMPTY_FILE_CHANGE_REVIEW)
  useEffect(() => () => runtime.runFileChanges.release(sessionId, runId), [runtime, sessionId, runId])
  const undo = () => {
    void runtime.runFileChanges.undo(sessionId, runId)
  }
  const files = (direction: 'expand' | 'next' | 'previous') => {
    void runtime.runFileChanges.readFiles(sessionId, runId, direction)
  }
  const diff = (path: string, offset = 0) => {
    void runtime.runFileChanges.readDiff(sessionId, runId, path, offset)
  }
  return (
    <HbarRunFileChanges
      summary={summary}
      review={review}
      labels={labels}
      renderer={renderer}
      disabled={!connected || !state.available}
      onFiles={files}
      onDiff={diff}
      onUndo={undo}
      onCollapse={() => runtime.runFileChanges.collapse(sessionId, runId)}
      onCloseDiff={() => runtime.runFileChanges.closeDiff(sessionId, runId)}
      onRetry={() => {
        if (review.failedAction === 'undo') undo()
        else if (review.failedAction === 'diff' && review.selectedPath) diff(review.selectedPath)
        else files('expand')
      }}
    />
  )
}
