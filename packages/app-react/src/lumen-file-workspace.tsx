import { ArrowLeft, FolderTree, Maximize2, MessageCircle, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LumenFrame,
  LumenText,
  LumenButton,
  LumenDialog,
  LumenIcon,
  LumenIconButton,
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
import { useFileNavigatorPresentation } from './file-navigator-presentation'
import './lumen-file-workspace.css'

export interface HbarFileWorkspaceLabels extends LumenWorkspaceFileLabels {
  readonly changes: HbarFileChangesLabels
  readonly tree: HbarFileTreeLabels
  readonly preview: string
  readonly edit: string
  readonly textPreview: (path: string) => string
  readonly close: string
  readonly closeWorkbench: string
  readonly expandWorkbench: string
  readonly returnToConversation: string
  readonly returnToWorkspace: string
  readonly root: string
  readonly loadMore: string
  readonly save: string
  readonly saving: string
  readonly saved: string
  readonly reconcile: string
  readonly dirty: string
  readonly backToFiles: string
  readonly showNavigator: string
  readonly hideNavigator: string
  readonly navigator: string
  readonly reload: string
  readonly reloadTitle: (path: string) => string
  readonly reloadDescription: string
  readonly keepDraft: string
  readonly discardAndReload: string
  readonly error: (code: string) => string
  readonly addToChat: string
  readonly addedToChat: (session: string) => string
  readonly alreadyInChat: (session: string) => string
  readonly addFileDraftPending: string
  readonly addNoSource: string
  readonly addOffline: string
  readonly addingToChat: string
  readonly addToChatError: (code: string) => string
}

export function HbarFileWorkspace({
  labels,
  connected,
  instanceId: requestedInstanceId,
  targetLabel,
  mode = 'dock',
  onExpand,
  onReturnToSource,
  onCloseWorkbench,
  actionError,
  returnLabel,
}: {
  readonly labels: HbarFileWorkspaceLabels
  readonly connected: boolean
  readonly instanceId?: string
  readonly targetLabel?: string | undefined
  readonly mode?: 'dock' | 'workbench'
  readonly onExpand?: (() => void) | undefined
  readonly onReturnToSource?: (() => void) | undefined
  readonly onCloseWorkbench?: (() => void) | undefined
  readonly actionError?: string | null | undefined
  readonly returnLabel?: string | undefined
}) {
  const runtime = useHbarRuntime()
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const files = useHbarRuntimeState(runtime.state.files)
  const tabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const drafts = useHbarRuntimeState(runtime.state.drafts)
  const addInFlight = useRef(false)
  const activeAddTarget = useRef('')
  const [addFeedback, setAddFeedback] = useState<{
    target: string
    kind: 'success' | 'error'
    message: string
    revision?: number
  } | null>(null)
  const [addingTarget, setAddingTarget] = useState<string | null>(null)
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
  const selectedPath =
    entry?.view === 'document'
      ? (entry.document?.path ?? null)
      : entry?.view === 'diff'
        ? (entry.diff?.path ?? null)
        : null
  const navigator = useFileNavigatorPresentation(`${instanceId}:${panel?.workspaceId}`, selectedPath)
  const hasPreview = entry?.view === 'document' || entry?.view === 'diff'
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
      entry.browserMode === 'changed' &&
      entry.changes.status === 'idle'
    )
      invoke('fileWorkspace.refreshChanges', { instanceId, workspaceId: panel.workspaceId, preservePreview: true })
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
      entry.browserMode === 'all' &&
      entry.tree.revalidateOnOpen
    )
      invoke('fileWorkspace.refresh', { instanceId, preservePreview: true })
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
  const sourceSessionId = panel.sessionId
  const sourceTab = tabs.items.find(
    (item) => item.kind === 'session' && item.id === sourceSessionId && item.workspaceId === workspaceId,
  )
  const workbenchTab =
    mode === 'workbench'
      ? tabs.items.find(
          (item) => item.kind === 'workbench' && item.id === tabs.activeId && item.panelInstanceId === instanceId,
        )
      : null
  const addTarget = `${instanceId}:${workspaceId}:${selectedPath}:${sourceTab?.instanceKey}:${workbenchTab?.instanceKey}`
  activeAddTarget.current = addTarget
  const blockedFileDraft = Boolean(
    document &&
    (dirty || document.status === 'unknown' || document.status === 'submitting' || document.status === 'loading'),
  )
  const canAdd = Boolean(
    connected &&
    workspaceId &&
    selectedPath &&
    sourceSessionId &&
    sourceTab &&
    (mode !== 'workbench' || workbenchTab) &&
    !blockedFileDraft &&
    (document || diff?.status === 'ready'),
  )
  const feedback =
    addFeedback?.target === addTarget &&
    (addFeedback.kind === 'error' || drafts[sourceSessionId ?? '']?.revision === addFeedback.revision)
      ? addFeedback
      : null
  const addHint =
    !sourceTab || !sourceSessionId
      ? labels.addNoSource
      : blockedFileDraft
        ? labels.addFileDraftPending
        : !connected
          ? labels.addOffline
          : addingTarget === addTarget
            ? labels.addingToChat
            : null
  const addCurrentFile = () => {
    if (!canAdd || !workspaceId || !selectedPath || !sourceSessionId || !sourceTab || addInFlight.current) return
    const target = addTarget
    const expectedRevision = runtime.state.drafts.getSnapshot()[sourceSessionId]?.revision ?? 0
    addInFlight.current = true
    setAddingTarget(target)
    setAddFeedback(null)
    void runtime.commands
      .execute('fileWorkspace.addToComposer', {
        instanceId,
        workspaceId,
        path: selectedPath,
        sourceSessionId,
        sourceTabInstanceKey: sourceTab.instanceKey,
        ...(workbenchTab ? { workbenchTabId: workbenchTab.id, workbenchTabInstanceKey: workbenchTab.instanceKey } : {}),
        expectedRevision,
      })
      .then((result) => {
        if (target !== activeAddTarget.current) return
        setAddFeedback({
          target,
          kind: 'success',
          message: result.added ? labels.addedToChat(result.sessionTitle) : labels.alreadyInChat(result.sessionTitle),
          revision: result.revision,
        })
      })
      .catch((reason: unknown) => {
        if (target !== activeAddTarget.current) return
        const code =
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED'
        setAddFeedback({ target, kind: 'error', message: labels.addToChatError(code) })
      })
      .finally(() => {
        addInFlight.current = false
        setAddingTarget(null)
      })
  }
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
        closeLabel={mode === 'workbench' ? labels.closeWorkbench : labels.close}
        onBack={document || diff ? () => invoke('fileWorkspace.showBrowser', { instanceId }) : undefined}
        onClose={mode === 'workbench' ? onCloseWorkbench : () => invoke('app.closePanel', { instanceId })}
        actions={
          <>
            {hasPreview && (
              <LumenIconButton
                ref={navigator.trigger}
                label={navigator.shown ? labels.hideNavigator : labels.showNavigator}
                aria-expanded={navigator.shown}
                onClick={navigator.toggle}
              >
                <LumenIcon icon={navigator.shown ? PanelRightClose : PanelRightOpen} tier="sm" />
              </LumenIconButton>
            )}
            {mode === 'dock' && onExpand ? (
              <LumenIconButton label={labels.expandWorkbench} onClick={onExpand}>
                <LumenIcon icon={Maximize2} tier="sm" />
              </LumenIconButton>
            ) : null}
          </>
        }
        toolbar={
          mode === 'workbench' && onReturnToSource ? (
            <LumenButton variant="text" size="s" onClick={onReturnToSource}>
              <LumenIcon icon={ArrowLeft} tier="sm" />
              {returnLabel ?? labels.returnToConversation}
            </LumenButton>
          ) : undefined
        }
        error={actionError ? <LumenText as="p">{actionError}</LumenText> : undefined}
        busy={Boolean(
          !entry ||
          (!document &&
            !diff &&
            (entry.browserMode === 'changed' ? entry.changes.status === 'loading' : entry.status === 'loading')) ||
          diff?.status === 'loading' ||
          busy,
        )}
        className={`hbar-app-react-file-workspace${mode === 'workbench' ? ' hbar-app-react-file-workbench' : ''}`}
      >
        <LumenFrame
          ref={navigator.layout}
          className="hbar-app-react-file-layout"
          data-view={entry?.view ?? 'browser'}
          data-two-pane={hasPreview && navigator.wide && navigator.shown}
        >
          <LumenFrame className="hbar-file-reader" hidden={!hasPreview || (!navigator.wide && navigator.shown)}>
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
                  {sourceTab && (mode !== 'workbench' || workbenchTab) && (
                    <LumenButton
                      className="hbar-file-add-to-chat"
                      variant="text"
                      disabled={!canAdd || addingTarget !== null}
                      onClick={addCurrentFile}
                    >
                      <LumenIcon icon={MessageCircle} tier="sm" />
                      {labels.addToChat}
                    </LumenButton>
                  )}
                </LumenFrame>
                {addHint && (
                  <LumenText as="p" role="status" className="hbar-file-add-feedback">
                    {addHint}
                  </LumenText>
                )}
                {feedback && (
                  <LumenText
                    as="p"
                    role={feedback.kind === 'error' ? 'alert' : 'status'}
                    className="hbar-file-add-feedback"
                  >
                    {feedback.message}
                  </LumenText>
                )}
                {editing ? (
                  <LumenTextarea
                    className="hbar-app-react-file-editor"
                    variant="plain"
                    aria-label={document.path}
                    value={document.draft}
                    disabled={!connected || unknown || document.status === 'loading'}
                    onChange={(event) =>
                      invoke('fileWorkspace.setText', { instanceId, text: event.currentTarget.value })
                    }
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
                    <LumenButton
                      disabled={!connected}
                      onClick={() => invoke('fileWorkspace.reconcile', { instanceId })}
                    >
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
                addToChat={
                  sourceTab && (mode !== 'workbench' || workbenchTab)
                    ? {
                        label: labels.addToChat,
                        disabled: !canAdd || addingTarget !== null,
                        onClick: addCurrentFile,
                        feedback: feedback?.message,
                        feedbackKind: feedback?.kind,
                      }
                    : undefined
                }
                referenceHint={addHint ?? undefined}
              />
            ) : null}
          </LumenFrame>
          <LumenFrame
            ref={navigator.navigator}
            role="region"
            aria-label={labels.navigator}
            className="hbar-app-react-file-browser"
            hidden={hasPreview && !navigator.shown}
          >
            <LumenFrame className="hbar-file-browser-mode">
              <LumenSelect
                aria-label={labels.changes.mode}
                value={entry?.browserMode ?? 'all'}
                disabled={!connected || !entry}
                onChange={(event) =>
                  invoke('fileWorkspace.setBrowserMode', {
                    instanceId,
                    workspaceId,
                    mode: event.currentTarget.value,
                    preservePreview: true,
                  })
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
                selectedPath={selectedPath}
                onRefresh={() =>
                  invoke('fileWorkspace.refreshChanges', { instanceId, workspaceId, preservePreview: true })
                }
                onFilter={(filter) => invoke('fileWorkspace.filterChanges', { instanceId, workspaceId, filter })}
                onPage={(page) => invoke('fileWorkspace.pageChanges', { instanceId, workspaceId, page })}
                onOpen={(path) => {
                  navigator.selected()
                  invoke('fileWorkspace.openChange', { instanceId, workspaceId, path })
                }}
              />
            ) : (
              <HbarFileTree
                entry={entry}
                labels={labels.tree}
                connected={connected}
                selectedPath={selectedPath}
                onFilter={(filter) => invoke('fileWorkspace.filterTree', { instanceId, workspaceId, filter })}
                onToggle={(path) => invoke('fileWorkspace.toggleTree', { instanceId, workspaceId, path })}
                onRefreshNode={(path) => invoke('fileWorkspace.refreshTree', { instanceId, workspaceId, path })}
                onMoreNode={(path) => invoke('fileWorkspace.loadMoreTree', { instanceId, workspaceId, path })}
                onOpenFile={(path) => {
                  navigator.selected()
                  invoke('fileWorkspace.openEntry', { instanceId, workspaceId, path, directory: false })
                }}
                onNavigateFolder={(path) =>
                  invoke('fileWorkspace.openEntry', {
                    instanceId,
                    workspaceId,
                    path,
                    directory: true,
                    preservePreview: true,
                  })
                }
                onMoreRoot={() => invoke('fileWorkspace.loadMore', { instanceId })}
                onRefreshRoot={() => invoke('fileWorkspace.refresh', { instanceId, preservePreview: true })}
              />
            )}
          </LumenFrame>
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
