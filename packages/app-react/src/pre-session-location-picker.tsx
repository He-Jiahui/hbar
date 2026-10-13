import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronRight, Folder, GitBranch, GitFork, Plus, X } from 'lucide-react'
import { LumenContentText, LumenButton, LumenFrame, LumenIcon, LumenInput } from '@lumen/app-ui'
import type {
  PreSessionLaunchBranchCreationEntry,
  SessionLaunchSelection,
  SessionLaunchBranchesPage,
} from '@hbar/app-runtime'
import { visiblePreSessionChoices, type HbarPreSessionChoice } from './pre-session-choice-picker'
import { launchSelectionBranchName } from './pre-session-launch-model'
export { launchSelectionBranchName } from './pre-session-launch-model'
import './pre-session-location-picker.css'

export interface HbarPreSessionLocationLabels {
  readonly title: string
  readonly directory: string
  readonly branch: string
  readonly chooseDirectory: string
  readonly chooseBranch: string
  readonly searchDirectories: string
  readonly searchBranches: string
  readonly currentBranch: string
  readonly baseBranch: string
  readonly detached: string
  readonly noBranches: string
  readonly noDirectories: string
  readonly shared: string
  readonly sharedHint: string
  readonly sharedBranchUnsupported: string
  readonly isolated: string
  readonly isolatedHint: string
  readonly isolatedUnavailable: string
  readonly sharedBranchHint: string
  readonly sharedBranch: string
  readonly sharedBranchUnavailable: (reason: 'checked-out-elsewhere' | 'worktree-state-unavailable') => string
  readonly newBranch: string
  readonly branchName: string
  readonly branchNamePlaceholder: string
  readonly startsFrom: (branch: string) => string
  readonly create: string
  readonly creating: string
  readonly cancel: string
  readonly captureBase: string
  readonly verifyBranch: string
  readonly useCreatedBranch: string
  readonly branchCreateUnavailable: string
  readonly branchCreateBaseUnavailable: string
  readonly branchCreateError: (code: string) => string
  readonly branchCreateUnknown: string
  readonly branchCreateNotFound: string
  readonly branchCreateDifferentOid: string
  readonly branchCreateIncomplete: string
  readonly branchCreateVerified: string
  readonly branchCreateCreatedNotSelected: string
  readonly loading: string
  readonly retry: string
  readonly more: string
  readonly back: string
  readonly backToBranches: string
  readonly close: string
  readonly error: (code: string) => string
  readonly trigger: (directory: string | null, branch: string | null, isolated: boolean) => string
}

export interface HbarPreSessionLocationPickerProps {
  readonly labels: HbarPreSessionLocationLabels
  /** Host projects reveal in 60-row increments; remote project/branch pages are explicit. */
  readonly directories: readonly HbarPreSessionChoice[]
  readonly workspaceId: string | null
  readonly selection: SessionLaunchSelection
  readonly page: SessionLaunchBranchesPage | null
  readonly draftRevision: number | null
  readonly branchCreation: PreSessionLaunchBranchCreationEntry | null
  readonly branchCreationAvailable: boolean
  /** Existing Sessions keep their registered workspace; hide project/path replacement in that mode. */
  readonly workspaceChangeAvailable?: boolean
  /** Remote nodes cannot switch the shared checkout to another branch. */
  readonly sharedBranchAvailable?: boolean
  readonly loading: boolean
  readonly error: string | null
  readonly disabled: boolean
  readonly hasMoreDirectories: boolean
  readonly directoryExtra?: (close: () => void) => ReactNode
  readonly statusExtra?: ReactNode
  readonly onOpen: () => void
  readonly onClose: () => void
  readonly onWorkspace: (id: string) => Promise<void | false>
  readonly onSelection: (selection: SessionLaunchSelection) => Promise<void>
  readonly onSearch: (search: string) => void
  readonly onMoreBranches: () => void
  readonly onMoreDirectories: () => void
  readonly onCaptureBranchBase: (expectedRevision: number) => Promise<PreSessionLaunchBranchCreationEntry>
  readonly onCreateBranch: (name: string, expectedRevision: number) => Promise<PreSessionLaunchBranchCreationEntry>
  readonly onReconcileBranch: (expectedRevision: number) => Promise<PreSessionLaunchBranchCreationEntry>
  readonly onAdoptBranch: (expectedRevision: number) => Promise<PreSessionLaunchBranchCreationEntry>
  readonly onCancelBranchCreate: () => Promise<PreSessionLaunchBranchCreationEntry | null>
}

