import { lazy, Suspense, useEffect, useRef, useState } from 'react'
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
import { useConnection } from './stores'
import AnimatedList from './react-bits/AnimatedList'
import GlassSurface from './react-bits/GlassSurface'
import SpotlightCard from './react-bits/SpotlightCard'
import { referenceAttributes } from './react-bits'
import { useLocale } from './locale'
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
  const { t } = useLocale()
  const connection = useConnection((state) => state.client)
  const [path, setPath] = useState('.'),
    [entries, setEntries] = useState<FileEntry[]>([]),
    [loading, setLoading] = useState(false),
    [reloadToken, setReloadToken] = useState(0),
    [query, setQuery] = useState(''),
    [error, setError] = useState('')
  const requestSerial = useRef(0)
  useEffect(() => {
    setPath('.')
    setQuery('')
  }, [workspaceId])
  useEffect(() => {
    if (!workspaceId) {
      setEntries([])
      setLoading(false)
      setError('')
      return
    }
    let alive = true
    const serial = ++requestSerial.current
    const requestConnection = connection
    const isCurrent = () =>
      alive && serial === requestSerial.current && useConnection.getState().client === requestConnection
    if (!requestConnection) {
      setEntries([])
      setLoading(false)
      setError(t('hostDisconnected'))
      return () => {
        alive = false
      }
    }
    setEntries([])
    setError('')
    setLoading(true)
    void requestConnection
      .call('file.list', { workspaceId, path })
      .then((files) => {
        if (isCurrent()) {
          setEntries(files)
          setError('')
        }
      })
      .catch((failure) => {
        if (isCurrent()) setError(failure instanceof Error ? failure.message : String(failure))
      })
      .finally(() => {
        if (isCurrent()) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [connection, workspaceId, path, reloadToken, t])
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
    <div
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/file-manager', 'artifact')}
      className="file-nav rb-file-nav"
    >
      <GlassSurface className="file-nav-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="sidebar-heading">
        <strong>{t('files')}</strong>
        <div>
          <button
            type="button"
            title={t('parentDirectory')}
            aria-label={t('parentDirectory')}
            disabled={path === '.'}
            onClick={() => setPath(path.includes('/') ? path.split('/').slice(0, -1).join('/') : '.')}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            title={t('refreshDirectory')}
            aria-label={t('refreshDirectory')}
            disabled={loading || !workspaceId}
            onClick={() => setReloadToken((current) => current + 1)}
          >
            {loading ? <LoaderCircle size={15} className="spinning" /> : <RefreshCw size={15} />}
          </button>
        </div>
      </div>
      <nav
        {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/file-manager', 'artifact')}
        className="file-breadcrumb"
        aria-label={t('filePath')}
        title={path}
      >
        <button type="button" className={path === '.' ? 'selected' : ''} onClick={() => navigateTo(-1)}>
          {t('workspace')}
        </button>
        {segments.map((segment, index) => (
          <span className="file-breadcrumb-segment" key={`${segment}-${index}`}>
            <span aria-hidden="true">/</span>
            <button
              type="button"
              className={index === segments.length - 1 ? 'selected' : ''}
              onClick={() => navigateTo(index)}
            >
              {segment}
            </button>
          </span>
        ))}
      </nav>
      <label
        {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/filtering', 'artifact')}
        className="file-filter"
      >
        <Search size={13} aria-hidden="true" />
        <input
          type="search"
          aria-label={t('filterDirectory')}
          placeholder={t('filterDirectory')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button type="button" title={t('clearFileFilter')} aria-label={t('clearFileFilter')} onClick={() => setQuery('')}>
            <X size={12} />
          </button>
        )}
      </label>
      {normalizedQuery && !loading && !error && (
        <div className="file-filter-count" role="status">
          {visibleEntries.length} {t('matchingItems')}
        </div>
      )}
      {!workspaceId ? (
        <div className="file-empty-state" role="status">
          <Folder size={18} />
          <strong>{t('noWorkspaceSelected')}</strong>
          <span>{t('selectWorkspaceHint')}</span>
        </div>
      ) : error ? (
        <div className="inline-error" role="alert">
          {error}
        </div>
      ) : loading ? (
        <div className="file-empty-state" role="status">
          <LoaderCircle size={18} className="spinning" />
          <strong>{t('readingDirectory')}</strong>
          <span>{t('readingDirectoryHint')}</span>
        </div>
      ) : visibleEntries.length ? (
        <AnimatedList
          {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/list', 'artifact')}
          className="file-list"
          viewportClassName="file-list-viewport"
          aria-label={`${t('fileList')} ${path}`}
        >
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
              aria-label={entry.directory ? `${t('openDirectory')} ${entry.name}` : `${t('openFile')} ${entry.name}`}
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
          <strong>{t('noMatchingFiles')}</strong>
          <span>{t('changeFilterHint')}</span>
          <button type="button" className="text-command" onClick={() => setQuery('')}>
            {t('clearFilter')}
          </button>
        </div>
      ) : (
        <div className="file-empty-state" role="status">
          <Folder size={18} />
          <strong>{t('emptyDirectory')}</strong>
          <span>{t('emptyDirectoryHint')}</span>
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
  const { t } = useLocale()
  const connection = useConnection((state) => state.client)
  const viewGeneration = useRef(0)
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
  const saveRequestSerial = useRef(0)
  useEffect(() => {
    let current = true
    const generation = ++viewGeneration.current
    saveRequestSerial.current += 1
    const requestConnection = connection
    const isCurrent = () =>
      current && generation === viewGeneration.current && useConnection.getState().client === requestConnection
    setLoading(true)
    setError('')
    setNotice('')
    setConflict(false)
    setText('')
    setSavedText('')
    setRevision('')
    setSaving(false)
    if (!requestConnection) {
      setLoading(false)
      setError(t('hostDisconnected'))
      return () => {
        current = false
      }
    }
    void requestConnection
      .call('file.read', { workspaceId, path })
      .then((result) => {
        if (isCurrent()) {
          setText(result.text)
          setSavedText(result.text)
          setRevision(result.revision)
          setError('')
        }
      })
      .catch((failure) => {
        if (isCurrent()) setError(failure instanceof Error ? failure.message : String(failure))
      })
      .finally(() => {
        if (isCurrent()) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [connection, workspaceId, path, reloadToken, t])
  function failureMessage(failure: unknown) {
    return failure instanceof Error ? failure.message : String(failure)
  }
  function failureCode(failure: unknown) {
    return typeof failure === 'object' && failure !== null && 'code' in failure ? String(failure.code) : ''
  }
  async function save(force = false) {
    if (!dirty || saving) return
    const generation = viewGeneration.current
    const requestConnection = connection
    const requestSerial = ++saveRequestSerial.current
    const submittedText = text
    if (!requestConnection) {
      setError(t('hostDisconnected'))
      return
    }
    const isCurrent = () =>
      generation === viewGeneration.current &&
      requestSerial === saveRequestSerial.current &&
      useConnection.getState().client === requestConnection
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await requestConnection.call('file.write', {
        workspaceId,
        path,
        text: submittedText,
        ...(force || !revision ? {} : { expectedRevision: revision }),
      })
      if (isCurrent()) {
        setText((current) => (current === submittedText ? result.text : current))
        setSavedText(result.text)
        setRevision(result.revision)
        setConflict(false)
        setNotice(t('saved'))
      }
    } catch (failure) {
      if (isCurrent()) {
        if (failureCode(failure) === 'FILE_CONFLICT') setConflict(true)
        setError(failureMessage(failure))
      }
    } finally {
      if (isCurrent()) setSaving(false)
    }
  }
  function reload() {
    setReloadToken((current) => current + 1)
  }
  function discardChanges() {
    reload()
  }
  return (
    <div
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-2', 'artifact')}
      className="file-viewer rb-file-viewer"
    >
      <GlassSurface className="file-viewer-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="file-viewer-header">
        <FileCode2 size={14} />
        <span title={path}>{path}</span>
        <span className={dirty ? 'file-viewer-state dirty' : 'file-viewer-state'}>
          {saving ? t('saving') : dirty ? t('notSaved') : notice || t('saved')}
        </span>
        <div className="file-viewer-actions">
          <button
            type="button"
            title={t('reloadFile')}
            aria-label={t('reloadFile')}
            disabled={saving || !workspaceId || dirty}
            onClick={reload}
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            className="file-viewer-save"
            title={t('saveFile')}
            aria-label={t('saveFile')}
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
                <RotateCcw size={12} /> {t('refresh')}
              </button>
              <button type="button" className="button primary" onClick={() => void save(true)} disabled={saving}>
                <AlertTriangle size={12} /> {t('overwriteSave')}
              </button>
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="file-viewer-empty" role="status">
          <LoaderCircle size={18} className="spinning" />
          <span>{t('readingFile')}</span>
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
          <span>{t('unsavedChanges')}</span>
          <button type="button" className="button primary" onClick={() => void save()} disabled={saving}>
            {saving ? t('saving') : t('save')}
          </button>
          <button type="button" className="button" onClick={discardChanges} disabled={saving}>
            {t('discardChanges')}
          </button>
        </div>
      )}
    </div>
  )
}
