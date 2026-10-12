import {
  LumenContentText,
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenDialog,
  LumenFrame,
} from '@lumen/app-ui'
import './workspace-tabs.css'
import { WorkspaceTabsCloseMessagesProvider, useWorkspaceTabsCloseMessages } from './workspace-shell-messages'

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
export function HbarWorkspaceTabsCloseDialog(props: HbarWorkspaceTabsCloseDialogProps) {
  return (
    <WorkspaceTabsCloseMessagesProvider messages={props.labels}>
      <HbarWorkspaceTabsCloseDialogView props={props} />
    </WorkspaceTabsCloseMessagesProvider>
  )
}

function HbarWorkspaceTabsCloseDialogView({ props }: { readonly props: HbarWorkspaceTabsCloseDialogProps }) {
  const { t } = useWorkspaceTabsCloseMessages()
  const { open, status, targets, error, onCancel, onKeepRunning, onStopAndClose, onRecheck } = props
  const busy = status === 'checking' || status === 'stopping'
  const choice = status === 'choice' || status === 'failed'
  const canKeepRunning = choice || status === 'unknown'
  return (
    <LumenDialog
      open={open}
      size="small"
      className="hbar-workspace-tabs-close-dialog"
      title={t('title')}
      closeLabel={t('cancel')}
      onClose={() => {
        if (!busy) onCancel()
      }}
      footer={
        <LumenFrame className="hbar-workspace-tabs-close-actions">
          <LumenButton variant="outlined" disabled={busy} onClick={onCancel}>
            {t('cancel')}
          </LumenButton>
          {canKeepRunning && (
            <LumenButton variant="outlined" disabled={targets.length === 0} onClick={onKeepRunning}>
              {t('keepRunning')}
            </LumenButton>
          )}
          {choice && (
            <LumenButton tone="danger" disabled={targets.length === 0} onClick={onStopAndClose}>
              {t('stopAndClose')}
            </LumenButton>
          )}
          {status === 'unknown' && (
            <LumenButton disabled={targets.length === 0} onClick={onRecheck}>
              {t('recheck')}
            </LumenButton>
          )}
        </LumenFrame>
      }
    >
      <LumenFrame className="hbar-workspace-tabs-close-body" aria-busy={busy || undefined}>
        <LumenContentText context="dialog.body" role="status">
          {t('status')(status)}
        </LumenContentText>
        <LumenCollection className="hbar-workspace-tabs-close-targets">
          {targets
            .filter((item, index) => targets.findIndex((candidate) => candidate.id === item.id) === index)
            .map((item) => (
              <LumenCollectionItem key={item.id}>{t('target')(item.title, item.runCount)}</LumenCollectionItem>
            ))}
        </LumenCollection>
        {error && (
          <LumenContentText context="dialog.body" role="alert">
            {error}
          </LumenContentText>
        )}
      </LumenFrame>
    </LumenDialog>
  )
}
