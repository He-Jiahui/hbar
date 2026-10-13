import { useEffect, useId, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, Folder, FolderOpen, Plus, Trash2 } from 'lucide-react'
import {
  LumenContentText,
  LumenButton,
  LumenCheckBoxControl,
  LumenCollection,
  LumenCollectionItem,
  LumenDialog,
  LumenFormField,
  LumenFrame,
  LumenIcon,
  LumenInput,
  LumenPopupSelect,
  LumenTree,
  LumenTreeItem,
} from '@lumen/app-ui'
import { workspaceFoldersClientCommands, type WorkspaceFoldersState } from '@hbar/app-runtime'
import { WORKSPACE_FOLDER_LIMIT } from '@hbar/contracts/commands/workspace-folders'
import type { NodeListPage } from '@hbar/contracts/node-management'
import { parseNodeWorkspaceLocator } from '@hbar/contracts/node-address'
import { HbarActionIconButton } from './action-icon-button'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './workspace-folders.css'
import './workspace-folder-flow.css'

export interface WorkspaceFoldersLabels {
  readonly create: string
  readonly manage: string
  readonly browse: string
  readonly description: string
  readonly browserHint: string
  readonly alias: string
  readonly aliasHint: string
  readonly folderCaption: (name: string) => string
  readonly path: string
  readonly pathHint: string
  readonly addPath: string
  readonly folders: string
  readonly empty: string
  readonly primary: string
  readonly remove: string
  readonly removeHint: string
  readonly moveUp: string
  readonly moveDown: string
  readonly openFolder: (name: string) => string
  readonly selectFolder: (name: string) => string
  readonly quickLocations: string
  readonly up: string
  readonly selectCurrent: string
  readonly emptyDirectory: string
  readonly loadMore: string
  readonly scanTruncated: string
  readonly selected: (count: number) => string
  readonly count: (count: number, limit: number) => string
  readonly addSelected: string
  readonly back: string
  readonly cancel: string
  readonly done: string
  readonly save: string
  readonly refresh: string
  readonly refreshHint: string
  readonly reconcile: string
  readonly retry: string
  readonly offline: string
  readonly unexpectedFailure: string
  readonly error: (code: string) => string
  readonly status: Readonly<Record<'loading' | 'saving' | 'checking' | 'unknown' | 'saved', string>>
  readonly validation: Readonly<Record<'required' | 'invalid' | 'capacity', string>>
  readonly nodeRoots: string
  readonly nodeRootsHint: string
  readonly nodeRootAccess: (access: 'read' | 'write') => string
  readonly nodeRootUnavailable: string
  readonly nodeRootLoading: string
  readonly nodeRootObserver: string
  readonly nodeRootMounted: string
  readonly nodeRootOverlap: string
  readonly nodeRootName: (name: string) => string
}

export type WorkspaceNodeFolderRegistry = Readonly<Record<string, NodeListPage['items'][number]>>

