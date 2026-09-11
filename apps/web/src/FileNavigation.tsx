import { lazy, Suspense, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, FileCode2, Folder, LoaderCircle, RefreshCw } from 'lucide-react'
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
    [error, setError] = useState('')
  useEffect(() => {
    setPath('.')
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
  function navigateTo(index: number) {
    setPath(index < 0 ? '.' : segments.slice(0, index + 1).join('/'))
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
      ) : entries.length ? (
        <AnimatedList className="file-list" viewportClassName="file-list-viewport" aria-label={`文件列表 ${path}`}>
          {entries.map((entry) => (
            <SpotlightCard
              as="button"
              type="button"
              className="file-entry"
              key={entry.path}
              onClick={() => (entry.directory ? setPath(entry.path) : onOpen(entry.path))}
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
    [loading, setLoading] = useState(true),
    [error, setError] = useState('')
  useEffect(() => {
    let current = true
    void client()
      .call('file.read', { workspaceId, path })
      .then((result) => {
        if (current) {
          setText(result.text)
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
  }, [workspaceId, path])
  return (
    <div className="file-viewer rb-file-viewer">
      <GlassSurface className="file-viewer-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="file-viewer-header">
        <FileCode2 size={14} />
        <span title={path}>{path}</span>
        <span>只读</span>
      </div>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : loading ? (
        <div className="file-viewer-empty" role="status">
          <LoaderCircle size={18} className="spinning" />
          <span>正在读取文件…</span>
        </div>
      ) : (
        <Suspense fallback={<pre>{text}</pre>}>
          <CodeEditor value={text} {...(path.split('.').at(-1) ? { language: path.split('.').at(-1)! } : {})} />
        </Suspense>
      )}
    </div>
  )
}
