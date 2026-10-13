import { useId } from 'react'
import { Computer, Folder, HardDrive, RefreshCw } from 'lucide-react'
import type { Workspace } from '@hbar/contracts/directory'
import type { NodeListPage } from '@hbar/contracts/node-management'
import {
  LumenButton,
  LumenContentText,
  LumenDialog,
  LumenFormField,
  LumenFrame,
  LumenIcon,
  LumenInput,
} from '@lumen/app-ui'
import './workspace-location-picker.css'

export interface WorkspaceLocationPickerLabels {
  readonly title: string
  readonly description: string
  readonly local: string
  readonly localDescription: string
  readonly remote: string
  readonly remoteDescription: string
  readonly name: string
  readonly namePlaceholder: string
  readonly localPath: string
  readonly localPathHint: string
  readonly browseLocal: string
  readonly nodes: string
  readonly loading: string
  readonly emptyNodes: string
  readonly offline: string
  readonly online: string
  readonly revoked: string
  readonly unavailable: string
  readonly capabilitiesUnavailable: string
  readonly chooseRoot: string
  readonly noRoots: string
  readonly readOnlyRoot: string
  readonly writeRoot: string
  readonly more: string
  readonly retry: string
  readonly cancelLoading: string
  readonly cancel: string
  readonly create: string
  readonly creating: string
  readonly error: (code: string) => string
  readonly remoteWorkspace: (nodeName: string) => string
}

export interface WorkspaceLocationPickerProps {
  readonly open: boolean
  readonly labels: WorkspaceLocationPickerLabels
  readonly page: NodeListPage | null
  readonly mode: 'local' | 'node'
  readonly name: string
  readonly localPath: string
  readonly nodeId: string | null
  readonly rootId: string | null
  readonly connected: boolean
  readonly writable: boolean
  readonly loading: boolean
  readonly loadingMore: boolean
  readonly creating: boolean
  readonly error: string | null
  readonly onModeChange: (mode: 'local' | 'node') => void
  readonly onNameChange: (value: string) => void
  readonly onLocalPathChange: (value: string) => void
  readonly onBrowseLocal: () => void
  readonly onNodeChange: (nodeId: string) => void
  readonly onRootChange: (nodeId: string, rootId: string) => void
  readonly onRefresh: () => void
  readonly onLoadMore: () => void
  readonly onCancelLoad: () => void
  readonly onCreate: () => void
  readonly onCancel: () => void
}

export function HbarWorkspaceNodeBadge({
  labels,
  nodeName,
}: {
  readonly labels: Pick<WorkspaceLocationPickerLabels, 'remoteWorkspace'>
  readonly nodeName: string
}) {
  return (
    <span className="hbar-workspace-node-badge">
      <LumenIcon icon={Computer} tier="xs" />
      <span>{labels.remoteWorkspace(nodeName)}</span>
    </span>
  )
}

