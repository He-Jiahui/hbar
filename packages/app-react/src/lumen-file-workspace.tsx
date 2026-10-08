import { ArrowLeft, FolderTree, Maximize2, MessageCircle, PanelRightClose, PanelRightOpen, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  hasOpenModalSurface,
  LumenFrame,
  LumenContentText,
  LumenButton,
  LumenDialog,
  LumenIcon,
  LumenIconButton,
  LumenFileDocument,
  LumenTextarea,
  LumenPopupSelect,
  LumenToolPane,
  LumenFileManager01,
  LumenFileManager03,
  LumenEditor02,
  LumenEditor03,
  LumenEditor05,
  type LumenWorkspaceFileLabels,
} from '@lumen/app-ui'
import type { FileComposerContextSelection, SessionFileTarget } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarFileChanges, HbarFileDiff, type HbarFileChangesLabels } from './file-workspace-changes'
import { HbarFileTree, type HbarFileTreeLabels } from './file-workspace-tree'
import { useFileNavigatorPresentation } from './file-navigator-presentation'
import { useFilePreviewReadingPosition } from './file-preview-reading-position'
import { useFilePreviewReveal } from './file-preview-reveal'
import { useFilePreviewPagination } from './file-preview-pagination'
import { filePreviewOwnsFailure, focusVisibleFilePreviewControl } from './file-preview-feedback'
import { captureFileReviewFocus } from './file-review-focus'
import { canFocusWorkspaceElement } from './workspace-tool-focus'
import { HbarFilePreviewTabs, type HbarFilePreviewItem, type HbarFilePreviewLabels } from './file-preview-tabs'
import { HbarFileSourceSurface, type HbarFileContextLabels } from './file-context-surfaces'
import { HbarFileMarkdownPreview, canRenderFileMarkdown, isMarkdownFile } from './file-markdown-preview'
import type { HbarCodeBlockLabels } from './code-block-copy-action'
import './lumen-file-workspace.css'