/** The connected adapter sends intents only. Drafts, selection, pagination and receipts live in Runtime. */
export function HbarWorkspaceFoldersDialog({
  labels,
  connected,
  nodeRegistry,
  nodeMutationAllowed,
  refreshNodeRegistry,
}: {
  readonly labels: WorkspaceFoldersLabels
  readonly connected: boolean
  readonly nodeRegistry?: WorkspaceNodeFolderRegistry | undefined
  readonly nodeMutationAllowed?: boolean | undefined
  readonly refreshNodeRegistry?: (() => Promise<void>) | undefined
}) {
  const runtime = useHbarRuntime()
  const state = useHbarRuntimeState(runtime.state.workspaceFolders)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const workspace = state.workspaceId ? directory.workspaces[state.workspaceId] : undefined
  let primaryAddress: ReturnType<typeof parseNodeWorkspaceLocator> = null
  const primaryFolderPath = workspace?.path ?? state.folders[0]?.path ?? state.snapshot?.folders[0]?.path
  if (primaryFolderPath) {
    try {
      primaryAddress = parseNodeWorkspaceLocator(primaryFolderPath)
    } catch {
      primaryAddress = null
    }
  }
  const ownerNodeId =
    workspace?.location?.kind === 'node' ? workspace.location.nodeId : (primaryAddress?.nodeId ?? null)
  const [unexpectedFailure, setUnexpectedFailure] = useState(false)
  const [nodeRegistryLoading, setNodeRegistryLoading] = useState(false)
  useEffect(() => setUnexpectedFailure(false), [state.open, state.token])
  useEffect(() => {
    if (!state.open || !ownerNodeId || !refreshNodeRegistry) {
      setNodeRegistryLoading(false)
      return
    }
    let current = true
    setNodeRegistryLoading(true)
    void refreshNodeRegistry().finally(() => {
      if (current) setNodeRegistryLoading(false)
    })
    return () => {
      current = false
    }
  }, [ownerNodeId, refreshNodeRegistry, state.open, state.token])
  const execute: WorkspaceFoldersDialogProps['execute'] = (name, input) => {
    setUnexpectedFailure(false)
    void runtime.commands.execute(name, workspaceFoldersClientCommands[name].input.parse(input)).catch(() => {
      const current = runtime.state.workspaceFolders.getSnapshot()
      if (current.open && current.token === input.token) setUnexpectedFailure(true)
    })
  }
  return (
    <WorkspaceFoldersDialog
      state={state}
      connected={connected}
      nodeRegistry={nodeRegistry}
      nodeMutationAllowed={nodeMutationAllowed ?? false}
      ownerNodeId={ownerNodeId}
      nodeRegistryLoading={nodeRegistryLoading}
      labels={labels}
      execute={execute}
      unexpectedFailure={unexpectedFailure}
    />
  )
}
export interface WorkspaceFoldersDialogProps {
  readonly state: WorkspaceFoldersState
  readonly labels: WorkspaceFoldersLabels
  readonly connected: boolean
  readonly nodeRegistry?: WorkspaceNodeFolderRegistry | undefined
  readonly nodeMutationAllowed?: boolean
  readonly ownerNodeId?: string | null
  readonly nodeRegistryLoading?: boolean
  readonly unexpectedFailure?: boolean
  readonly execute: (
    name: `workspaceFolders.${'close' | 'path' | 'addPath' | 'addNodeRoot' | 'edit' | 'remove' | 'move' | 'browse' | 'toggle' | 'addSelected' | 'back' | 'refresh' | 'save' | 'reconcile' | 'retry'}`,
    input: {
      token: number
      value?: string
      id?: string
      field?: 'alias' | 'path'
      nodeId?: string
      rootId?: string
      name?: string
      direction?: 'up' | 'down'
      path?: string
      more?: boolean
    },
  ) => void
}

