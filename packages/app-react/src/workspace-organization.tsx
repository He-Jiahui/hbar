import { useEffect, useRef, type KeyboardEvent } from 'react'
import { LumenContentText, LumenActionMenu, LumenButton, LumenFrame, type LumenActionMenuItem } from '@lumen/app-ui'
import type { WorkspaceOrganizationState } from '@hbar/app-runtime'
import './workspace-organization.css'

export interface WorkspaceOrganizationLabels {
  readonly menu: string
  readonly hide: string
  readonly restore: (count: number) => string
  readonly refresh: string
  readonly reconcile: string
  readonly allHidden: string
  readonly loading: string
  readonly offline: string
  readonly initialOffline: string
  readonly hiding: (name: string | null) => string
  readonly revealing: (name: string | null) => string
  readonly hidden: (name: string | null) => string
  readonly revealed: (name: string | null) => string
  readonly restoring: string
  readonly restored: string
  readonly saved: string
  readonly unknown: string
  readonly checking: string
  readonly waiting: string
  readonly failure: (code: string) => string
  readonly readFailure: (code: string) => string
  readonly initialReadFailure: string
}

/** Project menus retain Lumen's controls while supplying the owning workbench's keyboard navigation. */
export function WorkspaceProjectMenu({
  label,
  items,
  onAction,
  menuRef,
  header = false,
}: {
  readonly label: string
  readonly items: readonly LumenActionMenuItem[]
  readonly onAction: (id: string) => void
  readonly menuRef?: { current: HTMLDivElement | null } | undefined
  readonly header?: boolean
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const afterToggle = (event: Event) => {
      const menu = event.target
      if (!(menu instanceof HTMLDetailsElement) || !menu.open) return
      // Native toggle is queued: a later arrow key, Tab or dialog may already
      // own focus. Only the still-focused opening trigger grants initial focus.
      event.stopPropagation()
      if (root.ownerDocument.activeElement !== menu.querySelector('summary')) return
      menu.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    }
    root.addEventListener('toggle', afterToggle, true)
    return () => root.removeEventListener('toggle', afterToggle, true)
  }, [])
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.isDefaultPrevented() ||
      event.nativeEvent.isComposing ||
      !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
    )
      return
    const menu = event.currentTarget.querySelector('details')
    if (!menu) return
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')]
    if (!items.length) return
    event.preventDefault()
    menu.open = true
    const index = items.findIndex((item) => item === document.activeElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : index < 0
            ? event.key === 'ArrowUp'
              ? items.length - 1
              : 0
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    const target = items[next]
    target?.focus()
  }
  return (
    <LumenFrame
      ref={(node) => {
        rootRef.current = node
        if (menuRef) menuRef.current = node
      }}
      className={header ? 'hbar-app-react-project-organization-menu' : 'hbar-app-react-project-menu'}
      data-testid={header ? 'workspace-organization-menu' : undefined}
      onKeyDownCapture={navigate}
    >
      <LumenActionMenu label={label} items={items} onAction={onAction} />
    </LumenFrame>
  )
}

export function WorkspaceOrganizationFeedback({
  state,
  labels,
  targetName,
  connected,
  onRefresh,
  onReconcile,
}: {
  readonly state: WorkspaceOrganizationState
  readonly labels: WorkspaceOrganizationLabels
  readonly targetName: string | null
  readonly connected: boolean
  readonly onRefresh: () => void
  readonly onReconcile: () => void
}) {
  const { action } = state
  const busy = state.requestInFlight || action.status === 'submitting' || action.status === 'reconciling'
  const uncertain = action.status === 'unknown' || action.status === 'reconciling'
  const change = action.request?.change
  const effectCurrent =
    state.status === 'ready' &&
    state.snapshot &&
    action.receipt &&
    state.snapshot.revision >= action.receipt.revision &&
    (change?.kind === 'restoreHidden'
      ? state.snapshot.hiddenWorkspaceIds.length === 0
      : change?.kind === 'setHidden' &&
        state.snapshot.hiddenWorkspaceIds.includes(change.workspaceId) === change.hidden)
  const message =
    action.status === 'submitting'
      ? change?.kind === 'restoreHidden'
        ? labels.restoring
        : change?.hidden
          ? labels.hiding(targetName)
          : labels.revealing(targetName)
      : action.status === 'reconciling'
        ? labels.checking
        : action.status === 'unknown'
          ? state.requestInFlight
            ? labels.waiting
            : labels.unknown
          : action.status === 'failed'
            ? labels.failure(action.error ?? 'EXECUTION_FAILED')
            : action.status === 'succeeded'
              ? !effectCurrent
                ? labels.saved
                : change?.kind === 'restoreHidden'
                  ? labels.restored
                  : change?.hidden
                    ? labels.hidden(targetName)
                    : labels.revealed(targetName)
              : null
  const readProblem = state.status === 'error' || state.status === 'offline'
  if (!connected) return null
  if (!message && !readProblem && state.status !== 'loading') return null
  return (
    <LumenFrame className="hbar-app-react-organization-feedback" data-testid="workspace-organization-feedback">
      {message && (
        <LumenContentText
          context="feedback.message"
          role={action.status === 'failed' || uncertain ? 'alert' : 'status'}
        >
          {message}
        </LumenContentText>
      )}
      {state.status === 'loading' && !message && (
        <LumenContentText context="feedback.message" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {readProblem && (
        <LumenContentText context="feedback.message" role="alert">
          {state.status === 'offline'
            ? state.snapshot
              ? labels.offline
              : labels.initialOffline
            : state.snapshot
              ? labels.readFailure(state.error ?? 'READ_FAILED')
              : labels.initialReadFailure}
        </LumenContentText>
      )}
      {uncertain && (
        <LumenButton size="s" variant="outlined" disabled={!connected || busy} onClick={onReconcile}>
          {labels.reconcile}
        </LumenButton>
      )}
      {readProblem && !uncertain && (
        <LumenButton size="s" variant="outlined" disabled={!connected || busy} onClick={onRefresh}>
          {labels.refresh}
        </LumenButton>
      )}
    </LumenFrame>
  )
}