export interface HbarFileWorkspaceLabels extends LumenWorkspaceFileLabels {
  readonly context: HbarFileContextLabels
  readonly changes: HbarFileChangesLabels
  readonly tree: HbarFileTreeLabels
  readonly previews: HbarFilePreviewLabels
  readonly preview: string
  readonly edit: string
  readonly source: string
  readonly markdownTooLarge: string
  readonly markdownImage: (alt: string) => string
  readonly openLinkedFile: (path: string) => string
  readonly markdownCode: HbarCodeBlockLabels
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
  const reviewFocusLifetime = useRef(0)
  const reviewFocusReturn = useRef<(() => void) | null>(null)
  const [reviewFocusRequest, setReviewFocusRequest] = useState(0)
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
  useLayoutEffect(() => {
    reviewFocusLifetime.current += 1
    return () => {
      reviewFocusLifetime.current += 1
      reviewFocusReturn.current = null
    }
  }, [runtime, target])
  useLayoutEffect(() => {
    if (addingTarget !== null) return
    const finish = reviewFocusReturn.current
    reviewFocusReturn.current = null
    finish?.()
  }, [addingTarget, reviewFocusRequest])
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
  const revealPreviewId = entry?.activePreviewId ?? null
  const documentPreview = entry?.previews.find((item) => item.id === revealPreviewId && item.kind === 'document')
  const consumeReveal = useCallback(
    async (requestId: string) => {
      if (!instanceId || !panel?.workspaceId || !revealPreviewId) return
      await runtime.commands.execute('fileWorkspace.consumeReveal', {
        instanceId,
        workspaceId: panel.workspaceId,
        previewId: revealPreviewId,
        requestId,
        sourceSessionId,
        sessionTarget: entry?.sessionTarget ?? null,
      })
    },
    [runtime.commands, instanceId, panel?.workspaceId, revealPreviewId, sourceSessionId, entry?.sessionTarget],
  )
  const revealedLine = useFilePreviewReveal({
    reader,
    owner: runtime,
    previewId: revealPreviewId,
    request: documentPreview?.kind === 'document' ? documentPreview.reveal : undefined,
    value: entry?.document?.draft ?? '',
    ready: Boolean(entry?.document?.sha256 && entry.document.status !== 'loading'),
    editing: entry?.documentMode === 'edit',
    onConsume: consumeReveal,
  })
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
  const markdownFile = Boolean(document && isMarkdownFile(document.path))
  const previewing = entry?.documentMode === 'preview' || (!markdownFile && entry?.documentMode === 'source')
  const renderedMarkdown = Boolean(
    document && entry?.documentMode === 'preview' && canRenderFileMarkdown(document.path, document.draft),
  )
  const EditorRecipe = editing ? LumenEditor03 : renderedMarkdown ? LumenEditor05 : LumenEditor02
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
  const captureCommentCompletion = (line: HTMLElement | null) => {
    const lifetime = reviewFocusLifetime.current
    const owner = addTarget
    const document = line?.ownerDocument ?? globalThis.document
    const origin = document.activeElement
    const editor = origin instanceof Element ? origin.closest('.hbar-file-comment-editor') : null
    const composer =
      [...document.querySelectorAll<HTMLElement>('[data-hbar-composer-session]')]
        .find((element) => element.dataset.hbarComposerSession === sourceSessionId)
        ?.querySelector<HTMLElement>('[role="textbox"], textarea') ?? null
    const current = () => lifetime === reviewFocusLifetime.current && owner === activeAddTarget.current
    const finish = captureFileReviewFocus({
      composer,
      line,
      active: () =>
        document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : null,
      inEditor: (element) => editor?.contains(element) ?? false,
      current,
      usable: (element) => canFocusWorkspaceElement(element) && !hasOpenModalSurface(document),
      focus: (element) => element.focus({ preventScroll: true }),
    })
    return () => {
      if (!current()) return
      // The line may still be disabled in the pre-commit DOM after its read ACK.
      // Focus only after React has rendered the unlocked controls and removed the note.
      reviewFocusReturn.current = finish
      setReviewFocusRequest((request) => request + 1)
    }
  }
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
        error={
          actionError ? (
            <LumenContentText context="feedback.paragraph" tone="danger">
              {actionError}
            </LumenContentText>
          ) : undefined
        }
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
            <LumenContentText context="feedback.paragraph" tone="danger">
              {previewFeedback.message}
            </LumenContentText>
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
              <EditorRecipe
                slots={{
                  body: (
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
                          variant={previewing ? 'outlined' : 'text'}
                          aria-pressed={previewing}
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
                        {markdownFile && (
                          <LumenButton
                            variant={entry?.documentMode === 'source' ? 'outlined' : 'text'}
                            aria-pressed={entry?.documentMode === 'source'}
                            onClick={() =>
                              invoke('fileWorkspace.setDocumentMode', {
                                instanceId,
                                workspaceId,
                                previewId,
                                path: document.path,
                                mode: 'source',
                              })
                            }
                          >
                            {labels.source}
                          </LumenButton>
                        )}
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
                        <LumenContentText context="feedback.paragraph" role="status" className="hbar-file-add-feedback">
                          {addHint}
                        </LumenContentText>
                      )}
                      {feedback && (
                        <LumenContentText
                          context="feedback.paragraph"
                          tone={feedback.kind === 'error' ? 'danger' : 'success'}
                          role={feedback.kind === 'error' ? 'alert' : 'status'}
                          className="hbar-file-add-feedback"
                        >
                          {feedback.message}
                        </LumenContentText>
                      )}
                      {markdownFile && entry?.documentMode === 'preview' && !renderedMarkdown && (
                        <LumenContentText context="feedback.paragraph" role="status" className="hbar-file-add-feedback">
                          {labels.markdownTooLarge}
                        </LumenContentText>
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
                      ) : renderedMarkdown && previewId ? (
                        <HbarFileMarkdownPreview
                          key={previewId}
                          path={document.path}
                          value={document.draft}
                          label={labels.textPreview(document.path)}
                          imageLabel={labels.markdownImage}
                          openFileLabel={labels.openLinkedFile}
                          code={{ previewId, owner: runtime, labels: labels.markdownCode }}
                          onOpenFile={(path) =>
                            invoke('fileWorkspace.openEntry', { instanceId, workspaceId, path, directory: false })
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
                          revealedLine={revealedLine}
                          pagination={diffPagination}
                          onAdd={addCurrentFile}
                        />
                      )}
                      {unknown && document.error && (
                        <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
                          {labels.error(document.error)}
                        </LumenContentText>
                      )}
                      <LumenFrame
                        as="footer"
                        className="hbar-file-document-actions-reading"
                        role="group"
                        aria-label={labels.edit}
                        tabIndex={0}
                      >
                        <LumenContentText context="control.status" tone="subtle" role="status">
                          {dirty ? labels.dirty : document.status === 'succeeded' ? labels.saved : null}
                        </LumenContentText>
                        {dirty && !unknown && (
                          <LumenButton
                            disabled={!connected || busy || document.status === 'loading'}
                            onClick={requestReload}
                          >
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
                  ),
                }}
              />
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
                    ? {
                        labels: labels.context,
                        disabled: !canAdd || addingTarget !== null,
                        onAdd: addCurrentFile,
                        captureCommentCompletion,
                      }
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
              <LumenPopupSelect
                aria-label={labels.changes.mode}
                id="hbar-file-browser-mode"
                value={entry?.browserMode ?? 'all'}
                disabled={!connected || !entry}
                options={[
                  { id: 'all', label: labels.changes.all },
                  { id: 'changed', label: labels.changes.changed },
                ]}
                onValueChange={(mode) =>
                  invoke('fileWorkspace.setBrowserMode', {
                    instanceId,
                    workspaceId,
                    mode,
                    preservePreview: true,
                  })
                }
              />
            </LumenFrame>
            {entry?.browserMode === 'changed' ? (
              <LumenFileManager03
                slots={{
                  content: (
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
                  ),
                }}
              />
            ) : (
              <LumenFileManager01
                slots={{
                  navigation: (
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
                  ),
                }}
              />
            )}
          </LumenFrame>
        </LumenFrame>
      </LumenToolPane>
      <LumenDialog
        open={reloadTarget !== null}
        size="small"
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
        <LumenFrame
          className="hbar-app-react-file-reload-target"
          role="group"
          aria-label={reloadTarget?.path}
          tabIndex={0}
        >
          <LumenContentText context="resource.path">{reloadTarget?.path}</LumenContentText>
        </LumenFrame>
        <LumenContentText context="dialog.body" className="hbar-app-react-file-reload-description">
          {labels.reloadDescription}
        </LumenContentText>
      </LumenDialog>
    </>
  )
}
