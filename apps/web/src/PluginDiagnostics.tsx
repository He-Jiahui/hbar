import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileKey2,
  GitBranch,
  LoaderCircle,
  LockKeyhole,
  Stethoscope,
  XCircle,
} from 'lucide-react'
import type { RpcResults } from '@hbar/contracts'
import { client } from './stores'
import AnimatedList from './react-bits/AnimatedList'
import GlassSurface from './react-bits/GlassSurface'
import GlareButton from './react-bits/GlareButton'
import SpotlightCard from './react-bits/SpotlightCard'

type PluginReportKind = 'doctor' | 'graph' | 'lock'
type DoctorReport = RpcResults['plugin.doctor']
type GraphReport = RpcResults['plugin.graph']
type LockReport = RpcResults['plugin.lock']

type PluginReport =
  { kind: 'doctor'; data: DoctorReport } | { kind: 'graph'; data: GraphReport } | { kind: 'lock'; data: LockReport }

type PluginReportState = {
  active: PluginReportKind | null
  report: PluginReport | null
  loading: boolean
  error: string | null
}

type LockEntry = {
  id: string
  version: string | null
  scope: string | null
  source: string | null
  path: string | null
  enabled: boolean | null
  dependencyCount: number
}

function reportLabel(kind: PluginReportKind) {
  if (kind === 'doctor') return '插件检查'
  if (kind === 'graph') return '插件依赖图'
  return '插件锁定清单'
}

