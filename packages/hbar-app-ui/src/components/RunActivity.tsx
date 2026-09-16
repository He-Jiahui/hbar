import { HbarAppUiIcon } from '../icon'
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
  labels,
  title,
  emptyTitle,
  emptyDescription,
  selectedRunId,
  cancellingRunIds,
  feedback,
  cancelLabel,
  cancellingLabel,
  countLabel,
  onSelectRun,
  onCancelRun,
}: HbarAppUiRunActivityProps) {
  const resolvedTitle = title ?? labels?.title ?? 'Runs'
  const resolvedEmptyTitle = emptyTitle ?? labels?.emptyTitle ?? 'No runs yet'
  const resolvedEmptyDescription = emptyDescription ?? labels?.emptyDescription ?? 'Execution history will appear here.'
  const resolvedCancelLabel = cancelLabel ?? labels?.cancelLabel ?? 'Stop run'
  const resolvedCancellingLabel = cancellingLabel ?? labels?.cancellingLabel ?? 'Stopping run'
  const resolvedCountLabel = countLabel ?? labels?.countLabel ?? ((count: number) => `${count} ${count === 1 ? 'run' : 'runs'}`)
  return (
    <section className="hbar-app-ui-run-activity" aria-label={resolvedTitle}>
      <header className="hbar-app-ui-run-activity-heading">
        <strong>{resolvedTitle}</strong>
        <HbarAppUiStatus value={resolvedCountLabel(runs.length)} tone="neutral" />
      </header>
      {feedback && (
        <p className="hbar-app-ui-run-activity-feedback" role="alert">
          {feedback}
        </p>
      )}
      {runs.length === 0 ? (
        <HbarAppUiEmptyState
          icon={<HbarAppUiIcon icon={Square} tier="md"  />}
          title={resolvedEmptyTitle}
          description={resolvedEmptyDescription}
        />
      ) : (
        <ol className="hbar-app-ui-run-activity-list">
          {runs.map((run) => {
            const isCancelling = cancellingRunIds?.includes(run.id) ?? false
            const isActive = activeStatuses.has(run.status)
            const label = run.statusLabel ?? labels?.statusLabel?.(run.status) ?? statusText(run.status)
            const content = (
              <>
                <span className="hbar-app-ui-run-activity-marker" aria-hidden="true" />
                <span className="hbar-app-ui-run-activity-copy">
                  <strong>{run.label}</strong>
                  {run.detail && <small>{run.detail}</small>}
                </span>
                <span className="hbar-app-ui-run-activity-status">
                  <HbarAppUiStatus
                    value={isCancelling ? resolvedCancellingLabel : label}
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
                    label={isCancelling ? resolvedCancellingLabel : resolvedCancelLabel}
                    className="hbar-app-ui-run-activity-cancel"
                    disabled={isCancelling}
                    onClick={() => onCancelRun(run.id)}
                  >
                    <HbarAppUiIcon icon={Square} tier="sm"  />
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
