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
import { HbarActionIconButton } from './action-icon-button'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { WorkspaceFoldersMessagesProvider, useWorkspaceFoldersMessages } from './workspace-shell-messages'
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

export function WorkspaceFoldersDialog(props: WorkspaceFoldersDialogProps) {
  return (
    <WorkspaceFoldersMessagesProvider messages={props.labels}>
      <WorkspaceFoldersDialogView {...props} />
    </WorkspaceFoldersMessagesProvider>
  )
}

function WorkspaceFoldersDialogView({
  state,
  connected,
  execute,
  unexpectedFailure,
}: WorkspaceFoldersDialogProps) {
  const { t } = useWorkspaceFoldersMessages()
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
      title={browsing ? t('browse') : state.workspaceId ? t('manage') : t('create')}
      closeLabel={t('cancel')}
      onClose={() => intent('workspaceFolders.close')}
      className="hbar-workspace-folders-dialog"
      footer={
        <LumenFrame className="hbar-workspace-folders-actions">
          <LumenButton variant="text" indicator="none" onClick={() => intent('workspaceFolders.close')}>
            {state.status === 'saved' ? t('done') : t('cancel')}
          </LumenButton>
          {browsing ? (
            <>
              <LumenButton
                variant="outlined"
                indicator="none"
                disabled={locked}
                onClick={() => intent('workspaceFolders.back')}
              >
                {t('back')}
              </LumenButton>
              <LumenButton
                disabled={disabled || state.selected.length === 0}
                onClick={() => intent('workspaceFolders.addSelected')}
              >
                {t('addSelected')}
              </LumenButton>
            </>
          ) : (
            state.status !== 'saved' && (
              <LumenButton
                disabled={disabled || state.folders.length === 0 || Boolean(state.validation)}
                onClick={() => intent('workspaceFolders.save')}
              >
                {t('save')}
              </LumenButton>
            )
          )}
        </LumenFrame>
      }
    >
      <LumenFrame className="hbar-workspace-folders-body" data-testid="workspace-folders-editor">
        <LumenContentText context="dialog.body">{browsing ? t('browserHint') : t('description')}</LumenContentText>
        <LumenFormField controlId={`${id}-path`} label={t('path')} description={t('pathHint')}>
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
              {t('browse')}
            </LumenButton>
            {!browsing && (
              <HbarActionIconButton
                label={t('addPath')}
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
                    aria-label={t('quickLocations')}
                    value={null}
                    placeholder={t('quickLocations')}
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
                    {t('up')}
                  </LumenButton>
                  <LumenButton
                    variant="outlined"
                    indicator="none"
                    disabled={disabled}
                    aria-pressed={state.selected.includes(state.page.path)}
                    onClick={() => intent('workspaceFolders.toggle', { path: state.page!.path })}
                  >
                    {t('selectCurrent')}
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
                  label={t('folders')}
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
                            aria-label={t('selectFolder')(folder.name)}
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
                            label={t('openFolder')(folder.name)}
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
                  <LumenContentText context="dialog.body">{t('emptyDirectory')}</LumenContentText>
                )}
                {state.page.nextCursor && (
                  <LumenButton variant="text" disabled={disabled} onClick={() => browse(state.page!.path, true)}>
                    {t('loadMore')}
                  </LumenButton>
                )}
                {state.page.scanTruncated && (
                  <LumenContentText context="dialog.body" role="status">
                    {t('scanTruncated')}
                  </LumenContentText>
                )}
              </>
            )}
            <LumenFrame className="hbar-workspace-folder-selection" aria-label={t('selected')(state.selected.length)}>
              <LumenContentText context="popover.title">{t('selected')(state.selected.length)}</LumenContentText>
              {state.selected.map((path) => (
                <LumenButton
                  key={path}
                  size="s"
                  variant="outlined"
                  indicator="none"
                  title={path}
                  disabled={disabled}
                  aria-label={t('selectFolder')(path)}
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
              <LumenContentText context="popover.title">{t('folders')}</LumenContentText>
              <LumenContentText context="record.description">
                {t('count')(state.folders.length, WORKSPACE_FOLDER_LIMIT)}
              </LumenContentText>
            </LumenFrame>
            <LumenContentText context="dialog.body">{t('aliasHint')}</LumenContentText>
            {state.folders.length === 0 && <LumenContentText context="dialog.body">{t('empty')}</LumenContentText>}
            <LumenCollection as="ol" className="hbar-workspace-folder-list" aria-label={t('folders')}>
              {state.folders.map((folder, index) => (
                <LumenCollectionItem
                  as="li"
                  key={folder.id}
                  className="hbar-workspace-folder"
                  data-folder-id={folder.id}
                >
                  <LumenFrame className="hbar-workspace-folder-header">
                    <LumenIcon icon={Folder} tier="sm" />
                    <LumenContentText context="popover.title" title={folder.alias}>
                      {t('folderCaption')(folder.alias || t('alias'))}
                    </LumenContentText>
                    {index === 0 && (
                      <LumenContentText context="record.description" className="hbar-workspace-folder-primary">
                        {t('primary')}
                      </LumenContentText>
                    )}
                    <LumenFrame className="hbar-workspace-folder-priority">
                      <HbarActionIconButton
                        label={t('moveUp')}
                        disabled={disabled || index === 0}
                        onClick={() => intent('workspaceFolders.move', { id: folder.id, direction: 'up' })}
                      >
                        <LumenIcon icon={ArrowUp} tier="sm" />
                      </HbarActionIconButton>
                      <HbarActionIconButton
                        label={t('moveDown')}
                        disabled={disabled || index === state.folders.length - 1}
                        onClick={() => intent('workspaceFolders.move', { id: folder.id, direction: 'down' })}
                      >
                        <LumenIcon icon={ArrowDown} tier="sm" />
                      </HbarActionIconButton>
                      <HbarActionIconButton
                        label={t('remove')}
                        title={t('removeHint')}
                        disabled={disabled}
                        onClick={() => intent('workspaceFolders.remove', { id: folder.id })}
                      >
                        <LumenIcon icon={Trash2} tier="sm" />
                      </HbarActionIconButton>
                    </LumenFrame>
                  </LumenFrame>
                  <LumenFrame className="hbar-workspace-folder-fields">
                    <LumenFormField controlId={`${id}-${folder.id}-alias`} label={t('alias')}>
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
                    <LumenFormField controlId={`${id}-${folder.id}-path`} label={t('path')}>
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
                </LumenCollectionItem>
              ))}
            </LumenCollection>
            {state.workspaceId && !locked && (
              <LumenButton
                variant="text"
                indicator="none"
                title={t('refreshHint')}
                disabled={disabled}
                onClick={() => intent('workspaceFolders.refresh')}
              >
                {t('refresh')}
              </LumenButton>
            )}
            <LumenContentText context="dialog.body">{t('removeHint')}</LumenContentText>
          </>
        )}
        {!connected && (
          <LumenContentText context="dialog.body" role="alert">
            {t('offline')}
          </LumenContentText>
        )}
        {state.status in t('status') && (
          <LumenContentText context="dialog.body" role="status">
            {t('status')[state.status as 'loading' | 'saving' | 'checking' | 'unknown' | 'saved']}
          </LumenContentText>
        )}
        {state.validation && (
          <LumenContentText context="dialog.body" role="alert">
            {t('validation')[state.validation]}
          </LumenContentText>
        )}
        {state.error && (
          <LumenContentText context="dialog.body" role="alert">
            {t('error')(state.error)}
          </LumenContentText>
        )}
        {unexpectedFailure && (
          <LumenContentText context="dialog.body" role="alert">
            {t('unexpectedFailure')}
          </LumenContentText>
        )}
        {state.status === 'unknown' && (
          <LumenFrame className="hbar-workspace-folders-actions">
            <LumenButton
              variant="outlined"
              disabled={!connected || state.requestInFlight}
              onClick={() => intent('workspaceFolders.reconcile')}
            >
              {t('reconcile')}
            </LumenButton>
            <LumenButton
              variant="text"
              disabled={!connected || state.requestInFlight}
              onClick={() => intent('workspaceFolders.retry')}
            >
              {t('retry')}
            </LumenButton>
          </LumenFrame>
        )}
      </LumenFrame>
    </LumenDialog>
  )
}
