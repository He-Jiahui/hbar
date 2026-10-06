import { useEffect, useId, useRef } from 'react'
import { Check, Circle, Folder, MessageSquare } from 'lucide-react'
import type { DirectoryState } from '@hbar/app-runtime'
import {
  LumenActionMenu,
  LumenButton,
  LumenFrame,
  LumenIcon,
  LumenInput,
  LumenNavigationButton,
  LumenText,
} from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { SessionArchiveFeedback, type SessionArchiveLabels } from './session-archive'
import { SessionActivityIndicator, type SessionActivityIndicatorContent } from './session-activity-indicator'

export interface SessionRenameLabels {
  readonly form: (title: string) => string
  readonly title: string
  readonly save: string
  readonly cancel: string
  readonly saving: string
  readonly saved: string
  readonly unknown: string
  readonly reconcile: string
  readonly checking: string
  readonly error: (code: string) => string
}

export interface SessionNavigationRowLabels {
  readonly openSession: (name: string) => string
  readonly sessionUpdatedAt: (timestamp: number, now?: number) => string
  readonly sessionUpdatedAtFull: (timestamp: number) => string
  readonly sessionActions: (name: string) => string
  readonly selectSession: (name: string) => string
  readonly renameSession: string
  readonly archiveSession: string
  readonly archive: SessionArchiveLabels
  readonly renameEditor: SessionRenameLabels
}

export interface SessionNavigationRowMetadata {
  readonly workspaceName: string
  /** Canonical path is optional because timeline rows may be projected without directory data. */
  readonly workspacePath?: string | undefined
  readonly execution: SessionActivityIndicatorContent
}

/** A filtered/removed row must not make its pending intent impossible to resolve. */
export function SessionRenameRecovery({
  labels,
  connected,
}: {
  readonly labels: SessionRenameLabels
  readonly connected: boolean
}) {
  const runtime = useHbarRuntime()
  const rename = useHbarRuntimeState(runtime.state.sessionRename)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const target = rename.target
  if (!target || rename.status === 'idle' || rename.status === 'succeeded') return null
  const session = directory.sessions[target.sessionId]
  if (session && !session.archived) return null
  const checking = rename.status === 'reconciling'
  const busy = checking || rename.status === 'submitting'
  const unknown = rename.status === 'unknown' || checking
  const invoke = (operation: 'cancel' | 'reconcile') => {
    void runtime.commands
      .execute(`sessionRename.${operation}`, { sessionId: target.sessionId, revision: rename.revision })
      .catch(() => {})
  }
  return (
    <LumenFrame
      className="hbar-app-react-session-rename hbar-app-react-session-rename-recovery"
      role="group"
      aria-label={labels.form(target.originalTitle)}
    >
      <LumenText as="strong">{labels.form(target.originalTitle)}</LumenText>
      <LumenInput aria-label={labels.title} value={rename.draft} readOnly />
      <LumenText as="p" role={busy ? 'status' : 'alert'}>
        {checking
          ? labels.checking
          : busy
            ? labels.saving
            : unknown
              ? labels.unknown
              : labels.error(rename.error ?? 'STALE_TARGET')}
      </LumenText>
      <LumenButton
        size="s"
        disabled={busy || (unknown && !connected)}
        onClick={() => invoke(unknown ? 'reconcile' : 'cancel')}
      >
        {unknown ? labels.reconcile : labels.cancel}
      </LumenButton>
    </LumenFrame>
  )
}

