import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Database, LoaderCircle, PlugZap, RefreshCw, Server, Wrench } from 'lucide-react'
import { client } from './stores'
import AnimatedList from './react-bits/AnimatedList'
import GlassIconButton from './react-bits/GlassIconButton'
import GlassSurface from './react-bits/GlassSurface'
import SpotlightCard from './react-bits/SpotlightCard'

type UnknownRecord = Record<string, unknown>

type DiagnosePlugin = {
  id: string
  name: string
  version: string
  status: string
  required: boolean
  provides: string[]
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

const STORAGE_LABELS: Record<string, string> = {
  sessions: '会话',
  messages: '消息',
  events: '事件',
  runs: '运行',
  approvals: '审批',
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

function normalizeDiagnose(data: UnknownRecord): DiagnoseView {
  const host = record(data.host)
  const database = record(data.database)
  const plugins = Array.isArray(data.plugins)
    ? data.plugins.map((item, index) => {
        const plugin = record(item)
        const id = text(plugin.id) ?? `plugin-${index + 1}`
        return {
          id,
          name: text(plugin.name) ?? id,
          version: text(plugin.version) ?? '未知版本',
          status: text(plugin.status) ?? 'unknown',
          required: plugin.required === true,
          provides: strings(plugin.provides),
        }
      })
    : []
  const storage = Object.entries(database)
    .flatMap(([key, value]) => {
      const numericValue = count(value)
      return numericValue === null ? [] : [{ key, label: STORAGE_LABELS[key] ?? key, value: numericValue }]
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

function pluginStatus(status: string) {
  if (status === 'active') return '已启用'
  if (status === 'disabled') return '已停用'
  if (status === 'failed') return '失败'
  return status
}

function refreshError(error: unknown) {
  return error instanceof Error && error.message ? error.message : '无法读取当前诊断信息，请检查 Host 连接后重试。'
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
  const [data, setData] = useState<UnknownRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const requestId = useRef(0)
  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const next = await client().call('system.diagnose', {})
      if (requestId.current !== currentRequest) return
      setData(next)
      setRefreshedAt(new Date())
    } catch (reason) {
      if (requestId.current !== currentRequest) return
      setError(refreshError(reason))
    } finally {
      if (requestId.current === currentRequest) setLoading(false)
    }
  }, [])
  useEffect(() => {
    void refresh()
    return () => {
      requestId.current += 1
    }
  }, [refresh])

  const diagnose = useMemo(() => (data ? normalizeDiagnose(data) : null), [data])
  const hostDetail = diagnose
    ? [diagnose.host.platform, diagnose.host.version ? `v${diagnose.host.version}` : null]
        .filter(Boolean)
        .join(' · ') || '宿主信息不可用'
    : ''
  const runtimeDetail = diagnose ? `${formatCount(diagnose.streams)} 个活动流` : ''
  const recoveryDetail = diagnose
    ? diagnose.host.demo === true
      ? '演示模式'
      : diagnose.host.demo === false
        ? '标准模式'
        : '运行模式未知'
    : ''
  const refreshedLabel = loading
    ? '正在刷新诊断…'
    : error
      ? '最近一次刷新失败'
      : refreshedAt
        ? `更新于 ${refreshedAt.toLocaleTimeString()}`
        : '等待诊断结果'

  return (
    <section className="diagnose-panel rb-diagnose-panel" aria-label="诊断" aria-busy={loading}>
      <GlassSurface className="diagnose-panel-glass" width="100%" height="100%" aria-hidden="true" />
      <header className="diagnose-page-heading">
        <div className="diagnose-heading-copy">
          <span className="diagnose-eyebrow">HOST STATUS</span>
          <h1>诊断</h1>
          <p aria-live="polite">{refreshedLabel}</p>
        </div>
        <GlassIconButton
          type="button"
          label="刷新诊断"
          tone="accent"
          title="刷新诊断"
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
            <strong>未能刷新诊断</strong>
            <span>{error}</span>
          </div>
          <button type="button" className="button" onClick={() => void refresh()}>
            重试
          </button>
        </SpotlightCard>
      )}

      {!diagnose && !error && (
        <div className="diagnose-state" role="status">
          <LoaderCircle className="diagnose-refreshing" size={18} />
          <span>正在读取诊断信息</span>
        </div>
      )}

      {diagnose && (
        <div className="diagnose-content">
          <dl className="diagnose-summary-grid">
            <SummaryCard
              label="宿主"
              value={diagnose.host.version ? `v${diagnose.host.version}` : '—'}
              detail={hostDetail}
            />
            <SummaryCard
              label="运行"
              value={formatCount(diagnose.host.activeRuns)}
              detail={runtimeDetail}
              tone="status"
            />
            <SummaryCard
              label="恢复运行"
              value={formatCount(diagnose.recoveredRuns)}
              detail={recoveryDetail}
              tone="warning"
            />
          </dl>

          <section className="diagnose-section" aria-labelledby="diagnose-storage-heading">
            <div className="diagnose-section-heading">
              <Database size={16} aria-hidden="true" />
              <div>
                <h2 id="diagnose-storage-heading">存储</h2>
                <span>{diagnose.database.length} 个数据集</span>
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
                <span className="diagnose-empty">没有可用的存储统计</span>
              )}
            </SpotlightCard>
          </section>

          <section className="diagnose-section" aria-labelledby="diagnose-plugins-heading">
            <div className="diagnose-section-heading">
              <PlugZap size={16} aria-hidden="true" />
              <div>
                <h2 id="diagnose-plugins-heading">扩展</h2>
                <span>{diagnose.plugins.length} 个已加载扩展</span>
              </div>
            </div>
            {diagnose.plugins.length ? (
              <AnimatedList
                className="diagnose-plugin-list"
                viewportClassName="diagnose-plugin-list-viewport"
                showGradients={false}
              >
                {diagnose.plugins.map((plugin) => (
                  <SpotlightCard
                    className="diagnose-plugin-row"
                    key={plugin.id}
                    spotlightColor="color-mix(in srgb, var(--rb-accent) 18%, transparent)"
                  >
                    <div className="diagnose-plugin-copy">
                      <strong>{plugin.name}</strong>
                      <span title={plugin.id}>
                        {plugin.id} · {plugin.version}
                      </span>
                    </div>
                    <span className={`diagnose-plugin-status diagnose-plugin-status-${plugin.status}`}>
                      {pluginStatus(plugin.status)}
                    </span>
                    <span className="diagnose-plugin-provides">
                      {plugin.required
                        ? '必需扩展'
                        : plugin.provides.length
                          ? plugin.provides.join(' · ')
                          : '没有提供服务'}
                    </span>
                  </SpotlightCard>
                ))}
              </AnimatedList>
            ) : (
              <div className="diagnose-empty">没有加载的扩展</div>
            )}
          </section>

          <details className="diagnose-details">
            <summary>
              <span className="diagnose-details-title">
                <Wrench size={16} aria-hidden="true" />
                <span>已注册工具</span>
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
              <div className="diagnose-empty">没有注册的工具</div>
            )}
          </details>

          <details className="diagnose-details diagnose-raw-details">
            <summary>
              <span className="diagnose-details-title">
                <Server size={16} aria-hidden="true" />
                <span>原始诊断结果</span>
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
