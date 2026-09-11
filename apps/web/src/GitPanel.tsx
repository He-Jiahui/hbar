import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GitBranch, GitCommitHorizontal, GitCompareArrows, LoaderCircle, RefreshCw, Upload } from 'lucide-react'
import type { GitBranchInfo, GitCommitInfo, GitDiff, GitStatus } from '@hbar/contracts'
import { client } from './stores'
import GlassSurface from './react-bits/GlassSurface'
import SpotlightCard from './react-bits/SpotlightCard'
import './GitPanel.css'

type GitTab = 'changes' | 'history' | 'branches'

function statusCode(entry: GitStatus['entries'][number]) {
  const value = `${entry.index}${entry.worktree}`
  if (value === '??') return '未跟踪'
  if (value.includes('U')) return '冲突'
  if (value.includes('A')) return '新增'
  if (value.includes('D')) return '删除'
  if (value.includes('R')) return '重命名'
  return '修改'
}

function statusTone(entry: GitStatus['entries'][number]) {
  const value = `${entry.index}${entry.worktree}`
  if (value === '??') return 'untracked'
  if (value.includes('U')) return 'conflict'
  if (value.includes('A')) return 'added'
  if (value.includes('D')) return 'deleted'
  return 'changed'
}

function isStaged(entry: GitStatus['entries'][number]) {
  return entry.index !== ' ' && entry.index !== '?'
}

function shortBranch(value: string | null) {
  return value && value.length > 34 ? `${value.slice(0, 31)}…` : value ?? '未检出分支'
}

function shortSha(value: string) {
  return value.slice(0, 7)
}

