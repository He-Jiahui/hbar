export type HbarAppUiRunActivityStatus =
  'queued' | 'running' | 'waiting_approval' | 'completed' | 'cancelled' | 'failed' | 'interrupted'
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
  readonly countLabel: (count: number) => string
  readonly statusLabel: (status: HbarAppUiRunActivityStatus) => string
}
export interface HbarAppUiRunActivityProps {
  readonly runs: readonly HbarAppUiRunActivityItem[]
  readonly labels: HbarAppUiRunActivityLabels
  readonly listStrategy: 'content-grown' | 'virtual'
  readonly selectedRunId?: string | undefined
  readonly cancellingRunIds?: readonly string[] | undefined
  readonly feedback?: string | undefined
  readonly onSelectRun?: ((runId: string) => void) | undefined
  readonly onCancelRun?: ((runId: string) => void) | undefined
}
