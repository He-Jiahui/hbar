import { useCallback, useEffect, useRef, useState } from 'react'
import { GitBranch, LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import type { GitBranchInfo, GitStatus, GitWorktreeInfo } from '@hbar/contracts'
import { client } from './stores'
import FloatingLayer, { useFloatingTrigger } from './FloatingLayer'
import './GitContextSwitcher.css'

export default function GitContextSwitcher({
  workspacePath,
  branch,
  onUseWorktree,
}: {
  workspacePath: string
  branch: string | null
  onUseWorktree(path: string): void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [branches, setBranches] = useState<GitBranchInfo[]>([])
  const [worktrees, setWorktrees] = useState<GitWorktreeInfo[]>([])
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [worktreeTarget, setWorktreeTarget] = useState<string | null>(null)
  const [worktreePath, setWorktreePath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const triggerHandlers = useFloatingTrigger({
    open,
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
  })
  const load = useCallback(async () => {
    if (!workspacePath) return
    setBusy(true)
    setError('')
    try {
      const [nextStatus, nextBranches, nextWorktrees] = await Promise.all([
        client().call('git.status', { cwd: workspacePath }),
        client().call('git.branch', { cwd: workspacePath, operation: 'list' }),
        client().call('git.worktree', { cwd: workspacePath, operation: 'list' }),
      ])
      setStatus(nextStatus)
      setBranches(Array.isArray(nextBranches) ? nextBranches : [])
      setWorktrees(Array.isArray(nextWorktrees) ? nextWorktrees : [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [workspacePath])
  useEffect(() => {
    if (open) void load()
  }, [load, open])
  async function switchBranch(name: string) {
    if (!name || name === branch || busy) return
    const existingWorktree = worktrees.find((item) => item.branch === name || item.branch === `refs/heads/${name}`)
    if (existingWorktree && existingWorktree.path.toLowerCase() !== workspacePath.toLowerCase()) {
      await selectWorktree(existingWorktree)
      return
    }
    if (status?.dirty) {
      setWorktreeTarget(name)
      setWorktreePath(`${workspacePath}-${name.replace(/[^\w.-]+/g, '-')}`)
      setError('当前目录有未提交改动，无法直接切换；可为该分支创建 Worktree。')
      return
    }
    setBusy(true)
    setError('')
    try {
      await client().call('git.branch', { cwd: workspacePath, operation: 'switch', name })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setWorktreeTarget(name)
      setWorktreePath(`${workspacePath}-${name.replace(/[^\w.-]+/g, '-')}`)
    } finally {
      setBusy(false)
    }
  }
  async function createWorktree() {
    if (!worktreeTarget || !worktreePath.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await client().call('git.worktree', {
        cwd: workspacePath,
        operation: 'add',
        path: worktreePath.trim(),
        branch: worktreeTarget,
        createBranch: false,
      })
      const created = Array.isArray(result) ? result.find((item) => item.path === worktreePath.trim()) : result
      if (!created) throw new Error('Worktree 创建失败')
      await onUseWorktree(created.path)
      setOpen(false)
      setWorktreeTarget(null)
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
        <span>{branch ?? '未检出分支'}</span>
        {busy ? <LoaderCircle size={12} className="spinning" /> : <Plus size={12} />}
      </button>
      <FloatingLayer
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
        {worktreeTarget && <form className="git-context-worktree-form" onSubmit={(event) => { event.preventDefault(); void createWorktree() }}>
          <label htmlFor="git-worktree-path">为 {worktreeTarget} 创建 Worktree</label>
          <input id="git-worktree-path" value={worktreePath} onChange={(event) => setWorktreePath(event.target.value)} placeholder="Worktree 路径" autoFocus />
          <div><button type="submit" disabled={busy || !worktreePath.trim()}>创建并切换</button><button type="button" onClick={() => setWorktreeTarget(null)}>取消</button></div>
        </form>}
        <section>
          <h3>切换分支</h3>
          {branches.length ? branches.map((item) => (
            <button type="button" role="menuitem" className={item.current ? 'current' : ''} key={item.name} onClick={() => void switchBranch(item.name)} disabled={busy}>
              <GitBranch size={13} />
              <span>{item.name}</span>
              {item.current && <small>当前</small>}
            </button>
          )) : <p className="git-context-empty">没有可切换的分支</p>}
        </section>
        <section>
          <h3>切换 Worktree</h3>
          {worktrees.length ? worktrees.map((item) => (
              <button type="button" role="menuitem" className={item.path === workspacePath ? 'current' : ''} key={item.path} onClick={() => void selectWorktree(item)} disabled={busy || item.path === workspacePath}>
              <GitBranch size={13} />
              <span><strong>{item.branch ?? '分离 HEAD'}</strong><small title={item.path}>{item.path}</small></span>
              {item.path === workspacePath && <small>当前</small>}
            </button>
          )) : <p className="git-context-empty">没有检测到 Worktree</p>}
        </section>
      </FloatingLayer>
    </div>
  )
}
