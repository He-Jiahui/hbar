import { useCallback, useEffect, useRef, useState } from 'react'
import { GitBranch, LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import type { GitBranchInfo, GitStatus, GitWorktreeInfo } from '@hbar/contracts'
import { client } from './stores'
import { platform } from './platform'
import { FloatingSurface, useFloatingTrigger } from './FloatingLayer'
import { useLocale } from './locale'
import './GitContextSwitcher.css'

function pathKey(value: string) {
  return value.trim().replaceAll('\\', '/').replace(/\/+$/, '').toLocaleLowerCase()
}

export default function GitContextSwitcher({
  workspacePath,
  branch,
  gitProject,
  onUseWorktree,
}: {
  workspacePath: string
  branch: string | null
  gitProject?: boolean | null
  onUseWorktree(path: string): void | Promise<void>
}) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const [branches, setBranches] = useState<GitBranchInfo[]>([])
  const [worktrees, setWorktrees] = useState<GitWorktreeInfo[]>([])
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [worktreeTarget, setWorktreeTarget] = useState<string | null>(null)
  const [worktreePath, setWorktreePath] = useState('')
  const [branchDecision, setBranchDecision] = useState<string | null>(null)
  const [isGit, setIsGit] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const loadGeneration = useRef(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const triggerHandlers = useFloatingTrigger({
    open,
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
  })
  const load = useCallback(async () => {
    if (!workspacePath) return
    const generation = ++loadGeneration.current
    const operationWorkspacePath = workspacePath
    const connection = client()
    setBusy(true)
    setError('')
    try {
      const [nextStatus, nextBranches, nextWorktrees] = await Promise.all([
        connection.call('git.status', { cwd: operationWorkspacePath }),
        connection.call('git.branch', { cwd: operationWorkspacePath, operation: 'list' }),
        connection.call('git.worktree', { cwd: operationWorkspacePath, operation: 'list' }),
      ])
      if (generation !== loadGeneration.current || client() !== connection || workspacePath !== operationWorkspacePath) return
      setStatus(nextStatus)
      setBranches(Array.isArray(nextBranches) ? nextBranches : [])
      setWorktrees(Array.isArray(nextWorktrees) ? nextWorktrees : [])
      setIsGit(Boolean(nextStatus.root))
    } catch (cause) {
      if (generation !== loadGeneration.current || client() !== connection || workspacePath !== operationWorkspacePath) return
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (generation === loadGeneration.current) setBusy(false)
    }
  }, [workspacePath])
  useEffect(() => {
    if (open) void load()
  }, [load, open])
  useEffect(() => {
    if (!open) loadGeneration.current += 1
    setBranchDecision(null)
    setWorktreeTarget(null)
    setWorktreePath('')
    setError('')
  }, [open, workspacePath])
  async function applyBranchSwitch(name: string) {
    if (!name || name === branch || busy) return
    const connection = client()
    const operationWorkspacePath = workspacePath
    setBusy(true)
    setError('')
    try {
      await connection.call('git.branch', { cwd: operationWorkspacePath, operation: 'switch', name })
      if (client() !== connection || workspacePath !== operationWorkspacePath) throw new Error(t('workspaceChanged'))
      await load()
      if (client() !== connection || workspacePath !== operationWorkspacePath) throw new Error(t('workspaceChanged'))
      setBranchDecision(null)
      setWorktreeTarget(null)
      setWorktreePath('')
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  async function chooseBranch(name: string) {
    if (!name || name === branch || busy) return
    const existingWorktree = worktrees.find((item) => item.branch === name || item.branch === `refs/heads/${name}`)
    if (existingWorktree && pathKey(existingWorktree.path) !== pathKey(workspacePath)) {
      await selectWorktree(existingWorktree)
      return
    }
    setBranchDecision(name)
    setError(status?.dirty ? t('dirtyWorkspace') : '')
  }
  async function createWorktreeForBranch() {
    if (!branchDecision || busy) return
    try {
      const selected = await (await platform()).pickDirectory()
      setWorktreePath(selected ?? '')
      setWorktreeTarget(branchDecision)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  async function createWorktree() {
    if (!worktreeTarget || !worktreePath.trim() || busy) return
    const connection = client()
    const operationWorkspacePath = workspacePath
    const operationBranch = worktreeTarget
    const operationTarget = worktreePath.trim()
    setBusy(true)
    setError('')
    try {
      const result = await connection.call('git.worktree', {
        cwd: operationWorkspacePath,
        operation: 'add',
        path: operationTarget,
        branch: operationBranch,
        createBranch: false,
      })
      if (client() !== connection || workspacePath !== operationWorkspacePath) throw new Error(t('workspaceChangedWorktree'))
      const created = Array.isArray(result) ? result.find((item) => pathKey(item.path) === pathKey(operationTarget)) : result
      if (!created) throw new Error(t('worktreeCreateFailed'))
      await onUseWorktree(created.path)
      setOpen(false)
      setWorktreeTarget(null)
      setBranchDecision(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  async function selectWorktree(worktree: GitWorktreeInfo) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onUseWorktree(worktree.path)
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="git-context-switcher">
      <button
        ref={trigger}
        type="button"
        className="git-context-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!workspacePath}
        {...triggerHandlers}
      >
        <GitBranch size={13} />
        <span>{gitProject === false ? t('gitNonProject') : branch ?? (gitProject === true ? t('gitDetachedHead') : t('gitReadingStatus'))}</span>
        {busy ? <LoaderCircle size={12} className="spinning" /> : <Plus size={12} />}
      </button>
      <FloatingSurface
        anchorRef={trigger}
        open={open}
        onClose={() => setOpen(false)}
        placement="above"
        className="git-context-menu"
        role="menu"
        aria-label={`${t('switchBranch')} / Worktree`}
      >
        <header>
          <strong>{t('gitContext')}</strong>
          <button type="button" aria-label={t('refreshGitContext')} title={t('refresh')} onClick={() => void load()} disabled={busy}>
            <RefreshCw size={13} />
          </button>
        </header>
        {error && <p className="git-context-error" role="alert">{error}</p>}
        {!isGit ? <p className="git-context-empty">{t('notGitProject')}</p> : null}
        {isGit && status?.root && <p className="git-context-root" title={status.root}>{t('currentDirectory')}：{status.root}</p>}
        {branchDecision && (
          <section className="git-context-decision" aria-label={`${t('switchToBranch')} ${branchDecision}`}>
            <h3>{t('switchToBranch')} {branchDecision}</h3>
            <button type="button" onClick={() => void applyBranchSwitch(branchDecision)} disabled={busy || Boolean(status?.dirty)}>
              <GitBranch size={13} />
              <span>{t('switchInCurrentDirectory')}</span>
            </button>
            <button type="button" onClick={() => void createWorktreeForBranch()} disabled={busy}>
              <Plus size={13} />
              <span>{t('createWorktreeAndSwitch')}</span>
            </button>
            <button type="button" onClick={() => { setBranchDecision(null); setWorktreeTarget(null) }} disabled={busy}>{t('backToBranches')}</button>
          </section>
        )}
        {worktreeTarget && <form className="git-context-worktree-form" onSubmit={(event) => { event.preventDefault(); void createWorktree() }}>
          <label htmlFor="git-worktree-path">{t('createWorktreeFor')} {worktreeTarget}</label>
          <input id="git-worktree-path" value={worktreePath} onChange={(event) => setWorktreePath(event.target.value)} placeholder={t('worktreePath')} autoFocus />
          <div><button type="button" onClick={() => void createWorktreeForBranch()} disabled={busy}>{t('browseFolder')}</button><button type="submit" disabled={busy || !worktreePath.trim()}>{t('createAndSwitch')}</button><button type="button" onClick={() => { setWorktreeTarget(null); setBranchDecision(null) }}>{t('cancel')}</button></div>
        </form>}
        <section>
          <h3>{t('switchBranch')}</h3>
          {branches.length ? branches.map((item) => (
              <button type="button" role="menuitem" className={item.current ? 'current' : ''} key={item.name} onClick={() => void chooseBranch(item.name)} disabled={busy}>
              <GitBranch size={13} />
              <span>{item.name}</span>
              {item.current && <small>{t('current')}</small>}
            </button>
          )) : <p className="git-context-empty">{t('noBranches')}</p>}
        </section>
        <section>
          <h3>{t('switchWorktree')}</h3>
          {worktrees.length ? worktrees.map((item) => (
              <button type="button" role="menuitem" className={pathKey(item.path) === pathKey(workspacePath) ? 'current' : ''} key={item.path} onClick={() => void selectWorktree(item)} disabled={busy || pathKey(item.path) === pathKey(workspacePath)}>
              <GitBranch size={13} />
              <span><strong>{item.branch ?? t('gitDetachedHead')}</strong><small title={item.path}>{item.path}</small></span>
              {pathKey(item.path) === pathKey(workspacePath) && <small>{t('current')}</small>}
            </button>
          )) : <p className="git-context-empty">{t('noWorktrees')}</p>}
        </section>
      </FloatingSurface>
    </div>
  )
}
