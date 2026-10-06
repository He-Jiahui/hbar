import { LumenButton, LumenCollection, LumenCollectionItem, LumenDialog, LumenFrame, LumenText } from '@lumen/app-ui'
import './workspace-tabs.css'

export type HbarWorkspaceTabsCloseStatus = 'checking' | 'choice' | 'stopping' | 'unknown' | 'failed'
export interface HbarWorkspaceTabsCloseLabels {
  readonly title: string
  readonly cancel: string
  readonly keepRunning: string
  readonly stopAndClose: string
  readonly recheck: string
  readonly status: (status: HbarWorkspaceTabsCloseStatus) => string
  readonly target: (title: string, runCount: number) => string
}
export interface HbarWorkspaceTabsCloseDialogProps {
  readonly open: boolean
  readonly status: HbarWorkspaceTabsCloseStatus
  readonly targets: readonly { readonly id: string; readonly title: string; readonly runCount: number }[]
  readonly error?: string | null | undefined
  readonly labels: HbarWorkspaceTabsCloseLabels
  readonly onCancel: () => void
  readonly onKeepRunning: () => void
  readonly onStopAndClose: () => void
  readonly onRecheck: () => void
}
export function HbarWorkspaceTabsCloseDialog({
  open,
  status,
  targets,
  error,
  labels,
  onCancel,
  onKeepRunning,
  onStopAndClose,
  onRecheck,
}: HbarWorkspaceTabsCloseDialogProps) {
  const busy = status === 'checking' || status === 'stopping'
  const choice = status === 'choice' || status === 'failed'
  const canKeepRunning = choice || status === 'unknown'
  return (
    <LumenDialog
      open={open}
      size="small"
      className="hbar-workspace-tabs-close-dialog"
      title={labels.title}
      closeLabel={labels.cancel}
      onClose={() => {
        if (!busy) onCancel()
      }}
      footer={
        <LumenFrame className="hbar-workspace-tabs-close-actions">
          <LumenButton variant="outlined" disabled={busy} onClick={onCancel}>
            {labels.cancel}
          </LumenButton>
          {canKeepRunning && (
            <LumenButton variant="outlined" disabled={targets.length === 0} onClick={onKeepRunning}>
              {labels.keepRunning}
            </LumenButton>
          )}
          {choice && (
            <LumenButton tone="danger" disabled={targets.length === 0} onClick={onStopAndClose}>
              {labels.stopAndClose}
            </LumenButton>
          )}
          {status === 'unknown' && (
            <LumenButton disabled={targets.length === 0} onClick={onRecheck}>
              {labels.recheck}
            </LumenButton>
          )}
        </LumenFrame>
      }
    >
      <LumenFrame className="hbar-workspace-tabs-close-body" aria-busy={busy || undefined}>
        <LumenText as="p" role="status">
          {labels.status(status)}
        </LumenText>
        <LumenCollection className="hbar-workspace-tabs-close-targets">
          {targets
            .filter((item, index) => targets.findIndex((candidate) => candidate.id === item.id) === index)
            .map((item) => (
              <LumenCollectionItem key={item.id}>{labels.target(item.title, item.runCount)}</LumenCollectionItem>
            ))}
        </LumenCollection>
        {error && (
          <LumenText as="p" role="alert">
            {error}
          </LumenText>
        )}
      </LumenFrame>
    </LumenDialog>
  )
}
