import { LumenButton, LumenContentText, LumenFrame } from '@lumen/app-ui'
import type { WorkspaceNavigationActionState } from './workspace-navigation-actions'
import type { HbarWorkspaceShellLabels } from './workspace-shell-contract'
export function NavigationActionFeedback({
  state,
  labels,
  connected,
  targetName,
  onReconcile,
}: {
  readonly state: WorkspaceNavigationActionState
  readonly labels: HbarWorkspaceShellLabels
  readonly connected: boolean
  readonly targetName?: string | undefined
  readonly onReconcile: () => void
}) {
  if (!connected || state.status === 'idle') return null
  return (
    <LumenFrame className="hbar-app-react-navigation-feedback">
      {targetName && <LumenContentText context="record.description">{targetName}</LumenContentText>}
      <LumenContentText context="feedback.message" role={state.status === 'submitting' ? 'status' : 'alert'}>
        {state.status === 'submitting'
          ? state.action?.kind === 'create-session'
            ? labels.creatingSession
            : labels.openingWorkspace
          : state.status === 'unknown'
            ? labels.creationUnknown
            : labels.error(state.error ?? 'EXECUTION_FAILED')}
      </LumenContentText>
      {state.status === 'unknown' && (
        <LumenButton size="s" variant="outlined" disabled={!connected} onClick={onReconcile}>
          {labels.reconcileCreation}
        </LumenButton>
      )}
    </LumenFrame>
  )
}
