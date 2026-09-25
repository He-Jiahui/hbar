import { FolderTree } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  LumenFrame,
  LumenText,
  LumenButton,
  LumenDialog,
  LumenFileDocument,
  LumenTextarea,
  LumenSelect,
  LumenOption,
  LumenToolPane,
  type LumenWorkspaceFileLabels,
} from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarFileChanges, HbarFileDiff, type HbarFileChangesLabels } from './file-workspace-changes'
import { HbarFileTree, type HbarFileTreeLabels } from './file-workspace-tree'
import './lumen-file-workspace.css'

export interface HbarFileWorkspaceLabels extends LumenWorkspaceFileLabels {
  readonly changes: HbarFileChangesLabels
  readonly tree: HbarFileTreeLabels
  readonly preview: string
  readonly edit: string
  readonly textPreview: (path: string) => string
  readonly close: string
  readonly root: string
  readonly loadMore: string
  readonly save: string
  readonly saving: string
  readonly saved: string
  readonly reconcile: string
  readonly dirty: string
  readonly backToFiles: string
  readonly reload: string
  readonly reloadTitle: (path: string) => string
  readonly reloadDescription: string
  readonly keepDraft: string
  readonly discardAndReload: string
  readonly error: (code: string) => string
}

export function HbarFileWorkspace({
  labels,
  connected,
  instanceId: requestedInstanceId,
  targetLabel,
}: {
  readonly labels: HbarFileWorkspaceLabels
  readonly connected: boolean
  readonly instanceId?: string
  readonly targetLabel?: string | undefined
}) {
  const runtime = useHbarRuntime()
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const files = useHbarRuntimeState(runtime.state.files)
  const [reloadTarget, setReloadTarget] = useState<{
    instanceId: string
    workspaceId: string
    path: string
    expectedDraft: string
    expectedSha256: string | null
  } | null>(null)
  const instanceId = requestedInstanceId ?? presentation.toolInstanceId
  const panel = instanceId ? surfaces.panels[instanceId] : undefined
  const candidate = instanceId ? files.entries[instanceId] : undefined
  const entry = candidate?.workspaceId === panel?.workspaceId ? candidate : undefined
  const invoke = useCallback(
    (name: string, input: unknown) =>
      void (runtime.commands.execute as (command: string, value: unknown) => Promise<unknown>)(name, input).catch(
        () => {},
      ),
    [runtime.commands],
  )
  useEffect(() => {
    if (instanceId && panel?.panelId === 'files' && panel.workspaceId && entry?.workspaceId !== panel.workspaceId)
      invoke('fileWorkspace.refresh', { instanceId })
  }, [entry?.workspaceId, instanceId, invoke, panel?.panelId, panel?.workspaceId])
  useEffect(() => {
    if (
      instanceId &&
      panel?.panelId === 'files' &&
      panel.workspaceId &&
      entry?.workspaceId === panel.workspaceId &&
      entry.view === 'browser' &&
      entry.browserMode === 'changed' &&
      entry.changes.status === 'idle'
    )
      invoke('fileWorkspace.refreshChanges', { instanceId, workspaceId: panel.workspaceId })
  }, [
    entry?.browserMode,
    entry?.changes.status,
    entry?.view,
    entry?.workspaceId,
    instanceId,
    invoke,
    panel?.panelId,
    panel?.workspaceId,
  ])
  useEffect(() => {
    if (
      instanceId &&
      panel?.panelId === 'files' &&
      panel.workspaceId &&
      entry?.workspaceId === panel.workspaceId &&
      entry.view === 'browser' &&
      entry.browserMode === 'all' &&
      entry.tree.revalidateOnOpen
    )
      invoke('fileWorkspace.refresh', { instanceId })
  }, [
    entry?.browserMode,
    entry?.tree.revalidateOnOpen,
    entry?.view,
    entry?.workspaceId,
    instanceId,
    invoke,
    panel?.panelId,
    panel?.workspaceId,
  ])
  useEffect(() => setReloadTarget(null), [instanceId, panel?.workspaceId])
  if (!instanceId || panel?.panelId !== 'files') return null
  const document = entry?.view === 'document' ? entry.document : null
  const diff = entry?.view === 'diff' ? entry.diff : null
  const workspaceId = panel.workspaceId
  const editing = entry?.documentMode === 'edit'
  const busy = document?.status === 'submitting'
  const unknown = document?.status === 'unknown'
  const dirty = Boolean(document && document.draft !== document.baseline)
  const fileName = (path: string) => path.replaceAll('\\', '/').split('/').at(-1) ?? path
  const reload = () => {
    const target = reloadTarget
    setReloadTarget(null)
    if (target) invoke('fileWorkspace.discardAndReload', target)
  }
  const requestReload = () => {
    if (document && panel.workspaceId)
      setReloadTarget({
        instanceId,
        workspaceId: panel.workspaceId,
        path: document.path,
        expectedDraft: document.draft,
        expectedSha256: document.sha256,
      })
  }
  return (
    <>
      <LumenToolPane
        title={labels.title}
        targetLabel={targetLabel}
        description={entry ? (entry.path === '.' ? labels.root : entry.path) : undefined}
        icon={FolderTree}
        backLabel={document || diff ? labels.backToFiles : undefined}
        closeLabel={labels.close}
        onBack={document || diff ? () => invoke('fileWorkspace.showBrowser', { instanceId }) : undefined}
        onClose={() => invoke('app.closePanel', { instanceId })}
        busy={Boolean(
          !entry ||
          (!document &&
            !diff &&
            (entry.browserMode === 'changed' ? entry.changes.status === 'loading' : entry.status === 'loading')) ||
          diff?.status === 'loading' ||
          busy,
        )}
        className="hbar-app-react-file-workspace"
      >
        <LumenFrame className="hbar-app-react-file-layout" data-view={entry?.view ?? 'browser'}>
          {document ? (
            <LumenFileDocument
              path={document.path}
              name={fileName(document.path)}
              labels={labels}
              loading={document.status === 'loading'}
              error={
                document.status !== 'unknown' && (document.error || entry?.error)
                  ? labels.error(document.error ?? entry?.error ?? '')
                  : undefined
              }
              contentAvailable={document.sha256 !== null}
              refreshDisabled={dirty || busy || unknown}
              onRetry={() =>
                invoke('fileWorkspace.openEntry', { instanceId, workspaceId, path: document.path, directory: false })
              }
            >
              <LumenFrame className="hbar-file-document-modes">
                <LumenButton
                  variant={editing ? 'text' : 'outlined'}
                  aria-pressed={!editing}
                  onClick={() =>
                    invoke('fileWorkspace.setDocumentMode', {
                      instanceId,
                      workspaceId,
                      path: document.path,
                      mode: 'preview',
                    })
                  }
                >
                  {labels.preview}
                </LumenButton>
                <LumenButton
                  variant={editing ? 'outlined' : 'text'}
                  aria-pressed={editing}
                  onClick={() =>
                    invoke('fileWorkspace.setDocumentMode', {
                      instanceId,
                      workspaceId,
                      path: document.path,
                      mode: 'edit',
                    })
                  }
                >
                  {labels.edit}
                </LumenButton>
              </LumenFrame>
              {editing ? (
                <LumenTextarea
                  className="hbar-app-react-file-editor"
                  variant="plain"
                  aria-label={document.path}
                  value={document.draft}
                  disabled={!connected || unknown || document.status === 'loading'}
                  onChange={(event) => invoke('fileWorkspace.setText', { instanceId, text: event.currentTarget.value })}
                />
              ) : (
                <LumenText
                  as="pre"
                  className="hbar-file-text-preview"
                  tabIndex={0}
                  aria-label={labels.textPreview(document.path)}
                >
                  {document.draft}
                </LumenText>
              )}
              {unknown && document.error && (
                <LumenText as="p" role="alert">
                  {labels.error(document.error)}
                </LumenText>
              )}
              <LumenFrame as="footer">
                <LumenText as="span" role="status">
                  {dirty ? labels.dirty : document.status === 'succeeded' ? labels.saved : null}
                </LumenText>
                {dirty && !unknown && (
                  <LumenButton disabled={!connected || busy || document.status === 'loading'} onClick={requestReload}>
                    {labels.reload}
                  </LumenButton>
                )}
                {unknown ? (
                  <LumenButton disabled={!connected} onClick={() => invoke('fileWorkspace.reconcile', { instanceId })}>
                    {labels.reconcile}
                  </LumenButton>
                ) : editing ? (
                  <LumenButton
                    disabled={!connected || !dirty || busy}
                    tone="primary"
                    onClick={() => invoke('fileWorkspace.save', { instanceId })}
                  >
                    {busy ? labels.saving : labels.save}
                  </LumenButton>
                ) : null}
              </LumenFrame>
            </LumenFileDocument>
          ) : diff && entry ? (
            <HbarFileDiff
              key={`${diff.path}:${diff.cached}`}
              diff={diff}
              change={entry.changes.items.find((item) => item.path === diff.path)}
              labels={labels.changes}
              connected={connected}
              onOpen={(cached) =>
                invoke('fileWorkspace.openChange', { instanceId, workspaceId, path: diff.path, cached })
              }
              onFile={() =>
                invoke('fileWorkspace.openEntry', { instanceId, workspaceId, path: diff.path, directory: false })
              }
            />
          ) : (
            <LumenFrame className="hbar-app-react-file-browser">
              <LumenFrame className="hbar-file-browser-mode">
                <LumenSelect
                  aria-label={labels.changes.mode}
                  value={entry?.browserMode ?? 'all'}
                  disabled={!connected || !entry}
                  onChange={(event) =>
                    invoke('fileWorkspace.setBrowserMode', { instanceId, workspaceId, mode: event.currentTarget.value })
                  }
                >
                  <LumenOption value="all">{labels.changes.all}</LumenOption>
                  <LumenOption value="changed">{labels.changes.changed}</LumenOption>
                </LumenSelect>
              </LumenFrame>
              {entry?.browserMode === 'changed' ? (
                <HbarFileChanges
                  changes={entry.changes}
                  labels={labels.changes}
                  connected={connected}
                  onRefresh={() => invoke('fileWorkspace.refreshChanges', { instanceId, workspaceId })}
                  onFilter={(filter) => invoke('fileWorkspace.filterChanges', { instanceId, workspaceId, filter })}
                  onPage={(page) => invoke('fileWorkspace.pageChanges', { instanceId, workspaceId, page })}
                  onOpen={(path) => invoke('fileWorkspace.openChange', { instanceId, workspaceId, path })}
                />
              ) : (
                <HbarFileTree
                  entry={entry}
                  labels={labels.tree}
                  connected={connected}
                  onFilter={(filter) => invoke('fileWorkspace.filterTree', { instanceId, workspaceId, filter })}
                  onToggle={(path) => invoke('fileWorkspace.toggleTree', { instanceId, workspaceId, path })}
                  onRefreshNode={(path) => invoke('fileWorkspace.refreshTree', { instanceId, workspaceId, path })}
                  onMoreNode={(path) => invoke('fileWorkspace.loadMoreTree', { instanceId, workspaceId, path })}
                  onOpenFile={(path) =>
                    invoke('fileWorkspace.openEntry', { instanceId, workspaceId, path, directory: false })
                  }
                  onNavigateFolder={(path) =>
                    invoke('fileWorkspace.openEntry', { instanceId, workspaceId, path, directory: true })
                  }
                  onMoreRoot={() => invoke('fileWorkspace.loadMore', { instanceId })}
                  onRefreshRoot={() => invoke('fileWorkspace.refresh', { instanceId })}
                />
              )}
            </LumenFrame>
          )}
        </LumenFrame>
      </LumenToolPane>
      <LumenDialog
        open={reloadTarget !== null}
        title={labels.reloadTitle(reloadTarget?.path ?? '')}
        closeLabel={labels.keepDraft}
        onClose={() => setReloadTarget(null)}
        footer={
          <>
            <LumenButton onClick={() => setReloadTarget(null)}>{labels.keepDraft}</LumenButton>
            <LumenButton tone="danger" onClick={reload}>
              {labels.discardAndReload}
            </LumenButton>
          </>
        }
      >
        <LumenText as="p" className="hbar-app-react-file-reload-target">
          {reloadTarget?.path}
        </LumenText>
        <LumenText as="p" className="hbar-app-react-file-reload-description">
          {labels.reloadDescription}
        </LumenText>
      </LumenDialog>
    </>
  )
}
