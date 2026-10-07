import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { LumenButton, LumenCollection, LumenCollectionItem, LumenFrame, LumenContentText } from '@lumen/app-ui'
import { SESSION_ARCHIVE_BATCH_MAX_ITEMS } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './session-archive.css'

const commandErrorCode = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'

export interface SessionArchiveBatchLabels {
  readonly enter: string
  readonly selectionTitle: string
  readonly selectedCount: (count: number, maximum: number) => string
  readonly maximumReached: (maximum: number) => string
  readonly maximumHint: (maximum: number) => string
  readonly clearSelection: string
  readonly exitSelection: string
  readonly archiveSelected: string
  readonly previewTitle: (count: number) => string
  readonly pending: string
  readonly cancel: string
  readonly confirm: string
  readonly project: (name: string) => string
  readonly target: (workspaceName: string, title: string) => string
  readonly archiving: (completed: number, total: number) => string
  readonly processing: string
  readonly checking: string
  readonly reconcile: string
  readonly continue: string
  readonly archived: (title: string) => string
  readonly failed: (title: string, code: string) => string
  readonly unknown: (title: string) => string
  readonly succeeded: (count: number) => string
  readonly partial: (failed: number, total: number) => string
  readonly dismiss: string
  readonly error: (code: string) => string
}

