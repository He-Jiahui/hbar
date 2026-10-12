import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowLeft, Check, ChevronDown, GitBranch, GitFork, Plus, RefreshCw, Search, X } from 'lucide-react'
import { LumenButton, LumenContentText, LumenFrame, LumenIcon, LumenInput } from '@lumen/app-ui'
import type { SessionBranchTargetPage, SessionBranchTargetSelectInput } from '@hbar/app-runtime'
import { FloatingSurface, useFloatingTrigger } from './floating-surface'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './session-branch-target-control.css'
import { createMessageScope } from './messages'

export interface HbarSessionBranchTargetLabels {
  readonly title: string
  readonly choose: string
  readonly search: string
  readonly branches: string
  readonly current: string
  readonly worktree: string
  readonly checkout: string
  readonly executionPath: string
  readonly newBranch: string
  readonly newWorktree: string
  readonly branchName: string
  readonly branchNamePlaceholder: string
  readonly baseBranch: string
  readonly chooseBase: string
  readonly create: string
  readonly creating: string
  readonly switching: string
  readonly loading: string
  readonly empty: string
  readonly more: string
  readonly narrowSearch: string
  readonly retry: string
  readonly unknown: string
  readonly verify: string
  readonly busy: string
  readonly aiHint: string
  readonly back: string
  readonly close: string
  readonly error: (code: string) => string
}

const SessionBranchTargetMessages = createMessageScope<{
  readonly branchTarget: HbarSessionBranchTargetLabels
  readonly branch: (name: string) => string
}>()

type BranchBase = NonNullable<SessionBranchTargetPage['base']>
export function HbarSessionBranchTargetControl(props: Parameters<typeof HbarSessionBranchTargetControlContent>[0]) {
  return (
    <SessionBranchTargetMessages.Provider messages={{ branchTarget: props.labels, branch: props.branchLabel }}>
      <HbarSessionBranchTargetControlContent {...props} />
    </SessionBranchTargetMessages.Provider>
  )
}

