import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import { QUEUED_USER_RUNS_PAGE_SIZE, type QueuedUserRunsState } from '@hbar/app-runtime'
import { Pencil, Trash2 } from 'lucide-react'
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
  readonly edit: (position: number) => string
  readonly editInput: (position: number) => string
  readonly editLoading: string
  readonly editSaving: string
  readonly saveEdit: string
  readonly cancelEdit: string
  readonly editUnknown: string
  readonly editFailed: (code: string) => string
  readonly retryEdit: string
  readonly remove: (position: number) => string
  readonly removing: string
  readonly removeUnknown: string
  readonly removeFailed: (code: string) => string
  readonly retryRemoval: string
  readonly dismissRemoval: string
}

/** Host-confirmed, paged queue with target-bound edit and removal actions. */
export function HbarQueuedUserRuns({
  state,
  sessionId,
  connected,
  labels,
  onRefresh,
  onPrevious,
  onNext,
  onStartEdit,
  onEditText,
  onSaveEdit,
  onRetryEdit,
  onCancelEdit,
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
  readonly onStartEdit: (operationId: string) => void
  readonly onEditText: (operationId: string, text: string) => void
  readonly onSaveEdit: (operationId: string) => void
  readonly onRetryEdit: (operationId: string) => void
  readonly onCancelEdit: () => void
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
  if (current.totalQueued === 0 && !current.removal && !current.editing) return null
  const totalPages = Math.ceil(current.totalQueued / QUEUED_USER_RUNS_PAGE_SIZE)
  const removal = current.removal
  const editing = current.editing
  return (
    <LumenFrame className="hbar-queued-user-runs" role="group" aria-label={labels.queued}>
      <LumenFrame className="hbar-queued-user-runs-list">
        {current.items.map((item, index) => {
          const edit = editing?.operationId === item.operationId ? editing : null
          const position = current.pageIndex * QUEUED_USER_RUNS_PAGE_SIZE + index + 1
          return (
            <LumenFrame
              className={`hbar-queued-user-run${edit ? ' hbar-queued-user-run-editing' : ''}`}
              key={item.operationId}
            >
              <LumenText as="span" className="hbar-queued-user-run-status">
                {removal?.operationId === item.operationId && removal.status === 'submitting'
                  ? labels.removing
                  : labels.queued}
              </LumenText>
              {edit ? (
                <>
                  {edit.status === 'loading' ? (
                    <LumenText as="span" className="hbar-queued-user-run-edit-loading" role="status">
                      {labels.editLoading}
                    </LumenText>
                  ) : (
                    <input
                      className="hbar-queued-user-run-edit-input"
                      type="text"
                      aria-label={labels.editInput(position)}
                      value={edit.text}
                      maxLength={200_000}
                      autoFocus
                      disabled={edit.status !== 'ready'}
                      onChange={(event) => onEditText(item.operationId, event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          event.stopPropagation()
                          if (edit.status !== 'submitting') onCancelEdit()
                        } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                          event.preventDefault()
                          event.stopPropagation()
                          if (edit.status === 'ready' && edit.revision !== null && edit.text.trim())
                            onSaveEdit(item.operationId)
                        }
                      }}
                    />
                  )}
                  <LumenFrame className="hbar-queued-user-run-edit-actions">
                    <LumenButton
                      size="s"
                      variant="text"
                      disabled={edit.status !== 'ready' || edit.revision === null || !edit.text.trim()}
                      onClick={() => onSaveEdit(item.operationId)}
                    >
                      {edit.status === 'submitting' ? labels.editSaving : labels.saveEdit}
                    </LumenButton>
                    <LumenButton size="s" variant="text" disabled={edit.status === 'submitting'} onClick={onCancelEdit}>
                      {labels.cancelEdit}
                    </LumenButton>
                  </LumenFrame>
                  {(edit.status === 'failed' || edit.status === 'unknown') && (
                    <LumenFrame className="hbar-queued-user-run-edit-feedback" role="alert">
                      <LumenText as="span">
                        {edit.status === 'unknown'
                          ? labels.editUnknown
                          : labels.editFailed(edit.error ?? 'EXECUTION_FAILED')}
                      </LumenText>
                      {edit.status === 'unknown' && (
                        <LumenButton size="s" variant="text" onClick={() => onRetryEdit(item.operationId)}>
                          {labels.retryEdit}
                        </LumenButton>
                      )}
                    </LumenFrame>
                  )}
                </>
              ) : (
                <>
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
                    className="hbar-queued-user-run-edit"
                    aria-label={labels.edit(position)}
                    title={labels.edit(position)}
                    disabled={Boolean(removal || editing)}
                    onClick={() => onStartEdit(item.operationId)}
                  >
                    <LumenIcon icon={Pencil} tier="sm" />
                  </LumenButton>
                  <LumenButton
                    size="s"
                    variant="text"
                    indicator="none"
                    className="hbar-queued-user-run-remove"
                    aria-label={labels.remove(position)}
                    title={labels.remove(position)}
                    disabled={Boolean(removal || editing)}
                    onClick={() => onRemove(item.operationId, item.revision)}
                  >
                    <LumenIcon icon={Trash2} tier="sm" />
                  </LumenButton>
                </>
              )}
            </LumenFrame>
          )
        })}
      </LumenFrame>
      {editing && !current.items.some((item) => item.operationId === editing.operationId) && (
        <LumenFrame className="hbar-queued-user-runs-feedback" role="alert">
          <LumenText as="span">
            {editing.status === 'unknown'
              ? labels.editUnknown
              : editing.status === 'loading'
                ? labels.editLoading
                : labels.editFailed(editing.error ?? 'COMMAND_CONFLICT')}
          </LumenText>
          {editing.status === 'unknown' && (
            <LumenButton size="s" variant="text" onClick={() => onRetryEdit(editing.operationId)}>
              {labels.retryEdit}
            </LumenButton>
          )}
          <LumenButton size="s" variant="text" disabled={editing.status === 'submitting'} onClick={onCancelEdit}>
            {labels.cancelEdit}
          </LumenButton>
        </LumenFrame>
      )}
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
