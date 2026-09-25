import { useEffect, useId, useRef } from 'react'
import { MessageSquare } from 'lucide-react'
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
  readonly sessionUpdatedAt: (timestamp: number) => string
  readonly sessionActions: (name: string) => string
  readonly renameSession: string
  readonly archiveSession: string
  readonly renameEditor: SessionRenameLabels
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
  onOpen,
  onArchive,
}: {
  readonly session: DirectoryState['sessions'][string]
  readonly selected: boolean
  readonly connected: boolean
  readonly labels: SessionNavigationRowLabels
  readonly onOpen: () => void
  readonly onArchive: () => void
}) {
  const runtime = useHbarRuntime()
  const rename = useHbarRuntimeState(runtime.state.sessionRename)
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
    } else if (!editing && wasEditing.current && restoreFocus.current) {
      const document = row.current?.ownerDocument
      const active = document?.activeElement
      // A disabled submit control may leave focus on the body. Restore only
      // within this row/body; never steal focus chosen in another conversation.
      if (active === document?.body || (active && row.current?.contains(active)))
        row.current?.querySelector<HTMLButtonElement>('.hbar-app-react-session-target')?.focus()
    }
    wasEditing.current = editing
  }, [editing])
  return (
    <LumenFrame
      ref={row}
      className="hbar-app-react-session-row"
      data-selected={selected}
      data-session-id={session.id}
      data-editing={editing || undefined}
    >
      {editing ? (
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
            selected={selected}
            indicatorEdge="left"
            aria-label={labels.openSession(session.title)}
            title={session.title}
            onClick={onOpen}
          >
            <LumenIcon icon={MessageSquare} tier="sm" />
            <LumenText as="span" className="hbar-app-react-session-label">
              <LumenText size="s" variant="label">
                {session.title}
              </LumenText>
              <LumenText as="small" size="s" tone="subtle" variant="supporting">
                {own && rename.status === 'succeeded' && session.title === rename.draft.trim()
                  ? copy.saved
                  : labels.sessionUpdatedAt(session.updatedAt)}
              </LumenText>
            </LumenText>
          </LumenNavigationButton>
          <LumenActionMenu
            label={labels.sessionActions(session.title)}
            items={[
              { id: 'rename', label: labels.renameSession, disabled: !['idle', 'succeeded'].includes(rename.status) },
              { id: 'archive', label: labels.archiveSession, tone: 'danger' },
            ]}
            onAction={(action) => {
              if (action === 'rename') {
                void runtime.commands
                  .execute('sessionRename.begin', { workspaceId: session.workspaceId, sessionId: session.id })
                  .catch(() => {})
              } else onArchive()
            }}
          />
        </>
      )}
    </LumenFrame>
  )
}
