import { useEffect, useId, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, Folder, FolderOpen, Plus, Trash2 } from 'lucide-react'
import {
  LumenButton,
  LumenCheckBoxControl,
  LumenDialog,
  LumenFormField,
  LumenFrame,
  LumenIcon,
  LumenInput,
  LumenPopupSelect,
  LumenText,
  LumenTree,
  LumenTreeItem,
} from '@lumen/app-ui'
import { workspaceFoldersClientCommands, type WorkspaceFoldersState } from '@hbar/app-runtime'
import { WORKSPACE_FOLDER_LIMIT } from '@hbar/contracts/commands/workspace-folders'
import { HbarActionIconButton } from './action-icon-button'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './workspace-folders.css'

export interface WorkspaceFoldersLabels {
  readonly create: string
  readonly manage: string
  readonly browse: string
  readonly description: string
  readonly browserHint: string
  readonly alias: string
  readonly aliasHint: string
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
}

/** The connected adapter sends intents only. Drafts, selection, pagination and receipts live in Runtime. */
export function HbarWorkspaceFoldersDialog({
  labels,
  connected,
}: {
  readonly labels: WorkspaceFoldersLabels
  readonly connected: boolean
}) {
  const runtime = useHbarRuntime()
  const state = useHbarRuntimeState(runtime.state.workspaceFolders)
  const [unexpectedFailure, setUnexpectedFailure] = useState(false)
  useEffect(() => setUnexpectedFailure(false), [state.open, state.token])
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
  readonly unexpectedFailure?: boolean
  readonly execute: (
    name: `workspaceFolders.${'close' | 'path' | 'addPath' | 'edit' | 'remove' | 'move' | 'browse' | 'toggle' | 'addSelected' | 'back' | 'refresh' | 'save' | 'reconcile' | 'retry'}`,
    input: {
      token: number
      value?: string
      id?: string
      field?: 'alias' | 'path'
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
  execute,
  unexpectedFailure,
}: WorkspaceFoldersDialogProps) {
  const id = useId()
  const locked = state.requestInFlight || ['saving', 'unknown', 'checking'].includes(state.status)
  const disabled = !connected || locked || state.status === 'loading'
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
                disabled={disabled || state.folders.length === 0 || Boolean(state.validation)}
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
        <LumenText as="p">{browsing ? labels.browserHint : labels.description}</LumenText>
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
            <LumenButton type="button" variant="outlined" indicator="none" disabled={disabled} onClick={() => browse()}>
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
                <LumenText as="p" className="hbar-workspace-folder-current" title={state.page.path}>
                  {state.page.path}
                </LumenText>
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
                          <LumenText as="span" className="hbar-workspace-folder-browser-label" title={folder.path}>
                            {folder.name}
                          </LumenText>
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
                {state.page.items.length === 0 && <LumenText as="p">{labels.emptyDirectory}</LumenText>}
                {state.page.nextCursor && (
                  <LumenButton variant="text" disabled={disabled} onClick={() => browse(state.page!.path, true)}>
                    {labels.loadMore}
                  </LumenButton>
                )}
                {state.page.scanTruncated && (
                  <LumenText as="p" role="status">
                    {labels.scanTruncated}
                  </LumenText>
                )}
              </>
            )}
            <LumenFrame className="hbar-workspace-folder-selection" aria-label={labels.selected(state.selected.length)}>
              <LumenText as="strong">{labels.selected(state.selected.length)}</LumenText>
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
                  <LumenText as="span" className="hbar-workspace-folder-selection-name">
                    {path
                      .replace(/[\\/]+$/, '')
                      .split(/[\\/]/)
                      .at(-1) || path}
                  </LumenText>
                  <LumenIcon icon={Trash2} tier="sm" />
                </LumenButton>
              ))}
            </LumenFrame>
          </>
        ) : (
          <>
            <LumenFrame className="hbar-workspace-folders-heading">
              <LumenText as="strong">{labels.folders}</LumenText>
              <LumenText as="small">{labels.count(state.folders.length, WORKSPACE_FOLDER_LIMIT)}</LumenText>
            </LumenFrame>
            <LumenText as="p">{labels.aliasHint}</LumenText>
            {state.folders.length === 0 && <LumenText as="p">{labels.empty}</LumenText>}
            <ol className="hbar-workspace-folder-list" aria-label={labels.folders}>
              {state.folders.map((folder, index) => (
                <li key={folder.id} className="hbar-workspace-folder" data-folder-id={folder.id}>
                  <LumenFrame className="hbar-workspace-folder-header">
                    <LumenIcon icon={Folder} tier="sm" />
                    <LumenText as="strong" title={folder.alias}>
                      {folder.alias || labels.alias}
                      {'/'}
                    </LumenText>
                    {index === 0 && (
                      <LumenText as="small" className="hbar-workspace-folder-primary">
                        {labels.primary}
                      </LumenText>
                    )}
                    <LumenFrame className="hbar-workspace-folder-priority">
                      <HbarActionIconButton
                        label={labels.moveUp}
                        disabled={disabled || index === 0}
                        onClick={() => intent('workspaceFolders.move', { id: folder.id, direction: 'up' })}
                      >
                        <LumenIcon icon={ArrowUp} tier="sm" />
                      </HbarActionIconButton>
                      <HbarActionIconButton
                        label={labels.moveDown}
                        disabled={disabled || index === state.folders.length - 1}
                        onClick={() => intent('workspaceFolders.move', { id: folder.id, direction: 'down' })}
                      >
                        <LumenIcon icon={ArrowDown} tier="sm" />
                      </HbarActionIconButton>
                      <HbarActionIconButton
                        label={labels.remove}
                        title={labels.removeHint}
                        disabled={disabled}
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
                        disabled={disabled}
                        onChange={(event) =>
                          intent('workspaceFolders.edit', {
                            id: folder.id,
                            field: 'alias',
                            value: event.currentTarget.value,
                          })
                        }
                      />
                    </LumenFormField>
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
                  </LumenFrame>
                </li>
              ))}
            </ol>
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
            <LumenText as="p">{labels.removeHint}</LumenText>
          </>
        )}
        {!connected && (
          <LumenText as="p" role="alert">
            {labels.offline}
          </LumenText>
        )}
        {state.status in labels.status && (
          <LumenText as="p" role="status">
            {labels.status[state.status as keyof typeof labels.status]}
          </LumenText>
        )}
        {state.validation && (
          <LumenText as="p" role="alert">
            {labels.validation[state.validation]}
          </LumenText>
        )}
        {state.error && (
          <LumenText as="p" role="alert">
            {labels.error(state.error)}
          </LumenText>
        )}
        {unexpectedFailure && (
          <LumenText as="p" role="alert">
            {labels.unexpectedFailure}
          </LumenText>
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
