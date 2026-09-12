import { useEffect } from 'react'
import { Database, FolderCog, HardDrive, RefreshCw, RotateCcw, Save, ShieldCheck } from 'lucide-react'
import { usePathSettings } from './path-settings'
import { useConnection } from './stores'
import GlareButton from './react-bits/GlareButton'
import GlassSurface from './react-bits/GlassSurface'
import SpotlightCard from './react-bits/SpotlightCard'
import { useLocale } from './locale'

export default function PathSettings() {
  const { t } = useLocale()
  const state = usePathSettings()
  const load = state.load
  const connection = useConnection((current) => current.client)
  useEffect(() => {
    void load()
  }, [connection, load])
  const busy = state.status === 'loading' || state.status === 'validating' || state.status === 'saving'
  const changed = Boolean(
    state.current && (state.dataRoot !== state.current.dataRoot || state.cacheRoot !== state.current.cacheRoot),
  )
  return (
    <section className="settings-section path-settings">
      <GlassSurface className="settings-glass-section" width="100%" height="100%" aria-hidden="true" />
      <div className="section-toolbar">
        <div>
          <h2>{t('storageDirectories')}</h2>
          <p className="section-description">{t('storageDirectoriesHint')}</p>
        </div>
        <button
          className="button icon-button"
          title={t('rereadPaths')}
          aria-label={t('rereadPaths')}
          onClick={() => void state.load()}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="path-root-grid rb-path-roots">
        <GlassSurface className="path-roots-glass" width="100%" height="100%" aria-hidden="true" />
        <label>
          <span>
            <Database size={15} />
            {t('dataDirectory')}
          </span>
          <input
            value={state.dataRoot}
            onChange={(event) => state.setDataRoot(event.target.value)}
            spellCheck={false}
          />
          <small>sessions、skills、plugins、diagnostics、databases、settings</small>
        </label>
        <label>
          <span>
            <HardDrive size={15} />
            {t('cacheDirectory')}
          </span>
          <input
            value={state.cacheRoot}
            onChange={(event) => state.setCacheRoot(event.target.value)}
            spellCheck={false}
          />
          <small>{t('cacheContents')}</small>
        </label>
      </div>
      {state.current && (
        <SpotlightCard
          className="path-details-surface"
          spotlightColor="color-mix(in srgb, var(--rb-accent) 18%, transparent)"
        >
          <dl className="path-details">
            <dt>{t('cacheUsage')}</dt>
            <dd>{formatBytes(state.current.cacheBytes)}</dd>
            <dt>{t('sessionLogs')}</dt>
            <dd>{state.current.sessions}</dd>
            <dt>SQLite</dt>
            <dd>{state.current.database}</dd>
            <dt>{t('plugins')}</dt>
            <dd>{state.current.plugins}</dd>
            <dt>{t('skills')}</dt>
            <dd>{state.current.skills}</dd>
            <dt>{t('systemPointer')}</dt>
            <dd>{state.current.pointerFile}</dd>
          </dl>
        </SpotlightCard>
      )}
      {state.error && (
        <p className="inline-error" role="alert">
          {state.error}
        </p>
      )}
      {state.status === 'saved' && (
        <SpotlightCard
          className="restart-notice"
          role="status"
          spotlightColor="color-mix(in srgb, var(--hbar-wn) 22%, transparent)"
        >
          <FolderCog size={16} />
          <div>
            <strong>{t('pathsUpdated')}</strong>
            <span>{t('pathsUpdatedHint')}</span>
          </div>
        </SpotlightCard>
      )}
      <div className="path-actions">
        <button
          className="button"
          disabled={busy || !state.dataRoot || !state.cacheRoot}
          onClick={() => void state.validate()}
        >
          <ShieldCheck size={14} />
          {state.status === 'validating' ? t('validating') : t('validateDirectory')}
        </button>
        <button className="button" disabled={busy || !changed} onClick={state.reset}>
          <RotateCcw size={14} />
          {t('restore')}
        </button>
        <GlareButton
          className="button primary"
          disabled={busy || !changed || !state.dataRoot || !state.cacheRoot}
          onClick={() => void state.save()}
        >
          <Save size={14} />
          {state.status === 'saving' ? t('applying') : t('applyAfterRestart')}
        </GlareButton>
      </div>
    </section>
  )
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
