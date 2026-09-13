import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Database, LoaderCircle, PlugZap, RefreshCw, Server, Wrench } from 'lucide-react'
import { useConnection } from './stores'
import AnimatedList from './react-bits/AnimatedList'
import GlassIconButton from './react-bits/GlassIconButton'
import GlassSurface from './react-bits/GlassSurface'
import SpotlightCard from './react-bits/SpotlightCard'
import { referenceAttributes } from './react-bits'
import { useLocale, type LocaleMessageKey } from './locale'

type UnknownRecord = Record<string, unknown>

type DiagnosePlugin = {
  id: string
  name: string
  version: string
  status: string
  required: boolean
  provides: string[]
  projectId?: string
}

type DiagnoseView = {
  host: {
    version: string | null
    platform: string | null
    protocol: number | null
    addresses: string[]
    activeRuns: number | null
    demo: boolean | null
  }
  database: Array<{ key: string; label: string; value: number }>
  recoveredRuns: number | null
  plugins: DiagnosePlugin[]
  streams: number | null
  tools: string[]
}

const STORAGE_LABELS: Record<string, LocaleMessageKey> = {
  sessions: 'session',
  messages: 'messages',
  events: 'events',
  runs: 'runs',
  approvals: 'approvals',
}

const STORAGE_ORDER = Object.keys(STORAGE_LABELS)

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : {}
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function normalizeDiagnose(data: UnknownRecord, t: (key: LocaleMessageKey) => string): DiagnoseView {
  const host = record(data.host)
  const database = record(data.database)
  const plugins = Array.isArray(data.plugins)
    ? data.plugins.map((item, index) => {
        const plugin = record(item)
        const id = text(plugin.id) ?? `plugin-${index + 1}`
        return {
          id,
          name: text(plugin.name) ?? id,
          version: text(plugin.version) ?? t('pluginVersionUnknown'),
          status: text(plugin.status) ?? 'unknown',
          required: plugin.required === true,
          provides: strings(plugin.provides),
          ...(text(plugin.projectId) ? { projectId: text(plugin.projectId)! } : {}),
        }
      })
    : []
  const storage = Object.entries(database)
    .flatMap(([key, value]) => {
      const numericValue = count(value)
      return numericValue === null ? [] : [{ key, label: STORAGE_LABELS[key] ? t(STORAGE_LABELS[key]) : key, value: numericValue }]
    })
    .sort((left, right) => {
      const leftIndex = STORAGE_ORDER.indexOf(left.key)
      const rightIndex = STORAGE_ORDER.indexOf(right.key)
      return (leftIndex < 0 ? STORAGE_ORDER.length : leftIndex) - (rightIndex < 0 ? STORAGE_ORDER.length : rightIndex)
    })

  return {
    host: {
      version: text(host.version),
      platform: text(host.platform),
      protocol: count(host.protocol),
      addresses: strings(host.addresses),
      activeRuns: count(host.activeRuns),
      demo: typeof host.demo === 'boolean' ? host.demo : null,
    },
    database: storage,
    recoveredRuns: count(data.recoveredRuns),
    plugins,
    streams: count(data.streams),
    tools: [...new Set(strings(data.tools))],
  }
}

function formatCount(value: number | null) {
  return value === null ? '—' : value.toLocaleString()
}

function pluginStatus(status: string, t: (key: LocaleMessageKey) => string) {
  if (status === 'active') return t('statusActive')
  if (status === 'disabled') return t('statusDisabled')
  if (status === 'failed') return t('statusFailed')
  return status
}

function refreshError(error: unknown, t: (key: LocaleMessageKey) => string) {
  return error instanceof Error && error.message ? error.message : t('cannotReadDiagnose')
}

function SummaryCard({
  label,
  value,
  detail,
  tone = 'accent',
}: {
  label: string
  value: string
  detail: string
  tone?: 'accent' | 'status' | 'warning'
}) {
  const spotlightColor =
    tone === 'status'
      ? 'color-mix(in srgb, var(--rb-status) 20%, transparent)'
      : tone === 'warning'
        ? 'color-mix(in srgb, var(--hbar-wn) 22%, transparent)'
        : 'color-mix(in srgb, var(--rb-accent) 20%, transparent)'
  return (
    <SpotlightCard className={`diagnose-summary-card diagnose-summary-card-${tone}`} spotlightColor={spotlightColor}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      <span>{detail}</span>
    </SpotlightCard>
  )
}

