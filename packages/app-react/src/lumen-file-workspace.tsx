import { ArrowLeft, FolderTree, Maximize2, MessageCircle, PanelRightClose, PanelRightOpen, X } from 'lucide-react'
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
import type { FileComposerContextSelection, SessionFileTarget } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarFileChanges, HbarFileDiff, type HbarFileChangesLabels } from './file-workspace-changes'
import { HbarFileTree, type HbarFileTreeLabels } from './file-workspace-tree'
import { useFileNavigatorPresentation } from './file-navigator-presentation'
import { useFilePreviewReadingPosition } from './file-preview-reading-position'
import { useFilePreviewPagination } from './file-preview-pagination'
import { filePreviewOwnsFailure, focusVisibleFilePreviewControl } from './file-preview-feedback'
import { HbarFilePreviewTabs, type HbarFilePreviewItem, type HbarFilePreviewLabels } from './file-preview-tabs'
import { HbarFileSourceSurface, type HbarFileContextLabels } from './file-context-surfaces'
import './lumen-file-workspace.css'

export interface HbarFileWorkspaceLabels extends LumenWorkspaceFileLabels {
  readonly context: HbarFileContextLabels
  readonly changes: HbarFileChangesLabels
  readonly tree: HbarFileTreeLabels
  readonly previews: HbarFilePreviewLabels
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
    previewId: string
    sourceSessionId: string | null
    sessionTarget: SessionFileTarget | null
    path: string
    expectedDraft: string
    expectedSha256: string | null
  } | null>(null)
  const [previewFeedback, setPreviewFeedback] = useState<{
    target: string
    message: string
    blockedId?: string
  } | null>(null)
  const instanceId = requestedInstanceId ?? presentation.toolInstanceId
  const panel = instanceId ? surfaces.panels[instanceId] : undefined
  const candidate = instanceId ? files.entries[instanceId] : undefined
  const ownerWorkbench = instanceId
    ? tabs.items.find((item) => item.kind === 'workbench' && item.panelInstanceId === instanceId)
    : undefined
  const sourceSessionId =
    ownerWorkbench?.kind === 'workbench' ? ownerWorkbench.sourceSessionId : (panel?.sessionId ?? null)
  const entry =
    candidate && panel && candidate.workspaceId === panel.workspaceId && candidate.sourceSessionId === sourceSessionId
      ? candidate
      : undefined
  const selectedPath =
    entry?.view === 'document'
      ? (entry.document?.path ?? null)
      : entry?.view === 'diff'
        ? (entry.diff?.path ?? null)
        : null
  const target = `${instanceId}:${panel?.workspaceId}:${sourceSessionId ?? ''}:${entry?.sessionTarget?.sessionId ?? ''}:${entry?.sessionTarget?.expectedRevision ?? ''}`
  const activeTarget = useRef(target)
  const previewIntent = useRef(0)
  activeTarget.current = target
  const navigator = useFileNavigatorPresentation(target, entry?.activePreviewId ?? null)
  const hasPreview = entry?.view === 'document' || entry?.view === 'diff'
  const diffPagination = useFilePreviewPagination(target, entry?.previews ?? [], entry?.activePreviewId ?? null)
  const reader = useFilePreviewReadingPosition(
    target,
    entry?.activePreviewId ?? null,
    entry?.documentMode ?? 'preview',
    Boolean(entry?.document?.sha256 || entry?.diff?.text),
    (entry?.previews ?? []).map((item) => item.id).join('\u0000'),
    diffPagination?.page,
  )
  const invoke = useCallback(
    (name: string, input: unknown) => {
      const payload = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
      const commandInput = name.startsWith('fileWorkspace.')
        ? {
            ...payload,
            sourceSessionId: Object.prototype.hasOwnProperty.call(payload, 'sourceSessionId')
              ? payload.sourceSessionId
              : sourceSessionId,
            sessionTarget: Object.prototype.hasOwnProperty.call(payload, 'sessionTarget')
              ? payload.sessionTarget
              : (entry?.sessionTarget ?? null),
          }
        : input
      const previewAction = [
        'fileWorkspace.openEntry',
        'fileWorkspace.openChange',
        'fileWorkspace.selectPreview',
        'fileWorkspace.refreshPreview',
      ].includes(name)
      const intent = previewAction ? ++previewIntent.current : null
      if (previewAction) setPreviewFeedback(null)
      void (runtime.commands.execute as (command: string, value: unknown) => Promise<unknown>)(
        name,
        commandInput,
      ).catch((reason: unknown) => {
        if (intent === null || intent !== previewIntent.current || activeTarget.current !== target) return
        const code =
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED'
        const latest = instanceId ? runtime.state.files.getSnapshot().entries[instanceId] : undefined
        // A reader already owns this error. Only add strip feedback when no current reader displays it.
        if (filePreviewOwnsFailure(latest, name, input)) return
        if (code !== 'CANCELLED' && code !== 'TARGET_CHANGED' && code !== 'RESULT_UNKNOWN')
          setPreviewFeedback({ target, message: labels.previews.error(code) })
      })
    },
    [runtime.commands, runtime.state.files, instanceId, sourceSessionId, entry?.sessionTarget, target, labels.previews],
  )
  useEffect(() => {
    if (instanceId && panel?.panelId === 'files' && panel.workspaceId && entry?.workspaceId !== panel.workspaceId)
      invoke('fileWorkspace.refresh', { instanceId })
  }, [
    candidate?.sourceSessionId,
    entry?.workspaceId,
    instanceId,
    invoke,
    panel?.panelId,
    panel?.workspaceId,
    sourceSessionId,
  ])
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
  useEffect(
    () => setReloadTarget(null),
    [instanceId, panel?.workspaceId, sourceSessionId, entry?.sessionTarget?.expectedRevision],
  )
  if (!instanceId || panel?.panelId !== 'files') return null
  const document = entry?.view === 'document' ? entry.document : null
  const diff = entry?.view === 'diff' ? entry.diff : null
  const workspaceId = panel.workspaceId
  const previewId = entry?.activePreviewId ?? undefined
  const previews: readonly HbarFilePreviewItem[] = (entry?.previews ?? []).map((item) => ({
    id: item.id,
    path: item.path,
    kind: item.kind === 'document' ? 'document' : item.diff.cached ? 'staged' : 'working',
    protection:
      item.kind !== 'document'
        ? null
        : item.document.status === 'unknown'
          ? 'unknown'
          : item.document.status === 'submitting'
            ? 'submitting'
            : item.document.draft !== item.document.baseline
              ? 'dirty'
              : null,
  }))
  const showPreviewTabs = previews.length > 1 || (previews.length === 1 && !previewId)
  const activePreview = previews.find((item) => item.id === previewId)
  const selectPreview = (id: string) => {
    setPreviewFeedback(null)
    invoke('fileWorkspace.selectPreview', { instanceId, workspaceId, previewId: id })
  }
  const closePreviews = (ids: readonly string[]) => {
    if (!workspaceId || !ids.length) return
    const owner = navigator.layout.current?.closest<HTMLElement>('.hbar-app-react-file-workspace')
    const restoreFocus = Boolean(owner?.contains(globalThis.document?.activeElement))
    setPreviewFeedback(null)
    void runtime.commands
      .execute('fileWorkspace.closePreviews', {
        instanceId,
        workspaceId,
        previewIds: [...ids],
        sourceSessionId,
        sessionTarget: entry?.sessionTarget ?? null,
      })
      .then((result) => {
        if (activeTarget.current !== target) return
        const blocked = result.blocked[0]
        if (blocked) {
          const item = previews.find((candidate) => candidate.id === blocked.previewId)
          if (item)
            setPreviewFeedback({
              target,
              message: labels.previews.blocked(item.path, blocked.reason),
              blockedId: item.id,
            })
          return
        }
        if (restoreFocus)
          requestAnimationFrame(() => {
            if (!owner?.isConnected || !owner.getClientRects().length || activeTarget.current !== target) return
            const currentFocus = owner.ownerDocument.activeElement
            if (currentFocus !== owner.ownerDocument.body && !owner.contains(currentFocus)) return
            focusVisibleFilePreviewControl(owner)
          })
      })
      .catch((reason: unknown) => {
        if (activeTarget.current !== target) return
        const code =
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED'
        setPreviewFeedback({ target, message: labels.previews.error(code) })
      })
  }
  const singleClose =
    !showPreviewTabs && activePreview ? (
      <LumenIconButton
        className="hbar-file-single-preview-close"
        label={labels.previews.close(activePreview.path, activePreview.kind)}
        onClick={() => closePreviews([activePreview.id])}
      >
        <LumenIcon icon={X} tier="sm" />
      </LumenIconButton>
    ) : undefined
  const editing = entry?.documentMode === 'edit'
  const busy = document?.status === 'submitting'
  const unknown = document?.status === 'unknown'
  const dirty = Boolean(document && document.draft !== document.baseline)
  const sourceTab = tabs.items.find(
    (item) => item.kind === 'session' && item.id === sourceSessionId && item.workspaceId === workspaceId,
  )
  const workbenchTab =
    mode === 'workbench'
      ? tabs.items.find(
          (item) => item.kind === 'workbench' && item.id === tabs.activeId && item.panelInstanceId === instanceId,
        )
      : null
  const addTarget = `${target}:${workspaceId}:${previewId}:${selectedPath}:${sourceTab?.instanceKey}:${workbenchTab?.instanceKey}`
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
  const addCurrentFile = async (context?: FileComposerContextSelection): Promise<boolean> => {
    if (!canAdd || !workspaceId || !selectedPath || !sourceSessionId || !sourceTab || addInFlight.current) return false
    const target = addTarget
    const expectedRevision = runtime.state.drafts.getSnapshot()[sourceSessionId]?.revision ?? 0
    addInFlight.current = true
    setAddingTarget(target)
    setAddFeedback(null)
    return runtime.commands
      .execute('fileWorkspace.addToComposer', {
        instanceId,
        workspaceId,
        ...(previewId ? { previewId } : {}),
        path: selectedPath,
        sourceSessionId,
        sessionTarget: entry?.sessionTarget ?? null,
        sourceTabInstanceKey: sourceTab.instanceKey,
        ...(workbenchTab ? { workbenchTabId: workbenchTab.id, workbenchTabInstanceKey: workbenchTab.instanceKey } : {}),
        expectedRevision,
        ...(context ? { context } : {}),
      })
      .then((result) => {
        if (target !== activeAddTarget.current) return false
        setAddFeedback({
          target,
          kind: 'success',
          message: result.added ? labels.addedToChat(result.sessionTitle) : labels.alreadyInChat(result.sessionTitle),
          revision: result.revision,
        })
        return true
      })
      .catch((reason: unknown) => {
        if (target !== activeAddTarget.current) return false
        const code =
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED'
        setAddFeedback({ target, kind: 'error', message: labels.addToChatError(code) })
        return false
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
    if (document && panel.workspaceId && previewId)
      setReloadTarget({
        instanceId,
        workspaceId: panel.workspaceId,
        previewId,
        sourceSessionId,
        sessionTarget: entry?.sessionTarget ?? null,
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
        onBack={
          document || diff
            ? () => invoke('fileWorkspace.showBrowser', { instanceId, workspaceId, previewId })
            : undefined
        }
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
        {showPreviewTabs && (
          <HbarFilePreviewTabs
            items={previews}
            activeId={previewId ?? null}
            labels={labels.previews}
            onSelect={selectPreview}
            onClose={closePreviews}
          />
        )}
        {previewFeedback?.target === target && (
          <LumenFrame className="hbar-file-preview-feedback" role="alert">
            <LumenText as="p">{previewFeedback.message}</LumenText>
            {previewFeedback.blockedId &&
              previewFeedback.blockedId !== previewId &&
              previews.some((item) => item.id === previewFeedback.blockedId) && (
                <LumenButton
                  variant="text"
                  onClick={() => {
                    if (previewFeedback.blockedId) selectPreview(previewFeedback.blockedId)
                  }}
                >
                  {labels.previews.showBlocked}
                </LumenButton>
              )}
          </LumenFrame>
        )}
        <LumenFrame
          ref={navigator.layout}
          className="hbar-app-react-file-layout"
          data-view={entry?.view ?? 'browser'}
          data-two-pane={hasPreview && navigator.wide && navigator.shown}
        >
          <LumenFrame
            ref={reader}
            className="hbar-file-reader"
            id={previewId ? `file-preview-panel-${previewId}` : undefined}
            role={showPreviewTabs && previewId ? 'tabpanel' : undefined}
            aria-labelledby={showPreviewTabs && previewId ? `file-preview-tab-${previewId}` : undefined}
            hidden={!hasPreview || (!navigator.wide && navigator.shown)}
          >
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
                retainContentWhileLoading
                headerActions={singleClose}
                refreshDisabled={dirty || busy || unknown}
                onRetry={() => invoke('fileWorkspace.refreshPreview', { instanceId, workspaceId, previewId })}
              >
                <LumenFrame className="hbar-file-document-modes">
                  <LumenButton
                    variant={editing ? 'text' : 'outlined'}
                    aria-pressed={!editing}
                    onClick={() =>
                      invoke('fileWorkspace.setDocumentMode', {
                        instanceId,
                        workspaceId,
                        previewId,
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
                        previewId,
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
                      onClick={() => {
                        void addCurrentFile()
                      }}
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
                      invoke('fileWorkspace.setText', {
                        instanceId,
                        workspaceId,
                        previewId,
                        text: event.currentTarget.value,
                      })
                    }
                  />
                ) : (
                  <HbarFileSourceSurface
                    key={`${previewId}:${document.sha256}`}
                    path={document.path}
                    value={document.draft}
                    sha256={document.sha256}
                    previewLabel={labels.textPreview(document.path)}
                    labels={labels.context}
                    disabled={!canAdd || addingTarget !== null}
                    onAdd={addCurrentFile}
                  />
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
                      onClick={() => invoke('fileWorkspace.reconcile', { instanceId, workspaceId, previewId })}
                    >
                      {labels.reconcile}
                    </LumenButton>
                  ) : editing ? (
                    <LumenButton
                      disabled={!connected || !dirty || busy}
                      tone="primary"
                      onClick={() => invoke('fileWorkspace.save', { instanceId, workspaceId, previewId })}
                    >
                      {busy ? labels.saving : labels.save}
                    </LumenButton>
                  ) : null}
                </LumenFrame>
              </LumenFileDocument>
            ) : diff && entry ? (
              <HbarFileDiff
                key={previewId}
                diff={diff}
                change={entry.changes.items.find((item) => item.path === diff.path)}
                labels={labels.changes}
                connected={connected}
                pagination={diffPagination}
                headerActions={singleClose}
                onRefresh={() => invoke('fileWorkspace.refreshPreview', { instanceId, workspaceId, previewId })}
                onOpen={(cached) =>
                  invoke('fileWorkspace.openChange', { instanceId, workspaceId, previewId, path: diff.path, cached })
                }
                onFile={() =>
                  invoke('fileWorkspace.openEntry', { instanceId, workspaceId, path: diff.path, directory: false })
                }
                addToChat={
                  sourceTab && (mode !== 'workbench' || workbenchTab)
                    ? {
                        label: labels.addToChat,
                        disabled: !canAdd || addingTarget !== null,
                        onClick: () => {
                          void addCurrentFile()
                        },
                        feedback: feedback?.message,
                        feedbackKind: feedback?.kind,
                      }
                    : undefined
                }
                referenceHint={addHint ?? undefined}
                context={
                  sourceTab && (mode !== 'workbench' || workbenchTab)
                    ? { labels: labels.context, disabled: !canAdd || addingTarget !== null, onAdd: addCurrentFile }
                    : undefined
                }
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