export function HbarPreSessionLocationPicker(props: HbarPreSessionLocationPickerProps) {
  const { labels, page, selection, loading, disabled } = props
  const workspaceChangeAvailable = props.workspaceChangeAvailable ?? true
  const sharedBranchAvailable = props.sharedBranchAvailable ?? true
  const id = useId()
  const titleId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const branchTrigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef(false)
  const restoreBranchFocus = useRef(false)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'root' | 'directory' | 'branch' | 'new-branch'>('root')
  const [query, setQuery] = useState('')
  const [newBranchName, setNewBranchName] = useState('')
  const [limit, setLimit] = useState(60)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  useEffect(() => {
    if (open || pending || !restoreFocus.current) return
    restoreFocus.current = false
    trigger.current?.focus()
  }, [open, pending])
  useEffect(() => {
    if (!open) {
      restoreBranchFocus.current = false
      return
    }
    if (view !== 'root' || pending || !restoreBranchFocus.current || !branchTrigger.current) return
    restoreBranchFocus.current = false
    branchTrigger.current.focus()
  }, [open, pending, view, page])
  const directory = props.directories.find((item) => item.id === props.workspaceId) ?? null
  const head = page?.repository.kind === 'repository' ? page.repository.head : null
  const isolated = selection.mode === 'isolated-worktree'
  const branchName = launchSelectionBranchName(selection) ?? (head && 'name' in head ? head.name : null)
  const triggerLabel = labels.trigger(directory?.label ?? null, branchName, isolated)
  const repositoryRoot = page?.repository.kind === 'repository' && page.repository.workspaceScope === 'repository-root'
  const selectedBaseRef =
    selection.mode === 'shared-branch'
      ? selection.branch.ref
      : selection.mode === 'isolated-worktree'
        ? selection.branch.kind === 'derived'
          ? selection.branch.baseRef
          : selection.branch.kind === 'existing'
            ? `refs/heads/${selection.branch.name}`
            : null
        : head?.kind === 'branch'
          ? head.ref
          : null
  const canCreateBranch = repositoryRoot && props.branchCreationAvailable && selectedBaseRef !== null
  const canSubmitBranchCreate =
    canCreateBranch &&
    Boolean(props.branchCreation?.baseOid) &&
    (props.branchCreation?.phase === 'ready' || props.branchCreation?.phase === 'failed') &&
    Boolean(newBranchName.trim())
  const moreName = (name: string | null) => (name ? name.slice('refs/heads/'.length) : labels.detached)
  const directories = visiblePreSessionChoices(props.directories, query, limit)
  const close = () => {
    restoreFocus.current = true
    popup.current?.hidePopover()
  }
  const runResult = <Result,>(action: () => Promise<Result>, after: (result: Result) => void) => {
    if (pending || disabled) return
    setPending(true)
    setActionError(null)
    void action()
      .then((result) => {
        setPending(false)
        after(result)
      })
      .catch((reason: unknown) => {
        setPending(false)
        setActionError(
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED',
        )
      })
  }
  const run = (action: () => Promise<void | false>, after: () => void) =>
    runResult(action, (result) => {
      if (result !== false) after()
    })
  const startBranchForm = () => {
    setView('new-branch')
    const unresolvedName =
      props.branchCreation?.phase === 'creating' ||
      props.branchCreation?.phase === 'unknown' ||
      props.branchCreation?.phase === 'verified' ||
      props.branchCreation?.phase === 'created'
        ? props.branchCreation.name
        : null
    setNewBranchName(unresolvedName ?? query.trim())
    setActionError(null)
    const revision = props.draftRevision
    if (revision === null) {
      setActionError('INVALID_STATE')
      return
    }
    runResult(
      () => props.onCaptureBranchBase(revision),
      () => undefined,
    )
  }
  const createBranch = () => {
    if (!canSubmitBranchCreate) return
    const revision = props.draftRevision
    if (revision === null) {
      setActionError('INVALID_STATE')
      return
    }
    runResult(
      () => props.onCreateBranch(newBranchName, revision),
      (entry) => {
        if (entry.phase === 'selected') close()
      },
    )
  }
  const reconcileBranch = () => {
    const revision = props.draftRevision
    if (revision !== null)
      runResult(
        () => props.onReconcileBranch(revision),
        () => undefined,
      )
  }
  const adoptBranch = () => {
    const revision = props.draftRevision
    if (revision !== null)
      runResult(
        () => props.onAdoptBranch(revision),
        (entry) => {
          if (entry.phase === 'selected') close()
        },
      )
  }
  const returnToBranchList = () => {
    void props.onCancelBranchCreate().catch(() => undefined)
    setActionError(null)
    setView('branch')
  }
  return (
    <LumenFrame className="hbar-pre-session-location-picker">
      <LumenButton
        ref={trigger}
        type="button"
        size="s"
        variant="text"
        indicator="none"
        popoverTarget={id}
        disabled={disabled || pending}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={triggerLabel}
        title={triggerLabel}
      >
        <LumenIcon icon={isolated ? GitFork : Folder} tier="sm" />
        <LumenContentText context="control.label">{directory?.label ?? labels.chooseDirectory}</LumenContentText>
        {branchName && <LumenContentText context="choice.description">{branchName}</LumenContentText>}
        <LumenIcon icon={ChevronDown} tier="sm" />
      </LumenButton>
      <LumenFrame
        ref={popup}
        id={id}
        popover="auto"
        role="dialog"
        aria-labelledby={titleId}
        className="hbar-pre-session-location-popover"
        onBeforeToggle={(event) => {
          if (event.newState !== 'open' || !trigger.current) return
          const rect = trigger.current.getBoundingClientRect()
          const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
          const width = Math.min(25 * rem, innerWidth - 2 * rem)
          event.currentTarget.style.setProperty(
            '--location-left',
            `${Math.max(rem, Math.min(rect.left, innerWidth - width - rem))}px`,
          )
          event.currentTarget.style.setProperty('--location-bottom', `${innerHeight - rect.top + rem / 2}px`)
          event.currentTarget.style.setProperty('--location-limit', `${Math.max(0, rect.top - rem)}px`)
        }}
        onToggle={(event) => {
          const opening = event.newState === 'open'
          setOpen(opening)
          setQuery('')
          setLimit(60)
          setActionError(null)
          if (opening) {
            setView(props.workspaceId ? 'root' : 'directory')
            props.onOpen()
            queueMicrotask(() => popup.current?.querySelector<HTMLButtonElement>('button')?.focus())
          } else props.onClose()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.stopPropagation()
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            close()
          }
        }}
      >
        <LumenFrame className="hbar-pre-session-location-heading">
          {view !== 'root' && props.workspaceId && (
            <LumenButton
              type="button"
              size="s"
              variant="text"
              indicator="none"
              aria-label={view === 'new-branch' ? labels.backToBranches : labels.back}
              onClick={() => {
                if (view === 'new-branch') {
                  returnToBranchList()
                  return
                }
                setView('root')
                setQuery('')
                props.onSearch('')
              }}
            >
              <LumenIcon icon={ArrowLeft} tier="sm" />
            </LumenButton>
          )}
          <LumenContentText context="record.title" id={titleId}>
            {view === 'root'
              ? labels.title
              : view === 'directory'
                ? labels.chooseDirectory
                : view === 'branch'
                  ? labels.chooseBranch
                  : labels.newBranch}
          </LumenContentText>
          <LumenButton type="button" size="s" variant="text" indicator="none" aria-label={labels.close} onClick={close}>
            <LumenIcon icon={X} tier="sm" />
          </LumenButton>
        </LumenFrame>
        {props.statusExtra}
        <LumenFrame className="hbar-pre-session-location-body">
          {view === 'root' ? (
            <>
              {workspaceChangeAvailable ? (
                <LumenButton
                  type="button"
                  variant="text"
                  indicator="none"
                  className="hbar-pre-session-location-row"
                  disabled={pending || disabled}
                  onClick={() => {
                    setView('directory')
                    setQuery('')
                  }}
                >
                  <LumenIcon icon={Folder} tier="md" />
                  <LumenFrame>
                    <LumenContentText context="choice.title">{labels.directory}</LumenContentText>
                    <LumenContentText context="choice.description">
                      {directory?.label ?? labels.chooseDirectory}
                    </LumenContentText>
                  </LumenFrame>
                  <LumenIcon icon={ChevronRight} tier="sm" />
                </LumenButton>
              ) : (
                <LumenFrame className="hbar-pre-session-location-row hbar-pre-session-location-workspace-context">
                  <LumenIcon icon={Folder} tier="md" />
                  <LumenFrame>
                    <LumenContentText context="record.title">{labels.directory}</LumenContentText>
                    <LumenContentText context="record.description">
                      {directory?.label ?? labels.chooseDirectory}
                    </LumenContentText>
                  </LumenFrame>
                </LumenFrame>
              )}
              {page?.repository.kind === 'repository' && (
                <LumenButton
                  ref={branchTrigger}
                  type="button"
                  variant="text"
                  indicator="none"
                  className="hbar-pre-session-location-row"
                  disabled={pending || disabled}
                  onClick={() => {
                    setView('branch')
                    setQuery('')
                    props.onSearch('')
                  }}
                >
                  <LumenIcon icon={GitBranch} tier="md" />
                  <LumenFrame>
                    <LumenContentText context="choice.title">{labels.branch}</LumenContentText>
                    <LumenContentText context="choice.description">{branchName ?? labels.detached}</LumenContentText>
                  </LumenFrame>
                  <LumenIcon icon={ChevronRight} tier="sm" />
                </LumenButton>
              )}
              <LumenFrame role="radiogroup" aria-label={labels.title} className="hbar-pre-session-location-modes">
                <LumenButton
                  type="button"
                  role="radio"
                  aria-checked={!isolated}
                  variant="text"
                  indicator="none"
                  disabled={pending || disabled}
                  onClick={() => {
                    if (!isolated) {
                      close()
                      return
                    }
                    const ref = selectedBaseRef
                    const sharedBase = ref ? (page?.branches.find((branch) => branch.ref === ref) ?? null) : null
                    if (sharedBranchAvailable && sharedBase?.availability.sharedCurrent.state === 'available')
                      run(
                        () =>
                          props.onSelection({
                            mode: 'shared-branch',
                            branch: { ref: sharedBase.ref, tipOid: sharedBase.tipOid },
                          }),
                        close,
                      )
                    else run(() => props.onSelection({ mode: 'shared-current' }), close)
                  }}
                >
                  <LumenIcon icon={!isolated ? Check : Folder} tier="sm" />
                  <LumenFrame>
                    <LumenContentText context="choice.title">{labels.shared}</LumenContentText>
                    <LumenContentText context="choice.description">{labels.sharedHint}</LumenContentText>
                    {!sharedBranchAvailable && (
                      <LumenContentText context="choice.description">{labels.sharedBranchUnsupported}</LumenContentText>
                    )}
                  </LumenFrame>
                </LumenButton>
                <LumenButton
                  type="button"
                  role="radio"
                  aria-checked={isolated}
                  variant="text"
                  indicator="none"
                  disabled={pending || disabled || !repositoryRoot || !selectedBaseRef || loading}
                  onClick={() => {
                    if (isolated) close()
                    else if (selectedBaseRef)
                      run(
                        () =>
                          props.onSelection({
                            mode: 'isolated-worktree',
                            branch: { kind: 'derived', baseRef: selectedBaseRef },
                          }),
                        close,
                      )
                  }}
                >
                  <LumenIcon icon={isolated ? Check : GitFork} tier="sm" />
                  <LumenFrame>
                    <LumenContentText context="choice.title">{labels.isolated}</LumenContentText>
                    <LumenContentText context="choice.description">
                      {!repositoryRoot
                        ? labels.isolatedUnavailable
                        : !selectedBaseRef
                          ? labels.branchCreateBaseUnavailable
                          : labels.isolatedHint}
                    </LumenContentText>
                  </LumenFrame>
                </LumenButton>
              </LumenFrame>
            </>
          ) : view === 'new-branch' ? (
            <LumenFrame className="hbar-pre-session-location-new-branch">
              <LumenFrame as="label" htmlFor={`${id}-branch-name`}>
                {labels.branchName}
              </LumenFrame>
              <LumenInput
                id={`${id}-branch-name`}
                variant="boxed"
                value={newBranchName}
                placeholder={labels.branchNamePlaceholder}
                disabled={
                  disabled ||
                  props.branchCreation?.phase === 'creating' ||
                  props.branchCreation?.phase === 'unknown' ||
                  props.branchCreation?.phase === 'verified' ||
                  props.branchCreation?.phase === 'created'
                }
                onChange={(event) => setNewBranchName(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
                  event.preventDefault()
                  event.stopPropagation()
                  createBranch()
                }}
              />
              <LumenContentText context="record.description">
                {labels.startsFrom(moreName(props.branchCreation?.baseRef ?? selectedBaseRef))}
              </LumenContentText>
              {props.branchCreation?.phase === 'capturing' && (
                <LumenContentText context="feedback.message" role="status">
                  {labels.captureBase}
                </LumenContentText>
              )}
              {props.branchCreation?.phase === 'creating' && (
                <LumenContentText context="feedback.message" role="status">
                  {labels.creating}
                </LumenContentText>
              )}
              {props.branchCreation?.phase === 'unknown' && (
                <LumenContentText context="feedback.message" role="status">
                  {props.branchCreation.checkResult === 'not-found'
                    ? labels.branchCreateNotFound
                    : props.branchCreation.checkResult === 'different-oid'
                      ? labels.branchCreateDifferentOid
                      : props.branchCreation.checkResult === 'incomplete'
                        ? labels.branchCreateIncomplete
                        : labels.branchCreateUnknown}
                </LumenContentText>
              )}
              {props.branchCreation?.phase === 'verified' && (
                <LumenContentText context="feedback.message" role="status">
                  {labels.branchCreateVerified}
                </LumenContentText>
              )}
              {props.branchCreation?.phase === 'created' && (
                <LumenContentText context="feedback.message" role="status">
                  {labels.branchCreateCreatedNotSelected}
                </LumenContentText>
              )}
              {props.branchCreation?.phase === 'failed' && props.branchCreation.error && (
                <LumenContentText context="feedback.message" role="alert">
                  {labels.branchCreateError(props.branchCreation.error)}
                </LumenContentText>
              )}
              {!props.branchCreationAvailable && (
                <LumenContentText context="feedback.message" role="status">
                  {labels.branchCreateUnavailable}
                </LumenContentText>
              )}
              {page?.repository.kind === 'repository' && page.repository.workspaceScope !== 'repository-root' && (
                <LumenContentText context="feedback.message" role="status">
                  {labels.isolatedUnavailable}
                </LumenContentText>
              )}
              {(props.error || actionError) && props.branchCreation?.phase !== 'failed' && (
                <LumenContentText context="feedback.message" role="alert">
                  {labels.error(actionError ?? props.error ?? 'EXECUTION_FAILED')}
                </LumenContentText>
              )}
              <LumenFrame className="hbar-pre-session-location-new-branch-actions">
                <LumenButton type="button" variant="text" indicator="none" onClick={returnToBranchList}>
                  {labels.cancel}
                </LumenButton>
                {props.branchCreation?.phase === 'unknown' ? (
                  <LumenButton type="button" disabled={pending || disabled} onClick={reconcileBranch}>
                    {labels.verifyBranch}
                  </LumenButton>
                ) : props.branchCreation?.phase === 'verified' ? (
                  <LumenButton type="button" disabled={pending || disabled} onClick={adoptBranch}>
                    {labels.useCreatedBranch}
                  </LumenButton>
                ) : props.branchCreation?.phase === 'created' ? null : (
                  <>
                    {props.branchCreation?.phase === 'failed' && !props.branchCreation.baseOid && (
                      <LumenButton
                        type="button"
                        variant="text"
                        indicator="none"
                        disabled={pending || disabled}
                        onClick={() => {
                          const revision = props.draftRevision
                          if (revision !== null)
                            runResult(
                              () => props.onCaptureBranchBase(revision),
                              () => undefined,
                            )
                        }}
                      >
                        {labels.retry}
                      </LumenButton>
                    )}
                    <LumenButton
                      type="button"
                      disabled={pending || disabled || !canSubmitBranchCreate}
                      onClick={createBranch}
                    >
                      {labels.create}
                    </LumenButton>
                  </>
                )}
              </LumenFrame>
            </LumenFrame>
          ) : (
            <>
              <LumenInput
                type="search"
                variant="boxed"
                value={query}
                aria-label={view === 'directory' ? labels.searchDirectories : labels.searchBranches}
                placeholder={view === 'directory' ? labels.searchDirectories : labels.searchBranches}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setQuery(value)
                  setLimit(60)
                  if (view === 'branch') props.onSearch(value)
                }}
              />
              <LumenFrame className="hbar-pre-session-location-list">
                {view === 'directory' ? (
                  <>
                    {directories.rows.map((item) => (
                      <LumenButton
                        key={item.id}
                        type="button"
                        variant="text"
                        indicator="none"
                        className="hbar-pre-session-location-row"
                        aria-current={item.id === props.workspaceId ? 'true' : undefined}
                        disabled={pending || disabled}
                        onClick={() =>
                          run(
                            () => props.onWorkspace(item.id),
                            () => {
                              setView('root')
                              setQuery('')
                            },
                          )
                        }
                      >
                        <LumenIcon icon={Folder} tier="sm" />
                        <LumenFrame>
                          <LumenContentText context="choice.title">{item.label}</LumenContentText>
                          <LumenContentText context="choice.description">{item.detail}</LumenContentText>
                        </LumenFrame>
                      </LumenButton>
                    ))}
                    {directories.rows.length === 0 && (
                      <LumenContentText context="section.description">{labels.noDirectories}</LumenContentText>
                    )}
                    {(directories.remaining > 0 || props.hasMoreDirectories) && (
                      <LumenButton
                        type="button"
                        size="s"
                        disabled={pending || loading}
                        onClick={() => (directories.remaining > 0 ? setLimit(limit + 60) : props.onMoreDirectories())}
                      >
                        {labels.more}
                      </LumenButton>
                    )}
                  </>
                ) : (
                  <>
                    {page?.branches.map((branch) => {
                      const available = isolated
                        ? branch.availability.isolatedBase.state === 'available'
                        : branch.current ||
                          (sharedBranchAvailable && branch.availability.sharedCurrent.state === 'available')
                      const selected = isolated
                        ? branch.ref === selectedBaseRef
                        : selection.mode === 'shared-current'
                          ? branch.current
                          : branch.ref === selectedBaseRef
                      const disabledReason = isolated
                        ? !available
                          ? labels.isolatedUnavailable
                          : undefined
                        : !sharedBranchAvailable && !branch.current
                          ? labels.sharedBranchUnsupported
                          : branch.availability.sharedCurrent.state === 'disabled'
                            ? labels.sharedBranchUnavailable(branch.availability.sharedCurrent.reason)
                            : branch.availability.sharedCurrent.state === 'unknown'
                              ? labels.sharedBranchUnavailable(branch.availability.sharedCurrent.reason)
                              : undefined
                      return (
                        <LumenButton
                          key={branch.ref}
                          type="button"
                          variant="text"
                          indicator="none"
                          className="hbar-pre-session-location-row"
                          aria-current={selected ? 'true' : undefined}
                          title={disabledReason}
                          disabled={pending || disabled || loading || !available}
                          onClick={() =>
                            run(
                              () =>
                                isolated
                                  ? props.onSelection({
                                      mode: 'isolated-worktree',
                                      branch: { kind: 'derived', baseRef: branch.ref },
                                    })
                                  : props.onSelection(
                                      branch.current || !sharedBranchAvailable
                                        ? { mode: 'shared-current' }
                                        : { mode: 'shared-branch', branch: { ref: branch.ref, tipOid: branch.tipOid } },
                                    ),
                              () => {
                                restoreBranchFocus.current = true
                                setView('root')
                                setQuery('')
                              },
                            )
                          }
                        >
                          <LumenIcon icon={GitBranch} tier="sm" />
                          <LumenFrame>
                            <LumenContentText context="choice.title">{branch.name}</LumenContentText>
                            <LumenContentText context="choice.description">
                              {disabledReason ??
                                (branch.current
                                  ? labels.currentBranch
                                  : isolated
                                    ? labels.baseBranch
                                    : labels.sharedBranch)}
                            </LumenContentText>
                          </LumenFrame>
                          {selected && <LumenIcon icon={Check} tier="sm" />}
                        </LumenButton>
                      )
                    })}
                    {!loading && !page?.branches.length && (
                      <LumenContentText context="section.description">{labels.noBranches}</LumenContentText>
                    )}
                    {page?.nextCursor && (
                      <LumenButton type="button" size="s" disabled={pending || loading} onClick={props.onMoreBranches}>
                        {labels.more}
                      </LumenButton>
                    )}
                  </>
                )}
              </LumenFrame>
              {view === 'directory' && props.directoryExtra?.(close)}
              {view === 'branch' && (
                <LumenFrame className="hbar-pre-session-location-branch-footer">
                  {!canCreateBranch && (
                    <LumenContentText context="feedback.message" role="status">
                      {!props.branchCreationAvailable
                        ? labels.branchCreateUnavailable
                        : !repositoryRoot
                          ? labels.isolatedUnavailable
                          : labels.branchCreateBaseUnavailable}
                    </LumenContentText>
                  )}
                  <LumenButton
                    type="button"
                    variant="text"
                    indicator="none"
                    disabled={pending || disabled || loading || !canCreateBranch}
                    title={!canCreateBranch ? labels.branchCreateBaseUnavailable : undefined}
                    onClick={startBranchForm}
                  >
                    <LumenIcon icon={Plus} tier="sm" />
                    {labels.newBranch}
                  </LumenButton>
                </LumenFrame>
              )}
            </>
          )}
          {loading && (
            <LumenContentText context="feedback.message" role="status">
              {labels.loading}
            </LumenContentText>
          )}
          {(props.error || actionError) && (
            <LumenFrame className="hbar-pre-session-location-error">
              <LumenContentText context="feedback.message" role="alert">
                {labels.error(actionError ?? props.error ?? 'EXECUTION_FAILED')}
              </LumenContentText>
              {props.error && (
                <LumenButton type="button" size="s" disabled={loading} onClick={props.onOpen}>
                  {labels.retry}
                </LumenButton>
              )}
            </LumenFrame>
          )}
        </LumenFrame>
      </LumenFrame>
    </LumenFrame>
  )
}