export function HbarWorkspaceLocationPicker(props: WorkspaceLocationPickerProps) {
  const id = useId()
  if (!props.open) return null
  const selectedNode = props.page?.items.find((node) => node.nodeId === props.nodeId) ?? null
  const roots = selectedNode?.online && selectedNode.revokedAt === null ? (selectedNode.capabilities?.roots ?? []) : []
  const remoteReady = Boolean(
    props.connected &&
    props.writable &&
    selectedNode?.online &&
    selectedNode.revokedAt === null &&
    roots.some((root) => root.rootId === props.rootId),
  )
  const canCreate =
    props.connected &&
    props.writable &&
    !props.loading &&
    !props.loadingMore &&
    !props.creating &&
    (props.mode === 'local' ? Boolean(props.localPath.trim()) : remoteReady)

  return (
    <LumenDialog
      open
      appearance="panel"
      size="medium"
      title={props.labels.title}
      closeLabel={props.labels.cancel}
      onClose={props.onCancel}
      className="hbar-workspace-location-dialog"
      footer={
        <LumenFrame className="hbar-workspace-location-actions">
          <LumenButton variant="text" indicator="none" disabled={props.creating} onClick={props.onCancel}>
            {props.labels.cancel}
          </LumenButton>
          <LumenButton disabled={!canCreate} loading={props.creating} onClick={props.onCreate}>
            <LumenIcon icon={Folder} tier="sm" />
            {props.creating ? props.labels.creating : props.labels.create}
          </LumenButton>
        </LumenFrame>
      }
    >
      <LumenFrame className="hbar-workspace-location-body" data-testid="workspace-location-picker">
        <LumenContentText context="dialog.body">{props.labels.description}</LumenContentText>
        <LumenFrame className="hbar-workspace-location-modes" role="group" aria-label={props.labels.title}>
          <LumenButton
            type="button"
            variant={props.mode === 'local' ? 'outlined' : 'text'}
            aria-pressed={props.mode === 'local'}
            disabled={props.creating}
            onClick={() => props.onModeChange('local')}
          >
            <LumenIcon icon={HardDrive} tier="sm" />
            <LumenFrame>
              <LumenContentText context="record.title">{props.labels.local}</LumenContentText>
              <LumenContentText context="form.help">{props.labels.localDescription}</LumenContentText>
            </LumenFrame>
          </LumenButton>
          <LumenButton
            type="button"
            variant={props.mode === 'node' ? 'outlined' : 'text'}
            aria-pressed={props.mode === 'node'}
            disabled={props.creating}
            onClick={() => props.onModeChange('node')}
          >
            <LumenIcon icon={Computer} tier="sm" />
            <LumenFrame>
              <LumenContentText context="record.title">{props.labels.remote}</LumenContentText>
              <LumenContentText context="form.help">{props.labels.remoteDescription}</LumenContentText>
            </LumenFrame>
          </LumenButton>
        </LumenFrame>

        <LumenFormField controlId={`${id}-name`} label={props.labels.name}>
          <LumenInput
            id={`${id}-name`}
            value={props.name}
            maxLength={160}
            placeholder={props.labels.namePlaceholder}
            disabled={props.creating}
            onChange={(event) => props.onNameChange(event.currentTarget.value)}
          />
        </LumenFormField>

        {props.mode === 'local' ? (
          <LumenFormField
            controlId={`${id}-path`}
            label={props.labels.localPath}
            description={props.labels.localPathHint}
          >
            <LumenFrame className="hbar-workspace-location-path-row">
              <LumenInput
                id={`${id}-path`}
                value={props.localPath}
                maxLength={4_000}
                disabled={props.creating}
                onChange={(event) => props.onLocalPathChange(event.currentTarget.value)}
              />
              <LumenButton
                type="button"
                variant="outlined"
                indicator="none"
                disabled={props.creating}
                onClick={props.onBrowseLocal}
              >
                <LumenIcon icon={Folder} tier="sm" />
                {props.labels.browseLocal}
              </LumenButton>
            </LumenFrame>
          </LumenFormField>
        ) : (
          <LumenFrame className="hbar-workspace-location-remote">
            <LumenFrame className="hbar-workspace-location-heading">
              <LumenContentText context="section.subtitle">{props.labels.nodes}</LumenContentText>
              <LumenButton
                type="button"
                variant="text"
                indicator="none"
                disabled={!props.connected || props.loading || props.creating}
                onClick={props.onRefresh}
              >
                <LumenIcon icon={RefreshCw} tier="sm" />
                {props.labels.retry}
              </LumenButton>
            </LumenFrame>
            {!props.connected ? (
              <LumenContentText context="feedback.message">{props.labels.unavailable}</LumenContentText>
            ) : null}
            {props.loading ? (
              <LumenContentText context="feedback.message" role="status">
                {props.labels.loading}
              </LumenContentText>
            ) : null}
            {props.loading || props.loadingMore ? (
              <LumenButton type="button" variant="text" indicator="none" onClick={props.onCancelLoad}>
                {props.labels.cancelLoading}
              </LumenButton>
            ) : null}
            {props.error ? (
              <LumenContentText context="feedback.message" role="alert">
                {props.labels.error(props.error)}
              </LumenContentText>
            ) : null}
            {!props.loading && props.page?.items.length === 0 ? (
              <LumenContentText context="feedback.message">{props.labels.emptyNodes}</LumenContentText>
            ) : null}
            {props.page?.items.length ? (
              <ul className="hbar-workspace-location-nodes" aria-label={props.labels.nodes}>
                {props.page.items.map((node) => {
                  const selectable = props.connected && props.writable && node.online && node.revokedAt === null
                  const isSelected = node.nodeId === props.nodeId
                  const nodeRoots = node.online && node.revokedAt === null ? (node.capabilities?.roots ?? []) : []
                  return (
                    <li className="hbar-workspace-location-node" key={node.nodeId}>
                      <LumenButton
                        type="button"
                        variant={isSelected ? 'outlined' : 'text'}
                        aria-pressed={isSelected}
                        disabled={!selectable || props.creating}
                        onClick={() => props.onNodeChange(node.nodeId)}
                      >
                        <LumenIcon icon={Computer} tier="sm" />
                        <LumenFrame>
                          <LumenContentText context="record.title">{node.name}</LumenContentText>
                          <LumenContentText context="form.help">
                            {node.revokedAt !== null
                              ? props.labels.revoked
                              : node.online
                                ? props.labels.online
                                : props.labels.offline}
                          </LumenContentText>
                        </LumenFrame>
                      </LumenButton>
                      {isSelected ? (
                        node.capabilities === null ? (
                          <LumenContentText context="feedback.message">
                            {props.labels.capabilitiesUnavailable}
                          </LumenContentText>
                        ) : nodeRoots.length ? (
                          <LumenFrame
                            className="hbar-workspace-location-roots"
                            role="group"
                            aria-label={props.labels.chooseRoot}
                          >
                            {nodeRoots.map((root) => (
                              <LumenButton
                                key={root.rootId}
                                type="button"
                                variant={props.rootId === root.rootId ? 'outlined' : 'text'}
                                aria-pressed={props.rootId === root.rootId}
                                disabled={!selectable || props.creating}
                                onClick={() => props.onRootChange(node.nodeId, root.rootId)}
                              >
                                <LumenIcon icon={Folder} tier="sm" />
                                <LumenFrame>
                                  <LumenContentText context="record.title">{root.name}</LumenContentText>
                                  <LumenContentText context="form.help">{root.nodePath}</LumenContentText>
                                  <LumenContentText context="form.help">
                                    {root.access === 'write' ? props.labels.writeRoot : props.labels.readOnlyRoot}
                                  </LumenContentText>
                                </LumenFrame>
                              </LumenButton>
                            ))}
                          </LumenFrame>
                        ) : (
                          <LumenContentText context="feedback.message">{props.labels.noRoots}</LumenContentText>
                        )
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : null}
            {props.page?.nextCursor ? (
              <LumenButton
                type="button"
                variant="outlined"
                disabled={props.loadingMore || props.creating}
                loading={props.loadingMore}
                onClick={props.onLoadMore}
              >
                {props.labels.more}
              </LumenButton>
            ) : null}
          </LumenFrame>
        )}
      </LumenFrame>
    </LumenDialog>
  )
}

export function workspaceLocationBadgeLabel(
  workspace: Workspace,
  nodes: NodeListPage['items'],
  labels: Pick<WorkspaceLocationPickerLabels, 'remoteWorkspace'>,
): string | null {
  const location = workspace.location
  if (location?.kind !== 'node') return null
  return labels.remoteWorkspace(nodes.find((node) => node.nodeId === location.nodeId)?.name ?? location.nodeId)
}
