import { useEffect, useMemo } from 'react'
import { useStore } from 'zustand'
import { NodeManagementSettings } from '@hbar/app-react/node-management-settings'
import type { NodeManagementSettingsLabels } from '@hbar/app-react/node-management-settings'
import { createNodeManagementSettingsModel, type NodeManagementCommands } from './node-management-settings-model'
import './node-management-settings.css'

export function WebNodeManagementSettings({
  commands,
  hostId,
  connected,
  writable,
  accessKnown,
  labels,
}: {
  readonly commands: NodeManagementCommands
  readonly hostId: string
  readonly connected: boolean
  readonly writable: boolean
  readonly accessKnown: boolean
  readonly labels: NodeManagementSettingsLabels
}) {
  const model = useMemo(
    () => createNodeManagementSettingsModel(commands, hostId, connected, writable),
    [commands, hostId, connected, writable],
  )
  const state = useStore(model.store)
  useEffect(() => {
    model.setConnection(connected, writable)
  }, [connected, model, writable])
  useEffect(() => () => model.dispose(), [model])

  return (
    <NodeManagementSettings
      labels={labels}
      page={state.page}
      loading={state.loading}
      loadingMore={state.loadingMore}
      connected={state.connected}
      accessKnown={accessKnown}
      readOnly={!state.writable}
      listError={state.listError}
      inviteName={state.inviteName}
      invite={state.invite}
      inviteBusy={state.inviteBusy}
      inviteError={state.inviteError}
      revokingNodeId={state.revokingNodeId}
      confirmingNodeId={state.confirmingNodeId}
      revokeError={state.revokeError}
      copied={state.copied}
      copyError={state.copyError}
      onInviteNameChange={model.setInviteName}
      onInvite={() => void model.createInvite()}
      onRefresh={() => void model.refresh()}
      onLoadMore={() => void model.loadMore()}
      onCancelLoad={model.cancelLoad}
      onRevoke={model.requestRevoke}
      onConfirmRevoke={() => void model.confirmRevoke()}
      onCancelRevoke={model.cancelRevoke}
      onCopy={(value, kind) => void model.copy(value, kind)}
    />
  )
}
