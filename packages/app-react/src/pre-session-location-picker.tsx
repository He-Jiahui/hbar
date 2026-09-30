import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronRight, Folder, GitBranch, GitFork, X } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenInput, LumenText } from '@lumen/app-ui'
import type { SessionLaunchSelection } from '@hbar/contracts/commands/session-launch-target'
import type { SessionLaunchBranchesPage } from '@hbar/contracts/commands/session-launch-branches'
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
  readonly isolated: string
  readonly isolatedHint: string
  readonly isolatedUnavailable: string
  readonly sharedBranchHint: string
  readonly loading: string
  readonly retry: string
  readonly more: string
  readonly back: string
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
  readonly loading: boolean
  readonly error: string | null
  readonly disabled: boolean
  readonly hasMoreDirectories: boolean
  readonly directoryExtra?: (close: () => void) => ReactNode
  readonly onOpen: () => void
  readonly onClose: () => void
  readonly onWorkspace: (id: string) => Promise<void>
  readonly onSelection: (selection: SessionLaunchSelection) => Promise<void>
  readonly onSearch: (search: string) => void
  readonly onMoreBranches: () => void
  readonly onMoreDirectories: () => void
}

export function HbarPreSessionLocationPicker(props: HbarPreSessionLocationPickerProps) {
  const { labels, page, selection, loading, disabled } = props
  const id = useId()
  const titleId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef(false)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'root' | 'directory' | 'branch'>('root')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(60)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  useEffect(() => {
    if (open || pending || !restoreFocus.current) return
    restoreFocus.current = false
    trigger.current?.focus()
  }, [open, pending])
  const directory = props.directories.find((item) => item.id === props.workspaceId) ?? null
  const head = page?.repository.kind === 'repository' ? page.repository.head : null
  const isolated = selection.mode === 'isolated-worktree'
  const branchName = launchSelectionBranchName(selection) ?? (head && 'name' in head ? head.name : null)
  const canIsolate = page?.repository.kind === 'repository' && page.repository.workspaceScope === 'repository-root'
  const base = page?.branches.find((branch) => branch.current) ?? page?.branches[0]
  const directories = visiblePreSessionChoices(props.directories, query, limit)
  const close = () => {
    restoreFocus.current = true
    popup.current?.hidePopover()
  }
  const run = (action: () => Promise<void>, after: () => void) => {
    if (pending || disabled) return
    setPending(true)
    setActionError(null)
    void action()
      .then(() => {
        setPending(false)
        after()
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
        aria-label={labels.trigger(directory?.label ?? null, branchName, isolated)}
      >
        <LumenIcon icon={isolated ? GitFork : Folder} tier="sm" />
        <LumenText as="span">{directory?.label ?? labels.chooseDirectory}</LumenText>
        {branchName && <LumenText as="small">{branchName}</LumenText>}
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
              aria-label={labels.back}
              onClick={() => {
                setView('root')
                setQuery('')
                props.onSearch('')
              }}
            >
              <LumenIcon icon={ArrowLeft} tier="sm" />
            </LumenButton>
          )}
          <LumenText as="strong" id={titleId}>
            {view === 'root' ? labels.title : view === 'directory' ? labels.chooseDirectory : labels.chooseBranch}
          </LumenText>
          <LumenButton type="button" size="s" variant="text" indicator="none" aria-label={labels.close} onClick={close}>
            <LumenIcon icon={X} tier="sm" />
          </LumenButton>
        </LumenFrame>
        <LumenFrame className="hbar-pre-session-location-body">
          {view === 'root' ? (
            <>
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
                  <LumenText as="strong">{labels.directory}</LumenText>
                  <LumenText as="small">{directory?.label ?? labels.chooseDirectory}</LumenText>
                </LumenFrame>
                <LumenIcon icon={ChevronRight} tier="sm" />
              </LumenButton>
              {page?.repository.kind === 'repository' && (
                <LumenButton
                  type="button"
                  variant="text"
                  indicator="none"
                  className="hbar-pre-session-location-row"
                  disabled={pending || disabled || !isolated}
                  title={!isolated ? labels.sharedBranchHint : undefined}
                  onClick={() => {
                    setView('branch')
                    setQuery('')
                    props.onSearch('')
                  }}
                >
                  <LumenIcon icon={GitBranch} tier="md" />
                  <LumenFrame>
                    <LumenText as="strong">{labels.branch}</LumenText>
                    <LumenText as="small">{branchName ?? labels.detached}</LumenText>
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
                  onClick={() => run(() => props.onSelection({ mode: 'shared-current' }), close)}
                >
                  <LumenIcon icon={!isolated ? Check : Folder} tier="sm" />
                  <LumenFrame>
                    <LumenText as="strong">{labels.shared}</LumenText>
                    <LumenText as="small">{labels.sharedHint}</LumenText>
                  </LumenFrame>
                </LumenButton>
                <LumenButton
                  type="button"
                  role="radio"
                  aria-checked={isolated}
                  variant="text"
                  indicator="none"
                  disabled={pending || disabled || !canIsolate || !base || loading}
                  onClick={() => {
                    if (isolated) close()
                    else if (base)
                      run(
                        () =>
                          props.onSelection({
                            mode: 'isolated-worktree',
                            branch: { kind: 'derived', baseRef: head?.kind === 'branch' ? head.ref : base.ref },
                          }),
                        close,
                      )
                  }}
                >
                  <LumenIcon icon={isolated ? Check : GitFork} tier="sm" />
                  <LumenFrame>
                    <LumenText as="strong">{labels.isolated}</LumenText>
                    <LumenText as="small">{canIsolate ? labels.isolatedHint : labels.isolatedUnavailable}</LumenText>
                  </LumenFrame>
                </LumenButton>
              </LumenFrame>
            </>
          ) : (
            <>
              <LumenInput
                type="search"
                variant="boxed"
                value={query}
                aria-label={view === 'directory' ? labels.searchDirectories : labels.searchBranches}
                placeholder={view === 'directory' ? labels.searchDirectories : labels.searchBranches}
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
                          <LumenText as="strong">{item.label}</LumenText>
                          <LumenText as="small">{item.detail}</LumenText>
                        </LumenFrame>
                      </LumenButton>
                    ))}
                    {directories.rows.length === 0 && <LumenText as="p">{labels.noDirectories}</LumenText>}
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
                    {page?.branches.map((branch) => (
                      <LumenButton
                        key={branch.ref}
                        type="button"
                        variant="text"
                        indicator="none"
                        className="hbar-pre-session-location-row"
                        aria-current={branch.name === branchName ? 'true' : undefined}
                        disabled={
                          pending || disabled || loading || branch.availability.isolatedBase.state !== 'available'
                        }
                        onClick={() =>
                          run(
                            () =>
                              props.onSelection({
                                mode: 'isolated-worktree',
                                branch: { kind: 'derived', baseRef: branch.ref },
                              }),
                            close,
                          )
                        }
                      >
                        <LumenIcon icon={GitBranch} tier="sm" />
                        <LumenFrame>
                          <LumenText as="strong">{branch.name}</LumenText>
                          <LumenText as="small">{branch.current ? labels.currentBranch : labels.baseBranch}</LumenText>
                        </LumenFrame>
                        {branch.name === branchName && <LumenIcon icon={Check} tier="sm" />}
                      </LumenButton>
                    ))}
                    {!loading && !page?.branches.length && <LumenText as="p">{labels.noBranches}</LumenText>}
                    {page?.nextCursor && (
                      <LumenButton type="button" size="s" disabled={pending || loading} onClick={props.onMoreBranches}>
                        {labels.more}
                      </LumenButton>
                    )}
                  </>
                )}
              </LumenFrame>
              {view === 'directory' && props.directoryExtra?.(close)}
            </>
          )}
          {loading && (
            <LumenText as="p" role="status">
              {labels.loading}
            </LumenText>
          )}
          {(props.error || actionError) && (
            <LumenFrame className="hbar-pre-session-location-error">
              <LumenText as="p" role="alert">
                {labels.error(actionError ?? props.error ?? 'EXECUTION_FAILED')}
              </LumenText>
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
