import { Square } from 'lucide-react'
import { HbarAppUiEmptyState, HbarAppUiIconButton, HbarAppUiStatus } from '../primitives'
import type { HbarAppUiRunActivityItem, HbarAppUiRunActivityProps } from '../types'

const activeStatuses = new Set<HbarAppUiRunActivityItem['status']>(['queued', 'running', 'waiting_approval'])

function statusTone(status: HbarAppUiRunActivityItem['status']): 'neutral' | 'positive' | 'warning' | 'danger' {
  if (status === 'completed') return 'positive'
  if (status === 'failed' || status === 'interrupted') return 'danger'
  if (status === 'queued' || status === 'running' || status === 'waiting_approval') return 'warning'
  return 'neutral'
}

function statusText(status: HbarAppUiRunActivityItem['status']): string {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'waiting_approval':
      return 'Waiting for approval'
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    case 'failed':
      return 'Failed'
    case 'interrupted':
      return 'Interrupted'
  }
}

/**
 * A data-driven execution list. The host supplies records and action
 * callbacks, so this component remains independent from stores and transport.
 */
export function HbarAppUiRunActivity({
  runs,
  title = 'Runs',
  emptyTitle = 'No runs yet',
  emptyDescription = 'Execution history will appear here.',
  selectedRunId,
  cancellingRunIds,
  feedback,
  cancelLabel = 'Stop run',
  cancellingLabel = 'Stopping run',
  countLabel = (count) => `${count} ${count === 1 ? 'run' : 'runs'}`,
  onSelectRun,
  onCancelRun,
}: HbarAppUiRunActivityProps) {
  return (
    <section className="hbar-app-ui-run-activity" aria-label={title}>
      <header className="hbar-app-ui-run-activity-heading">
        <strong>{title}</strong>
        <HbarAppUiStatus value={countLabel(runs.length)} tone="neutral" />
      </header>
      {feedback && (
        <p className="hbar-app-ui-run-activity-feedback" role="alert">
          {feedback}
        </p>
      )}
      {runs.length === 0 ? (
        <HbarAppUiEmptyState icon={<Square size={18} />} title={emptyTitle} description={emptyDescription} />
      ) : (
        <ol className="hbar-app-ui-run-activity-list">
          {runs.map((run) => {
            const isCancelling = cancellingRunIds?.includes(run.id) ?? false
            const isActive = activeStatuses.has(run.status)
            const label = run.statusLabel ?? statusText(run.status)
            const content = (
              <>
                <span className="hbar-app-ui-run-activity-marker" aria-hidden="true" />
                <span className="hbar-app-ui-run-activity-copy">
                  <strong>{run.label}</strong>
                  {run.detail && <small>{run.detail}</small>}
                </span>
                <span className="hbar-app-ui-run-activity-status">
                  <HbarAppUiStatus
                    value={isCancelling ? cancellingLabel : label}
                    tone={isCancelling ? 'warning' : statusTone(run.status)}
                  />
                  {run.duration && <small>{run.duration}</small>}
                </span>
              </>
            )
            return (
              <li className={`hbar-app-ui-run-activity-item hbar-app-ui-run-status-${run.status}`} key={run.id}>
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
                {isActive && onCancelRun && (
                  <HbarAppUiIconButton
                    type="button"
                    label={isCancelling ? cancellingLabel : cancelLabel}
                    className="hbar-app-ui-run-activity-cancel"
                    disabled={isCancelling}
                    onClick={() => onCancelRun(run.id)}
                  >
                    <Square size={13} />
                  </HbarAppUiIconButton>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