export function WorkspaceFoldersDialog({
  state,
  labels,
  connected,
  nodeRegistry,
  nodeMutationAllowed = false,
  ownerNodeId = null,
  nodeRegistryLoading = false,
  execute,
  unexpectedFailure,
}: WorkspaceFoldersDialogProps) {
  const id = useId()
  const ownerNode = ownerNodeId ? nodeRegistry?.[ownerNodeId] : undefined
  const remoteRoots =
    ownerNode?.online && ownerNode.revokedAt === null && ownerNode.capabilities?.nodeId === ownerNodeId
      ? ownerNode.capabilities.roots.filter((root) => !root.managed)
      : []
  const mountedRootIds = new Set(
    state.folders.flatMap((folder) => {
      try {
        const address = parseNodeWorkspaceLocator(folder.path)
        return address && address.nodeId === ownerNodeId ? [address.rootId] : []
      } catch {
        return []
      }
    }),
  )
  const remoteReadOnly = ownerNodeId !== null && !nodeMutationAllowed
  const locked = state.requestInFlight || ['saving', 'unknown', 'checking'].includes(state.status)
  const disabled = !connected || locked || state.status === 'loading'
  const folderEditingDisabled = disabled || remoteReadOnly
  const rootOverlapsMounted = (rootId: string) => {
    const candidate = remoteRoots.find((root) => root.rootId === rootId)
    if (!candidate || !ownerNode?.capabilities) return false
    const normalize = (path: string) =>
      ownerNode.capabilities?.platform === 'win32' ? path.replaceAll('\\', '/').toLocaleLowerCase() : path
    const paths = remoteRoots.filter((root) => mountedRootIds.has(root.rootId)).map((root) => normalize(root.nodePath))
    const next = normalize(candidate.nodePath)
    return paths.some((path) => {
      const within = (parent: string, value: string) =>
        value === parent || value.startsWith(parent.endsWith('/') ? parent : `${parent}/`)
      return within(path, next) || within(next, path)
    })
  }
  const registeredRoot = (path: string) => {
    try {
      const address = parseNodeWorkspaceLocator(path)
      return address?.nodeId === ownerNodeId ? remoteRoots.find((root) => root.rootId === address.rootId) : undefined
    } catch {
      return undefined
    }
  }
  const browse = (path?: string, more = false) =>
    execute('workspaceFolders.browse', {
      token: state.token,
      ...(path ? { path } : {}),
      ...(more ? { more: true } : {}),
    })
  const intent = (name: Parameters<typeof execute>[0], input: Omit<Parameters<typeof execute>[1], 'token'> = {}) =>
    execute(name, { token: state.token, ...input })
  if (!state.open) return null
  const browsing = state.phase === 'browsing'
  return (
    <LumenDialog
      open
      appearance="panel"
      size="medium"
      title={browsing ? labels.browse : state.workspaceId ? labels.manage : labels.create}
      closeLabel={labels.cancel}
      onClose={() => intent('workspaceFolders.close')}
      className="hbar-workspace-folders-dialog"
      footer={
        <LumenFrame className="hbar-workspace-folders-actions">
          <LumenButton variant="text" indicator="none" onClick={() => intent('workspaceFolders.close')}>
            {state.status === 'saved' ? labels.done : labels.cancel}
          </LumenButton>
          {browsing ? (
            <>
              <LumenButton
                variant="outlined"
                indicator="none"
                disabled={locked}
                onClick={() => intent('workspaceFolders.back')}
              >
                {labels.back}
              </LumenButton>
              <LumenButton
                disabled={disabled || state.selected.length === 0}
                onClick={() => intent('workspaceFolders.addSelected')}
              >
                {labels.addSelected}
              </LumenButton>
            </>
          ) : (
            state.status !== 'saved' && (
              <LumenButton
                disabled={disabled || state.folders.length === 0 || Boolean(state.validation) || remoteReadOnly}
                onClick={() => intent('workspaceFolders.save')}
              >
                {labels.save}
              </LumenButton>
            )
          )}
        </LumenFrame>
      }
    >
      <LumenFrame className="hbar-workspace-folders-body" data-testid="workspace-folders-editor">
        <LumenContentText context="dialog.body">{browsing ? labels.browserHint : labels.description}</LumenContentText>
        {ownerNodeId ? (
          !browsing && (
            <LumenFrame className="hbar-workspace-folder-node-roots" aria-label={labels.nodeRoots}>
              <LumenContentText context="popover.title">{labels.nodeRoots}</LumenContentText>
              <LumenContentText context="form.help">{labels.nodeRootsHint}</LumenContentText>
              {nodeRegistryLoading ? (
                <LumenContentText context="feedback.message" role="status">
                  {labels.nodeRootLoading}
                </LumenContentText>
              ) : !connected || !ownerNode?.online || ownerNode.revokedAt !== null || !ownerNode.capabilities ? (
                <LumenContentText context="feedback.message" role="alert">
                  {labels.nodeRootUnavailable}
                </LumenContentText>
              ) : remoteReadOnly ? (
                <LumenContentText context="feedback.message" role="status">
                  {labels.nodeRootObserver}
                </LumenContentText>
              ) : remoteRoots.length === 0 ? (
                <LumenContentText context="feedback.message">{labels.nodeRootUnavailable}</LumenContentText>
              ) : (
                <LumenFrame className="hbar-workspace-folder-node-root-list" role="group" aria-label={labels.nodeRoots}>
                  {remoteRoots.map((root) => {
                    const alreadyMounted = mountedRootIds.has(root.rootId)
                    const overlapsMounted = !alreadyMounted && rootOverlapsMounted(root.rootId)
                    const atCapacity = state.folders.length >= WORKSPACE_FOLDER_LIMIT
                    return (
                      <LumenButton
                        key={root.rootId}
                        type="button"
                        variant="outlined"
                        indicator="none"
                        disabled={disabled || alreadyMounted || overlapsMounted || atCapacity}
                        aria-label={labels.nodeRootName(root.name)}
                        onClick={() =>
                          intent('workspaceFolders.addNodeRoot', {
                            nodeId: ownerNodeId,
                            rootId: root.rootId,
                            name: root.name,
                          })
                        }
                      >
                        <LumenIcon icon={Folder} tier="sm" />
                        <LumenContentText context="control.label" className="hbar-workspace-folder-node-root-name">
                          {root.name}
                        </LumenContentText>
                        <LumenContentText context="metadata">{labels.nodeRootAccess(root.access)}</LumenContentText>
                        {alreadyMounted ? (
                          <LumenContentText context="metadata">{labels.nodeRootMounted}</LumenContentText>
                        ) : overlapsMounted ? (
                          <LumenContentText context="metadata">{labels.nodeRootOverlap}</LumenContentText>
                        ) : null}
                      </LumenButton>
                    )
                  })}
                </LumenFrame>
              )}
            </LumenFrame>
          )
        ) : (
          <LumenFormField controlId={`${id}-path`} label={labels.path} description={labels.pathHint}>
            <LumenFrame className="hbar-workspace-folder-path-row">
              <LumenInput
                id={`${id}-path`}
                value={state.path}
                maxLength={4000}
                disabled={disabled}
                onChange={(event) => intent('workspaceFolders.path', { value: event.currentTarget.value })}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
                  event.preventDefault()
                  if (browsing) browse()
                  else intent('workspaceFolders.addPath')
                }}
              />
              <LumenButton
                type="button"
                variant="outlined"
                indicator="none"
                disabled={disabled}
                onClick={() => browse()}
              >
                <LumenIcon icon={FolderOpen} tier="sm" />
                {labels.browse}
              </LumenButton>
              {!browsing && (
                <HbarActionIconButton
                  label={labels.addPath}
                  disabled={disabled || !state.path.trim()}
                  onClick={() => intent('workspaceFolders.addPath')}
                >
                  <LumenIcon icon={Plus} tier="sm" />
                </HbarActionIconButton>
              )}
            </LumenFrame>
          </LumenFormField>
        )}
        {browsing ? (
          <>
            {state.page && (
              <>
                <LumenFrame className="hbar-workspace-folder-browser-toolbar">
                  <LumenPopupSelect
                    aria-label={labels.quickLocations}
                    value={null}
                    placeholder={labels.quickLocations}
                    disabled={disabled}
                    options={state.page.roots.map((root) => ({ id: root.path, label: root.name }))}
                    onValueChange={(path) => browse(path)}
                  />
                  <LumenButton
                    variant="text"
                    indicator="none"
                    disabled={disabled || !state.page.parent}
                    onClick={() => browse(state.page!.parent ?? undefined)}
                  >
                    <LumenIcon icon={ArrowUp} tier="sm" />
                    {labels.up}
                  </LumenButton>
                  <LumenButton
                    variant="outlined"
                    indicator="none"
                    disabled={disabled}
                    aria-pressed={state.selected.includes(state.page.path)}
                    onClick={() => intent('workspaceFolders.toggle', { path: state.page!.path })}
                  >
                    {labels.selectCurrent}
                  </LumenButton>
                </LumenFrame>
                <LumenContentText
                  context="dialog.body"
                  className="hbar-workspace-folder-current"
                  title={state.page.path}
                >
                  {state.page.path}
                </LumenContentText>
                <LumenTree
                  label={labels.folders}
                  aria-multiselectable="true"
                  className="hbar-workspace-folder-browser-list"
                  data-testid="workspace-folder-browser"
                >
                  {state.page.items.map((folder) => (
                    <LumenTreeItem
                      key={folder.path}
                      nodeId={folder.path}
                      label={folder.name}
                      selected={state.selected.includes(folder.path)}
                      onActivate={() => {
                        if (!disabled) intent('workspaceFolders.toggle', { path: folder.path })
                      }}
                      content={
                        <LumenFrame className="hbar-workspace-folder-browser-row">
                          <LumenCheckBoxControl
                            aria-label={labels.selectFolder(folder.name)}
                            checked={state.selected.includes(folder.path)}
                            disabled={disabled}
                            onChange={() => intent('workspaceFolders.toggle', { path: folder.path })}
                          />
                          <LumenIcon icon={Folder} tier="sm" />
                          <LumenContentText
                            context="metadata"
                            className="hbar-workspace-folder-browser-label"
                            title={folder.path}
                          >
                            {folder.name}
                          </LumenContentText>
                          <HbarActionIconButton
                            label={labels.openFolder(folder.name)}
                            disabled={disabled}
                            onClick={() => browse(folder.path)}
                          >
                            <LumenIcon icon={ChevronRight} tier="sm" />
                          </HbarActionIconButton>
                        </LumenFrame>
                      }
                    />
                  ))}
                </LumenTree>
                {state.page.items.length === 0 && (
                  <LumenContentText context="dialog.body">{labels.emptyDirectory}</LumenContentText>
                )}
                {state.page.nextCursor && (
                  <LumenButton variant="text" disabled={disabled} onClick={() => browse(state.page!.path, true)}>
                    {labels.loadMore}
                  </LumenButton>
                )}
                {state.page.scanTruncated && (
                  <LumenContentText context="dialog.body" role="status">
                    {labels.scanTruncated}
                  </LumenContentText>
                )}
              </>
            )}
            <LumenFrame className="hbar-workspace-folder-selection" aria-label={labels.selected(state.selected.length)}>
              <LumenContentText context="popover.title">{labels.selected(state.selected.length)}</LumenContentText>
              {state.selected.map((path) => (
                <LumenButton
                  key={path}
                  size="s"
                  variant="outlined"
                  indicator="none"
                  title={path}
                  disabled={disabled}
                  aria-label={labels.selectFolder(path)}
                  onClick={() => intent('workspaceFolders.toggle', { path })}
                >
                  <LumenContentText context="control.label" className="hbar-workspace-folder-selection-name">
                    {path
                      .replace(/[\\/]+$/, '')
                      .split(/[\\/]/)
                      .at(-1) || path}
                  </LumenContentText>
                  <LumenIcon icon={Trash2} tier="sm" />
                </LumenButton>
              ))}
            </LumenFrame>
          </>
        ) : (
          <>
            <LumenFrame className="hbar-workspace-folders-heading">
              <LumenContentText context="popover.title">{labels.folders}</LumenContentText>
              <LumenContentText context="record.description">
                {labels.count(state.folders.length, WORKSPACE_FOLDER_LIMIT)}
              </LumenContentText>
            </LumenFrame>
            <LumenContentText context="dialog.body">{labels.aliasHint}</LumenContentText>
            {state.folders.length === 0 && <LumenContentText context="dialog.body">{labels.empty}</LumenContentText>}
            <LumenCollection as="ol" className="hbar-workspace-folder-list" aria-label={labels.folders}>
              {state.folders.map((folder, index) => {
                const root = ownerNodeId ? registeredRoot(folder.path) : undefined
                return (
                  <LumenCollectionItem
                    as="li"
                    key={folder.id}
                    className="hbar-workspace-folder"
                    data-folder-id={folder.id}
                  >
                    <LumenFrame className="hbar-workspace-folder-header">
                      <LumenIcon icon={Folder} tier="sm" />
                      <LumenContentText context="popover.title" title={folder.alias}>
                        {labels.folderCaption(folder.alias || labels.alias)}
                      </LumenContentText>
                      {index === 0 && (
                        <LumenContentText context="record.description" className="hbar-workspace-folder-primary">
                          {labels.primary}
                        </LumenContentText>
                      )}
                      <LumenFrame className="hbar-workspace-folder-priority">
                        <HbarActionIconButton
                          label={labels.moveUp}
                          disabled={folderEditingDisabled || index === 0}
                          onClick={() => intent('workspaceFolders.move', { id: folder.id, direction: 'up' })}
                        >
                          <LumenIcon icon={ArrowUp} tier="sm" />
                        </HbarActionIconButton>
                        <HbarActionIconButton
                          label={labels.moveDown}
                          disabled={folderEditingDisabled || index === state.folders.length - 1}
                          onClick={() => intent('workspaceFolders.move', { id: folder.id, direction: 'down' })}
                        >
                          <LumenIcon icon={ArrowDown} tier="sm" />
                        </HbarActionIconButton>
                        <HbarActionIconButton
                          label={labels.remove}
                          title={labels.removeHint}
                          disabled={folderEditingDisabled}
                          onClick={() => intent('workspaceFolders.remove', { id: folder.id })}
                        >
                          <LumenIcon icon={Trash2} tier="sm" />
                        </HbarActionIconButton>
                      </LumenFrame>
                    </LumenFrame>
                    <LumenFrame className="hbar-workspace-folder-fields">
                      <LumenFormField controlId={`${id}-${folder.id}-alias`} label={labels.alias}>
                        <LumenInput
                          id={`${id}-${folder.id}-alias`}
                          value={folder.alias}
                          maxLength={64}
                          disabled={folderEditingDisabled}
                          onChange={(event) =>
                            intent('workspaceFolders.edit', {
                              id: folder.id,
                              field: 'alias',
                              value: event.currentTarget.value,
                            })
                          }
                        />
                      </LumenFormField>
                      {ownerNodeId ? (
                        <LumenContentText
                          context="metadata"
                          className="hbar-workspace-folder-root-summary"
                          title={folder.path}
                        >
                          <span>{root?.name ?? labels.nodeRootUnavailable}</span>
                          {root ? <span>{labels.nodeRootAccess(root.access)}</span> : null}
                        </LumenContentText>
                      ) : (
                        <LumenFormField controlId={`${id}-${folder.id}-path`} label={labels.path}>
                          <LumenInput
                            id={`${id}-${folder.id}-path`}
                            value={folder.path}
                            title={folder.path}
                            maxLength={4000}
                            disabled={disabled}
                            onChange={(event) =>
                              intent('workspaceFolders.edit', {
                                id: folder.id,
                                field: 'path',
                                value: event.currentTarget.value,
                              })
                            }
                          />
                        </LumenFormField>
                      )}
                    </LumenFrame>
                  </LumenCollectionItem>
                )
              })}
            </LumenCollection>
            {state.workspaceId && !locked && (
              <LumenButton
                variant="text"
                indicator="none"
                title={labels.refreshHint}
                disabled={disabled}
                onClick={() => intent('workspaceFolders.refresh')}
              >
                {labels.refresh}
              </LumenButton>
            )}
            <LumenContentText context="dialog.body">{labels.removeHint}</LumenContentText>
          </>
        )}
        {!connected && (
          <LumenContentText context="dialog.body" role="alert">
            {labels.offline}
          </LumenContentText>
        )}
        {state.status in labels.status && (
          <LumenContentText context="dialog.body" role="status">
            {labels.status[state.status as keyof typeof labels.status]}
          </LumenContentText>
        )}
        {state.validation && (
          <LumenContentText context="dialog.body" role="alert">
            {labels.validation[state.validation]}
          </LumenContentText>
        )}
        {state.error && (
          <LumenContentText context="dialog.body" role="alert">
            {labels.error(state.error)}
          </LumenContentText>
        )}
        {unexpectedFailure && (
          <LumenContentText context="dialog.body" role="alert">
            {labels.unexpectedFailure}
          </LumenContentText>
        )}
        {state.status === 'unknown' && (
          <LumenFrame className="hbar-workspace-folders-actions">
            <LumenButton
              variant="outlined"
              disabled={!connected || state.requestInFlight}
              onClick={() => intent('workspaceFolders.reconcile')}
            >
              {labels.reconcile}
            </LumenButton>
            <LumenButton
              variant="text"
              disabled={!connected || state.requestInFlight}
              onClick={() => intent('workspaceFolders.retry')}
            >
              {labels.retry}
            </LumenButton>
          </LumenFrame>
        )}
      </LumenFrame>
    </LumenDialog>
  )
}