function HbarSessionBranchTargetControlContent({
  sessionId,
  workspaceId,
  connected,
  busy,
  branch,
}: {
  readonly sessionId: string
  readonly workspaceId: string
  readonly connected: boolean
  readonly busy: boolean
  readonly branch: string | null
  readonly labels: HbarSessionBranchTargetLabels
  readonly branchLabel: (name: string) => string
}) {
  const { t } = SessionBranchTargetMessages.useMessages()
  const labels = t('branchTarget')
  const branchLabel = t('branch')
  const runtime = useHbarRuntime()
  const projection = useHbarRuntimeState(runtime.state.sessionBranchTargetPicker)
  const captured = projection.entries[sessionId]
  const entry = captured?.workspaceId === workspaceId ? captured : undefined
  const page = entry?.page
  const unavailable = page?.repository === 'plain'
  const branchName = page?.execution.branch ?? branch
  const anchor = useRef<HTMLButtonElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId()
  const nameId = useId()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'branches' | 'create' | 'base'>('branches')
  const [kind, setKind] = useState<'new-branch' | 'new-worktree'>('new-branch')
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [base, setBase] = useState<BranchBase | null>(null)
  const switching = entry?.phase === 'switching'
  const unknown = entry?.phase === 'unknown'
  const disabled = unavailable || !connected || busy || switching || unknown
  const loading = entry?.phase === 'loading'
  const invoke = (search = '') =>
    void runtime.commands
      .execute('sessionBranchTargetPicker.refresh', { sessionId, workspaceId, search })
      .catch(() => undefined)
  const close = () => setOpen(false)
  useEffect(() => {
    if (!open || view === 'create' || unavailable) return
    const timer = window.setTimeout(() => {
      void runtime.commands
        .execute('sessionBranchTargetPicker.refresh', { sessionId, workspaceId, search: query })
        .catch(() => undefined)
    }, 150)
    return () => window.clearTimeout(timer)
  }, [open, view, query, runtime.commands, sessionId, workspaceId, unavailable])
  useEffect(() => {
    if (open && view === 'create') nameInput.current?.focus()
  }, [open, view])
  useEffect(() => {
    if (!open || view === 'create' || query || loading) return
    list.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [open, view, query, loading, page?.revision])
  const triggerEvents = useFloatingTrigger(open, (next) => {
    if (next) {
      setView('branches')
      setQuery('')
      setName('')
      setBase(null)
    }
    setOpen(next)
  })
  const select = (choice: SessionBranchTargetSelectInput['choice']) => {
    if (!page || disabled) return
    void runtime.commands
      .execute('sessionBranchTargetPicker.select', { sessionId, workspaceId, expectedRevision: page.revision, choice })
      .then((operation) => {
        if (operation.status === 'ready') close()
      })
      .catch(() => undefined)
  }
  const startCreate = (value: 'new-branch' | 'new-worktree') => {
    setKind(value)
    setName('')
    setBase(page?.base ?? null)
    setView('create')
  }
  const moveOption = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || view === 'create') return
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    if (event.target === searchInput.current && event.key !== 'ArrowDown') return
    const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)')]
    if (!options.length) return
    event.preventDefault()
    const current = options.findIndex((option) => option === document.activeElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : event.key === 'ArrowUp'
            ? (current - 1 + options.length) % options.length
            : (current + 1) % options.length
    options[next]?.focus()
  }
  if (unavailable) return null
  return (
    <>
      <LumenButton
        ref={anchor}
        type="button"
        variant="text"
        size="s"
        indicator="none"
        className="hbar-session-branch-trigger"
        aria-haspopup="dialog"
        aria-controls={id}
        aria-expanded={open}
        aria-label={branchName ? branchLabel(branchName) : labels.choose}
        title={busy ? labels.busy : branchName ? branchLabel(branchName) : labels.choose}
        disabled={!connected}
        {...triggerEvents}
      >
        <LumenIcon icon={GitBranch} tier="sm" />
        <LumenContentText context="control.label">
          <bdi>{branchName ?? labels.choose}</bdi>
        </LumenContentText>
        <LumenIcon icon={ChevronDown} tier="sm" />
      </LumenButton>
      <FloatingSurface
        open={open}
        onClose={close}
        anchorRef={anchor}
        initialFocusRef={view === 'create' ? nameInput : searchInput}
        id={id}
        label={labels.title}
        className="hbar-session-branch-panel"
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.stopPropagation()
          moveOption(event)
        }}
      >
        <LumenFrame className="hbar-session-branch-heading">
          {view !== 'branches' && (
            <LumenButton
              type="button"
              size="s"
              variant="text"
              indicator="none"
              aria-label={labels.back}
              onClick={() => {
                setView(view === 'base' ? 'create' : 'branches')
                setQuery('')
                invoke()
              }}
            >
              <LumenIcon icon={ArrowLeft} tier="sm" />
            </LumenButton>
          )}
          <LumenContentText context="popover.title">
            {view === 'branches'
              ? labels.title
              : view === 'base'
                ? labels.chooseBase
                : kind === 'new-branch'
                  ? labels.newBranch
                  : labels.newWorktree}
          </LumenContentText>
          <LumenButton type="button" size="s" variant="text" indicator="none" aria-label={labels.close} onClick={close}>
            <LumenIcon icon={X} tier="sm" />
          </LumenButton>
        </LumenFrame>
        {page && (
          <LumenFrame className="hbar-session-branch-directory">
            <LumenContentText context="choice.description" tone="subtle">
              {labels.executionPath}
            </LumenContentText>
            <LumenContentText context="choice.description">
              <bdi>{page.execution.path}</bdi>
            </LumenContentText>
          </LumenFrame>
        )}
        {busy && (
          <LumenContentText context="control.status" tone="subtle" role="status">
            {labels.busy}
          </LumenContentText>
        )}
        {switching && (
          <LumenContentText context="control.status" role="status">
            {view === 'create' ? labels.creating : labels.switching}
          </LumenContentText>
        )}
        {unknown && (
          <LumenFrame className="hbar-session-branch-feedback">
            <LumenContentText context="control.status" tone="warning" role="status">
              {entry?.error === 'OPERATION_OTHER_ACTOR' ? labels.error(entry.error) : labels.unknown}
            </LumenContentText>
            {entry?.idempotencyKey && (
              <LumenButton
                type="button"
                size="s"
                variant="outlined"
                disabled={!connected || busy}
                onClick={() => {
                  void runtime.commands
                    .execute('sessionBranchTargetPicker.reconcile', { sessionId, workspaceId })
                    .then((operation) => {
                      if (operation?.status === 'ready') close()
                    })
                    .catch(() => undefined)
                }}
              >
                {labels.verify}
              </LumenButton>
            )}
          </LumenFrame>
        )}
        {entry?.error && !unknown && !switching && (
          <LumenFrame className="hbar-session-branch-feedback">
            <LumenContentText context="control.status" tone="danger" role="alert">
              {labels.error(entry.error)}
            </LumenContentText>
            <LumenButton type="button" size="s" variant="text" disabled={!connected} onClick={() => invoke(query)}>
              <LumenIcon icon={RefreshCw} tier="sm" />
              {labels.retry}
            </LumenButton>
          </LumenFrame>
        )}
        {view === 'create' ? (
          <LumenFrame
            as="form"
            className="hbar-session-branch-form"
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (base && name.trim())
                select({ kind, name: name.trim(), baseRef: base.ref, expectedBaseOid: base.tipOid })
            }}
          >
            <LumenFrame as="label" htmlFor={nameId}>
              <LumenContentText context="form.label">{labels.branchName}</LumenContentText>
            </LumenFrame>
            <LumenInput
              ref={nameInput}
              id={nameId}
              aria-label={labels.branchName}
              placeholder={labels.branchNamePlaceholder}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              autoComplete="off"
              maxLength={1_000}
              disabled={disabled}
            />
            <LumenContentText context="form.label">{labels.baseBranch}</LumenContentText>
            <LumenButton
              type="button"
              variant="outlined"
              size="s"
              className="hbar-session-branch-base"
              disabled={disabled}
              onClick={() => {
                setView('base')
                setQuery('')
                invoke()
              }}
            >
              <LumenIcon icon={GitBranch} tier="sm" />
              <LumenContentText context="choice.title">
                <bdi>{base?.name ?? labels.chooseBase}</bdi>
              </LumenContentText>
              <LumenIcon icon={ChevronDown} tier="sm" />
            </LumenButton>
            <LumenContentText context="form.help" tone="subtle">
              {labels.aiHint}
            </LumenContentText>
            <LumenButton type="submit" variant="solid" size="s" disabled={disabled || !name.trim() || !base}>
              {switching ? labels.creating : labels.create}
            </LumenButton>
          </LumenFrame>
        ) : (
          <>
            <LumenFrame className="hbar-session-branch-search">
              <LumenIcon icon={Search} tier="sm" />
              <LumenInput
                ref={searchInput}
                aria-label={labels.search}
                placeholder={labels.search}
                value={query}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setQuery(value)
                }}
                maxLength={256}
                autoComplete="off"
              />
            </LumenFrame>
            {loading && (
              <LumenContentText context="control.status" tone="subtle" role="status">
                {labels.loading}
              </LumenContentText>
            )}
            <LumenFrame
              role="listbox"
              ref={list}
              aria-label={view === 'base' ? labels.chooseBase : labels.branches}
              className="hbar-session-branch-list"
            >
              {entry?.branches.map((option) => (
                <LumenButton
                  key={option.ref}
                  type="button"
                  role="option"
                  aria-selected={view === 'base' ? option.ref === base?.ref : option.current}
                  size="s"
                  variant="text"
                  indicator="none"
                  className="hbar-session-branch-option"
                  disabled={disabled || loading}
                  onClick={() => {
                    if (view === 'base') {
                      setBase({ name: option.name, ref: option.ref, tipOid: option.tipOid })
                      setView('create')
                      setQuery('')
                    } else select({ kind: 'branch', ref: option.ref, expectedOid: option.tipOid })
                  }}
                >
                  <LumenIcon icon={option.worktreePath ? GitFork : GitBranch} tier="sm" />
                  <LumenFrame className="hbar-session-branch-option-copy">
                    <LumenContentText context="choice.title">
                      <bdi>{option.name}</bdi>
                    </LumenContentText>
                    <LumenContentText context="choice.description" tone="subtle">
                      {option.current ? labels.current : option.worktreePath ? labels.worktree : labels.checkout}
                    </LumenContentText>
                    {option.worktreePath && !option.current && (
                      <LumenContentText context="choice.description" tone="subtle">
                        <bdi>{option.worktreePath}</bdi>
                      </LumenContentText>
                    )}
                  </LumenFrame>
                  {option.current && <LumenIcon icon={Check} tier="sm" aria-label={labels.current} />}
                </LumenButton>
              ))}
              {!loading && entry?.branches.length === 0 && (
                <LumenContentText context="choice.description" tone="subtle">
                  {labels.empty}
                </LumenContentText>
              )}
            </LumenFrame>
            {entry?.canLoadMore && (
              <LumenButton
                type="button"
                size="s"
                variant="text"
                disabled={loading || disabled}
                onClick={() => {
                  void runtime.commands
                    .execute('sessionBranchTargetPicker.refresh', { sessionId, workspaceId, search: query, more: true })
                    .catch(() => undefined)
                }}
              >
                {labels.more}
              </LumenButton>
            )}
            {(page?.incomplete || entry?.atCapacity) && (
              <LumenContentText context="control.status" tone="subtle">
                {labels.narrowSearch}
              </LumenContentText>
            )}
            {view === 'branches' && (
              <LumenFrame className="hbar-session-branch-create-actions">
                <LumenButton
                  type="button"
                  size="s"
                  variant="text"
                  disabled={disabled || !page}
                  onClick={() => startCreate('new-branch')}
                >
                  <LumenIcon icon={Plus} tier="sm" />
                  {labels.newBranch}
                </LumenButton>
                <LumenButton
                  type="button"
                  size="s"
                  variant="text"
                  disabled={disabled || !page}
                  onClick={() => startCreate('new-worktree')}
                >
                  <LumenIcon icon={GitFork} tier="sm" />
                  {labels.newWorktree}
                </LumenButton>
              </LumenFrame>
            )}
          </>
        )}
      </FloatingSurface>
    </>
  )
}
