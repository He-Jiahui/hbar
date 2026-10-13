import { useEffect, useMemo } from 'react'
import { useStore } from 'zustand'
import { createNodeCommandClient, type ClientTransport } from '@hbar/client'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import {
  HbarWorkspaceLocationPicker,
  type WorkspaceLocationPickerLabels,
} from '@hbar/app-react/workspace-location-picker'
import { createWorkspaceLocationPickerModel } from './workspace-location-picker-model'

export interface WebWorkspaceLocationPickerProps {
  readonly client: ClientTransport
  readonly open: boolean
  readonly connected: boolean
  readonly writable: boolean
  readonly labels: WorkspaceLocationPickerLabels
  readonly onBrowseLocal: () => Promise<string | null>
  readonly onCreated: (workspaceId: string) => void
  readonly onCancel: () => void
}

export function WebWorkspaceLocationPicker({
  client,
  open,
  connected,
  writable,
  labels,
  onBrowseLocal,
  onCreated,
  onCancel,
}: WebWorkspaceLocationPickerProps) {
  const model = useMemo(() => {
    const nodes = createNodeCommandClient(client)
    const workspaces = createWorkspaceSessionCommandClient(client)
    return createWorkspaceLocationPickerModel(
      {
        listNodes: (input, options) =>
          nodes.execute('node.list', input, options?.signal ? { signal: options.signal } : undefined),
        createWorkspace: (input) => workspaces.execute('workspace.create', input),
      },
      false,
      false,
    )
  }, [client])
  const state = useStore(model.store)

  useEffect(() => {
    model.setConnection(connected, writable)
  }, [connected, model, writable])
  useEffect(() => {
    if (open && connected && state.mode === 'node' && !state.page && !state.error) void model.refresh()
  }, [connected, model, open, state.error, state.mode, state.page])
  useEffect(() => model.retain(), [model])

  const browseLocal = async () => {
    try {
      const path = await onBrowseLocal()
      if (path !== null) model.setLocalPath(path)
    } catch {
      model.reportError('LOCAL_PICKER_FAILED')
    }
  }
  const create = async () => {
    const workspace = await model.create()
    if (workspace) onCreated(workspace.id)
  }

  return (
    <HbarWorkspaceLocationPicker
      open={open}
      labels={labels}
      page={state.page}
      mode={state.mode}
      name={state.name}
      localPath={state.localPath}
      nodeId={state.nodeId}
      rootId={state.rootId}
      connected={state.connected}
      writable={state.writable}
      loading={state.loading}
      loadingMore={state.loadingMore}
      creating={state.creating}
      error={state.error}
      onModeChange={model.setMode}
      onNameChange={model.setName}
      onLocalPathChange={model.setLocalPath}
      onBrowseLocal={() => void browseLocal()}
      onNodeChange={model.selectNode}
      onRootChange={model.selectRoot}
      onRefresh={() => void model.refresh()}
      onLoadMore={() => void model.loadMore()}
      onCancelLoad={model.cancelLoad}
      onCreate={() => void create()}
      onCancel={onCancel}
    />
  )
}