export function SessionArchiveBatchPanel({
  labels,
  connected,
  selecting,
  selectedTargets,
  toolbarRef,
  onClearSelection,
  onExitSelection,
  onBatchStarted,
  onBatchCancelled,
  onBatchDismissed,
}: {
  readonly labels: SessionArchiveBatchLabels
  readonly connected: boolean
  readonly selecting: boolean
  readonly selectedTargets: readonly { readonly workspaceId: string; readonly sessionId: string }[]
  readonly toolbarRef: RefObject<HTMLButtonElement | null>
  readonly onClearSelection: () => void
  readonly onExitSelection: () => void
  readonly onBatchStarted: () => void
  readonly onBatchCancelled: () => void
  readonly onBatchDismissed: () => void
}) {
  const runtime = useHbarRuntime()
  const { batch } = useHbarRuntimeState(runtime.state.sessionArchive)
  const cancel = useRef<HTMLButtonElement>(null)
  const reconcile = useRef<HTMLButtonElement>(null)
  const continueBatch = useRef<HTMLButtonElement>(null)
  const dismiss = useRef<HTMLButtonElement>(null)
  const [commandError, setCommandError] = useState<string | null>(null)
  const restoreToolbarFocus = useRef(false)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const failedCount = batch.items.filter((item) => item.status === 'failed').length
  const completedCount = batch.items.filter((item) => item.status === 'archived' || item.status === 'failed').length

  useEffect(() => {
    if (batch.status === 'confirming') cancel.current?.focus()
  }, [batch.revision, batch.status])
  useEffect(() => {
    if (document.activeElement !== document.body) return
    if (batch.status === 'unknown') reconcile.current?.focus()
    else if (batch.status === 'paused') continueBatch.current?.focus()
    else if (batch.status === 'succeeded' || batch.status === 'partial') dismiss.current?.focus()
  }, [batch.revision, batch.status])
  useEffect(() => {
    if (batch.status !== 'idle' || !restoreToolbarFocus.current) return
    restoreToolbarFocus.current = false
    toolbarRef.current?.focus()
  }, [batch.status, batch.revision, toolbarRef])

  const invoke = (operation: 'confirm' | 'cancel' | 'reconcile' | 'continue' | 'dismiss') => {
    setCommandError(null)
    if (operation === 'cancel' || operation === 'dismiss') restoreToolbarFocus.current = true
    void runtime.commands
      .execute(`sessionArchiveBatch.${operation}`, { revision: batch.revision })
      .then(() => {
        if (operation === 'cancel') onBatchCancelled()
        if (operation === 'dismiss') {
          onBatchDismissed()
        }
      })
      .catch((error: unknown) => {
        restoreToolbarFocus.current = false
        setCommandError(commandErrorCode(error))
      })
  }

  const start = () => {
    setCommandError(null)
    void runtime.commands
      .execute('sessionArchiveBatch.begin', { targets: [...selectedTargets] })
      .then(onBatchStarted)
      .catch((error: unknown) => setCommandError(commandErrorCode(error)))
  }

  const escape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return
    if (batch.status === 'confirming') {
      event.preventDefault()
      event.stopPropagation()
      invoke('cancel')
    } else if (batch.status === 'idle' && selecting) {
      event.preventDefault()
      event.stopPropagation()
      onExitSelection()
      toolbarRef.current?.focus()
    }
  }

  if (batch.status === 'idle' && !selecting) return null

  const unknownTarget = batch.activeIndex === null ? null : (batch.items[batch.activeIndex]?.target ?? null)
  const workspaceIds = new Set(batch.items.map((item) => item.target.workspaceId))
  const singleWorkspaceId = workspaceIds.size === 1 ? batch.items[0]?.target.workspaceId : undefined
  const singleWorkspaceName = singleWorkspaceId
    ? (directory.workspaces[singleWorkspaceId]?.name ?? singleWorkspaceId)
    : undefined
  const reconciledTarget =
    batch.activeIndex === null ? null : (batch.items[Math.max(0, batch.activeIndex - 1)]?.target ?? null)
  const stateMessage =
    batch.status === 'confirming'
      ? null
      : batch.status === 'submitting'
        ? labels.archiving(completedCount, batch.items.length)
        : batch.status === 'unknown'
          ? labels.unknown(unknownTarget?.title ?? '')
          : batch.status === 'reconciling'
            ? labels.checking
            : batch.status === 'paused'
              ? labels.archived(reconciledTarget?.title ?? '')
              : batch.status === 'succeeded'
                ? labels.succeeded(batch.items.length)
                : batch.status === 'partial'
                  ? labels.partial(failedCount, batch.items.length)
                  : null

  return (
    <LumenFrame
      as="section"
      className="hbar-app-react-session-archive-batch"
      role="region"
      aria-label={batch.status === 'idle' ? labels.selectionTitle : labels.previewTitle(batch.items.length)}
      onKeyDown={escape}
    >
      {batch.status === 'idle' ? (
        <>
          <LumenContentText context="section.title">{labels.selectionTitle}</LumenContentText>
          <LumenContentText context="feedback.paragraph" role="status">
            {labels.selectedCount(selectedTargets.length, SESSION_ARCHIVE_BATCH_MAX_ITEMS)}
          </LumenContentText>
          <LumenContentText context="section.description">
            {labels.maximumHint(SESSION_ARCHIVE_BATCH_MAX_ITEMS)}
          </LumenContentText>
          {commandError && (
            <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
              {labels.error(commandError)}
            </LumenContentText>
          )}
          <LumenFrame
            className="hbar-app-react-session-archive-actions"
            role="group"
            aria-label={labels.selectionTitle}
            tabIndex={0}
          >
            <LumenButton size="s" variant="text" disabled={selectedTargets.length === 0} onClick={onClearSelection}>
              {labels.clearSelection}
            </LumenButton>
            <LumenButton size="s" variant="text" onClick={onExitSelection}>
              {labels.exitSelection}
            </LumenButton>
            <LumenButton size="s" tone="danger" disabled={!connected || selectedTargets.length === 0} onClick={start}>
              {labels.archiveSelected}
            </LumenButton>
          </LumenFrame>
        </>
      ) : (
        <>
          <LumenContentText context="section.title">{labels.previewTitle(batch.items.length)}</LumenContentText>
          {singleWorkspaceName && (
            <LumenContentText context="collection.detail">{labels.project(singleWorkspaceName)}</LumenContentText>
          )}
          <LumenFrame
            className="hbar-app-react-session-archive-batch-reading"
            role="group"
            aria-label={labels.previewTitle(batch.items.length)}
            tabIndex={0}
          >
            <LumenCollection as="ol" className="hbar-app-react-session-archive-batch-list">
              {batch.items.map((item) => {
                const workspace = directory.workspaces[item.target.workspaceId]
                return (
                  <LumenCollectionItem
                    key={`${item.target.workspaceId}\u0000${item.target.sessionId}`}
                    data-workspace-id={item.target.workspaceId}
                    data-session-id={item.target.sessionId}
                    data-result={item.status}
                  >
                    <LumenContentText
                      context="collection.title"
                      className="hbar-app-react-session-archive-batch-target"
                    >
                      {workspaceIds.size === 1
                        ? item.target.title
                        : labels.target(workspace?.name ?? item.target.workspaceId, item.target.title)}
                    </LumenContentText>
                    {item.status === 'pending' && batch.status === 'confirming' && (
                      <LumenFrame
                        className="hbar-app-react-session-archive-actions"
                        role="group"
                        aria-label={labels.pending}
                        tabIndex={0}
                      >
                        <LumenContentText context="control.status">{labels.pending}</LumenContentText>
                      </LumenFrame>
                    )}
                    {item.status === 'submitting' && (
                      <LumenContentText context="feedback.paragraph">{labels.processing}</LumenContentText>
                    )}
                    {item.status === 'archived' && (
                      <LumenContentText context="feedback.paragraph" tone="success">
                        {labels.archived(item.target.title)}
                      </LumenContentText>
                    )}
                    {item.status === 'failed' && (
                      <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
                        {labels.failed(item.target.title, item.error ?? 'UNKNOWN')}
                      </LumenContentText>
                    )}
                    {item.status === 'unknown' && (
                      <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
                        {labels.unknown(item.target.title)}
                      </LumenContentText>
                    )}
                  </LumenCollectionItem>
                )
              })}
            </LumenCollection>
          </LumenFrame>
          {stateMessage && (
            <LumenContentText
              context="feedback.paragraph"
              tone={
                batch.status === 'unknown' || batch.status === 'partial'
                  ? 'danger'
                  : batch.status === 'succeeded'
                    ? 'success'
                    : 'neutral'
              }
              role={batch.status === 'unknown' || batch.status === 'partial' ? 'alert' : 'status'}
            >
              {stateMessage}
            </LumenContentText>
          )}
          {commandError && (
            <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
              {labels.error(commandError)}
            </LumenContentText>
          )}
          <LumenFrame
            className="hbar-app-react-session-archive-actions"
            role="group"
            aria-label={labels.previewTitle(batch.items.length)}
            tabIndex={0}
          >
            {batch.status === 'confirming' && (
              <>
                <LumenButton ref={cancel} size="s" variant="text" onClick={() => invoke('cancel')}>
                  {labels.cancel}
                </LumenButton>
                <LumenButton size="s" tone="danger" disabled={!connected} onClick={() => invoke('confirm')}>
                  {labels.confirm}
                </LumenButton>
              </>
            )}
            {(batch.status === 'unknown' || batch.status === 'reconciling') && (
              <LumenButton
                ref={reconcile}
                size="s"
                disabled={!connected || batch.status === 'reconciling'}
                onClick={() => invoke('reconcile')}
              >
                {batch.status === 'reconciling' ? labels.checking : labels.reconcile}
              </LumenButton>
            )}
            {batch.status === 'paused' && (
              <LumenButton ref={continueBatch} size="s" disabled={!connected} onClick={() => invoke('continue')}>
                {labels.continue}
              </LumenButton>
            )}
            {(batch.status === 'succeeded' || batch.status === 'partial') && (
              <LumenButton ref={dismiss} size="s" onClick={() => invoke('dismiss')}>
                {labels.dismiss}
              </LumenButton>
            )}
          </LumenFrame>
        </>
      )}
    </LumenFrame>
  )
}

