import { lazy, Suspense, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  Folder,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  X,
} from 'lucide-react'
import type { FileEntry } from '@hbar/contracts'
import { client } from './stores'
import AnimatedList from './react-bits/AnimatedList'
import GlassSurface from './react-bits/GlassSurface'
import SpotlightCard from './react-bits/SpotlightCard'
import './FileNavigation.css'

// Keep the editor out of the initial shell bundle; file navigation remains
// useful even when the optional CodeMirror chunk is still loading.
const CodeEditor = lazy(() => import('./CodeEditor'))

interface FileNavigationProps {
  workspaceId: string
  onOpen(path: string): void
}

/** File tree view for the active workspace. Network ownership stays local to
 * this document feature; the parent only supplies scope and open intent. */
export function FileNavigation({ workspaceId, onOpen }: FileNavigationProps) {
  const [path, setPath] = useState('.'),
    [entries, setEntries] = useState<FileEntry[]>([]),
    [loading, setLoading] = useState(false),
    [reloadToken, setReloadToken] = useState(0),
    [query, setQuery] = useState(''),
    [error, setError] = useState('')
  useEffect(() => {
    setPath('.')
    setQuery('')
  }, [workspaceId])
  useEffect(() => {
    if (!workspaceId) {
      setEntries([])
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    void client()
      .call('file.list', { workspaceId, path })
      .then((files) => {
        if (alive) {
          setEntries(files)
          setError('')
        }
      })
      .catch((failure) => {
        if (alive) setError(failure instanceof Error ? failure.message : String(failure))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [workspaceId, path, reloadToken])
  const segments = path === '.' ? [] : path.split('/').filter(Boolean)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleEntries = normalizedQuery
    ? entries.filter((entry) => entry.name.toLocaleLowerCase().includes(normalizedQuery))
    : entries
  function navigateTo(index: number) {
    setPath(index < 0 ? '.' : segments.slice(0, index + 1).join('/'))
    setQuery('')
  }
  return (
    <div className="file-nav rb-file-nav">
      <GlassSurface className="file-nav-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="sidebar-heading">
        <strong>文件</strong>
        <div>
          <button
            type="button"
            title="上级目录"
            aria-label="上级目录"
            disabled={path === '.'}
            onClick={() => setPath(path.includes('/') ? path.split('/').slice(0, -1).join('/') : '.')}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            title="刷新目录"
            aria-label="刷新目录"
            disabled={loading || !workspaceId}
            onClick={() => setReloadToken((current) => current + 1)}
          >
            {loading ? <LoaderCircle size={15} className="spinning" /> : <RefreshCw size={15} />}
          </button>
        </div>
      </div>
      <nav className="file-breadcrumb" aria-label="文件路径" title={path}>
        <button type="button" className={path === '.' ? 'selected' : ''} onClick={() => navigateTo(-1)}>
          工作区
        </button>
        {segments.map((segment, index) => (
          <span className="file-breadcrumb-segment" key={`${segment}-${index}`}>
            <span aria-hidden="true">/</span>
            <button type="button" className={index === segments.length - 1 ? 'selected' : ''} onClick={() => navigateTo(index)}>
              {segment}
            </button>
          </span>
        ))}
      </nav>
      <label className="file-filter">
        <Search size={13} aria-hidden="true" />
        <input
          type="search"
          aria-label="筛选当前目录"
          placeholder="筛选当前目录"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button type="button" title="清除文件筛选" aria-label="清除文件筛选" onClick={() => setQuery('')}>
            <X size={12} />
          </button>
        )}
      </label>
      {normalizedQuery && !loading && !error && (
        <div className="file-filter-count" role="status">
          {visibleEntries.length} 个匹配项
        </div>
      )}
      {!workspaceId ? (
        <div className="file-empty-state" role="status">
          <Folder size={18} />
          <strong>尚未选择工作区</strong>
          <span>选择一个工作区后浏览文件。</span>
        </div>
      ) : error ? (
        <div className="inline-error" role="alert">
          {error}
        </div>
      ) : loading ? (
        <div className="file-empty-state" role="status">
          <LoaderCircle size={18} className="spinning" />
          <strong>正在读取目录</strong>
          <span>稍等片刻，文件列表马上就绪。</span>
        </div>
      ) : visibleEntries.length ? (
        <AnimatedList className="file-list" viewportClassName="file-list-viewport" aria-label={`文件列表 ${path}`}>
          {visibleEntries.map((entry) => (
            <SpotlightCard
              as="button"
              type="button"
              className="file-entry"
              key={entry.path}
              onClick={() => {
                if (entry.directory) {
                  setPath(entry.path)
                  setQuery('')
                } else onOpen(entry.path)
              }}
              title={entry.path}
              aria-label={entry.directory ? `打开目录 ${entry.name}` : `打开文件 ${entry.name}`}
              spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
            >
              {entry.directory ? <Folder size={14} className="folder-icon" /> : <FileCode2 size={14} />}
              <span>{entry.name}</span>
              {entry.directory && <ChevronRight size={12} />}
            </SpotlightCard>
          ))}
        </AnimatedList>
      ) : entries.length ? (
        <div className="file-empty-state" role="status">
          <Search size={18} />
          <strong>没有匹配的文件</strong>
          <span>尝试更换关键词，或清除当前筛选。</span>
          <button type="button" className="text-command" onClick={() => setQuery('')}>清除筛选</button>
        </div>
      ) : (
        <div className="file-empty-state" role="status">
          <Folder size={18} />
          <strong>目录为空</strong>
          <span>当前目录没有可浏览的文件。</span>
        </div>
      )}
    </div>
  )
}

interface FileViewerProps {
  path: string
  workspaceId: string
}

export function FileViewer({ path, workspaceId }: FileViewerProps) {
  const [text, setText] = useState(''),
    [savedText, setSavedText] = useState(''),
    [revision, setRevision] = useState(''),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [reloadToken, setReloadToken] = useState(0),
    [conflict, setConflict] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('')
  const dirty = !loading && text !== savedText
  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    setNotice('')
    setConflict(false)
    setText('')
    setSavedText('')
    setRevision('')
    void client()
      .call('file.read', { workspaceId, path })
      .then((result) => {
        if (current) {
          setText(result.text)
          setSavedText(result.text)
          setRevision(result.revision)
          setError('')
        }
      })
      .catch((failure) => {
        if (current) setError(failure instanceof Error ? failure.message : String(failure))
      })
      .finally(() => {
        if (current) setLoading(false)
      })
      return () => {
      current = false
    }
  }, [workspaceId, path, reloadToken])
  function failureMessage(failure: unknown) {
    return failure instanceof Error ? failure.message : String(failure)
  }
  function failureCode(failure: unknown) {
    return typeof failure === 'object' && failure !== null && 'code' in failure ? String(failure.code) : ''
  }
  async function save(force = false) {
    if (!dirty || saving) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await client().call('file.write', {
        workspaceId,
        path,
        text,
        ...(force || !revision ? {} : { expectedRevision: revision }),
      })
      setText(result.text)
      setSavedText(result.text)
      setRevision(result.revision)
      setConflict(false)
      setNotice('已保存')
    } catch (failure) {
      if (failureCode(failure) === 'FILE_CONFLICT') setConflict(true)
      setError(failureMessage(failure))
    } finally {
      setSaving(false)
    }
  }
  function reload() {
    setReloadToken((current) => current + 1)
  }
  function discardChanges() {
    reload()
  }
  return (
    <div className="file-viewer rb-file-viewer">
      <GlassSurface className="file-viewer-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="file-viewer-header">
        <FileCode2 size={14} />
        <span title={path}>{path}</span>
        <span className={dirty ? 'file-viewer-state dirty' : 'file-viewer-state'}>
          {saving ? '保存中…' : dirty ? '未保存' : notice || '已保存'}
        </span>
        <div className="file-viewer-actions">
          <button
            type="button"
            title="重新加载文件"
            aria-label="重新加载文件"
            disabled={saving || !workspaceId || dirty}
            onClick={reload}
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            className="file-viewer-save"
            title="保存文件"
            aria-label="保存文件"
            disabled={!dirty || saving || !workspaceId}
            onClick={() => void save()}
          >
            {saving ? <LoaderCircle size={13} className="spinning" /> : <Save size={13} />}
          </button>
        </div>
      </div>
      {error ? (
        <div className="file-viewer-feedback" role="alert">
          <p className="inline-error">{error}</p>
          {conflict && (
            <div className="file-viewer-conflict-actions">
              <button type="button" className="button" onClick={() => setReloadToken((current) => current + 1)}>
                <RotateCcw size={12} /> 重新加载
              </button>
              <button type="button" className="button primary" onClick={() => void save(true)} disabled={saving}>
                <AlertTriangle size={12} /> 覆盖保存
              </button>
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="file-viewer-empty" role="status">
          <LoaderCircle size={18} className="spinning" />
          <span>正在读取文件…</span>
        </div>
      ) : (
        <Suspense fallback={<pre>{text}</pre>}>
          <CodeEditor
            value={text}
            readOnly={false}
            onChange={setText}
            {...(path.split('.').at(-1) ? { language: path.split('.').at(-1)! } : {})}
          />
        </Suspense>
      )}
      {dirty && !error && (
        <div className="file-viewer-unsaved" role="status">
          <span>有未保存的更改</span>
          <button type="button" className="button primary" onClick={() => void save()} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
          <button type="button" className="button" onClick={discardChanges} disabled={saving}>
            放弃更改
          </button>
        </div>
      )}
    </div>
  )
}
