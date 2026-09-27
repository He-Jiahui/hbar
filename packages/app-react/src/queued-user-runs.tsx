import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import { QUEUED_USER_RUNS_PAGE_SIZE, type QueuedUserRunsState } from '@hbar/app-runtime'
import { Trash2 } from 'lucide-react'
import './queued-user-runs.css'

export interface HbarQueuedUserRunsLabels {
  readonly queued: string
  readonly loading: string
  readonly disconnected: string
  readonly error: (code: string) => string
  readonly retry: string
  readonly previous: string
  readonly next: string
  readonly page: (current: number, total: number) => string
  readonly attachments: (count: number) => string
  readonly ellipsis: string
  readonly remove: (position: number) => string
  readonly removing: string
  readonly removeUnknown: string
  readonly removeFailed: (code: string) => string
  readonly retryRemoval: string
  readonly dismissRemoval: string
}

/** Read-only until Host offers queued-only CAS actions; status comes from its durable queue. */
export function HbarQueuedUserRuns({
  state,
  sessionId,
  connected,
  labels,
  onRefresh,
  onPrevious,
  onNext,
  onRemove,
  onRetryRemoval,
  onDismissRemoval,
}: {
  readonly state: QueuedUserRunsState
  readonly sessionId: string
  readonly connected: boolean
  readonly labels: HbarQueuedUserRunsLabels
  readonly onRefresh: () => void
  readonly onPrevious: () => void
  readonly onNext: () => void
  readonly onRemove: (operationId: string, expectedRevision: number) => void
  readonly onRetryRemoval: (operationId: string) => void
  readonly onDismissRemoval: () => void
}) {
  const current = state.sessionId === sessionId ? state : null
  if (!connected)
    return (
      <LumenText as="p" className="hbar-queued-user-runs-notice" role="status">
        {labels.disconnected}
      </LumenText>
    )
  if (!current || current.status === 'idle') return null
  if (current.status === 'loading')
    return (
      <LumenText as="p" className="hbar-queued-user-runs-notice" role="status">
        {labels.loading}
      </LumenText>
    )
  if (current.status === 'error')
    return (
      <LumenFrame className="hbar-queued-user-runs-notice" role="alert">
        <LumenText as="span">{labels.error(current.error ?? 'EXECUTION_FAILED')}</LumenText>
        <LumenButton size="s" variant="text" onClick={onRefresh}>
          {labels.retry}
        </LumenButton>
      </LumenFrame>
    )
  if (current.totalQueued === 0 && !current.removal) return null
  const totalPages = Math.ceil(current.totalQueued / QUEUED_USER_RUNS_PAGE_SIZE)
  const removal = current.removal
  return (
    <LumenFrame className="hbar-queued-user-runs" role="group" aria-label={labels.queued}>
      <LumenFrame className="hbar-queued-user-runs-list">
        {current.items.map((item, index) => (
          <LumenFrame className="hbar-queued-user-run" key={item.operationId}>
            <LumenText as="span" className="hbar-queued-user-run-status">
              {removal?.operationId === item.operationId && removal.status === 'submitting'
                ? labels.removing
                : labels.queued}
            </LumenText>
            <LumenText as="span" className="hbar-queued-user-run-text" title={item.textPreview}>
              {item.textPreview || labels.attachments(item.attachmentCount)}
              {item.truncated ? labels.ellipsis : null}
            </LumenText>
            {item.attachmentCount > 0 && item.textPreview && (
              <LumenText as="span" className="hbar-queued-user-run-attachments">
                {labels.attachments(item.attachmentCount)}
              </LumenText>
            )}
            <LumenButton
              size="s"
              variant="text"
              indicator="none"
              className="hbar-queued-user-run-remove"
              aria-label={labels.remove(current.pageIndex * QUEUED_USER_RUNS_PAGE_SIZE + index + 1)}
              title={labels.remove(current.pageIndex * QUEUED_USER_RUNS_PAGE_SIZE + index + 1)}
              disabled={Boolean(removal)}
              onClick={() => onRemove(item.operationId, item.revision)}
            >
              <LumenIcon icon={Trash2} tier="sm" />
            </LumenButton>
          </LumenFrame>
        ))}
      </LumenFrame>
      {removal && removal.status !== 'submitting' && (
        <LumenFrame className="hbar-queued-user-runs-feedback" role="alert">
          <LumenText as="span">
            {removal.status === 'unknown'
              ? labels.removeUnknown
              : labels.removeFailed(removal.error ?? 'EXECUTION_FAILED')}
          </LumenText>
          {removal.status === 'unknown' && (
            <LumenButton size="s" variant="text" onClick={() => onRetryRemoval(removal.operationId)}>
              {labels.retryRemoval}
            </LumenButton>
          )}
          {removal.status === 'failed' && (
            <LumenButton size="s" variant="text" onClick={onRefresh}>
              {labels.retry}
            </LumenButton>
          )}
          <LumenButton size="s" variant="text" onClick={onDismissRemoval}>
            {labels.dismissRemoval}
          </LumenButton>
        </LumenFrame>
      )}
      {(current.previousCursors.length > 0 || current.nextCursor) && (
        <LumenFrame className="hbar-queued-user-runs-pagination">
          <LumenButton size="s" variant="text" disabled={current.previousCursors.length === 0} onClick={onPrevious}>
            {labels.previous}
          </LumenButton>
          <LumenText as="span" aria-live="polite">
            {labels.page(current.pageIndex + 1, totalPages)}
          </LumenText>
          <LumenButton size="s" variant="text" disabled={!current.nextCursor} onClick={onNext}>
            {labels.next}
          </LumenButton>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