export interface SessionArchiveLabels {
  readonly openList: (workspaceName: string) => string
  readonly listTitle: (workspaceName: string) => string
  readonly close: string
  readonly loading: string
  readonly empty: string
  readonly emptyPage: string
  readonly firstPage: string
  readonly nextPage: string
  readonly page: (number: number) => string
  readonly restore: string
  readonly restoreSession: (title: string) => string
  readonly restoreTitle: (title: string) => string
  readonly restored: (title: string) => string
  readonly confirmTitle: (title: string) => string
  readonly description: string
  readonly confirm: string
  readonly cancel: string
  readonly archiving: string
  readonly restoring: string
  readonly archived: (title: string) => string
  readonly unknown: string
  readonly reconcile: string
  readonly checking: string
  readonly dismiss: string
  readonly error: (code: string) => string
}

export function SessionArchiveFeedback({
  labels,
  connected,
  focusCancel = false,
}: {
  readonly labels: SessionArchiveLabels
  readonly connected: boolean
  readonly focusCancel?: boolean
}) {
  const runtime = useHbarRuntime()
  const { mutation } = useHbarRuntimeState(runtime.state.sessionArchive)
  const cancel = useRef<HTMLButtonElement>(null)
  const result = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (focusCancel && mutation.status === 'confirming') cancel.current?.focus()
  }, [focusCancel, mutation.revision, mutation.status])
  useEffect(() => {
    const button = result.current
    if (button && button.ownerDocument.activeElement === button.ownerDocument.body) button.focus()
  }, [mutation.revision, mutation.status])
  const target = mutation.target
  if (!target || mutation.status === 'idle') return null
  const checking = mutation.status === 'reconciling'
  const busy = checking || mutation.status === 'submitting'
  const unknown = mutation.status === 'unknown' || checking
  const succeeded = mutation.status === 'succeeded'
  const invoke = (operation: 'confirm' | 'cancel' | 'reconcile' | 'dismiss') => {
    void runtime.commands
      .execute(`sessionArchive.${operation}`, { sessionId: target.sessionId, revision: mutation.revision })
      .catch(() => {})
  }
  return (
    <LumenFrame
      className="hbar-app-react-session-archive-feedback"
      role="group"
      aria-label={target.archived ? labels.confirmTitle(target.title) : labels.restoreTitle(target.title)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          if (!busy && !unknown) invoke(succeeded ? 'dismiss' : 'cancel')
        }
      }}
    >
      <LumenContentText context="feedback.title">
        {target.archived ? labels.confirmTitle(target.title) : labels.restoreTitle(target.title)}
      </LumenContentText>
      {target.archived && !succeeded && (
        <LumenContentText context="section.description">{labels.description}</LumenContentText>
      )}
      <LumenContentText
        context="feedback.paragraph"
        tone={unknown || mutation.status === 'failed' ? 'danger' : succeeded ? 'success' : 'neutral'}
        role={unknown || mutation.status === 'failed' ? 'alert' : 'status'}
      >
        {checking
          ? labels.checking
          : unknown
            ? labels.unknown
            : succeeded
              ? target.archived
                ? labels.archived(target.title)
                : labels.restored(target.title)
              : busy
                ? target.archived
                  ? labels.archiving
                  : labels.restoring
                : mutation.error
                  ? labels.error(mutation.error)
                  : null}
      </LumenContentText>
      <LumenFrame
        className="hbar-app-react-session-archive-actions"
        role="group"
        aria-label={target.archived ? labels.confirm : labels.restore}
        tabIndex={0}
      >
        {succeeded ? (
          <LumenButton ref={result} size="s" onClick={() => invoke('dismiss')}>
            {labels.dismiss}
          </LumenButton>
        ) : unknown ? (
          <LumenButton ref={result} size="s" disabled={!connected || busy} onClick={() => invoke('reconcile')}>
            {checking ? labels.checking : labels.reconcile}
          </LumenButton>
        ) : (
          <>
            <LumenButton ref={cancel} size="s" disabled={busy} onClick={() => invoke('cancel')}>
              {labels.cancel}
            </LumenButton>
            <LumenButton
              size="s"
              tone={target.archived ? 'danger' : 'primary'}
              disabled={!connected || busy}
              onClick={() => invoke('confirm')}
            >
              {busy
                ? target.archived
                  ? labels.archiving
                  : labels.restoring
                : target.archived
                  ? labels.confirm
                  : labels.restore}
            </LumenButton>
          </>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}

/** A hidden original row never hides a pending or unknown mutation with it. */
export function SessionArchiveRecovery({
  labels,
  connected,
  inlineSessionIds,
}: {
  readonly labels: SessionArchiveLabels
  readonly connected: boolean
  readonly inlineSessionIds: ReadonlySet<string>
}) {
  const runtime = useHbarRuntime()
  const { mutation, list } = useHbarRuntimeState(runtime.state.sessionArchive)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const target = mutation.target
  if (!target || mutation.status === 'idle') return null
  const session = directory.sessions[target.sessionId]
  const inline =
    mutation.status !== 'succeeded' &&
    directory.workspaces[target.workspaceId] !== undefined &&
    (target.archived
      ? inlineSessionIds.has(target.sessionId)
      : list.open &&
        list.workspaceId === target.workspaceId &&
        list.sessionIds.includes(target.sessionId) &&
        session?.archived)
  if (inline) return null
  return <SessionArchiveFeedback labels={labels} connected={connected} />
}

export function ArchivedSessions({
  workspaceId,
  workspaceName,
  labels,
  connected,
  getCloseFocusTarget,
}: {
  readonly workspaceId: string
  readonly workspaceName: string
  readonly labels: SessionArchiveLabels
  readonly connected: boolean
  readonly getCloseFocusTarget: () => HTMLElement | null
}) {
  const runtime = useHbarRuntime()
  const { mutation, list } = useHbarRuntimeState(runtime.state.sessionArchive)
  const directory = useHbarRuntimeState(runtime.state.directory)
  if (!list.open || list.workspaceId !== workspaceId) return null
  const sessions = list.sessionIds.flatMap((id) => {
    const session = directory.sessions[id]
    return session?.archived && session.workspaceId === workspaceId ? [session] : []
  })
  const loading = list.status === 'loading'
  const stale = list.sessionIds.some((id) => !directory.sessions[id])
  const mutationLocked = mutation.status !== 'idle' && mutation.status !== 'succeeded'
  const load = (direction: 'first' | 'next') => {
    void runtime.commands
      .execute('archivedSessions.load', { workspaceId, revision: list.revision, direction })
      .catch(() => {})
  }
  return (
    <LumenFrame as="section" className="hbar-app-react-archived-sessions" aria-label={labels.listTitle(workspaceName)}>
      <LumenFrame className="hbar-app-react-session-archive-heading">
        <LumenContentText context="section.title">{labels.listTitle(workspaceName)}</LumenContentText>
        <LumenFrame
          className="hbar-app-react-session-archive-actions"
          role="group"
          aria-label={labels.close}
          tabIndex={0}
        >
          <LumenButton
            size="s"
            variant="text"
            onClick={(event) => {
              const button = event.currentTarget
              const trigger = getCloseFocusTarget()
              void runtime.commands
                .execute('archivedSessions.close', { workspaceId, revision: list.revision })
                .then(() => {
                  const active = button.ownerDocument.activeElement
                  if ((active === button || active === button.ownerDocument.body) && trigger?.isConnected)
                    trigger.focus({ preventScroll: true })
                })
                .catch(() => {})
            }}
          >
            {labels.close}
          </LumenButton>
        </LumenFrame>
      </LumenFrame>
      <LumenFrame
        className="hbar-app-react-session-archive-actions"
        role="group"
        aria-label={labels.page(list.page)}
        tabIndex={0}
      >
        <LumenContentText context="metadata.detail">{labels.page(list.page)}</LumenContentText>
      </LumenFrame>
      {loading && (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {list.error && (
        <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
          {labels.error(list.error)}
        </LumenContentText>
      )}
      {stale && (
        <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
          {labels.error('PAGE_STALE')}
        </LumenContentText>
      )}
      {list.status === 'ready' && !stale && sessions.length === 0 && (
        <LumenContentText context="empty.description">
          {list.page === 1 && list.nextCursor === null ? labels.empty : labels.emptyPage}
        </LumenContentText>
      )}
      {sessions.map((session) => {
        const own =
          mutation.target?.sessionId === session.id &&
          !mutation.target.archived &&
          mutation.status !== 'idle' &&
          mutation.status !== 'succeeded'
        return (
          <LumenFrame
            key={session.id}
            className="hbar-app-react-archived-session"
            data-archived-session-id={session.id}
          >
            {own ? (
              <SessionArchiveFeedback labels={labels} connected={connected} />
            ) : (
              <>
                <LumenContentText context="collection.title">{session.title}</LumenContentText>
                <LumenFrame
                  className="hbar-app-react-session-archive-actions"
                  role="group"
                  aria-label={labels.restoreSession(session.title)}
                  tabIndex={0}
                >
                  <LumenButton
                    size="s"
                    disabled={!connected || mutationLocked}
                    aria-label={labels.restoreSession(session.title)}
                    onClick={() => {
                      void runtime.commands
                        .execute('sessionArchive.restore', { workspaceId, sessionId: session.id })
                        .catch(() => {})
                    }}
                  >
                    {labels.restore}
                  </LumenButton>
                </LumenFrame>
              </>
            )}
          </LumenFrame>
        )
      })}
      <LumenFrame
        className="hbar-app-react-session-archive-actions"
        role="group"
        aria-label={labels.page(list.page)}
        tabIndex={0}
      >
        <LumenButton size="s" variant="text" disabled={!connected || loading} onClick={() => load('first')}>
          {labels.firstPage}
        </LumenButton>
        {list.nextCursor && (
          <LumenButton size="s" disabled={!connected || loading} onClick={() => load('next')}>
            {labels.nextPage}
          </LumenButton>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}
