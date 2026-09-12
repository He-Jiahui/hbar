import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { client, refreshCatalog, useWorkbench } from './stores'
import AnimatedList from './react-bits/AnimatedList'
import GlassSurface from './react-bits/GlassSurface'
import GlareButton from './react-bits/GlareButton'
import SpotlightCard from './react-bits/SpotlightCard'
import { useLocale, type LocaleMessageKey } from './locale'
type Translate = (key: LocaleMessageKey) => string

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

type PluginGraphNodeData = {
  label: string
  version: string
  enabled: boolean
  busy: boolean
  onToggle(): void
  onDisableTree(): void
}
type PluginGraphNode = FlowNode<PluginGraphNodeData, 'plugin'>

type LockEntry = {
  id: string
  version: string | null
  scope: string | null
  source: string | null
  path: string | null
  enabled: boolean | null
  dependencyCount: number
  dependencies: { id: string; range: string | null }[]
}

function reportLabel(kind: PluginReportKind, t: Translate) {
  if (kind === 'doctor') return t('pluginDoctor')
  if (kind === 'graph') return t('pluginGraph')
  return t('pluginLock')
}

function reportError(error: unknown, t: Translate) {
  return error instanceof Error && error.message ? error.message : `${t('pluginCannotRead')}${t('pluginDiagnostics')}，${t('hostDisconnected')}。`
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
        dependencies: Object.entries(record(entry.dependencies)).map(([dependency, range]) => ({
          id: dependency,
          range: stringValue(range),
        })),
        dependencyCount: Object.keys(record(entry.dependencies)).length,
      }
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

function LockGraphNodeView({ data }: NodeProps<FlowNode<{ label: string; version: string | null; enabled: boolean | null }, 'lock-plugin'>>) {
  const { t } = useLocale()
  return (
    <div className={`plugin-graph-node ${data.enabled === true ? 'is-enabled' : 'is-disabled'}`}>
      <Handle type="target" position={Position.Left} aria-label={`${data.label} ${t('pluginDependencyInput')}`} />
      <div className="plugin-graph-node-heading">
        <div><strong>{data.label}</strong><small>{data.version ? `v${data.version}` : t('pluginVersionUnknown')}</small></div>
        <span className="plugin-graph-node-state">{data.enabled === true ? t('pluginEnabled') : data.enabled === false ? t('pluginDisabled') : t('pluginStatusUnknown')}</span>
      </div>
      <Handle type="source" position={Position.Right} aria-label={`${data.label} ${t('pluginDependencyOutput')}`} />
    </div>
  )
}

async function requestReport(kind: PluginReportKind, projectId?: string): Promise<PluginReport> {
  if (kind === 'doctor') return { kind, data: await client().call('plugin.doctor', {}) }
  if (kind === 'graph') return { kind, data: await client().call('plugin.graph', projectId ? { projectId } : {}) }
  return { kind, data: await client().call('plugin.lock', projectId ? { projectId } : {}) }
}

function RawReport({ data }: { data: unknown }) {
  const { t } = useLocale()
  return (
    <details className="plugin-report-raw">
      <summary>
        <span>{t('pluginRawResult')}</span>
        <ChevronRight className="plugin-report-raw-chevron" size={15} aria-hidden="true" />
      </summary>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </details>
  )
}