function reportError(error: unknown) {
  return error instanceof Error && error.message ? error.message : '无法读取插件诊断结果，请检查 Host 连接后重试。'
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function lockEntries(plugins: Record<string, unknown>): LockEntry[] {
  return Object.entries(plugins)
    .map(([id, value]) => {
      const entry = record(value)
      return {
        id,
        version: stringValue(entry.version),
        scope: stringValue(entry.scope),
        source: stringValue(entry.source),
        path: stringValue(entry.path),
        enabled: typeof entry.enabled === 'boolean' ? entry.enabled : null,
        dependencyCount: Object.keys(record(entry.dependencies)).length,
      }
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

async function requestReport(kind: PluginReportKind): Promise<PluginReport> {
  if (kind === 'doctor') return { kind, data: await client().call('plugin.doctor', {}) }
  if (kind === 'graph') return { kind, data: await client().call('plugin.graph', {}) }
  return { kind, data: await client().call('plugin.lock', {}) }
}

function RawReport({ data }: { data: unknown }) {
  return (
    <details className="plugin-report-raw">
      <summary>
        <span>原始结果</span>
        <ChevronRight className="plugin-report-raw-chevron" size={15} aria-hidden="true" />
      </summary>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </details>
  )
}

function ReportSurface({
  kind,
  icon,
  title,
  subtitle,
  children,
}: {
  kind: PluginReportKind
  icon: ReactNode
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <section className={`plugin-diagnostic-result plugin-diagnostic-result-${kind}`} aria-label={`${title}结果`}>
      <GlassSurface className="plugin-diagnostic-glass" width="100%" height="100%" aria-hidden="true" />
      <header className="plugin-diagnostic-heading">
        <span className="plugin-diagnostic-heading-icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </header>
      {children}
    </section>
  )
}

function DoctorReportView({ data }: { data: DoctorReport }) {
  const order = data.order ?? []
  return (
    <ReportSurface
      kind="doctor"
      icon={data.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      title="插件检查"
      subtitle={data.ok ? '依赖解析已通过' : '发现需要处理的依赖问题'}
    >
      <div className="plugin-diagnostic-summary">
        <span className={`plugin-doctor-status ${data.ok ? 'is-healthy' : 'has-errors'}`}>
          {data.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {data.ok ? '检查通过' : '需要处理'}
        </span>
        <span>{data.errors.length ? `${data.errors.length} 个问题` : `${order.length} 个已解析插件`}</span>
      </div>

      {data.errors.length > 0 && (
        <AnimatedList
          className="plugin-report-error-list"
          viewportClassName="plugin-report-error-viewport"
          showGradients={false}
          role="list"
        >
          {data.errors.map((error, index) => (
            <SpotlightCard
              className="plugin-report-error-row"
              key={`${error}-${index}`}
              role="listitem"
              spotlightColor="color-mix(in srgb, var(--hbar-er) 20%, transparent)"
            >
              <AlertTriangle size={15} aria-hidden="true" />
              <span>{error}</span>
            </SpotlightCard>
          ))}
        </AnimatedList>
      )}

      <section className="plugin-report-list-section" aria-labelledby="plugin-doctor-order-heading">
        <h4 id="plugin-doctor-order-heading">解析顺序</h4>
        {order.length ? (
          <AnimatedList
            className="plugin-report-order-list"
            viewportClassName="plugin-report-order-viewport"
            showGradients={false}
            role="list"
          >
            {order.map((id, index) => (
              <SpotlightCard className="plugin-report-order-row" key={id} role="listitem">
                <span>{index + 1}</span>
                <code>{id}</code>
              </SpotlightCard>
            ))}
          </AnimatedList>
        ) : (
          <div className="plugin-report-empty">没有需要排序的已启用插件</div>
        )}
      </section>
      <RawReport data={data} />
    </ReportSurface>
  )
}

function GraphReportView({ data }: { data: GraphReport }) {
  return (
    <ReportSurface
      kind="graph"
      icon={<GitBranch size={16} />}
      title="插件依赖图"
      subtitle={`${data.nodes.length} 个插件节点 · ${data.edges.length} 条依赖关系`}
    >
      <dl className="plugin-report-stat-grid">
        <div>
          <dt>插件节点</dt>
          <dd>{data.nodes.length}</dd>
        </div>
        <div>
          <dt>依赖关系</dt>
          <dd>{data.edges.length}</dd>
        </div>
      </dl>
      <section className="plugin-report-list-section" aria-labelledby="plugin-graph-nodes-heading">
        <h4 id="plugin-graph-nodes-heading">已注册插件</h4>
        {data.nodes.length ? (
          <AnimatedList
            className="plugin-report-node-list"
            viewportClassName="plugin-report-node-viewport"
            showGradients={false}
            role="list"
          >
            {data.nodes.map((node) => (
              <SpotlightCard className="plugin-report-node-row" key={node.id} role="listitem">
                <div>
                  <strong>{node.id}</strong>
                  <span>v{node.version}</span>
                </div>
                <span className={`plugin-node-status ${node.enabled ? 'is-enabled' : 'is-disabled'}`}>
                  {node.enabled ? '已启用' : '已停用'}
                </span>
              </SpotlightCard>
            ))}
          </AnimatedList>
        ) : (
          <div className="plugin-report-empty">没有可用的插件节点</div>
        )}
      </section>
      <section className="plugin-report-list-section" aria-labelledby="plugin-graph-edges-heading">
        <h4 id="plugin-graph-edges-heading">依赖关系</h4>
        {data.edges.length ? (
          <AnimatedList
            className="plugin-report-edge-list"
            viewportClassName="plugin-report-edge-viewport"
            showGradients={false}
            role="list"
          >
            {data.edges.map((edge) => (
              <SpotlightCard
                className="plugin-report-edge-row"
                key={`${edge.from}:${edge.kind}:${edge.to}`}
                role="listitem"
              >
                <div className="plugin-report-edge-path">
                  <code>{edge.from}</code>
                  <ArrowRight size={14} aria-hidden="true" />
                  <code>{edge.to}</code>
                </div>
                <span>
                  {edge.kind} · {edge.range}
                </span>
              </SpotlightCard>
            ))}
          </AnimatedList>
        ) : (
          <div className="plugin-report-empty">当前插件之间没有声明依赖</div>
        )}
      </section>
      <RawReport data={data} />
    </ReportSurface>
  )
}

function LockReportView({ data }: { data: LockReport }) {
  const entries = lockEntries(data.plugins)
  return (
    <ReportSurface
      kind="lock"
      icon={<FileKey2 size={16} />}
      title="插件锁定清单"
      subtitle={`${entries.length} 个已锁定插件 · 格式版本 ${data.version}`}
    >
      <section className="plugin-report-list-section" aria-labelledby="plugin-lock-entries-heading">
        <h4 id="plugin-lock-entries-heading">已锁定插件</h4>
        {entries.length ? (
          <AnimatedList
            className="plugin-report-lock-list"
            viewportClassName="plugin-report-lock-viewport"
            showGradients={false}
            role="list"
          >
            {entries.map((entry) => (
              <SpotlightCard className="plugin-report-lock-row" key={entry.id} role="listitem">
                <div>
                  <strong>{entry.id}</strong>
                  <span>
                    {[entry.version ? `v${entry.version}` : null, entry.scope, entry.source]
                      .filter(Boolean)
                      .join(' · ') || '元数据不可用'}
                  </span>
                  {entry.path && <code title={entry.path}>{entry.path}</code>}
                </div>
                <span className={`plugin-node-status ${entry.enabled === true ? 'is-enabled' : 'is-disabled'}`}>
                  {entry.enabled === true ? '已启用' : entry.enabled === false ? '已停用' : '状态未知'}
                </span>
                <small>{entry.dependencyCount ? `${entry.dependencyCount} 个依赖` : '无直接依赖'}</small>
              </SpotlightCard>
            ))}
          </AnimatedList>
        ) : (
          <div className="plugin-report-empty">当前没有写入锁定清单的托管插件</div>
        )}
      </section>
      <RawReport data={data} />
    </ReportSurface>
  )
}

function PluginReportView({ report }: { report: PluginReport }) {
  if (report.kind === 'doctor') return <DoctorReportView data={report.data} />
  if (report.kind === 'graph') return <GraphReportView data={report.data} />
  return <LockReportView data={report.data} />
}

export default function PluginDiagnostics() {
  const [state, setState] = useState<PluginReportState>({ active: null, report: null, loading: false, error: null })
  const requestVersion = useRef(0)

  useEffect(() => {
    return () => {
      requestVersion.current += 1
    }
  }, [])

  const run = useCallback(async (kind: PluginReportKind) => {
    const version = ++requestVersion.current
    setState((current) => ({
      active: kind,
      report: current.report?.kind === kind ? current.report : null,
      loading: true,
      error: null,
    }))
    try {
      const report = await requestReport(kind)
      if (requestVersion.current !== version) return
      setState({ active: kind, report, loading: false, error: null })
    } catch (error) {
      if (requestVersion.current !== version) return
      setState((current) => ({ ...current, loading: false, error: reportError(error) }))
    }
  }, [])

  const active = state.active
  return (
    <div className="plugin-diagnostics">
      <div className="plugin-diagnostic-actions" role="group" aria-label="插件诊断操作">
        <GlareButton
          type="button"
          className={`button plugin-diagnostic-action ${active === 'doctor' ? 'selected' : ''}`}
          aria-label="检查"
          aria-pressed={active === 'doctor'}
          disabled={state.loading}
          onClick={() => void run('doctor')}
        >
          {state.loading && active === 'doctor' ? (
            <LoaderCircle className="plugin-diagnostic-spin" size={14} />
          ) : (
            <Stethoscope size={14} />
          )}
          {state.loading && active === 'doctor' ? '检查中' : '检查'}
        </GlareButton>
        <GlareButton
          type="button"
          className={`button plugin-diagnostic-action ${active === 'graph' ? 'selected' : ''}`}
          aria-label="依赖图"
          aria-pressed={active === 'graph'}
          disabled={state.loading}
          onClick={() => void run('graph')}
        >
          {state.loading && active === 'graph' ? (
            <LoaderCircle className="plugin-diagnostic-spin" size={14} />
          ) : (
            <GitBranch size={14} />
          )}
          依赖图
        </GlareButton>
        <GlareButton
          type="button"
          className={`button plugin-diagnostic-action ${active === 'lock' ? 'selected' : ''}`}
          aria-label="查看插件锁"
          title="查看插件锁"
          aria-pressed={active === 'lock'}
          disabled={state.loading}
          onClick={() => void run('lock')}
        >
          {state.loading && active === 'lock' ? (
            <LoaderCircle className="plugin-diagnostic-spin" size={15} />
          ) : (
            <LockKeyhole size={15} />
          )}
          查看插件锁
        </GlareButton>
      </div>

      {state.loading && !state.report && (
        <div className="plugin-diagnostic-loading" role="status">
          <LoaderCircle className="plugin-diagnostic-spin" size={16} />
          <span>正在读取{active ? reportLabel(active) : '插件诊断'}…</span>
        </div>
      )}

      {state.error && active && (
        <SpotlightCard
          className="plugin-diagnostic-error"
          role="alert"
          spotlightColor="color-mix(in srgb, var(--hbar-er) 20%, transparent)"
        >
          <div>
            <strong>无法读取{reportLabel(active)}</strong>
            <span>{state.error}</span>
          </div>
          <button type="button" className="button" onClick={() => void run(active)}>
            重试
          </button>
        </SpotlightCard>
      )}

      {state.report && <PluginReportView report={state.report} />}
    </div>
  )
}
