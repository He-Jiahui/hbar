import { LumenButton, LumenContentText, LumenFrame } from '@lumen/app-ui'
import type { WorkspaceNavigationActionState } from './workspace-navigation-actions'
import { useWorkspaceNavigationFeedbackMessages } from './workspace-shell-messages'
export function NavigationActionFeedback({
  state,
  connected,
  targetName,
  onReconcile,
}: {
  readonly state: WorkspaceNavigationActionState
  readonly connected: boolean
  readonly targetName?: string | undefined
  readonly onReconcile: () => void
}) {
  const { t } = useWorkspaceNavigationFeedbackMessages()
  if (!connected || state.status === 'idle') return null
  return (
    <LumenFrame className="hbar-app-react-navigation-feedback">
      {targetName && <LumenContentText context="record.description">{targetName}</LumenContentText>}
      <LumenContentText context="feedback.message" role={state.status === 'submitting' ? 'status' : 'alert'}>
        {state.status === 'submitting'
          ? state.action?.kind === 'create-session'
            ? t('creatingSession')
            : t('openingWorkspace')
          : state.status === 'unknown'
            ? t('creationUnknown')
            : t('error')(state.error ?? 'EXECUTION_FAILED')}
      </LumenContentText>
      {state.status === 'unknown' && (
        <LumenButton size="s" variant="outlined" disabled={!connected} onClick={onReconcile}>
          {t('reconcileCreation')}
        </LumenButton>
      )}
    </LumenFrame>
  )
}