export default function GitPanel({ workspacePath = '' }: { workspacePath?: string }) {
  const [tab, setTab] = useState<GitTab>('changes')
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [commits, setCommits] = useState<GitCommitInfo[]>([])
  const [branches, setBranches] = useState<GitBranchInfo[]>([])
  const [selectedPath, setSelectedPath] = useState('')
  const [diff, setDiff] = useState<GitDiff | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [diffLoading, setDiffLoading] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const diffRequestId = useRef(0)

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current
    if (!workspacePath) {
      setStatus(null)
      setCommits([])
      setBranches([])
      setError('')
      return
    }
    setLoading(true)
    setError('')
    try {
      const [nextStatus, nextCommits, nextBranches] = await Promise.all([
        client().call('git.status', { cwd: workspacePath }),
        client().call('git.log', { cwd: workspacePath, limit: 20 }),
        client().call('git.branch', { cwd: workspacePath, operation: 'list' }),
      ])
      if (currentRequest !== requestId.current) return
      setStatus(nextStatus)
      setCommits(nextCommits)
      setBranches(Array.isArray(nextBranches) ? nextBranches : [])
      setSelectedPath((current) => (nextStatus.entries.some((entry) => entry.path === current) ? current : ''))
    } catch (cause) {
      if (currentRequest === requestId.current) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [workspacePath])

  useEffect(() => {
    void refresh()
    return () => {
      requestId.current += 1
      diffRequestId.current += 1
    }
  }, [refresh])

  const selectedEntry = useMemo(
    () => status?.entries.find((entry) => entry.path === selectedPath),
    [selectedPath, status?.entries],
  )

  async function openDiff(path: string) {
    const currentRequest = ++diffRequestId.current
    setSelectedPath(path)
    setDiffLoading(true)
    setDiff(null)
    try {
      const nextDiff = await client().call('git.diff', { cwd: workspacePath, paths: [path] })
      if (currentRequest === diffRequestId.current) setDiff(nextDiff)
    } catch (cause) {
      if (currentRequest === diffRequestId.current) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (currentRequest === diffRequestId.current) setDiffLoading(false)
    }
  }

  async function switchBranch(name: string) {
    if (!workspacePath || !name || name === status?.branch || mutating) return
    setMutating(true)
    setError('')
    try {
      await client().call('git.branch', { cwd: workspacePath, operation: 'switch', name })
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setMutating(false)
    }
  }

  async function updateIndex(path: string, staged: boolean) {
    if (!workspacePath || mutating) return
    setMutating(true)
    setError('')
    try {
      await client().call(staged ? 'git.stage' : 'git.unstage', { cwd: workspacePath, paths: [path] })
      setDiff(null)
      setSelectedPath('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setMutating(false)
    }
  }

  async function commit() {
    const message = commitMessage.trim()
    if (!workspacePath || !message || !status?.entries.length || mutating) return
    if (!window.confirm(`提交 ${status.entries.length} 个更改？`)) return
    setMutating(true)
    setError('')
    try {
      await client().call('git.commit', {
        cwd: workspacePath,
        message,
        paths: status.entries.map((entry) => entry.path).slice(0, 100),
        stage: true,
      })
      setCommitMessage('')
      setDiff(null)
      setSelectedPath('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setMutating(false)
    }
  }

  return (
    <section className="git-panel rb-git-panel" aria-label="Git">
      <GlassSurface className="git-panel-glass" width="100%" height="100%" aria-hidden="true" />
      <header className="git-panel-header">
        <div className="git-panel-title">
          <span className="git-panel-icon"><GitBranch size={15} /></span>
          <div>
            <h2>Git</h2>
            <p>{status?.root ? shortBranch(status.branch) : '项目变更与历史'}</p>
          </div>
        </div>
        <button type="button" className="git-panel-refresh" title="刷新 Git 状态" aria-label="刷新 Git 状态" onClick={() => void refresh()} disabled={loading || !workspacePath}>
          {loading ? <LoaderCircle size={14} className="spinning" /> : <RefreshCw size={14} />}
        </button>
      </header>
      <nav className="git-panel-tabs" aria-label="Git 分组">
        <button type="button" className={tab === 'changes' ? 'selected' : ''} aria-current={tab === 'changes' ? 'page' : undefined} onClick={() => setTab('changes')}>
          <GitCompareArrows size={13} /> 更改 {status?.entries.length ? <b>{status.entries.length}</b> : null}
        </button>
        <button type="button" className={tab === 'history' ? 'selected' : ''} aria-current={tab === 'history' ? 'page' : undefined} onClick={() => setTab('history')}>
          <GitCommitHorizontal size={13} /> 历史
        </button>
        <button type="button" className={tab === 'branches' ? 'selected' : ''} aria-current={tab === 'branches' ? 'page' : undefined} onClick={() => setTab('branches')}>
          <GitBranch size={13} /> 分支
        </button>
      </nav>
      {!workspacePath ? (
        <div className="git-panel-empty" role="status"><GitBranch size={20} /><strong>尚未选择工作区</strong><span>选择工作区后查看 Git 状态。</span></div>
      ) : error && !status ? (
        <div className="git-panel-empty" role="alert"><GitBranch size={20} /><strong>无法读取 Git</strong><span>{error}</span><button type="button" className="button" onClick={() => void refresh()}>重试</button></div>
      ) : status && !status.root ? (
        <div className="git-panel-empty" role="status"><GitBranch size={20} /><strong>当前目录不是 Git 仓库</strong><span>在项目根目录初始化 Git 后，这里会显示更改和提交历史。</span></div>
      ) : tab === 'changes' ? (
        <div className="git-panel-content">
          <div className="git-branch-summary">
            <div><span>当前分支</span><strong title={status?.branch ?? undefined}>{shortBranch(status?.branch ?? null)}</strong></div>
            <span className="git-sync-state">{status?.ahead ? `领先 ${status.ahead}` : ''}{status?.ahead && status.behind ? ' · ' : ''}{status?.behind ? `落后 ${status.behind}` : !status?.ahead ? '已同步' : ''}</span>
          </div>
          {status?.entries.length ? (
            <div className="git-change-list" aria-label="文件更改">
              {status.entries.slice(0, 100).map((entry) => (
                <SpotlightCard
                  className={`git-change-row ${entry.path === selectedPath ? 'selected' : ''}`}
                  key={`${entry.index}${entry.worktree}:${entry.path}`}
                  onClick={() => void openDiff(entry.path)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      void openDiff(entry.path)
                    }
                  }}
                  spotlightColor="color-mix(in srgb, var(--rb-accent) 20%, transparent)"
                >
                  <code className={`git-change-code git-change-${statusTone(entry)}`}>{statusCode(entry)}</code>
                  <span title={entry.path}>{entry.path}</span>
                  <span className="git-change-actions">
                    <button
                      type="button"
                      title={isStaged(entry) ? '取消暂存' : '暂存'}
                      aria-label={`${isStaged(entry) ? '取消暂存' : '暂存'} ${entry.path}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        void updateIndex(entry.path, !isStaged(entry))
                      }}
                      disabled={mutating}
                    >
                      {isStaged(entry) ? '−' : '＋'}
                    </button>
                  </span>
                </SpotlightCard>
              ))}
              {status.entries.length > 100 && <p className="git-panel-muted">仅显示前 100 个文件。</p>}
            </div>
          ) : (
            <div className="git-panel-empty compact" role="status"><GitCompareArrows size={18} /><strong>工作区干净</strong><span>没有待提交的文件更改。</span></div>
          )}
          {selectedEntry && (
            <section className="git-diff-card" aria-label={`${selectedEntry.path} 差异`}>
              <header><code>{selectedEntry.path}</code><span>{diff?.truncated ? '内容已截断' : '未暂存差异'}</span></header>
              {diffLoading ? <div className="git-diff-loading" role="status"><LoaderCircle size={15} className="spinning" />读取差异…</div> : <pre>{diff?.diff || '此文件没有可显示的文本差异。'}</pre>}
            </section>
          )}
          {status?.entries.length ? (
            <form className="git-commit-form" onSubmit={(event) => { event.preventDefault(); void commit() }}>
              <label><span>提交说明</span><input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder="输入一次提交说明" maxLength={4_000} /></label>
              <button type="submit" className="button" disabled={mutating || !commitMessage.trim()}><Upload size={13} />{mutating ? '提交中…' : '暂存并提交'}</button>
            </form>
          ) : null}
        </div>
      ) : tab === 'history' ? (
        <div className="git-panel-content git-history-list" aria-label="提交历史">
          {commits.length ? commits.map((commit) => <SpotlightCard className="git-commit-row" key={commit.sha} spotlightColor="color-mix(in srgb, var(--rb-accent) 18%, transparent)"><code>{shortSha(commit.shortSha)}</code><div><strong>{commit.subject}</strong><small>{commit.author} · {commit.authoredAt}</small></div></SpotlightCard>) : <div className="git-panel-empty compact" role="status"><GitCommitHorizontal size={18} /><strong>暂无提交</strong><span>这个仓库还没有可显示的提交记录。</span></div>}
        </div>
      ) : (
        <div className="git-panel-content git-branch-list" aria-label="分支列表">
          {branches.length ? branches.map((branch) => <SpotlightCard className={`git-branch-row ${branch.current ? 'selected' : ''}`} key={branch.name} spotlightColor="color-mix(in srgb, var(--rb-accent) 18%, transparent)"><div><strong>{branch.name}</strong><small>{branch.current ? '当前分支' : branch.remote ?? '本地分支'}</small></div>{branch.current ? <span className="git-branch-current">当前</span> : <button type="button" className="button" onClick={() => void switchBranch(branch.name)} disabled={mutating}>切换</button>}</SpotlightCard>) : <div className="git-panel-empty compact" role="status"><GitBranch size={18} /><strong>暂无分支</strong><span>当前仓库没有可显示的分支。</span></div>}
        </div>
      )}
      {error && status && <p className="git-panel-error" role="alert">{error}</p>}
    </section>
  )
}