function PluginGraphNodeView({ data }: NodeProps<PluginGraphNode>) {
  const { t } = useLocale()
  return (
    <div className={`plugin-graph-node ${data.enabled ? 'is-enabled' : 'is-disabled'}`}>
      <Handle type="target" position={Position.Left} aria-label={`${data.label} ${t('pluginDependencyInput')}`} />
      <div className="plugin-graph-node-heading">
        <div>
          <strong>{data.label}</strong>
          <small>v{data.version}</small>
        </div>
          <span className="plugin-graph-node-state">{data.enabled ? t('pluginEnabled') : t('pluginDisabled')}</span>
      </div>
      <div className="plugin-graph-node-actions">
        <button
          type="button"
          className="plugin-graph-node-toggle"
          disabled={data.busy}
          onClick={(event) => {
            event.stopPropagation()
            data.onToggle()
          }}
        >
          {data.busy ? t('pluginProcessing') : data.enabled ? t('pluginClose') : t('pluginEnable')}
        </button>
        {data.enabled && (
          <button
            type="button"
            className="plugin-graph-node-tree"
            disabled={data.busy}
            title={t('pluginCloseChainTitle')}
            onClick={(event) => {
              event.stopPropagation()
              data.onDisableTree()
            }}
          >
            {t('pluginCloseChain')}
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Right} aria-label={`${data.label} ${t('pluginDependencyOutput')}`} />
    </div>
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
  const { t } = useLocale()
  return (
    <section className={`plugin-diagnostic-result plugin-diagnostic-result-${kind}`} aria-label={`${title}${t('pluginResultSuffix')}`}>
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
  const { t } = useLocale()
  const order = data.order ?? []
  return (
    <ReportSurface
      kind="doctor"
      icon={data.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      title={t('pluginDoctorTitle')}
      subtitle={data.ok ? t('pluginDependencyResolved') : t('pluginDependencyIssues')}
    >
      <div className="plugin-diagnostic-summary">
        <span className={`plugin-doctor-status ${data.ok ? 'is-healthy' : 'has-errors'}`}>
          {data.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {data.ok ? t('pluginCheckPassed') : t('pluginNeedsAttention')}
        </span>
        <span>{data.errors.length ? `${data.errors.length} ${t('pluginIssueCount')}` : `${order.length} ${t('pluginResolvedCount')}`}</span>
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
        <h4 id="plugin-doctor-order-heading">{t('pluginResolutionOrder')}</h4>
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
          <div className="plugin-report-empty">{t('pluginNoEnabledToSort')}</div>
        )}
      </section>
      <RawReport data={data} />
    </ReportSurface>
  )
}

function GraphReportView({ data, onRefresh }: { data: GraphReport; onRefresh(): void }) {
  const { t } = useLocale()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const nodeTypes = useMemo(() => ({ plugin: PluginGraphNodeView }), [])
  const graphNodes: PluginGraphNode[] = (() => {
    const incoming = new Map(data.nodes.map((node) => [node.id, 0]))
    for (const edge of data.edges) {
      if (incoming.has(edge.from) && incoming.has(edge.to)) incoming.set(edge.from, (incoming.get(edge.from) ?? 0) + 1)
    }
    const layers = new Map<string, number>()
    const pending = data.nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).map((node) => node.id)
    const visited = new Set<string>()
    while (pending.length) {
      const id = pending.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      const layer = layers.get(id) ?? 0
      for (const edge of data.edges.filter((item) => item.to === id)) {
        const nextLayer = Math.max(layers.get(edge.from) ?? 0, layer + 1)
        layers.set(edge.from, nextLayer)
        pending.push(edge.from)
      }
      layers.set(id, layer)
    }
    return data.nodes.map((node, index) => {
      const layer = layers.get(node.id) ?? 0
      const row = data.nodes.slice(0, index).filter((item) => (layers.get(item.id) ?? 0) === layer).length
      return {
        id: node.id,
        type: 'plugin',
        position: { x: layer * 270, y: row * 135 },
        data: {
          label: node.id,
          version: node.version,
          enabled: node.enabled,
          busy: busyId === node.id,
          onToggle: () => void togglePlugin(node.id, !node.enabled, node.projectId),
          onDisableTree: () => void disableTree(node.id, node.projectId),
        },
      }
    })
  })()
  const graphEdges = useMemo<FlowEdge[]>(
    () =>
      data.edges.map((edge, index) => ({
        id: `${edge.from}:${edge.kind}:${edge.to}:${index}`,
        source: edge.from,
        target: edge.to,
        label: edge.kind,
        type: 'smoothstep',
        animated: edge.kind === 'dependency',
        className: `plugin-graph-edge-${edge.kind}`,
      })),
    [data.edges],
  )

  async function togglePlugin(id: string, enabled: boolean, targetProjectId?: string) {
    setBusyId(id)
    setActionError(null)
    try {
      await client().call(enabled ? 'plugin.enable' : 'plugin.disable', { id, ...(targetProjectId ? { projectId: targetProjectId } : {}) })
      await refreshCatalog()
      onRefresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyId(null)
    }
  }

  async function disableTree(rootId: string, targetProjectId?: string) {
    setBusyId(rootId)
    setActionError(null)
    try {
      await client().call('plugin.disableTree', { id: rootId, ...(targetProjectId ? { projectId: targetProjectId } : {}) })
      await refreshCatalog()
      onRefresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <ReportSurface
      kind="graph"
      icon={<GitBranch size={16} />}
      title={t('pluginGraph')}
      subtitle={`${data.nodes.length} ${t('pluginNodesCount')} · ${data.edges.length} ${t('pluginRelationsCount')}`}
    >
      <dl className="plugin-report-stat-grid">
        <div>
          <dt>{t('pluginNodes')}</dt>
          <dd>{data.nodes.length}</dd>
        </div>
        <div>
          <dt>{t('pluginRelations')}</dt>
          <dd>{data.edges.length}</dd>
        </div>
      </dl>
      <div className="plugin-graph-toolbar">
        <span>{t('pluginGraphHint')}</span>
        {actionError && <span className="inline-error" role="alert">{actionError}</span>}
      </div>
      <section className="plugin-graph-canvas" aria-label={t('pluginGraphAccessible')}>
        {data.nodes.length ? (
          <ReactFlow
            nodes={graphNodes}
            edges={graphEdges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesConnectable={false}
            nodesDraggable
            elementsSelectable
            panOnScroll
            zoomOnScroll
            aria-label={t('pluginGraphAccessible')}
          >
            <Background gap={24} size={1} color="var(--rb-border)" />
            <MiniMap pannable zoomable nodeColor={(node) => (node.data?.enabled ? 'var(--rb-ok)' : 'var(--rb-muted)')} />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <div className="plugin-report-empty">{t('pluginNoNodes')}</div>
        )}
      </section>
      <section className="plugin-report-list-section" aria-labelledby="plugin-graph-nodes-heading">
        <h4 id="plugin-graph-nodes-heading">{t('pluginRegistered')}</h4>
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
                  {node.enabled ? t('pluginEnabled') : t('pluginDisabled')}
                </span>
              </SpotlightCard>
            ))}
          </AnimatedList>
        ) : (
          <div className="plugin-report-empty">{t('pluginNoNodes')}</div>
        )}
      </section>
      <section className="plugin-report-list-section" aria-labelledby="plugin-graph-edges-heading">
        <h4 id="plugin-graph-edges-heading">{t('pluginRelations')}</h4>
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
          <div className="plugin-report-empty">{t('pluginNoRelations')}</div>
        )}
      </section>
      <RawReport data={data} />
    </ReportSurface>
  )
}

