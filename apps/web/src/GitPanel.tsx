import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GitBranch, GitCommitHorizontal, GitCompareArrows, LoaderCircle, RefreshCw, Upload } from 'lucide-react'
import type { GitBranchInfo, GitCommitInfo, GitDiff, GitStatus } from '@hbar/contracts'
import { useConnection } from './stores'
import GlassSurface from './react-bits/GlassSurface'
import SpotlightCard from './react-bits/SpotlightCard'
import './GitPanel.css'
import GitDiffViewer from './GitDiffViewer'
import { useLocale, type LocaleMessageKey } from './locale'

type GitTab = 'changes' | 'history' | 'branches'
type GitDiffMode = 'unstaged' | 'staged' | 'remote'

function statusCode(entry: GitStatus['entries'][number], t: (key: LocaleMessageKey) => string) {
  const value = `${entry.index}${entry.worktree}`
  if (value === '??') return t('gitUntracked')
  if (value.includes('U')) return t('gitConflict')
  if (value.includes('A')) return t('gitAdded')
  if (value.includes('D')) return t('gitDeleted')
  if (value.includes('R')) return t('gitRenamed')
  return t('gitModified')
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

function shortBranch(value: string | null, t: (key: LocaleMessageKey) => string) {
  return value && value.length > 34 ? `${value.slice(0, 31)}…` : value ?? t('noBranch')
}

function shortSha(value: string) {
  return value.slice(0, 7)
}

export default function GitPanel({ workspacePath = '' }: { workspacePath?: string }) {
  const { t } = useLocale()
  const connection = useConnection((state) => state.client)
  const [tab, setTab] = useState<GitTab>('changes')
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [commits, setCommits] = useState<GitCommitInfo[]>([])
  const [branches, setBranches] = useState<GitBranchInfo[]>([])
  const [selectedPath, setSelectedPath] = useState('')
  const [diff, setDiff] = useState<GitDiff | null>(null)
  const [diffMode, setDiffMode] = useState<GitDiffMode>('unstaged')
  const [commitMessage, setCommitMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [diffLoading, setDiffLoading] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const diffRequestId = useRef(0)
  const mutationId = useRef(0)

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current
    const requestConnection = connection
    const isCurrentRequest = () =>
      currentRequest === requestId.current && requestConnection === useConnection.getState().client
    if (!workspacePath || !requestConnection) {
      if (isCurrentRequest()) {
        setLoading(false)
        setDiffLoading(false)
        setMutating(false)
        setStatus(null)
        setCommits([])
        setBranches([])
        setSelectedPath('')
        setDiff(null)
        setError(workspacePath ? t('hostDisconnected') : '')
      }
      return
    }
    setLoading(true)
    setError('')
    try {
      const [nextStatus, nextCommits, nextBranches] = await Promise.all([
        requestConnection.call('git.status', { cwd: workspacePath }),
        requestConnection.call('git.log', { cwd: workspacePath, limit: 20 }),
        requestConnection.call('git.branch', { cwd: workspacePath, operation: 'list' }),
      ])
      if (!isCurrentRequest()) return
      setStatus(nextStatus)
      setCommits(nextCommits)
      setBranches(Array.isArray(nextBranches) ? nextBranches : [])
      setSelectedPath((current) => (nextStatus.entries.some((entry) => entry.path === current) ? current : ''))
    } catch (cause) {
      if (isCurrentRequest()) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (isCurrentRequest()) setLoading(false)
    }
  }, [connection, t, workspacePath])

  useEffect(() => {
    requestId.current += 1
    diffRequestId.current += 1
    mutationId.current += 1
    setStatus(null)
    setCommits([])
    setBranches([])
    setSelectedPath('')
    setDiff(null)
    setDiffMode('unstaged')
    setLoading(false)
    setDiffLoading(false)
    setMutating(false)
    setError('')
    void refresh()
    return () => {
      requestId.current += 1
      diffRequestId.current += 1
      mutationId.current += 1
    }
  }, [refresh])

  const selectedEntry = useMemo(
    () => status?.entries.find((entry) => entry.path === selectedPath),
    [selectedPath, status?.entries],
  )

  async function openDiff(path: string, mode: GitDiffMode = diffMode) {
    const currentRequest = ++diffRequestId.current
    const requestConnection = connection
    const isCurrentRequest = () =>
      currentRequest === diffRequestId.current && requestConnection === useConnection.getState().client
    setSelectedPath(path)
    setDiffMode(mode)
    setDiffLoading(true)
    setDiff(null)
    if (!requestConnection) {
      if (isCurrentRequest()) {
        setDiffLoading(false)
        setError(t('hostDisconnected'))
      }
      return
    }
    try {
      const nextDiff = mode === 'remote'
        ? await requestConnection.call('git.diff_to_remote', { cwd: workspacePath, paths: [path] }).then((remote) => remote ? { cwd: workspacePath, diff: remote.diff, cached: false, truncated: remote.truncated } : null)
        : await requestConnection.call('git.diff', { cwd: workspacePath, cached: mode === 'staged', paths: [path] })
      if (isCurrentRequest()) setDiff(nextDiff)
    } catch (cause) {
      if (isCurrentRequest()) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (isCurrentRequest()) setDiffLoading(false)
    }
  }

  async function switchBranch(name: string) {
    if (!workspacePath || !name || name === status?.branch || mutating) return
    const requestConnection = connection
    const operation = ++mutationId.current
    const isCurrentMutation = () =>
      operation === mutationId.current && requestConnection === useConnection.getState().client
    if (!requestConnection) {
      setError(t('hostDisconnected'))
      return
    }
    setMutating(true)
    setError('')
    try {
      await requestConnection.call('git.branch', { cwd: workspacePath, operation: 'switch', name })
      if (isCurrentMutation()) await refresh()
    } catch (cause) {
      if (isCurrentMutation()) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (isCurrentMutation()) setMutating(false)
    }
  }

  async function updateIndex(path: string, staged: boolean) {
    if (!workspacePath || mutating) return
    const requestConnection = connection
    const operation = ++mutationId.current
    const isCurrentMutation = () =>
      operation === mutationId.current && requestConnection === useConnection.getState().client
    if (!requestConnection) {
      setError(t('hostDisconnected'))
      return
    }
    setMutating(true)
    setError('')
    try {
      await requestConnection.call(staged ? 'git.stage' : 'git.unstage', { cwd: workspacePath, paths: [path] })
      if (isCurrentMutation()) {
        setDiff(null)
        setSelectedPath('')
        await refresh()
      }
    } catch (cause) {
      if (isCurrentMutation()) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (isCurrentMutation()) setMutating(false)
    }
  }

  async function commit() {
    const message = commitMessage.trim()
    if (!workspacePath || !message || !status?.entries.length || mutating) return
    if (!window.confirm(`${t('commitConfirm')} ${status.entries.length} ${t('changes')}?`)) return
    const requestConnection = connection
    const operation = ++mutationId.current
    const isCurrentMutation = () =>
      operation === mutationId.current && requestConnection === useConnection.getState().client
    if (!requestConnection) {
      setError(t('hostDisconnected'))
      return
    }
    setMutating(true)
    setError('')
    try {
      await requestConnection.call('git.commit', {
        cwd: workspacePath,
        message,
        paths: status.entries.map((entry) => entry.path).slice(0, 100),
        stage: true,
      })
      if (isCurrentMutation()) {
        setCommitMessage('')
        setDiff(null)
        setSelectedPath('')
        await refresh()
      }
    } catch (cause) {
      if (isCurrentMutation()) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (isCurrentMutation()) setMutating(false)
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
            <p>{status?.root ? shortBranch(status.branch, t) : t('projectChangesHistory')}</p>
          </div>
        </div>
        <button type="button" className="git-panel-refresh" title={t('refreshGitStatus')} aria-label={t('refreshGitStatus')} onClick={() => void refresh()} disabled={loading || !workspacePath}>
          {loading ? <LoaderCircle size={14} className="spinning" /> : <RefreshCw size={14} />}
        </button>
      </header>
      <nav className="git-panel-tabs" aria-label={t('gitGroup')}>
        <button type="button" className={tab === 'changes' ? 'selected' : ''} aria-current={tab === 'changes' ? 'page' : undefined} onClick={() => setTab('changes')}>
          <GitCompareArrows size={13} /> {t('changes')} {status?.entries.length ? <b>{status.entries.length}</b> : null}
        </button>
        <button type="button" className={tab === 'history' ? 'selected' : ''} aria-current={tab === 'history' ? 'page' : undefined} onClick={() => setTab('history')}>
          <GitCommitHorizontal size={13} /> {t('history')}
        </button>
        <button type="button" className={tab === 'branches' ? 'selected' : ''} aria-current={tab === 'branches' ? 'page' : undefined} onClick={() => setTab('branches')}>
          <GitBranch size={13} /> {t('branches')}
        </button>
      </nav>
      {!workspacePath ? (
        <div className="git-panel-empty" role="status"><GitBranch size={20} /><strong>{t('noWorkspaceSelected')}</strong><span>{t('selectWorkspaceHint')}</span></div>
      ) : error && !status ? (
        <div className="git-panel-empty" role="alert"><GitBranch size={20} /><strong>{t('cannotReadGit')}</strong><span>{error}</span><button type="button" className="button" onClick={() => void refresh()}>{t('retry')}</button></div>
      ) : status && !status.root ? (
        <div className="git-panel-empty" role="status"><GitBranch size={20} /><strong>{t('notGitRepository')}</strong><span>{t('initGitHint')}</span></div>
      ) : tab === 'changes' ? (
        <div className="git-panel-content">
          <div className="git-branch-summary">
            <div><span>{t('currentBranch')}</span><strong title={status?.branch ?? undefined}>{shortBranch(status?.branch ?? null, t)}</strong></div>
            <span className="git-sync-state">{status?.ahead ? `${t('ahead')} ${status.ahead}` : ''}{status?.ahead && status.behind ? ' · ' : ''}{status?.behind ? `${t('behind')} ${status.behind}` : !status?.ahead ? t('synced') : ''}</span>
          </div>
          {status?.entries.length ? (
            <div className="git-change-list" aria-label={t('fileChanges')}>
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
                  <code className={`git-change-code git-change-${statusTone(entry)}`}>{statusCode(entry, t)}</code>
                  <span title={entry.path}>{entry.path}</span>
                  <span className="git-change-actions">
                    <button
                      type="button"
                      title={isStaged(entry) ? t('unstage') : t('stage')}
                      aria-label={`${isStaged(entry) ? t('unstage') : t('stage')} ${entry.path}`}
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
              {status.entries.length > 100 && <p className="git-panel-muted">{t('onlyFirstFiles')}</p>}
            </div>
          ) : (
            <div className="git-panel-empty compact" role="status"><GitCompareArrows size={18} /><strong>{t('cleanWorkspace')}</strong><span>{t('noPendingChanges')}</span></div>
          )}
          {selectedEntry && (
            <section className="git-diff-card" aria-label={`${selectedEntry.path} diff`}>
              <header>
                <code>{selectedEntry.path}</code>
                <label className="git-diff-mode"><span className="visually-hidden">{t('diffMode')}</span><select aria-label={t('diffMode')} value={diffMode} onChange={(event) => void openDiff(selectedEntry.path, event.target.value as GitDiffMode)}><option value="unstaged">{t('unstagedDiff')}</option><option value="staged">{t('stagedDiff')}</option><option value="remote">{t('remoteDiff')}</option></select></label>
                {diff?.truncated && <span>{t('truncated')}</span>}
              </header>
              {diffLoading ? <div className="git-diff-loading" role="status"><LoaderCircle size={15} className="spinning" />{t('readingDiff')}</div> : diff?.diff ? <GitDiffViewer source={diff.diff} path={selectedEntry.path} truncated={diff.truncated} /> : <pre>{t('noTextDiff')}</pre>}
            </section>
          )}
          {status?.entries.length ? (
            <form className="git-commit-form" onSubmit={(event) => { event.preventDefault(); void commit() }}>
              <label><span>{t('commitMessage')}</span><input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder={t('commitMessagePlaceholder')} maxLength={4_000} /></label>
              <button type="submit" className="button" disabled={mutating || !commitMessage.trim()}><Upload size={13} />{mutating ? t('committing') : t('stageAndCommit')}</button>
            </form>
          ) : null}
        </div>
      ) : tab === 'history' ? (
        <div className="git-panel-content git-history-list" aria-label={t('commitHistory')}>
          {commits.length ? commits.map((commit) => <SpotlightCard className="git-commit-row" key={commit.sha} spotlightColor="color-mix(in srgb, var(--rb-accent) 18%, transparent)"><code>{shortSha(commit.shortSha)}</code><div><strong>{commit.subject}</strong><small>{commit.author} · {commit.authoredAt}</small></div></SpotlightCard>) : <div className="git-panel-empty compact" role="status"><GitCommitHorizontal size={18} /><strong>{t('noCommits')}</strong><span>{t('noCommitRecords')}</span></div>}
        </div>
      ) : (
        <div className="git-panel-content git-branch-list" aria-label={t('branchList')}>
          {branches.length ? branches.map((branch) => <SpotlightCard className={`git-branch-row ${branch.current ? 'selected' : ''}`} key={branch.name} spotlightColor="color-mix(in srgb, var(--rb-accent) 18%, transparent)"><div><strong>{branch.name}</strong><small>{branch.current ? t('currentBranchLabel') : branch.remote ?? t('localBranch')}</small></div>{branch.current ? <span className="git-branch-current">{t('current')}</span> : <button type="button" className="button" onClick={() => void switchBranch(branch.name)} disabled={mutating}>{t('switch')}</button>}</SpotlightCard>) : <div className="git-panel-empty compact" role="status"><GitBranch size={18} /><strong>{t('noBranchesInRepository')}</strong><span>{t('noBranchesHint')}</span></div>}
        </div>
      )}
      {error && status && <p className="git-panel-error" role="alert">{error}</p>}
    </section>
  )
}