export default function DiagnosePanel() {
  const { t } = useLocale()
  const connection = useConnection((state) => state.client)
  const [data, setData] = useState<UnknownRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const requestId = useRef(0)
  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current
    const requestConnection = connection
    const isCurrentRequest = () =>
      currentRequest === requestId.current && requestConnection === useConnection.getState().client
    setLoading(true)
    setError(null)
    if (!requestConnection) {
      if (isCurrentRequest()) {
        setData(null)
        setRefreshedAt(null)
        setError(t('hostDisconnected'))
        setLoading(false)
      }
      return
    }
    try {
      const next = await requestConnection.call('system.diagnose', {})
      if (!isCurrentRequest()) return
      setData(next)
      setRefreshedAt(new Date())
    } catch (reason) {
      if (!isCurrentRequest()) return
      setError(refreshError(reason, t))
    } finally {
      if (isCurrentRequest()) setLoading(false)
    }
  }, [connection, t])
  useEffect(() => {
    setData(null)
    setRefreshedAt(null)
    setError(null)
    void refresh()
    return () => {
      requestId.current += 1
    }
  }, [refresh])

  const diagnose = useMemo(() => (data ? normalizeDiagnose(data, t) : null), [data, t])
  const hostDetail = diagnose
    ? [diagnose.host.platform, diagnose.host.version ? `v${diagnose.host.version}` : null]
        .filter(Boolean)
        .join(' · ') || t('unavailable')
    : ''
  const runtimeDetail = diagnose ? `${formatCount(diagnose.streams)} ${t('activeStreams')}` : ''
  const recoveryDetail = diagnose
      ? diagnose.host.demo === true
      ? t('demoMode')
      : diagnose.host.demo === false
        ? t('standardMode')
        : t('unknownRunMode')
    : ''
  const refreshedLabel = loading
    ? t('refreshing')
    : error
      ? t('latestRefreshFailed')
      : refreshedAt
        ? `${t('updatedAt')} ${refreshedAt.toLocaleTimeString()}`
        : t('waitingDiagnose')

  return (
    <section
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/monitoring', 'activity')}
      className="diagnose-panel rb-diagnose-panel"
      aria-label={t('diagnose')}
      aria-busy={loading}
    >
      <GlassSurface className="diagnose-panel-glass" width="100%" height="100%" aria-hidden="true" />
      <header
        {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/dashboard', 'activity')}
        className="diagnose-page-heading"
      >
        <div className="diagnose-heading-copy">
          <span className="diagnose-eyebrow">{t('hostStatus')}</span>
          <h1>{t('diagnose')}</h1>
          <p aria-live="polite">{refreshedLabel}</p>
        </div>
        <GlassIconButton
          type="button"
          label={t('refreshDiagnose')}
          tone="accent"
          title={t('refreshDiagnose')}
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? <LoaderCircle className="diagnose-refreshing" size={16} /> : <RefreshCw size={16} />}
        </GlassIconButton>
      </header>

      {error && (
        <SpotlightCard
          className="diagnose-error"
          spotlightColor="color-mix(in srgb, var(--hbar-er) 18%, transparent)"
          role="alert"
        >
          <div>
            <strong>{t('diagnoseRefreshFailed')}</strong>
            <span>{error}</span>
          </div>
          <button type="button" className="button" onClick={() => void refresh()}>
            {t('retry')}
          </button>
        </SpotlightCard>
      )}

      {!diagnose && !error && (
        <div className="diagnose-state" role="status">
          <LoaderCircle className="diagnose-refreshing" size={18} />
          <span>{t('readingDiagnose')}</span>
        </div>
      )}

      {diagnose && (
        <div className="diagnose-content">
          <dl
            {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/dashboard', 'activity')}
            className="diagnose-summary-grid"
          >
            <SummaryCard
              label={t('host')}
              value={diagnose.host.version ? `v${diagnose.host.version}` : '—'}
              detail={hostDetail}
            />
            <SummaryCard
              label={t('run')}
              value={formatCount(diagnose.host.activeRuns)}
              detail={runtimeDetail}
              tone="status"
            />
            <SummaryCard
              label={t('recoveredRuns')}
              value={formatCount(diagnose.recoveredRuns)}
              detail={recoveryDetail}
              tone="warning"
            />
          </dl>

          <section
            {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/card', 'activity')}
            className="diagnose-section"
            aria-labelledby="diagnose-storage-heading"
          >
            <div className="diagnose-section-heading">
              <Database size={16} aria-hidden="true" />
              <div>
              <h2 id="diagnose-storage-heading">{t('storage')}</h2>
                <span>{diagnose.database.length} {t('dataSets')}</span>
              </div>
            </div>
            <SpotlightCard
              className="diagnose-storage-card"
              spotlightColor="color-mix(in srgb, var(--rb-accent) 16%, transparent)"
            >
              {diagnose.database.length ? (
                <dl className="diagnose-storage-grid">
                  {diagnose.database.map((item) => (
                    <div key={item.key}>
                      <dt>{item.label}</dt>
                      <dd>{item.value.toLocaleString()}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <span className="diagnose-empty">{t('noStorageStats')}</span>
              )}
            </SpotlightCard>
          </section>

          <section
            {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/list', 'activity')}
            className="diagnose-section"
            aria-labelledby="diagnose-plugins-heading"
          >
            <div className="diagnose-section-heading">
              <PlugZap size={16} aria-hidden="true" />
              <div>
              <h2 id="diagnose-plugins-heading">{t('extensions')}</h2>
                <span>{diagnose.plugins.length} {t('loadedExtensions')}</span>
              </div>
            </div>
            {diagnose.plugins.length ? (
              <AnimatedList
                {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/list', 'activity')}
                className="diagnose-plugin-list"
                viewportClassName="diagnose-plugin-list-viewport"
                showGradients={false}
              >
                {diagnose.plugins.map((plugin) => (
                  <SpotlightCard
                    className="diagnose-plugin-row"
                    key={`${plugin.id}@${text(plugin.projectId) ?? 'global'}`}
                    spotlightColor="color-mix(in srgb, var(--rb-accent) 18%, transparent)"
                  >
                    <div className="diagnose-plugin-copy">
                      <strong>{plugin.name}</strong>
                      <span title={plugin.id}>
                        {plugin.id} · {plugin.version}
                      </span>
                    </div>
                    <span className={`diagnose-plugin-status diagnose-plugin-status-${plugin.status}`}>
                      {pluginStatus(plugin.status, t)}
                    </span>
                    <span className="diagnose-plugin-provides">
                      {plugin.required
                        ? t('requiredExtension')
                        : plugin.provides.length
                          ? plugin.provides.join(' · ')
                          : t('noServices')}
                    </span>
                  </SpotlightCard>
                ))}
              </AnimatedList>
            ) : (
              <div className="diagnose-empty">{t('noLoadedExtensions')}</div>
            )}
          </section>

          <details
            {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/monitoring', 'activity')}
            className="diagnose-details"
          >
            <summary>
              <span className="diagnose-details-title">
                <Wrench size={16} aria-hidden="true" />
                <span>{t('registeredTools')}</span>
                <small>{diagnose.tools.length}</small>
              </span>
              <ChevronRight className="diagnose-details-chevron" size={16} aria-hidden="true" />
            </summary>
            {diagnose.tools.length ? (
              <div className="diagnose-tool-chips">
                {diagnose.tools.map((tool) => (
                  <code key={tool}>{tool}</code>
                ))}
              </div>
            ) : (
              <div className="diagnose-empty">{t('noRegisteredTools')}</div>
            )}
          </details>

          <details
            {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/monitoring', 'activity')}
            className="diagnose-details diagnose-raw-details"
          >
            <summary>
              <span className="diagnose-details-title">
                <Server size={16} aria-hidden="true" />
                <span>{t('rawDiagnose')}</span>
              </span>
              <ChevronRight className="diagnose-details-chevron" size={16} aria-hidden="true" />
            </summary>
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </details>
        </div>
      )}
    </section>
  )
}
