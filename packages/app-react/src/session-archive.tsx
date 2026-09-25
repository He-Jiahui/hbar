import { useEffect, useRef } from 'react'
import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './session-archive.css'

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
      <LumenText as="strong">
        {target.archived ? labels.confirmTitle(target.title) : labels.restoreTitle(target.title)}
      </LumenText>
      {target.archived && !succeeded && <LumenText as="p">{labels.description}</LumenText>}
      <LumenText as="p" role={unknown || mutation.status === 'failed' ? 'alert' : 'status'}>
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
      </LumenText>
      <LumenFrame className="hbar-app-react-session-archive-actions">
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
  expandedWorkspaces,
}: {
  readonly labels: SessionArchiveLabels
  readonly connected: boolean
  readonly expandedWorkspaces: ReadonlySet<string>
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
      ? expandedWorkspaces.has(target.workspaceId) && session && !session.archived
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
}: {
  readonly workspaceId: string
  readonly workspaceName: string
  readonly labels: SessionArchiveLabels
  readonly connected: boolean
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
      <LumenFrame className="hbar-app-react-session-archive-actions">
        <LumenText as="strong">{labels.listTitle(workspaceName)}</LumenText>
        <LumenButton
          size="s"
          variant="text"
          onClick={(event) => {
            const button = event.currentTarget
            const trigger = button.closest('[data-workspace-id]')?.querySelector<HTMLElement>('summary')
            void runtime.commands
              .execute('archivedSessions.close', { workspaceId, revision: list.revision })
              .then(() => {
                const active = button.ownerDocument.activeElement
                if (active === button || active === button.ownerDocument.body) trigger?.focus()
              })
              .catch(() => {})
          }}
        >
          {labels.close}
        </LumenButton>
      </LumenFrame>
      <LumenText as="small">{labels.page(list.page)}</LumenText>
      {loading && (
        <LumenText as="p" role="status">
          {labels.loading}
        </LumenText>
      )}
      {list.error && (
        <LumenText as="p" role="alert">
          {labels.error(list.error)}
        </LumenText>
      )}
      {stale && (
        <LumenText as="p" role="alert">
          {labels.error('PAGE_STALE')}
        </LumenText>
      )}
      {list.status === 'ready' && !stale && sessions.length === 0 && (
        <LumenText as="p">{list.page === 1 && list.nextCursor === null ? labels.empty : labels.emptyPage}</LumenText>
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
                <LumenText as="span">{session.title}</LumenText>
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
              </>
            )}
          </LumenFrame>
        )
      })}
      <LumenFrame className="hbar-app-react-session-archive-actions">
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
