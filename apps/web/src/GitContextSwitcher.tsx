import { useCallback, useEffect, useRef, useState } from 'react'
import { GitBranch, LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import type { GitBranchInfo, GitStatus, GitWorktreeInfo } from '@hbar/contracts'
import { client } from './stores'
import { platform } from './platform'
import { FloatingSurface, useFloatingTrigger } from './FloatingLayer'
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
      if (client() !== connection || workspacePath !== operationWorkspacePath)
        throw new Error('工作区已切换，请重新选择分支')
      await load()
      if (client() !== connection || workspacePath !== operationWorkspacePath)
        throw new Error('连接或工作区已切换，请重新选择分支')
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
    setError(status?.dirty ? '当前目录有未提交改动，不能在当前目录切换分支。' : '')
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
      if (client() !== connection || workspacePath !== operationWorkspacePath)
        throw new Error('工作区已切换，请重新选择 Worktree')
      const created = Array.isArray(result) ? result.find((item) => pathKey(item.path) === pathKey(operationTarget)) : result
      if (!created) throw new Error('Worktree 创建失败')
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
        <span>{gitProject === false ? '非 Git 项目' : branch ?? (gitProject === true ? '分离 HEAD' : '读取 Git 状态…')}</span>
        {busy ? <LoaderCircle size={12} className="spinning" /> : <Plus size={12} />}
      </button>
      <FloatingSurface
        anchorRef={trigger}
        open={open}
        onClose={() => setOpen(false)}
        placement="above"
        className="git-context-menu"
        role="menu"
        aria-label="切换 Git 分支或 worktree"
      >
        <header>
          <strong>Git 上下文</strong>
          <button type="button" aria-label="刷新 Git 上下文" title="刷新" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={13} />
          </button>
        </header>
        {error && <p className="git-context-error" role="alert">{error}</p>}
        {!isGit ? <p className="git-context-empty">当前目录不是 Git 项目。</p> : null}
        {isGit && status?.root && <p className="git-context-root" title={status.root}>当前目录：{status.root}</p>}
        {branchDecision && (
          <section className="git-context-decision" aria-label={`切换到分支 ${branchDecision}`}>
            <h3>切换到 {branchDecision}</h3>
            <button type="button" onClick={() => void applyBranchSwitch(branchDecision)} disabled={busy || Boolean(status?.dirty)}>
              <GitBranch size={13} />
              <span>在当前目录切换</span>
            </button>
            <button type="button" onClick={() => void createWorktreeForBranch()} disabled={busy}>
              <Plus size={13} />
              <span>新建 Worktree 并切换</span>
            </button>
            <button type="button" onClick={() => { setBranchDecision(null); setWorktreeTarget(null) }} disabled={busy}>返回分支列表</button>
          </section>
        )}
        {worktreeTarget && <form className="git-context-worktree-form" onSubmit={(event) => { event.preventDefault(); void createWorktree() }}>
          <label htmlFor="git-worktree-path">为 {worktreeTarget} 创建 Worktree</label>
          <input id="git-worktree-path" value={worktreePath} onChange={(event) => setWorktreePath(event.target.value)} placeholder="Worktree 路径" autoFocus />
          <div><button type="button" onClick={() => void createWorktreeForBranch()} disabled={busy}>浏览文件夹</button><button type="submit" disabled={busy || !worktreePath.trim()}>创建并切换</button><button type="button" onClick={() => { setWorktreeTarget(null); setBranchDecision(null) }}>取消</button></div>
        </form>}
        <section>
          <h3>切换分支</h3>
          {branches.length ? branches.map((item) => (
              <button type="button" role="menuitem" className={item.current ? 'current' : ''} key={item.name} onClick={() => void chooseBranch(item.name)} disabled={busy}>
              <GitBranch size={13} />
              <span>{item.name}</span>
              {item.current && <small>当前</small>}
            </button>
          )) : <p className="git-context-empty">没有可切换的分支</p>}
        </section>
        <section>
          <h3>切换 Worktree</h3>
          {worktrees.length ? worktrees.map((item) => (
              <button type="button" role="menuitem" className={pathKey(item.path) === pathKey(workspacePath) ? 'current' : ''} key={item.path} onClick={() => void selectWorktree(item)} disabled={busy || pathKey(item.path) === pathKey(workspacePath)}>
              <GitBranch size={13} />
              <span><strong>{item.branch ?? '分离 HEAD'}</strong><small title={item.path}>{item.path}</small></span>
              {pathKey(item.path) === pathKey(workspacePath) && <small>当前</small>}
            </button>
          )) : <p className="git-context-empty">没有检测到 Worktree</p>}
        </section>
      </FloatingSurface>
    </div>
  )
}
