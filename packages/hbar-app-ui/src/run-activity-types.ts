export type HbarAppUiRunActivityStatus =
  'queued' | 'running' | 'waiting_approval' | 'completed' | 'cancelled' | 'failed' | 'interrupted'
export type HbarAppUiRunPlanStepStatus = 'pending' | 'in_progress' | 'completed'
export interface HbarAppUiRunPlan {
  readonly runId: string | null
  readonly explanation?: string | undefined
  readonly steps: readonly {
    readonly id: string
    readonly title: string
    readonly status: HbarAppUiRunPlanStepStatus
  }[]
}
export interface HbarAppUiRunActivityItem {
  readonly id: string
  readonly label: string
  readonly status: HbarAppUiRunActivityStatus
  readonly statusLabel?: string | undefined
  readonly detail?: string | undefined
  readonly duration?: string | undefined
}
export interface HbarAppUiRunActivityLabels {
  readonly title: string
  readonly emptyTitle: string
  readonly emptyDescription: string
  readonly cancelLabel: string
  readonly cancellingLabel: string
  readonly retryLabel: string
  readonly retryingLabel: string
  readonly planTitle: string
  readonly planProgress: (completed: number, total: number) => string
  readonly planStatusLabel: (status: HbarAppUiRunPlanStepStatus) => string
  readonly countLabel: (count: number) => string
  readonly statusLabel: (status: HbarAppUiRunActivityStatus) => string
}
export interface HbarAppUiRunActivityProps {
  readonly runs: readonly HbarAppUiRunActivityItem[]
  readonly labels: HbarAppUiRunActivityLabels
  readonly listStrategy: 'content-grown' | 'virtual'
  readonly selectedRunId?: string | undefined
  readonly cancellingRunIds?: readonly string[] | undefined
  readonly retryingRunIds?: readonly string[] | undefined
  readonly plan?: HbarAppUiRunPlan | null | undefined
  readonly feedback?: string | undefined
  readonly onSelectRun?: ((runId: string) => void) | undefined
  readonly onCancelRun?: ((runId: string) => void) | undefined
  readonly onRetryRun?: ((runId: string) => void) | undefined
}