export function SessionNavigationRow({
  session,
  selected,
  connected,
  labels,
  now,
  onOpen,
  batchSelecting = false,
  batchSelected = false,
  onToggleBatchSelection,
  onExitBatchSelection,
  metadata,
  execution,
  responseTime,
}: {
  readonly session: DirectoryState['sessions'][string]
  readonly selected: boolean
  readonly connected: boolean
  readonly labels: SessionNavigationRowLabels
  readonly now: number
  readonly onOpen: () => void
  readonly batchSelecting?: boolean
  readonly batchSelected?: boolean
  readonly onToggleBatchSelection?: () => void
  readonly onExitBatchSelection?: () => void
  readonly metadata?: SessionNavigationRowMetadata | undefined
  readonly execution?: SessionActivityIndicatorContent | undefined
  readonly responseTime?: { readonly at: number | null; readonly emptyLabel: string } | undefined
}) {
  const runtime = useHbarRuntime()
  const rename = useHbarRuntimeState(runtime.state.sessionRename)
  const { mutation: archive, batch: archiveBatch } = useHbarRuntimeState(runtime.state.sessionArchive)
  const archiving =
    archive.target?.sessionId === session.id &&
    archive.target.archived &&
    archive.status !== 'idle' &&
    archive.status !== 'succeeded'
  const archiveLocked = (archive.status !== 'idle' && archive.status !== 'succeeded') || archiveBatch.status !== 'idle'
  const own = rename.target?.sessionId === session.id && rename.target.workspaceId === session.workspaceId
  const editing = own && rename.status !== 'idle' && rename.status !== 'succeeded'
  const busy = rename.status === 'submitting' || rename.status === 'reconciling'
  const unknown = rename.status === 'unknown'
  const locked = busy || unknown
  const inputId = useId()
  const feedbackId = useId()
  const row = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const wasEditing = useRef(false)
  const restoreFocus = useRef(false)
  const copy = labels.renameEditor
  const timestamp = responseTime ? responseTime.at : session.updatedAt
  const sessionTime =
    own && rename.status === 'succeeded' && session.title === rename.draft.trim() ? (
      <LumenText role="status" size="s" tone="subtle" className="hbar-app-react-session-time">
        {copy.saved}
      </LumenText>
    ) : timestamp === null ? (
      <LumenText size="s" tone="subtle" className="hbar-app-react-session-time">
        {responseTime?.emptyLabel}
      </LumenText>
    ) : (
      <LumenText
        as="time"
        className="hbar-app-react-session-time"
        dateTime={
          Number.isSafeInteger(timestamp) && timestamp >= 0 && timestamp <= 8_640_000_000_000_000
            ? new Date(timestamp).toISOString()
            : undefined
        }
        title={labels.sessionUpdatedAtFull(timestamp)}
      >
        {labels.sessionUpdatedAt(timestamp, now)}
      </LumenText>
    )
  const openActions = (): boolean => {
    if (batchSelecting || editing || archiving) return false
    const menu = row.current?.querySelector<HTMLDetailsElement>('details.lumen-action-menu')
    if (!menu) return false
    menu.open = true
    queueMicrotask(() => menu.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus())
    return true
  }
  useEffect(() => {
    const owner = row.current
    if (!owner) return
    let removeOutside = () => {}
    const toggled = (event: Event) => {
      if (!(event.target instanceof HTMLDetailsElement) || !event.target.matches('details.lumen-action-menu')) return
      removeOutside()
      const menu = event.target
      if (!menu.open) return
      const document = owner.ownerDocument
      const dismiss = (pointer: PointerEvent) => {
        if (pointer.target instanceof Node && !menu.contains(pointer.target)) {
          menu.open = false
          removeOutside()
        }
      }
      document.addEventListener('pointerdown', dismiss, true)
      removeOutside = () => document.removeEventListener('pointerdown', dismiss, true)
    }
    owner.addEventListener('toggle', toggled, true)
    return () => {
      removeOutside()
      owner.removeEventListener('toggle', toggled, true)
    }
  }, [])
  const invoke = (operation: 'submit' | 'cancel' | 'reconcile') => {
    void runtime.commands
      .execute(`sessionRename.${operation}`, { sessionId: session.id, revision: rename.revision })
      .catch(() => {})
  }
  useEffect(() => {
    if (editing && !wasEditing.current) {
      input.current?.focus()
      input.current?.select()
      restoreFocus.current = true
    } else if (!editing && !archiving && wasEditing.current && restoreFocus.current) {
      const document = row.current?.ownerDocument
      const active = document?.activeElement
      // A disabled submit control may leave focus on the body. Restore only
      // within this row/body; never steal focus chosen in another conversation.
      if (active === document?.body || (active && row.current?.contains(active)))
        row.current?.querySelector<HTMLButtonElement>('.hbar-app-react-session-target')?.focus()
    }
    if (archiving) restoreFocus.current = true
    wasEditing.current = editing || archiving
  }, [editing, archiving])
  return (
    <LumenFrame
      ref={row}
      className="hbar-app-react-session-row"
      data-selected={selected}
      data-batch-selected={batchSelected || undefined}
      data-session-id={session.id}
      data-editing={editing || undefined}
      onContextMenu={(event) => {
        if (event.target instanceof Element && event.target.closest('details, input, textarea')) return
        if (openActions()) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
      onKeyDown={(event) => {
        if ((event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) && openActions()) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        if (event.key === 'Escape' && batchSelecting && onExitBatchSelection) {
          event.preventDefault()
          event.stopPropagation()
          onExitBatchSelection()
        }
      }}
    >
      {archiving ? (
        <SessionArchiveFeedback labels={labels.archive} connected={connected} focusCancel />
      ) : editing ? (
        <LumenFrame
          as="form"
          className="hbar-app-react-session-rename"
          aria-label={copy.form(rename.target?.originalTitle ?? session.title)}
          noValidate
          onFocus={() => {
            restoreFocus.current = true
          }}
          onBlur={(event) => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) restoreFocus.current = false
          }}
          onSubmit={(event) => {
            event.preventDefault()
            if (!locked) invoke('submit')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault()
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              if (!locked) invoke('cancel')
            }
          }}
        >
          <LumenFrame as="label" className="hbar-app-react-session-rename-label" htmlFor={inputId}>
            {copy.title}
          </LumenFrame>
          <LumenInput
            ref={input}
            id={inputId}
            value={rename.draft}
            maxLength={160}
            required
            disabled={locked}
            aria-describedby={feedbackId}
            aria-invalid={rename.status === 'failed' || undefined}
            onChange={(event) => {
              void runtime.commands
                .execute('sessionRename.edit', {
                  sessionId: session.id,
                  revision: rename.revision,
                  title: event.currentTarget.value,
                })
                .catch(() => {})
            }}
          />
          <LumenFrame className="hbar-app-react-session-rename-actions">
            {unknown || rename.status === 'reconciling' ? (
              <LumenButton size="s" disabled={!connected || busy} onClick={() => invoke('reconcile')}>
                {busy ? copy.checking : copy.reconcile}
              </LumenButton>
            ) : (
              <>
                <LumenButton size="s" type="button" disabled={locked} onClick={() => invoke('cancel')}>
                  {copy.cancel}
                </LumenButton>
                <LumenButton size="s" type="submit" tone="primary" disabled={!connected || locked}>
                  {busy ? copy.saving : copy.save}
                </LumenButton>
              </>
            )}
          </LumenFrame>
          <LumenText as="p" id={feedbackId} role={rename.status === 'failed' || unknown ? 'alert' : 'status'}>
            {unknown
              ? copy.unknown
              : rename.status === 'reconciling'
                ? copy.checking
                : busy
                  ? copy.saving
                  : rename.error
                    ? copy.error(rename.error)
                    : null}
          </LumenText>
        </LumenFrame>
      ) : (
        <>
          <LumenNavigationButton
            className="hbar-app-react-session-target"
            size="s"
            variant="text"
            selected={batchSelecting ? batchSelected : selected}
            indicatorEdge="left"
            aria-label={batchSelecting ? labels.selectSession(session.title) : labels.openSession(session.title)}
            aria-pressed={batchSelecting ? batchSelected : undefined}
            title={session.title}
            onClick={batchSelecting && onToggleBatchSelection ? onToggleBatchSelection : onOpen}
          >
            {(batchSelecting || !metadata) && (
              <LumenIcon icon={batchSelecting ? (batchSelected ? Check : Circle) : MessageSquare} tier="sm" />
            )}
            <LumenText
              as="span"
              className="hbar-app-react-session-label"
              data-has-metadata={metadata ? 'true' : undefined}
            >
              {metadata ? (
                <>
                  <LumenFrame className="hbar-app-react-session-main-line">
                    <LumenText as="span" size="s" variant="label" className="hbar-app-react-session-title">
                      {session.title}
                    </LumenText>
                    {sessionTime}
                    <SessionActivityIndicator execution={metadata.execution} />
                  </LumenFrame>
                  <LumenText as="span" size="s" variant="supporting" className="hbar-app-react-session-context-line">
                    <LumenIcon icon={Folder} tier="sm" />
                    <LumenText
                      as="span"
                      size="s"
                      variant="supporting"
                      className="hbar-app-react-session-workspace-label"
                      title={metadata.workspacePath ?? metadata.workspaceName}
                    >
                      {metadata.workspaceName}
                    </LumenText>
                  </LumenText>
                </>
              ) : (
                <>
                  <LumenText as="span" size="s" variant="label" className="hbar-app-react-session-title">
                    {session.title}
                  </LumenText>
                  <SessionActivityIndicator execution={execution} />
                  {sessionTime}
                </>
              )}
            </LumenText>
          </LumenNavigationButton>
          {!batchSelecting && (
            <LumenActionMenu
              label={labels.sessionActions(session.title)}
              items={[
                {
                  id: 'rename',
                  label: labels.renameSession,
                  disabled: !['idle', 'succeeded'].includes(rename.status) || archiveLocked,
                },
                {
                  id: 'archive',
                  label: labels.archiveSession,
                  disabled: !connected || archiveLocked || !['idle', 'succeeded'].includes(rename.status),
                  tone: 'danger',
                },
              ]}
              onAction={(action) => {
                if (action === 'rename') {
                  void runtime.commands
                    .execute('sessionRename.begin', { workspaceId: session.workspaceId, sessionId: session.id })
                    .catch(() => {})
                } else
                  void runtime.commands
                    .execute('sessionArchive.begin', { workspaceId: session.workspaceId, sessionId: session.id })
                    .catch(() => {})
              }}
            />
          )}
        </>
      )}
    </LumenFrame>
  )
}
