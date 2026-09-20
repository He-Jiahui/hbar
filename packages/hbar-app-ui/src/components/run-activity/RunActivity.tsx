import { RotateCcw, Square } from 'lucide-react'
import { HbarAppUiIcon } from '../../icon'
import { HbarAppUiButton, HbarAppUiEmptyState, HbarAppUiIconButton, HbarAppUiStatus } from '../../primitives'
import { HbarAppUiVirtualList } from '../../VirtualList'
import { uniqueItems } from '../../collection'
import type { HbarAppUiRunActivityItem, HbarAppUiRunActivityProps } from '../../run-activity-types'
import './RunActivity.css'

const activeStatuses = new Set<HbarAppUiRunActivityItem['status']>(['queued', 'running', 'waiting_approval'])
const retryableStatuses = new Set<HbarAppUiRunActivityItem['status']>(['failed', 'interrupted'])
function tone(status: HbarAppUiRunActivityItem['status']) {
  if (status === 'completed') return 'positive'
  if (status === 'failed' || status === 'interrupted') return 'danger'
  return activeStatuses.has(status) ? 'warning' : 'neutral'
}
export function HbarAppUiRunActivity({
  runs,
  labels,
  listStrategy,
  selectedRunId,
  cancellingRunIds,
  retryingRunIds,
  feedback,
  onSelectRun,
  onCancelRun,
  onRetryRun,
}: HbarAppUiRunActivityProps) {
  const records = uniqueItems(runs)
  const empty = (
    <HbarAppUiEmptyState
      icon={<HbarAppUiIcon icon={Square} />}
      title={labels.emptyTitle}
      description={labels.emptyDescription}
    />
  )
  function renderRow(run: HbarAppUiRunActivityItem) {
    const cancelling = cancellingRunIds?.includes(run.id) ?? false
    const retrying = retryingRunIds?.includes(run.id) ?? false
    const content = (
      <>
        <span className="hbar-app-ui-run-activity-marker" aria-hidden="true" />
        <span className="hbar-app-ui-run-activity-copy">
          <strong>{run.label}</strong>
          {run.detail && <small>{run.detail}</small>}
        </span>
        <span className="hbar-app-ui-run-activity-status">
          <HbarAppUiStatus
            value={cancelling ? labels.cancellingLabel : (run.statusLabel ?? labels.statusLabel(run.status))}
            tone={cancelling ? 'warning' : tone(run.status)}
          />
          {run.duration && <small>{run.duration}</small>}
        </span>
      </>
    )
    return (
      <article className={`hbar-app-ui-run-activity-item hbar-app-ui-run-status-${run.status}`}>
        {onSelectRun ? (
          <button
            type="button"
            className={selectedRunId === run.id ? 'is-selected' : ''}
            aria-current={selectedRunId === run.id ? 'true' : undefined}
            onClick={() => onSelectRun(run.id)}
          >
            {content}
          </button>
        ) : (
          <div className="hbar-app-ui-run-activity-static">{content}</div>
        )}
        {activeStatuses.has(run.status) && onCancelRun && (
          <HbarAppUiIconButton
            type="button"
            label={cancelling ? labels.cancellingLabel : labels.cancelLabel}
            className="hbar-app-ui-run-activity-cancel"
            disabled={cancelling}
            onClick={() => onCancelRun(run.id)}
          >
            <HbarAppUiIcon icon={Square} tier="sm" />
          </HbarAppUiIconButton>
        )}
        {retryableStatuses.has(run.status) && onRetryRun && (
          <HbarAppUiButton
            type="button"
            className="hbar-app-ui-run-activity-retry"
            disabled={retrying}
            onClick={() => onRetryRun(run.id)}
          >
            <HbarAppUiIcon icon={RotateCcw} tier="sm" />
            <span>{retrying ? labels.retryingLabel : labels.retryLabel}</span>
          </HbarAppUiButton>
        )}
      </article>
    )
  }
  return (
    <section className={`hbar-app-ui-run-activity is-${listStrategy}`} aria-label={labels.title}>
      <header className="hbar-app-ui-run-activity-heading">
        <strong>{labels.title}</strong>
        <HbarAppUiStatus value={labels.countLabel(records.length)} tone="neutral" />
      </header>
      {feedback && (
        <p className="hbar-app-ui-run-activity-feedback" role="alert">
          {feedback}
        </p>
      )}
      {listStrategy === 'virtual' ? (
        <HbarAppUiVirtualList items={records} label={labels.title} empty={empty} renderRow={renderRow} />
      ) : records.length ? (
        <ol className="hbar-app-ui-run-activity-list">
          {records.map((run) => (
            <li key={run.id}>{renderRow(run)}</li>
          ))}
        </ol>
      ) : (
        empty
      )}
    </section>
  )
}