function LockReportView({ data }: { data: LockReport }) {
  const { t } = useLocale()
  const entries = lockEntries(data.plugins)
  const graphEntries = useMemo(() => {
    const byId = new Map(entries.map((entry) => [entry.id, entry]))
    for (const entry of entries) {
      for (const dependency of entry.dependencies) {
        if (byId.has(dependency.id)) continue
        byId.set(dependency.id, {
          id: dependency.id,
          version: null,
          scope: null,
          source: null,
          path: null,
          enabled: null,
          dependencies: [],
          dependencyCount: 0,
        })
      }
    }
    return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id))
  }, [entries])
  const nodeTypes = useMemo(() => ({ 'lock-plugin': LockGraphNodeView }), [])
  const lockNodes = useMemo<FlowNode<{ label: string; version: string | null; enabled: boolean | null }, 'lock-plugin'>[]>(
    () => graphEntries.map((entry, index) => ({
      id: entry.id,
      type: 'lock-plugin',
      position: { x: (index % 3) * 290, y: Math.floor(index / 3) * 120 },
      data: { label: entry.id, version: entry.version, enabled: entry.enabled },
    })),
    [graphEntries],
  )
  const lockEdges = useMemo<FlowEdge[]>(
    () => entries.flatMap((entry) => entry.dependencies.map((dependency) => ({
      id: `${entry.id}:${dependency}`,
      source: entry.id,
      target: dependency.id,
      label: 'locked dependency',
      type: 'smoothstep',
      animated: true,
      className: 'plugin-graph-edge-dependency',
    }))),
    [entries],
  )
  return (
    <ReportSurface
      kind="lock"
      icon={<FileKey2 size={16} />}
      title={t('pluginLock')}
      subtitle={`${entries.length} ${t('pluginLocked')} · ${t('pluginVersion')} ${data.version}`}
    >
      <section className="plugin-graph-canvas plugin-lock-graph-canvas" aria-label={t('pluginLockGraph')}>
        {entries.length ? (
          <ReactFlow
            nodes={lockNodes}
            edges={lockEdges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesConnectable={false}
            nodesDraggable
            panOnScroll
            zoomOnScroll
            aria-label={t('pluginLockGraph')}
          >
            <Background gap={24} size={1} color="var(--rb-border)" />
            <MiniMap pannable zoomable nodeColor={(node) => node.data?.enabled === true ? 'var(--rb-ok)' : 'var(--rb-muted)'} />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : <div className="plugin-report-empty">{t('pluginNoLockNodes')}</div>}
      </section>
      <section className="plugin-report-list-section" aria-labelledby="plugin-lock-entries-heading">
        <h4 id="plugin-lock-entries-heading">{t('pluginLocked')}</h4>
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
                      .join(' · ') || t('pluginMetadataUnavailable')}
                  </span>
                  {entry.path && <code title={entry.path}>{entry.path}</code>}
                </div>
                <span className={`plugin-node-status ${entry.enabled === true ? 'is-enabled' : 'is-disabled'}`}>
                  {entry.enabled === true ? t('pluginEnabled') : entry.enabled === false ? t('pluginDisabled') : t('pluginStatusUnknown')}
                </span>
                <small>{entry.dependencyCount ? `${entry.dependencyCount} ${t('pluginDependencyCount')}` : t('pluginNoDirectDependencies')}</small>
              </SpotlightCard>
            ))}
          </AnimatedList>
        ) : (
          <div className="plugin-report-empty">{t('pluginNoManagedLocks')}</div>
        )}
      </section>
      <RawReport data={data} />
    </ReportSurface>
  )
}

