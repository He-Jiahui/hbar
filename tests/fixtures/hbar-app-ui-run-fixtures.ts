import type { HbarAppUiRunActivityLabels } from '../../packages/hbar-app-ui/src/run-activity-types'
export const RUN_LABELS: HbarAppUiRunActivityLabels = {
  title: 'Runs',
  emptyTitle: 'No runs yet',
  emptyDescription: 'Execution history will appear here.',
  cancelLabel: 'Stop run',
  cancellingLabel: 'Stopping run',
  retryLabel: 'Retry run',
  retryingLabel: 'Retrying run',
  planTitle: 'Agent plan',
  planProgress: (completed, total) => `${completed} of ${total} completed`,
  planStatusLabel: (status) => ({ pending: 'Pending', in_progress: 'In progress', completed: 'Completed' })[status],
  countLabel: (count) => `${count} runs`,
  statusLabel: (status) =>
    ({
      queued: 'Queued',
      running: 'Running',
      waiting_approval: 'Waiting for approval',
      completed: 'Completed',
      cancelled: 'Cancelled',
      failed: 'Failed',
      interrupted: 'Interrupted',
    })[status],
}
