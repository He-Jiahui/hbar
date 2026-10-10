import { LumenContentText, LumenButton, LumenFrame, LumenIcon, LumenTextarea } from '@lumen/app-ui'
import { QUEUED_USER_RUNS_PAGE_SIZE, type QueuedUserRunsState } from '@hbar/app-runtime'
import { CornerDownRight, Pencil, Trash2 } from 'lucide-react'
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
  readonly previewLimited: string
  readonly edit: (position: number) => string
  readonly editInput: (position: number) => string
  readonly editHint: string
  readonly editLoading: string
  readonly editSaving: string
  readonly saveEdit: string
  readonly cancelEdit: string
  readonly editUnknown: string
  readonly editFailed: (code: string) => string
  readonly retryEdit: string
  readonly guide: (position: number) => string
  readonly guideLabel: string
  readonly guideSubmitting: string
  readonly guideUnknown: string
  readonly guideFailed: (code: string) => string
  readonly retryGuide: string
  readonly dismissGuide: string
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
  activeRunId,
  labels,
  onRefresh,
  onPrevious,
  onNext,
  onStartEdit,
  onEditText,
  onSaveEdit,
  onRetryEdit,
  onGuide,
  onRetryGuide,
  onDismissGuide,
  onCancelEdit,
  onRemove,
  onRetryRemoval,
  onDismissRemoval,
}: {
  readonly state: QueuedUserRunsState
  readonly sessionId: string
  readonly connected: boolean
  readonly activeRunId: string | null
  readonly labels: HbarQueuedUserRunsLabels
  readonly onRefresh: () => void
  readonly onPrevious: () => void
  readonly onNext: () => void
  readonly onStartEdit: (operationId: string) => void
  readonly onEditText: (operationId: string, text: string) => void
  readonly onSaveEdit: (operationId: string) => void
  readonly onRetryEdit: (operationId: string) => void
  readonly onGuide: (operationId: string, expectedRevision: number, activeRunId: string) => void
  readonly onRetryGuide: (operationId: string) => void
  readonly onDismissGuide: () => void
  readonly onCancelEdit: () => void
  readonly onRemove: (operationId: string, expectedRevision: number) => void
  readonly onRetryRemoval: (operationId: string) => void
  readonly onDismissRemoval: () => void
}) {
  const current = state.sessionId === sessionId ? state : null
  if (!connected)
    return (
      <LumenContentText context="feedback.message" className="hbar-queued-user-runs-notice" role="status">
        {labels.disconnected}
      </LumenContentText>
    )
  if (!current || current.status === 'idle') return null
  if (current.status === 'loading')
    return (
      <LumenContentText context="feedback.message" className="hbar-queued-user-runs-notice" role="status">
        {labels.loading}
      </LumenContentText>
    )
  if (current.status === 'error')
    return (
      <LumenFrame className="hbar-queued-user-runs-notice" role="alert">
        <LumenContentText context="message.inline">
          {labels.error(current.error ?? 'EXECUTION_FAILED')}
        </LumenContentText>
        <LumenButton size="s" variant="text" indicator="none" onClick={onRefresh}>
          {labels.retry}
        </LumenButton>
      </LumenFrame>
    )
  if (current.totalQueued === 0 && !current.removal && !current.editing && !current.guiding) return null
  const totalPages = Math.ceil(current.totalQueued / QUEUED_USER_RUNS_PAGE_SIZE)
  const removal = current.removal
  const editing = current.editing
  return (
    <LumenFrame className="hbar-queued-user-runs" role="group" aria-label={labels.queued}>
      <LumenFrame className="hbar-queued-user-runs-list" tabIndex={0} aria-label={labels.queued}>
        {current.items.map((item, index) => {
          const edit = editing?.operationId === item.operationId ? editing : null
          const guide = current.guiding?.operationId === item.operationId ? current.guiding : null
          const position = current.pageIndex * QUEUED_USER_RUNS_PAGE_SIZE + index + 1
          return (
            <LumenFrame
              className={`hbar-queued-user-run${edit ? ' hbar-queued-user-run-editing' : ''}`}
              key={item.operationId}
            >
              <LumenContentText context="control.status" className="hbar-queued-user-run-status">
                {removal?.operationId === item.operationId && removal.status === 'submitting'
                  ? labels.removing
                  : labels.queued}
              </LumenContentText>
              {edit ? (
                <>
                  {edit.status === 'loading' ? (
                    <LumenContentText
                      context="message.inline"
                      className="hbar-queued-user-run-edit-loading"
                      role="status"
                    >
                      {labels.editLoading}
                    </LumenContentText>
                  ) : (
                    <LumenTextarea
                      className="hbar-queued-user-run-edit-input"
                      variant="boxed"
                      aria-label={labels.editInput(position)}
                      aria-description={labels.editHint}
                      title={labels.editHint}
                      value={edit.text}
                      rows={Math.min(6, edit.text.split(/\r\n|\r|\n/).length)}
                      maxLength={200_000}
                      autoFocus
                      disabled={edit.status !== 'ready'}
                      onChange={(event) => onEditText(item.operationId, event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          event.stopPropagation()
                          if (edit.status !== 'submitting') onCancelEdit()
                        } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
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
                      variant="outlined"
                      indicator="none"
                      disabled={edit.status !== 'ready' || edit.revision === null || !edit.text.trim()}
                      onClick={() => onSaveEdit(item.operationId)}
                    >
                      {edit.status === 'submitting' ? labels.editSaving : labels.saveEdit}
                    </LumenButton>
                    <LumenButton
                      size="s"
                      variant="text"
                      indicator="none"
                      disabled={edit.status === 'submitting'}
                      onClick={onCancelEdit}
                    >
                      {labels.cancelEdit}
                    </LumenButton>
                  </LumenFrame>
                  {(edit.status === 'failed' || edit.status === 'unknown') && (
                    <LumenFrame className="hbar-queued-user-run-edit-feedback" role="alert">
                      <LumenContentText context="message.inline">
                        {edit.status === 'unknown'
                          ? labels.editUnknown
                          : labels.editFailed(edit.error ?? 'EXECUTION_FAILED')}
                      </LumenContentText>
                      {edit.status === 'unknown' && (
                        <LumenButton
                          size="s"
                          variant="text"
                          indicator="none"
                          onClick={() => onRetryEdit(item.operationId)}
                        >
                          {labels.retryEdit}
                        </LumenButton>
                      )}
                    </LumenFrame>
                  )}
                </>
              ) : (
                <>
                  <LumenContentText
                    context="message.inline"
                    className="hbar-queued-user-run-text"
                    title={item.textPreview}
                    tabIndex={0}
                  >
                    {item.textPreview || labels.attachments(item.attachmentCount)}
                  </LumenContentText>
                  {item.truncated && (
                    <LumenContentText context="record.description">{labels.previewLimited}</LumenContentText>
                  )}
                  {item.attachmentCount > 0 && item.textPreview && (
                    <LumenContentText context="message.inline" className="hbar-queued-user-run-attachments">
                      {labels.attachments(item.attachmentCount)}
                    </LumenContentText>
                  )}
                  {activeRunId && (!guide || guide.status === 'failed') && (
                    <LumenButton
                      size="s"
                      variant="text"
                      indicator="none"
                      className="hbar-queued-user-run-guide"
                      aria-label={labels.guide(position)}
                      title={labels.guide(position)}
                      disabled={Boolean(removal || editing || (current.guiding && current.guiding.status !== 'failed'))}
                      onClick={() => onGuide(item.operationId, item.revision, activeRunId)}
                    >
                      <LumenIcon icon={CornerDownRight} tier="sm" />
                      {labels.guideLabel}
                    </LumenButton>
                  )}
                  <LumenButton
                    size="s"
                    variant="text"
                    indicator="none"
                    className="hbar-queued-user-run-edit"
                    aria-label={labels.edit(position)}
                    title={labels.edit(position)}
                    disabled={Boolean(removal || editing || (current.guiding && current.guiding.status !== 'failed'))}
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
                    disabled={Boolean(removal || editing || (current.guiding && current.guiding.status !== 'failed'))}
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
          <LumenContentText context="message.inline">
            {editing.status === 'unknown'
              ? labels.editUnknown
              : editing.status === 'loading'
                ? labels.editLoading
                : labels.editFailed(editing.error ?? 'COMMAND_CONFLICT')}
          </LumenContentText>
          {editing.status === 'unknown' && (
            <LumenButton size="s" variant="text" indicator="none" onClick={() => onRetryEdit(editing.operationId)}>
              {labels.retryEdit}
            </LumenButton>
          )}
          <LumenButton
            size="s"
            variant="text"
            indicator="none"
            disabled={editing.status === 'submitting'}
            onClick={onCancelEdit}
          >
            {labels.cancelEdit}
          </LumenButton>
        </LumenFrame>
      )}
      {removal && removal.status !== 'submitting' && (
        <LumenFrame className="hbar-queued-user-runs-feedback" role="alert">
          <LumenContentText context="message.inline">
            {removal.status === 'unknown'
              ? labels.removeUnknown
              : labels.removeFailed(removal.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          {removal.status === 'unknown' && (
            <LumenButton size="s" variant="text" indicator="none" onClick={() => onRetryRemoval(removal.operationId)}>
              {labels.retryRemoval}
            </LumenButton>
          )}
          {removal.status === 'failed' && (
            <LumenButton size="s" variant="text" indicator="none" onClick={onRefresh}>
              {labels.retry}
            </LumenButton>
          )}
          <LumenButton size="s" variant="text" indicator="none" onClick={onDismissRemoval}>
            {labels.dismissRemoval}
          </LumenButton>
        </LumenFrame>
      )}
      {current.guiding && (
        <LumenFrame className="hbar-queued-user-runs-guide-feedback" role="alert">
          <LumenContentText context="message.inline">
            {current.guiding.status === 'submitting'
              ? labels.guideSubmitting
              : current.guiding.status === 'unknown'
                ? labels.guideUnknown
                : labels.guideFailed(current.guiding.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          {current.guiding.status === 'unknown' && (
            <LumenButton
              size="s"
              variant="text"
              indicator="none"
              disabled={!connected}
              onClick={() => onRetryGuide(current.guiding?.operationId ?? '')}
            >
              {labels.retryGuide}
            </LumenButton>
          )}
          {current.guiding.status === 'failed' && (
            <LumenButton size="s" variant="text" indicator="none" onClick={onDismissGuide}>
              {labels.dismissGuide}
            </LumenButton>
          )}
        </LumenFrame>
      )}
      {(current.previousCursors.length > 0 || current.nextCursor) && (
        <LumenFrame className="hbar-queued-user-runs-pagination">
          <LumenButton
            size="s"
            variant="text"
            indicator="none"
            disabled={current.previousCursors.length === 0}
            onClick={onPrevious}
          >
            {labels.previous}
          </LumenButton>
          <LumenContentText context="message.inline" aria-live="polite">
            {labels.page(current.pageIndex + 1, totalPages)}
          </LumenContentText>
          <LumenButton size="s" variant="text" indicator="none" disabled={!current.nextCursor} onClick={onNext}>
            {labels.next}
          </LumenButton>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