function PluginReportView({ report, onRefresh }: { report: PluginReport; onRefresh(): void }) {
  if (report.kind === 'doctor') return <DoctorReportView data={report.data} />
  if (report.kind === 'graph') return <GraphReportView data={report.data} onRefresh={onRefresh} />
  return <LockReportView data={report.data} />
}

export default function PluginDiagnostics() {
  const { t } = useLocale()
  const [state, setState] = useState<PluginReportState>({ active: null, report: null, loading: false, error: null })
  const requestVersion = useRef(0)
  const projectId = useWorkbench((state) => state.workspaceId) ?? undefined

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
      const report = await requestReport(kind, projectId)
      if (requestVersion.current !== version) return
      setState({ active: kind, report, loading: false, error: null })
    } catch (error) {
      if (requestVersion.current !== version) return
      setState((current) => ({ ...current, loading: false, error: reportError(error, t) }))
    }
  }, [projectId, t])

  const active = state.active
  return (
    <div className="plugin-diagnostics">
      <div className="plugin-diagnostic-actions" role="group" aria-label={t('pluginDiagnosticActions')}>
        <GlareButton
          type="button"
          className={`button plugin-diagnostic-action ${active === 'doctor' ? 'selected' : ''}`}
          aria-label={t('pluginCheck')}
          aria-pressed={active === 'doctor'}
          disabled={state.loading}
          onClick={() => void run('doctor')}
        >
          {state.loading && active === 'doctor' ? (
            <LoaderCircle className="plugin-diagnostic-spin" size={14} />
          ) : (
            <Stethoscope size={14} />
          )}
          {state.loading && active === 'doctor' ? t('pluginProcessing') : t('pluginCheck')}
        </GlareButton>
        <GlareButton
          type="button"
          className={`button plugin-diagnostic-action ${active === 'graph' ? 'selected' : ''}`}
          aria-label={t('pluginGraph')}
          aria-pressed={active === 'graph'}
          disabled={state.loading}
          onClick={() => void run('graph')}
        >
          {state.loading && active === 'graph' ? (
            <LoaderCircle className="plugin-diagnostic-spin" size={14} />
          ) : (
            <GitBranch size={14} />
          )}
          {t('pluginGraph')}
        </GlareButton>
        <GlareButton
          type="button"
          className={`button plugin-diagnostic-action ${active === 'lock' ? 'selected' : ''}`}
          aria-label={t('pluginReadLock')}
          title={t('pluginReadLock')}
          aria-pressed={active === 'lock'}
          disabled={state.loading}
          onClick={() => void run('lock')}
        >
          {state.loading && active === 'lock' ? (
            <LoaderCircle className="plugin-diagnostic-spin" size={15} />
          ) : (
            <LockKeyhole size={15} />
          )}
          {t('pluginReadLock')}
        </GlareButton>
      </div>

      {state.loading && !state.report && (
        <div className="plugin-diagnostic-loading" role="status">
          <LoaderCircle className="plugin-diagnostic-spin" size={16} />
          <span>{t('pluginReading')}{active ? reportLabel(active, t) : t('pluginDiagnostics')}…</span>
        </div>
      )}

      {state.error && active && (
        <SpotlightCard
          className="plugin-diagnostic-error"
          role="alert"
          spotlightColor="color-mix(in srgb, var(--hbar-er) 20%, transparent)"
        >
          <div>
            <strong>{t('pluginCannotRead')}{reportLabel(active, t)}</strong>
            <span>{state.error}</span>
          </div>
          <button type="button" className="button" onClick={() => void run(active)}>
            {t('retry')}
          </button>
        </SpotlightCard>
      )}

      {state.report && <PluginReportView report={state.report} onRefresh={() => void run(active ?? 'graph')} />}
    </div>
  )
}
