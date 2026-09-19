import { useCallback, useEffect } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { HbarAppUiButton, HbarAppUiIcon, HbarAppUiIconButton, HbarAppUiSurface } from 'hbar-app-ui'
import { HbarAppUiCheckBox, HbarAppUiSelect } from 'hbar-app-ui/forms'
import { HbarAppUiBarSeries, HbarAppUiCompactMetrics, HbarAppUiPageHeader } from 'hbar-app-ui/workbench'
import type { StatusWorkspaceEntryState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './status-workspace.css'

type PerformanceReport = NonNullable<StatusWorkspaceEntryState['performance']>
type PerformanceReadings = NonNullable<PerformanceReport['current']>['readings']
type MetricValue = PerformanceReadings[keyof PerformanceReadings]
type UsageReport = NonNullable<StatusWorkspaceEntryState['usage']>
type UsageMetric = UsageReport['cost']
type UsageLatency = UsageReport['latency']['response']
type ExecutionReport = NonNullable<UsageReport['execution']>
type ExecutionMetric = ExecutionReport['requestConcurrency']
type ReadingKey = keyof PerformanceReadings

export interface HbarStatusWorkspaceLabels {
  readonly title: string
  readonly description: string
  readonly close: string
  readonly refresh: string
  readonly loading: string
  readonly tabs: string
  readonly sections: Readonly<Record<'dashboard' | 'usage' | 'git', string>>
  readonly performanceFilters: {
    readonly label: string
    readonly timeWindow: string
    readonly target: string
    readonly windows: Readonly<Record<'2m' | '15m' | '1h', string>>
    readonly targets: Readonly<Record<'all' | 'system' | 'host', string>>
  }
  readonly gap: (skipped: number) => string
  readonly process: string
  readonly resources: string
  readonly runtime: string
  readonly io: string
  readonly trends: string
  readonly readings: Readonly<Record<ReadingKey, string>>
  readonly processLabels: {
    readonly pid: string
    readonly platform: string
    readonly architecture: string
    readonly uptime: string
    readonly processors: string
  }
  readonly usage: {
    readonly title: string
    readonly filters: string
    readonly advancedFilters: string
    readonly export: string
    readonly scope: string
    readonly timeWindow: string
    readonly aggregation: string
    readonly provider: string
    readonly modelFilter: string
    readonly allProviders: string
    readonly allModels: string
    readonly scopes: Readonly<Record<'global' | 'workspace' | 'session', string>>
    readonly windows: Readonly<Record<'1h' | '24h' | '7d' | '30d', string>>
    readonly aggregations: Readonly<Record<'minute' | 'hour' | 'day', string>>
    readonly includeDescendants: string
    readonly exportJson: string
    readonly exportCsv: string
    readonly exporting: string
    readonly exported: (rows: number, fileName: string) => string
    readonly incompleteExport: string
    readonly gap: string
    readonly totals: string
    readonly tokens: string
    readonly attempts: string
    readonly runs: string
    readonly input: string
    readonly output: string
    readonly cacheRead: string
    readonly cacheWrite: string
    readonly billable: string
    readonly cost: string
    readonly cacheHit: string
    readonly rates: string
    readonly inputRate: string
    readonly outputRate: string
    readonly totalRate: string
    readonly latency: string
    readonly firstProviderEvent: string
    readonly firstThinking: string
    readonly firstText: string
    readonly response: string
    readonly models: string
    readonly timeline: string
    readonly execution: string
    readonly toolCalls: string
    readonly toolCallsDetail: (succeeded: number, failed: number, unknown: number) => string
    readonly requestConcurrency: string
    readonly toolConcurrency: string
    readonly totalDuration: string
    readonly runDuration: string
    readonly toolDuration: string
    readonly executionUnavailable: string
    readonly estimated: string
    readonly p50p95: (p50: string, p95: string) => string
    readonly model: (provider: string, model: string) => string
  }
  readonly git: {
    readonly title: string
    readonly filters: string
    readonly advancedFilters: string
    readonly repositoryFilter: string
    readonly timeWindow: string
    readonly windows: Readonly<Record<'7d' | '30d' | '90d' | '1y', string>>
    readonly sources: string
    readonly repositoryStatus: string
    readonly branch: string
    readonly upstream: string
    readonly noUpstream: string
    readonly workingTree: string
    readonly clean: string
    readonly dirty: string
    readonly aheadBehind: (ahead: number, behind: number) => string
    readonly changedPaths: string
    readonly activity: string
    readonly provenance: string
    readonly changes: string
    readonly timeline: string
    readonly files: string
    readonly policy: string
    readonly details: string
    readonly commits: string
    readonly automatic: string
    readonly manual: string
    readonly external: string
    readonly filesChanged: string
    readonly additions: string
    readonly deletions: string
    readonly renames: string
    readonly binaryFiles: string
    readonly repository: string
    readonly head: string
    readonly scanned: string
    readonly indexMode: string
    readonly historyPolicy: string
    readonly timeBasis: string
    readonly timezone: string
    readonly gap: string
    readonly binaryChanges: string
    readonly binaryUnavailable: string
    readonly noHead: string
    readonly noRepository: string
    readonly emptyHistory: string
    readonly recentCommits: string
    readonly noCommits: string
    readonly historyTruncated: string
    readonly commitAuthor: string
    readonly commitDate: string
    readonly formatCommitDate: (authoredAt: string) => string
    readonly commitSource: string
    readonly commitMetadata: (source: string, date: string) => string
    readonly session: string
    readonly run: string
    readonly operation: string
    readonly selectBucket: (summary: string) => string
    readonly selectedBucket: (time: string, count: number) => string
    readonly showAllCommits: string
  }
  readonly unavailable: (reason: string | null) => string
  readonly number: (value: number) => string
  readonly currency: (value: number) => string
  readonly tokenCount: (value: number) => string
  readonly tokenRate: (value: number) => string
  readonly percent: (value: number) => string
  readonly bytes: (value: number) => string
  readonly bytesPerSecond: (value: number) => string
  readonly milliseconds: (value: number) => string
  readonly duration: (value: number) => string
  readonly observedAt: (value: number) => string
  readonly error: (code: string) => string
}

function formatMetric(metric: MetricValue, labels: HbarStatusWorkspaceLabels): string {
  if (metric.availability !== 'available' || metric.value === null) return labels.unavailable(metric.reason)
  if (metric.unit === 'percent') return labels.percent(metric.value)
  if (metric.unit === 'bytes') return labels.bytes(metric.value)
  if (metric.unit === 'bytes_per_second') return labels.bytesPerSecond(metric.value)
  if (metric.unit === 'milliseconds') return labels.milliseconds(metric.value)
  return labels.number(metric.value)
}

function usageValue(metric: UsageMetric, labels: HbarStatusWorkspaceLabels, format: (value: number) => string) {
  return metric.availability === 'available' && metric.value !== null
    ? format(metric.value)
    : labels.unavailable(metric.reason)
}

export function HbarStatusWorkspace({
  labels,
  instanceId: requestedInstanceId,
}: {
  readonly labels: HbarStatusWorkspaceLabels
  readonly instanceId?: string
}) {
  const runtime = useHbarRuntime()
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const status = useHbarRuntimeState(runtime.state.status)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const instanceId = requestedInstanceId ?? (presentation.page.kind === 'status' ? presentation.page.instanceId : null)
  const panel = instanceId ? surfaces.panels[instanceId] : undefined
  const rawSection = panel?.params.section
  const section = rawSection === 'usage' || rawSection === 'git' ? rawSection : 'dashboard'
  const entry = instanceId ? status.entries[instanceId] : undefined
  const invoke = useCallback(
    (name: string, input: unknown) =>
      void (runtime.commands.execute as (command: string, value: unknown) => Promise<unknown>)(name, input).catch(
        () => {},
      ),
    [runtime.commands],
  )
  useEffect(() => {
    if (instanceId && panel?.panelId === 'status' && entry?.section !== section)
      invoke('statusWorkspace.refresh', { instanceId })
  }, [entry?.section, instanceId, invoke, panel?.panelId, section])
  if (!instanceId || panel?.panelId !== 'status') return null

  const report = entry?.performance
  const usageReport = entry?.usage
  const usageQuery = entry?.usageQuery
  const usageExport = entry?.usageExport
  const gitReport = entry?.git
  const gitStatus = entry?.gitStatus
  const gitQuery = entry?.gitQuery
  const selectedGitPoint = gitReport?.points.find((point) => point.start === entry?.gitBucketStart) ?? null
  const visibleGitCommits = selectedGitPoint
    ? (entry?.gitCommits ?? []).filter((commit) => {
        const committedAt = Date.parse(commit.committedAt ?? commit.authoredAt)
        return committedAt >= selectedGitPoint.start && committedAt < selectedGitPoint.end
      })
    : (entry?.gitCommits ?? [])
  const readings = report?.current?.readings
  const performanceQuery = entry?.performanceQuery
  const includeSystem = performanceQuery?.target !== 'host'
  const includeHost = performanceQuery?.target !== 'system'
  const metrics = (keys: readonly ReadingKey[]) =>
    keys.map((key) => {
      const metric = readings?.[key]
      if (!metric) return { id: key, label: labels.readings[key], value: labels.unavailable(null) }
      if (metric.availability !== 'available' || metric.value === null)
        return {
          id: key,
          label: labels.readings[key],
          value: labels.unavailable(null),
          ...(metric.reason ? { detail: metric.reason } : {}),
        }
      return { id: key, label: labels.readings[key], value: formatMetric(metric, labels) }
    })
  const chart = (key: 'systemCpuPercent' | 'hostCpuPercent') => (
    <HbarAppUiBarSeries
      label={labels.readings[key]}
      maximum={100}
      points={(report?.points ?? []).map((point) => {
        const metric = point.readings[key]
        return {
          id: String(point.start),
          value: metric.availability === 'available' && metric.value !== null ? metric.value : 0,
          label: `${labels.observedAt(point.start)} · ${formatMetric(metric, labels)}`,
        }
      })}
      empty={<p className="hbar-app-react-status-empty-chart">{labels.unavailable(null)}</p>}
    />
  )
  const usageItem = (id: string, label: string, metric: UsageMetric, format: (value: number) => string) =>
    metric.availability === 'available' && metric.value !== null
      ? {
          id,
          label,
          value: format(metric.value),
          ...(metric.estimated ? { detail: labels.usage.estimated } : {}),
        }
      : {
          id,
          label,
          value: labels.unavailable(null),
          ...(metric.reason ? { detail: metric.reason } : {}),
        }
  const latencyItem = (id: string, label: string, metric: UsageLatency) =>
    metric.availability === 'available' && metric.p50 !== null && metric.p95 !== null
      ? { id, label, value: labels.usage.p50p95(labels.milliseconds(metric.p50), labels.milliseconds(metric.p95)) }
      : {
          id,
          label,
          value: labels.unavailable(null),
          ...(metric.reason ? { detail: metric.reason } : {}),
        }
  const executionItem = (id: string, label: string, metric: ExecutionMetric) =>
    metric.availability === 'available' && metric.value !== null
      ? {
          id,
          label,
          value: metric.unit === 'milliseconds' ? labels.duration(metric.value) : labels.number(metric.value),
        }
      : {
          id,
          label,
          value: labels.unavailable(metric.reason),
          ...(metric.reason ? { detail: metric.reason } : {}),
        }
  const usageProviders = Array.from(
    new Set([
      ...(usageReport?.models.map((model) => model.providerId) ?? []),
      ...(usageQuery?.providerId ? [usageQuery.providerId] : []),
    ]),
  ).sort()
  const usageModels = Array.from(
    new Set([
      ...(usageReport?.models
        .filter((model) => !usageQuery?.providerId || model.providerId === usageQuery.providerId)
        .map((model) => model.modelId) ?? []),
      ...(usageQuery?.modelId ? [usageQuery.modelId] : []),
    ]),
  ).sort()
  const setUsageQuery = (patch: Partial<StatusWorkspaceEntryState['usageQuery']>) => {
    if (!usageQuery) return
    invoke('statusWorkspace.setUsageQuery', { instanceId, ...usageQuery, ...patch })
  }
  const gitWorkspaces = Object.values(directory.workspaces).sort((left, right) => left.name.localeCompare(right.name))
  const setGitQuery = (patch: Partial<StatusWorkspaceEntryState['gitQuery']>) => {
    if (!gitQuery?.workspaceId) return
    invoke('statusWorkspace.setGitQuery', { instanceId, ...gitQuery, ...patch })
  }
  const toggleGitSource = (source: StatusWorkspaceEntryState['gitQuery']['sources'][number], checked: boolean) => {
    if (!gitQuery) return
    const sources = (['auto', 'manual', 'external'] as const).filter((candidate) =>
      candidate === source ? checked : gitQuery.sources.includes(candidate),
    )
    if (sources.length > 0) setGitQuery({ sources })
  }
  const selectGitBucket = (id: string) => {
    const bucketStart = Number(id)
    if (!Number.isSafeInteger(bucketStart) || bucketStart < 0) return
    invoke('statusWorkspace.selectGitBucket', {
      instanceId,
      bucketStart: entry?.gitBucketStart === bucketStart ? null : bucketStart,
    })
  }

  return (
    <HbarAppUiSurface className="hbar-app-react-status-workspace">
      <HbarAppUiPageHeader
        title={labels.title}
        context={labels.description}
        leading={
          <HbarAppUiIconButton label={labels.close} onClick={() => invoke('app.closePanel', { instanceId })}>
            <HbarAppUiIcon icon={ArrowLeft} tier="sm" />
          </HbarAppUiIconButton>
        }
        actionsLabel={labels.refresh}
        actions={
          <HbarAppUiIconButton
            label={labels.refresh}
            disabled={entry?.status === 'loading'}
            onClick={() => invoke('statusWorkspace.refresh', { instanceId })}
          >
            <HbarAppUiIcon icon={RefreshCw} tier="sm" />
          </HbarAppUiIconButton>
        }
      />
      <nav aria-label={labels.tabs}>
        {(['dashboard', 'usage', 'git'] as const).map((item) => (
          <HbarAppUiButton
            key={item}
            aria-current={section === item ? 'page' : undefined}
            onClick={() => invoke('app.openStatus', { section: item })}
          >
            {labels.sections[item]}
          </HbarAppUiButton>
        ))}
      </nav>
      {section === 'dashboard' && performanceQuery && (
        <div className="hbar-app-react-status-controls" role="group" aria-label={labels.performanceFilters.label}>
          <label>
            <span>{labels.performanceFilters.timeWindow}</span>
            <HbarAppUiSelect
              value={performanceQuery.window}
              disabled={entry?.status === 'loading'}
              onChange={(event) =>
                invoke('statusWorkspace.setPerformanceQuery', {
                  instanceId,
                  window: event.currentTarget.value,
                  target: performanceQuery.target,
                })
              }
            >
              {(['2m', '15m', '1h'] as const).map((window) => (
                <option key={window} value={window}>
                  {labels.performanceFilters.windows[window]}
                </option>
              ))}
            </HbarAppUiSelect>
          </label>
          <label>
            <span>{labels.performanceFilters.target}</span>
            <HbarAppUiSelect
              value={performanceQuery.target}
              disabled={entry?.status === 'loading'}
              onChange={(event) =>
                invoke('statusWorkspace.setPerformanceQuery', {
                  instanceId,
                  window: performanceQuery.window,
                  target: event.currentTarget.value,
                })
              }
            >
              {(['all', 'system', 'host'] as const).map((target) => (
                <option key={target} value={target}>
                  {labels.performanceFilters.targets[target]}
                </option>
              ))}
            </HbarAppUiSelect>
          </label>
        </div>
      )}
      {section === 'usage' && usageQuery && (
        <div
          className="hbar-app-react-status-controls hbar-app-react-usage-controls"
          role="group"
          aria-label={labels.usage.filters}
        >
          <label>
            <span>{labels.usage.scope}</span>
            <HbarAppUiSelect
              value={usageQuery.scope}
              disabled={entry?.status === 'loading'}
              onChange={(event) => setUsageQuery({ scope: event.currentTarget.value as typeof usageQuery.scope })}
            >
              {(['global', 'workspace', 'session'] as const).map((scope) => (
                <option
                  key={scope}
                  value={scope}
                  disabled={(scope === 'workspace' && !panel.workspaceId) || (scope === 'session' && !panel.sessionId)}
                >
                  {labels.usage.scopes[scope]}
                </option>
              ))}
            </HbarAppUiSelect>
          </label>
          {usageQuery.scope === 'session' && (
            <HbarAppUiCheckBox
              label={labels.usage.includeDescendants}
              checked={usageQuery.includeDescendants}
              disabled={entry?.status === 'loading'}
              onChange={(event) => setUsageQuery({ includeDescendants: event.currentTarget.checked })}
            />
          )}
          <label>
            <span>{labels.usage.timeWindow}</span>
            <HbarAppUiSelect
              value={usageQuery.window}
              disabled={entry?.status === 'loading'}
              onChange={(event) => setUsageQuery({ window: event.currentTarget.value as typeof usageQuery.window })}
            >
              {(['1h', '24h', '7d', '30d'] as const).map((window) => (
                <option key={window} value={window}>
                  {labels.usage.windows[window]}
                </option>
              ))}
            </HbarAppUiSelect>
          </label>
          <details className="hbar-app-react-status-filter-details">
            <summary>{labels.usage.advancedFilters}</summary>
            <div>
              <label>
                <span>{labels.usage.aggregation}</span>
                <HbarAppUiSelect
                  value={usageQuery.aggregation}
                  disabled={entry?.status === 'loading'}
                  onChange={(event) =>
                    setUsageQuery({ aggregation: event.currentTarget.value as typeof usageQuery.aggregation })
                  }
                >
                  {(['minute', 'hour', 'day'] as const).map((aggregation) => (
                    <option key={aggregation} value={aggregation}>
                      {labels.usage.aggregations[aggregation]}
                    </option>
                  ))}
                </HbarAppUiSelect>
              </label>
              <label>
                <span>{labels.usage.provider}</span>
                <HbarAppUiSelect
                  value={usageQuery.providerId ?? ''}
                  disabled={entry?.status === 'loading'}
                  onChange={(event) => setUsageQuery({ providerId: event.currentTarget.value || null, modelId: null })}
                >
                  <option value="">{labels.usage.allProviders}</option>
                  {usageProviders.map((providerId) => (
                    <option key={providerId} value={providerId}>
                      {providerId}
                    </option>
                  ))}
                </HbarAppUiSelect>
              </label>
              <label>
                <span>{labels.usage.modelFilter}</span>
                <HbarAppUiSelect
                  value={usageQuery.modelId ?? ''}
                  disabled={entry?.status === 'loading'}
                  onChange={(event) => setUsageQuery({ modelId: event.currentTarget.value || null })}
                >
                  <option value="">{labels.usage.allModels}</option>
                  {usageModels.map((modelId) => (
                    <option key={modelId} value={modelId}>
                      {modelId}
                    </option>
                  ))}
                </HbarAppUiSelect>
              </label>
            </div>
          </details>
          <details className="hbar-app-react-status-export-menu">
            <summary>{labels.usage.export}</summary>
            <div className="hbar-app-ui-dialog-menu" role="menu" aria-label={labels.usage.export}>
              <HbarAppUiButton
                role="menuitem"
                disabled={entry?.status === 'loading' || usageExport?.status === 'exporting'}
                onClick={() => invoke('statusWorkspace.exportUsage', { instanceId, format: 'json' })}
              >
                {usageExport?.status === 'exporting' ? labels.usage.exporting : labels.usage.exportJson}
              </HbarAppUiButton>
              <HbarAppUiButton
                role="menuitem"
                disabled={entry?.status === 'loading' || usageExport?.status === 'exporting'}
                onClick={() => invoke('statusWorkspace.exportUsage', { instanceId, format: 'csv' })}
              >
                {usageExport?.status === 'exporting' ? labels.usage.exporting : labels.usage.exportCsv}
              </HbarAppUiButton>
            </div>
          </details>
          {usageExport?.status === 'succeeded' && usageExport.fileName && (
            <p role="status">
              {labels.usage.exported(usageExport.rowCount, usageExport.fileName)}
              {usageExport.incomplete && (
                <span className="hbar-app-react-status-export-warning">{labels.usage.incompleteExport}</span>
              )}
            </p>
          )}
          {usageExport?.status === 'failed' && usageExport.error && (
            <p role="alert">{labels.error(usageExport.error)}</p>
          )}
        </div>
      )}
      {section === 'git' && gitQuery?.workspaceId && (
        <div
          className="hbar-app-react-status-controls hbar-app-react-git-controls"
          role="group"
          aria-label={labels.git.filters}
        >
          <label>
            <span>{labels.git.repositoryFilter}</span>
            <HbarAppUiSelect
              value={gitQuery.workspaceId}
              disabled={entry?.status === 'loading'}
              onChange={(event) => setGitQuery({ workspaceId: event.currentTarget.value })}
            >
              {gitWorkspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </HbarAppUiSelect>
          </label>
          <label>
            <span>{labels.git.timeWindow}</span>
            <HbarAppUiSelect
              value={gitQuery.window}
              disabled={entry?.status === 'loading'}
              onChange={(event) => setGitQuery({ window: event.currentTarget.value as typeof gitQuery.window })}
            >
              {(['7d', '30d', '90d', '1y'] as const).map((window) => (
                <option key={window} value={window}>
                  {labels.git.windows[window]}
                </option>
              ))}
            </HbarAppUiSelect>
          </label>
          <details className="hbar-app-react-status-filter-details">
            <summary>{labels.git.advancedFilters}</summary>
            <div className="hbar-app-react-git-source-options" role="group" aria-label={labels.git.sources}>
              {(['auto', 'manual', 'external'] as const).map((source) => {
                const checked = gitQuery.sources.includes(source)
                return (
                  <HbarAppUiCheckBox
                    key={source}
                    label={labels.git[source === 'auto' ? 'automatic' : source]}
                    checked={checked}
                    disabled={entry?.status === 'loading' || (checked && gitQuery.sources.length === 1)}
                    onChange={(event) => toggleGitSource(source, event.currentTarget.checked)}
                  />
                )
              })}
            </div>
          </details>
        </div>
      )}
      {!entry || entry.status === 'loading' ? (
        <p className="hbar-app-react-status-loading">{labels.loading}</p>
      ) : entry.error ||
        (section === 'dashboard' && !report) ||
        (section === 'usage' && !usageReport) ||
        (section === 'git' && !gitReport) ? (
        <p className="hbar-app-react-status-loading" role="alert">
          {labels.error(entry.error ?? 'CAPABILITY_UNAVAILABLE')}
        </p>
      ) : section === 'dashboard' && report ? (
        <main className="hbar-app-react-performance">
          {report.gap && (
            <p className="hbar-app-react-status-gap" role="status">
              {labels.gap(report.skippedSamples)}
            </p>
          )}
          <section>
            <h2>{labels.resources}</h2>
            <HbarAppUiCompactMetrics
              label={labels.resources}
              metrics={metrics([
                ...(includeSystem
                  ? (['systemCpuPercent', 'systemLoad1', 'systemMemoryUsedBytes', 'systemMemoryTotalBytes'] as const)
                  : []),
                ...(includeHost ? (['hostCpuPercent', 'hostRssBytes', 'hostHeapUsedBytes'] as const) : []),
              ])}
            />
          </section>
          {includeHost && (
            <section>
              <h2>{labels.runtime}</h2>
              <HbarAppUiCompactMetrics
                label={labels.runtime}
                metrics={metrics([
                  'hostThreadCount',
                  'eventLoopLagMs',
                  'activeRuns',
                  'queuedRuns',
                  'managedChildProcesses',
                ])}
              />
            </section>
          )}
          <section>
            <h2>{labels.trends}</h2>
            <div className="hbar-app-react-performance-charts">
              {includeSystem && (
                <article>
                  <h3>{labels.readings.systemCpuPercent}</h3>
                  {chart('systemCpuPercent')}
                </article>
              )}
              {includeHost && (
                <article>
                  <h3>{labels.readings.hostCpuPercent}</h3>
                  {chart('hostCpuPercent')}
                </article>
              )}
            </div>
          </section>
          {includeHost && (
            <details className="hbar-app-react-status-details">
              <summary>{labels.process}</summary>
              <HbarAppUiCompactMetrics
                label={labels.process}
                metrics={[
                  { id: 'pid', label: labels.processLabels.pid, value: labels.number(report.process.pid) },
                  { id: 'platform', label: labels.processLabels.platform, value: report.process.platform },
                  { id: 'architecture', label: labels.processLabels.architecture, value: report.process.arch },
                  {
                    id: 'uptime',
                    label: labels.processLabels.uptime,
                    value: labels.duration(report.process.uptimeMs),
                  },
                  {
                    id: 'processors',
                    label: labels.processLabels.processors,
                    value: labels.number(report.process.logicalProcessors),
                  },
                ]}
              />
            </details>
          )}
          <details className="hbar-app-react-status-details">
            <summary>{labels.io}</summary>
            <HbarAppUiCompactMetrics
              label={labels.io}
              metrics={metrics([
                ...(includeHost ? (['hostDiskReadBytesPerSecond', 'hostDiskWriteBytesPerSecond'] as const) : []),
                ...(includeSystem
                  ? (['systemNetworkReceiveBytesPerSecond', 'systemNetworkTransmitBytesPerSecond'] as const)
                  : []),
              ])}
            />
          </details>
        </main>
      ) : section === 'usage' && usageReport ? (
        <main className="hbar-app-react-global-usage">
          {usageReport.gap && (
            <p className="hbar-app-react-status-gap" role="status">
              {labels.usage.gap}
            </p>
          )}
          <section>
            <h2>{labels.usage.title}</h2>
            <HbarAppUiCompactMetrics
              label={labels.usage.title}
              metrics={[
                {
                  id: 'tokens',
                  label: labels.usage.tokens,
                  value: labels.tokenCount(usageReport.totals.input + usageReport.totals.output),
                },
                { id: 'input', label: labels.usage.input, value: labels.number(usageReport.totals.input) },
                { id: 'output', label: labels.usage.output, value: labels.number(usageReport.totals.output) },
                { id: 'cache-read', label: labels.usage.cacheRead, value: labels.number(usageReport.totals.cacheRead) },
                {
                  id: 'cache-write',
                  label: labels.usage.cacheWrite,
                  value: labels.number(usageReport.totals.cacheWrite),
                },
                {
                  id: 'billable',
                  label: labels.usage.billable,
                  value: labels.number(usageReport.totals.billableTokens),
                },
                { id: 'runs', label: labels.usage.runs, value: labels.number(usageReport.totals.runs) },
                { id: 'attempts', label: labels.usage.attempts, value: labels.number(usageReport.totals.attempts) },
                usageItem('cost', labels.usage.cost, usageReport.cost, labels.currency),
                usageItem('cache-hit', labels.usage.cacheHit, usageReport.cacheHitRate, labels.percent),
              ]}
            />
          </section>
          <section>
            <h2>{labels.usage.rates}</h2>
            <HbarAppUiCompactMetrics
              label={labels.usage.rates}
              metrics={[
                usageItem('input-rate', labels.usage.inputRate, usageReport.rates.input, labels.tokenRate),
                usageItem('output-rate', labels.usage.outputRate, usageReport.rates.output, labels.tokenRate),
                usageItem('total-rate', labels.usage.totalRate, usageReport.rates.total, labels.tokenRate),
              ]}
            />
          </section>
          <section className="hbar-app-react-usage-latency">
            <h2>{labels.usage.latency}</h2>
            <HbarAppUiCompactMetrics
              label={labels.usage.latency}
              metrics={[
                latencyItem('first-provider', labels.usage.firstProviderEvent, usageReport.latency.firstProviderEvent),
                latencyItem('first-thinking', labels.usage.firstThinking, usageReport.latency.firstThinking),
                latencyItem('first-text', labels.usage.firstText, usageReport.latency.firstText),
                latencyItem('response', labels.usage.response, usageReport.latency.response),
              ]}
            />
          </section>
          <section>
            <h2>{labels.usage.timeline}</h2>
            <HbarAppUiBarSeries
              label={labels.usage.timeline}
              points={usageReport.series.map((point) => ({
                id: String(point.start),
                value: point.billableTokens,
                label: `${labels.observedAt(point.start)} · ${labels.tokenCount(point.billableTokens)}`,
              }))}
              empty={<p className="hbar-app-react-status-empty-chart">{labels.unavailable(null)}</p>}
            />
          </section>
          <section>
            <h2>{labels.usage.models}</h2>
            {usageReport.models.length === 0 ? (
              <p>{labels.unavailable(null)}</p>
            ) : (
              <ul className="hbar-app-react-usage-models">
                {usageReport.models.map((model) => (
                  <li key={model.modelSelectionId}>
                    <strong>{labels.usage.model(model.providerId, model.modelId)}</strong>
                    <span>{labels.tokenCount(model.input + model.output)}</span>
                    <span>{usageValue(model.cost, labels, labels.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <details className="hbar-app-react-status-details">
            <summary>{labels.usage.execution}</summary>
            {usageReport.execution ? (
              <HbarAppUiCompactMetrics
                label={labels.usage.execution}
                metrics={[
                  {
                    id: 'tool-calls',
                    label: labels.usage.toolCalls,
                    value: labels.number(usageReport.execution.toolCalls.total),
                    detail: labels.usage.toolCallsDetail(
                      usageReport.execution.toolCalls.succeeded,
                      usageReport.execution.toolCalls.failed,
                      usageReport.execution.toolCalls.unknown,
                    ),
                  },
                  executionItem(
                    'request-concurrency',
                    labels.usage.requestConcurrency,
                    usageReport.execution.requestConcurrency,
                  ),
                  executionItem(
                    'tool-concurrency',
                    labels.usage.toolConcurrency,
                    usageReport.execution.toolConcurrency,
                  ),
                  executionItem('total-duration', labels.usage.totalDuration, usageReport.execution.totalRunDuration),
                  latencyItem('run-duration', labels.usage.runDuration, usageReport.execution.runDuration),
                  latencyItem('tool-duration', labels.usage.toolDuration, usageReport.execution.toolDuration),
                ]}
              />
            ) : (
              <p>{labels.usage.executionUnavailable}</p>
            )}
          </details>
        </main>
      ) : gitReport ? (
        <main className="hbar-app-react-git-status">
          {gitReport.gap && (
            <p className="hbar-app-react-status-gap" role="status">
              {labels.git.gap}
            </p>
          )}
          <section>
            <h2>{labels.git.title}</h2>
            {!gitStatus?.root ? (
              <p className="hbar-app-react-git-empty" role="status">
                {labels.git.noRepository}
              </p>
            ) : (
              <HbarAppUiCompactMetrics
                label={labels.git.repositoryStatus}
                metrics={[
                  { id: 'branch', label: labels.git.branch, value: gitStatus.branch ?? labels.git.noHead },
                  { id: 'upstream', label: labels.git.upstream, value: gitStatus.upstream ?? labels.git.noUpstream },
                  {
                    id: 'working-tree',
                    label: labels.git.workingTree,
                    value: gitStatus.dirty ? labels.git.dirty : labels.git.clean,
                    detail: labels.git.aheadBehind(gitStatus.ahead, gitStatus.behind),
                  },
                  {
                    id: 'changed-paths',
                    label: labels.git.changedPaths,
                    value: labels.number(gitStatus.entries.length),
                  },
                ]}
              />
            )}
          </section>
          {gitStatus?.root && (
            <>
              <section>
                <h2>{labels.git.activity}</h2>
                {!gitReport.head && <p className="hbar-app-react-git-empty">{labels.git.emptyHistory}</p>}
                <HbarAppUiCompactMetrics
                  label={labels.git.activity}
                  metrics={[
                    { id: 'commits', label: labels.git.commits, value: labels.number(gitReport.totals.commits) },
                    {
                      id: 'automatic',
                      label: labels.git.automatic,
                      value: labels.number(gitReport.totals.autoCommits),
                    },
                    { id: 'manual', label: labels.git.manual, value: labels.number(gitReport.totals.manualCommits) },
                    {
                      id: 'external',
                      label: labels.git.external,
                      value: labels.number(gitReport.totals.externalCommits),
                    },
                    {
                      id: 'files',
                      label: labels.git.filesChanged,
                      value: labels.number(gitReport.totals.filesChanged),
                    },
                    {
                      id: 'additions',
                      label: labels.git.additions,
                      value: labels.number(gitReport.totals.additions),
                    },
                    {
                      id: 'deletions',
                      label: labels.git.deletions,
                      value: labels.number(gitReport.totals.deletions),
                    },
                  ]}
                />
              </section>
              <section>
                <h2>{labels.git.timeline}</h2>
                {gitReport.totals.commits === 0 ? (
                  <p>{labels.git.noCommits}</p>
                ) : (
                  <div className="hbar-app-react-git-charts">
                    <article className="is-commits">
                      <h3>{labels.git.commits}</h3>
                      <HbarAppUiBarSeries
                        label={labels.git.commits}
                        points={gitReport.points.map((point) => ({
                          id: String(point.start),
                          value: point.commits,
                          label: `${labels.git.formatCommitDate(new Date(point.start).toISOString())} · ${labels.number(point.commits)} ${labels.git.commits} · ${labels.number(point.autoCommits)} ${labels.git.automatic} · ${labels.number(point.manualCommits)} ${labels.git.manual} · ${labels.number(point.externalCommits)} ${labels.git.external}`,
                        }))}
                        selectedId={entry.gitBucketStart === null ? null : String(entry.gitBucketStart)}
                        selectLabel={(point) => labels.git.selectBucket(point.label)}
                        onSelect={selectGitBucket}
                        empty={<p>{labels.git.noCommits}</p>}
                      />
                    </article>
                    <article className="is-files">
                      <h3>{labels.git.files}</h3>
                      <HbarAppUiBarSeries
                        label={labels.git.files}
                        points={gitReport.points.map((point) => ({
                          id: String(point.start),
                          value: point.filesChanged,
                          label: `${labels.git.formatCommitDate(new Date(point.start).toISOString())} · ${labels.number(point.filesChanged)} ${labels.git.filesChanged}`,
                        }))}
                        selectedId={entry.gitBucketStart === null ? null : String(entry.gitBucketStart)}
                        selectLabel={(point) => labels.git.selectBucket(point.label)}
                        onSelect={selectGitBucket}
                        empty={<p>{labels.git.noCommits}</p>}
                      />
                    </article>
                    <article className="is-changes">
                      <h3>{labels.git.changes}</h3>
                      <HbarAppUiBarSeries
                        label={labels.git.changes}
                        points={gitReport.points.map((point) => ({
                          id: String(point.start),
                          value: point.additions + point.deletions,
                          label: `${labels.git.formatCommitDate(new Date(point.start).toISOString())} · +${labels.number(point.additions)} / -${labels.number(point.deletions)}`,
                        }))}
                        selectedId={entry.gitBucketStart === null ? null : String(entry.gitBucketStart)}
                        selectLabel={(point) => labels.git.selectBucket(point.label)}
                        onSelect={selectGitBucket}
                        empty={<p>{labels.git.noCommits}</p>}
                      />
                    </article>
                  </div>
                )}
              </section>
              <section>
                <h2>{labels.git.recentCommits}</h2>
                {selectedGitPoint && (
                  <div className="hbar-app-react-git-bucket-filter" role="status">
                    <span>
                      {labels.git.selectedBucket(
                        labels.git.formatCommitDate(new Date(selectedGitPoint.start).toISOString()),
                        visibleGitCommits.length,
                      )}
                    </span>
                    <HbarAppUiButton
                      onClick={() => invoke('statusWorkspace.selectGitBucket', { instanceId, bucketStart: null })}
                    >
                      {labels.git.showAllCommits}
                    </HbarAppUiButton>
                  </div>
                )}
                {visibleGitCommits.length === 0 ? (
                  <p>{labels.git.noCommits}</p>
                ) : (
                  <div className="hbar-app-react-git-commits">
                    {visibleGitCommits.map((commit) => (
                      <details key={commit.sha}>
                        <summary>
                          <code>{commit.shortSha}</code>
                          <span>
                            <strong>{commit.subject}</strong>
                            <small>
                              {labels.git.commitMetadata(
                                labels.git[
                                  commit.provenance.source === 'auto' ? 'automatic' : commit.provenance.source
                                ],
                                labels.git.formatCommitDate(commit.committedAt ?? commit.authoredAt),
                              )}
                            </small>
                          </span>
                        </summary>
                        <dl>
                          <div>
                            <dt>{labels.git.commitAuthor}</dt>
                            <dd>{commit.author}</dd>
                          </div>
                          <div>
                            <dt>{labels.git.commitDate}</dt>
                            <dd>{labels.git.formatCommitDate(commit.committedAt ?? commit.authoredAt)}</dd>
                          </div>
                          <div>
                            <dt>{labels.git.commitSource}</dt>
                            <dd>
                              {labels.git[commit.provenance.source === 'auto' ? 'automatic' : commit.provenance.source]}
                            </dd>
                          </div>
                          {commit.provenance.sessionId && (
                            <div>
                              <dt>{labels.git.session}</dt>
                              <dd>{commit.provenance.sessionId}</dd>
                            </div>
                          )}
                          {commit.provenance.runId && (
                            <div>
                              <dt>{labels.git.run}</dt>
                              <dd>{commit.provenance.runId}</dd>
                            </div>
                          )}
                          {commit.provenance.operationId && (
                            <div>
                              <dt>{labels.git.operation}</dt>
                              <dd>{commit.provenance.operationId}</dd>
                            </div>
                          )}
                        </dl>
                      </details>
                    ))}
                  </div>
                )}
                {entry.gitHistoryTruncated && <p role="status">{labels.git.historyTruncated}</p>}
              </section>
              <details className="hbar-app-react-status-details">
                <summary>{labels.git.details}</summary>
                <HbarAppUiCompactMetrics
                  label={labels.git.details}
                  metrics={[
                    { id: 'repository', label: labels.git.repository, value: gitReport.repoId },
                    {
                      id: 'head',
                      label: labels.git.head,
                      value: gitReport.head?.slice(0, 12) ?? labels.git.noHead,
                    },
                    { id: 'scanned', label: labels.git.scanned, value: labels.number(gitReport.scannedCommits) },
                    { id: 'index', label: labels.git.indexMode, value: gitReport.indexMode },
                    { id: 'history', label: labels.git.historyPolicy, value: gitReport.historyPolicy },
                    { id: 'time', label: labels.git.timeBasis, value: gitReport.timeBasis },
                    { id: 'timezone', label: labels.git.timezone, value: gitReport.timezone },
                    { id: 'renames', label: labels.git.renames, value: labels.number(gitReport.totals.renames) },
                    {
                      id: 'binary-files',
                      label: labels.git.binaryFiles,
                      value: labels.number(gitReport.totals.binaryFiles),
                    },
                    {
                      id: 'binary-lines',
                      label: labels.git.binaryChanges,
                      value:
                        gitReport.binaryLineChanges.availability === 'available' &&
                        gitReport.binaryLineChanges.value !== null
                          ? labels.number(gitReport.binaryLineChanges.value)
                          : labels.git.binaryUnavailable,
                      ...(gitReport.binaryLineChanges.reason ? { detail: gitReport.binaryLineChanges.reason } : {}),
                    },
                  ]}
                />
              </details>
            </>
          )}
        </main>
      ) : null}
    </HbarAppUiSurface>
  )
}
