import { useCallback, useEffect } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenOption,
  LumenText,
  LumenBarSeries,
  LumenButton,
  LumenActionMenu,
  LumenCheckBox,
  LumenCompactMetrics,
  LumenFormField,
  LumenIcon,
  LumenIconButton,
  LumenNavigationButton,
  LumenPageHeader,
  LumenSelect,
} from '@lumen/app-ui'
import type { StatusWorkspaceEntryState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarLumenDisclosure } from './lumen-disclosure'
import './lumen-status-workspace.css'

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
    <LumenBarSeries
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
      empty={<LumenText as="p" className="hbar-app-react-status-empty-chart">{labels.unavailable(null)}</LumenText>}
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
    <LumenFrame as="section" className="hbar-app-react-status-workspace">
      <LumenPageHeader
        title={labels.title}
        context={labels.description}
        leading={
          <LumenIconButton label={labels.close} onClick={() => invoke('app.closePanel', { instanceId })}>
            <LumenIcon icon={ArrowLeft} tier="sm" />
          </LumenIconButton>
        }
        actionsLabel={labels.refresh}
        actions={
          <LumenIconButton
            label={labels.refresh}
            disabled={entry?.status === 'loading'}
            onClick={() => invoke('statusWorkspace.refresh', { instanceId })}
          >
            <LumenIcon icon={RefreshCw} tier="sm" />
          </LumenIconButton>
        }
      />
      <LumenFrame as="nav" aria-label={labels.tabs}>
        {(['dashboard', 'usage', 'git'] as const).map((item) => (
          <LumenNavigationButton
            key={item}
            size="s"
            selected={section === item}
            onClick={() => invoke('app.openStatus', { section: item })}
          >
            {labels.sections[item]}
          </LumenNavigationButton>
        ))}
      </LumenFrame>
      {section === 'dashboard' && performanceQuery && (
        <LumenFrame className="hbar-app-react-status-controls" role="group" aria-label={labels.performanceFilters.label}>
          <LumenFormField controlId="hbar-status-performance-window" label={labels.performanceFilters.timeWindow}>
            <LumenSelect
              id="hbar-status-performance-window"
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
                <LumenOption key={window} value={window}>
                  {labels.performanceFilters.windows[window]}
                </LumenOption>
              ))}
            </LumenSelect>
          </LumenFormField>
          <LumenFormField controlId="hbar-status-performance-target" label={labels.performanceFilters.target}>
            <LumenSelect
              id="hbar-status-performance-target"
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
                <LumenOption key={target} value={target}>
                  {labels.performanceFilters.targets[target]}
                </LumenOption>
              ))}
            </LumenSelect>
          </LumenFormField>
        </LumenFrame>
      )}
      {section === 'usage' && usageQuery && (
        <LumenFrame
          className="hbar-app-react-status-controls hbar-app-react-usage-controls"
          role="group"
          aria-label={labels.usage.filters}
        >
          <LumenFormField controlId="hbar-status-usage-scope" label={labels.usage.scope}>
            <LumenSelect
              id="hbar-status-usage-scope"
              value={usageQuery.scope}
              disabled={entry?.status === 'loading'}
              onChange={(event) => setUsageQuery({ scope: event.currentTarget.value as typeof usageQuery.scope })}
            >
              {(['global', 'workspace', 'session'] as const).map((scope) => (
                <LumenOption
                  key={scope}
                  value={scope}
                  disabled={(scope === 'workspace' && !panel.workspaceId) || (scope === 'session' && !panel.sessionId)}
                >
                  {labels.usage.scopes[scope]}
                </LumenOption>
              ))}
            </LumenSelect>
          </LumenFormField>
          {usageQuery.scope === 'session' && (
            <LumenCheckBox
              label={labels.usage.includeDescendants}
              checked={usageQuery.includeDescendants}
              disabled={entry?.status === 'loading'}
              onChange={(event) => setUsageQuery({ includeDescendants: event.currentTarget.checked })}
            />
          )}
          <LumenFormField controlId="hbar-status-usage-window" label={labels.usage.timeWindow}>
            <LumenSelect
              id="hbar-status-usage-window"
              value={usageQuery.window}
              disabled={entry?.status === 'loading'}
              onChange={(event) => setUsageQuery({ window: event.currentTarget.value as typeof usageQuery.window })}
            >
              {(['1h', '24h', '7d', '30d'] as const).map((window) => (
                <LumenOption key={window} value={window}>
                  {labels.usage.windows[window]}
                </LumenOption>
              ))}
            </LumenSelect>
          </LumenFormField>
          <HbarLumenDisclosure className="hbar-app-react-status-filter-details" label={labels.usage.advancedFilters}>
            <LumenFrame>
              <LumenFormField controlId="hbar-status-usage-aggregation" label={labels.usage.aggregation}>
                <LumenSelect
                  id="hbar-status-usage-aggregation"
                  value={usageQuery.aggregation}
                  disabled={entry?.status === 'loading'}
                  onChange={(event) =>
                    setUsageQuery({ aggregation: event.currentTarget.value as typeof usageQuery.aggregation })
                  }
                >
                  {(['minute', 'hour', 'day'] as const).map((aggregation) => (
                    <LumenOption key={aggregation} value={aggregation}>
                      {labels.usage.aggregations[aggregation]}
                    </LumenOption>
                  ))}
                </LumenSelect>
              </LumenFormField>
              <LumenFormField controlId="hbar-status-usage-provider" label={labels.usage.provider}>
                <LumenSelect
                  id="hbar-status-usage-provider"
                  value={usageQuery.providerId ?? ''}
                  disabled={entry?.status === 'loading'}
                  onChange={(event) => setUsageQuery({ providerId: event.currentTarget.value || null, modelId: null })}
                >
                  <LumenOption value="">{labels.usage.allProviders}</LumenOption>
                  {usageProviders.map((providerId) => (
                    <LumenOption key={providerId} value={providerId}>
                      {providerId}
                    </LumenOption>
                  ))}
                </LumenSelect>
              </LumenFormField>
              <LumenFormField controlId="hbar-status-usage-model" label={labels.usage.modelFilter}>
                <LumenSelect
                  id="hbar-status-usage-model"
                  value={usageQuery.modelId ?? ''}
                  disabled={entry?.status === 'loading'}
                  onChange={(event) => setUsageQuery({ modelId: event.currentTarget.value || null })}
                >
                  <LumenOption value="">{labels.usage.allModels}</LumenOption>
                  {usageModels.map((modelId) => (
                    <LumenOption key={modelId} value={modelId}>
                      {modelId}
                    </LumenOption>
                  ))}
                </LumenSelect>
              </LumenFormField>
            </LumenFrame>
          </HbarLumenDisclosure>
          <LumenActionMenu
            label={labels.usage.export}
            items={[
              {
                id: 'json',
                label: usageExport?.status === 'exporting' ? labels.usage.exporting : labels.usage.exportJson,
                disabled: entry?.status === 'loading' || usageExport?.status === 'exporting',
              },
              {
                id: 'csv',
                label: usageExport?.status === 'exporting' ? labels.usage.exporting : labels.usage.exportCsv,
                disabled: entry?.status === 'loading' || usageExport?.status === 'exporting',
              },
            ]}
            onAction={(format) => invoke('statusWorkspace.exportUsage', { instanceId, format })}
          />
          {usageExport?.status === 'succeeded' && usageExport.fileName && (
            <LumenText as="p" role="status">
              {labels.usage.exported(usageExport.rowCount, usageExport.fileName)}
              {usageExport.incomplete && (
                <LumenText as="span" className="hbar-app-react-status-export-warning">{labels.usage.incompleteExport}</LumenText>
              )}
            </LumenText>
          )}
          {usageExport?.status === 'failed' && usageExport.error && (
            <LumenText as="p" role="alert">{labels.error(usageExport.error)}</LumenText>
          )}
        </LumenFrame>
      )}
      {section === 'git' && gitQuery?.workspaceId && (
        <LumenFrame
          className="hbar-app-react-status-controls hbar-app-react-git-controls"
          role="group"
          aria-label={labels.git.filters}
        >
          <LumenFormField controlId="hbar-status-git-repository" label={labels.git.repositoryFilter}>
            <LumenSelect
              id="hbar-status-git-repository"
              value={gitQuery.workspaceId}
              disabled={entry?.status === 'loading'}
              onChange={(event) => setGitQuery({ workspaceId: event.currentTarget.value })}
            >
              {gitWorkspaces.map((workspace) => (
                <LumenOption key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </LumenOption>
              ))}
            </LumenSelect>
          </LumenFormField>
          <LumenFormField controlId="hbar-status-git-window" label={labels.git.timeWindow}>
            <LumenSelect
              id="hbar-status-git-window"
              value={gitQuery.window}
              disabled={entry?.status === 'loading'}
              onChange={(event) => setGitQuery({ window: event.currentTarget.value as typeof gitQuery.window })}
            >
              {(['7d', '30d', '90d', '1y'] as const).map((window) => (
                <LumenOption key={window} value={window}>
                  {labels.git.windows[window]}
                </LumenOption>
              ))}
            </LumenSelect>
          </LumenFormField>
          <HbarLumenDisclosure className="hbar-app-react-status-filter-details" label={labels.git.advancedFilters}>
            <LumenFrame className="hbar-app-react-git-source-options" role="group" aria-label={labels.git.sources}>
              {(['auto', 'manual', 'external'] as const).map((source) => {
                const checked = gitQuery.sources.includes(source)
                return (
                  <LumenCheckBox
                    key={source}
                    label={labels.git[source === 'auto' ? 'automatic' : source]}
                    checked={checked}
                    disabled={entry?.status === 'loading' || (checked && gitQuery.sources.length === 1)}
                    onChange={(event) => toggleGitSource(source, event.currentTarget.checked)}
                  />
                )
              })}
            </LumenFrame>
          </HbarLumenDisclosure>
        </LumenFrame>
      )}
      {!entry || entry.status === 'loading' ? (
        <LumenText as="p" className="hbar-app-react-status-loading">{labels.loading}</LumenText>
      ) : entry.error ||
        (section === 'dashboard' && !report) ||
        (section === 'usage' && !usageReport) ||
        (section === 'git' && !gitReport) ? (
        <LumenText as="p" className="hbar-app-react-status-loading" role="alert">
          {labels.error(entry.error ?? 'CAPABILITY_UNAVAILABLE')}
        </LumenText>
      ) : section === 'dashboard' && report ? (
        <LumenFrame as="main" className="hbar-app-react-performance">
          {report.gap && (
            <LumenText as="p" className="hbar-app-react-status-gap" role="status">
              {labels.gap(report.skippedSamples)}
            </LumenText>
          )}
          <LumenFrame as="section">
            <LumenText as="h2">{labels.resources}</LumenText>
            <LumenCompactMetrics
              label={labels.resources}
              metrics={metrics([
                ...(includeSystem
                  ? (['systemCpuPercent', 'systemLoad1', 'systemMemoryUsedBytes', 'systemMemoryTotalBytes'] as const)
                  : []),
                ...(includeHost ? (['hostCpuPercent', 'hostRssBytes', 'hostHeapUsedBytes'] as const) : []),
              ])}
            />
          </LumenFrame>
          {includeHost && (
            <LumenFrame as="section">
              <LumenText as="h2">{labels.runtime}</LumenText>
              <LumenCompactMetrics
                label={labels.runtime}
                metrics={metrics([
                  'hostThreadCount',
                  'eventLoopLagMs',
                  'activeRuns',
                  'queuedRuns',
                  'managedChildProcesses',
                ])}
              />
            </LumenFrame>
          )}
          <LumenFrame as="section">
            <LumenText as="h2">{labels.trends}</LumenText>
            <LumenFrame className="hbar-app-react-performance-charts">
              {includeSystem && (
                <LumenFrame as="article">
                  <LumenText as="h3">{labels.readings.systemCpuPercent}</LumenText>
                  {chart('systemCpuPercent')}
                </LumenFrame>
              )}
              {includeHost && (
                <LumenFrame as="article">
                  <LumenText as="h3">{labels.readings.hostCpuPercent}</LumenText>
                  {chart('hostCpuPercent')}
                </LumenFrame>
              )}
            </LumenFrame>
          </LumenFrame>
          {includeHost && (
            <HbarLumenDisclosure className="hbar-app-react-status-details" label={labels.process}>
              <LumenCompactMetrics
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
            </HbarLumenDisclosure>
          )}
          <HbarLumenDisclosure className="hbar-app-react-status-details" label={labels.io}>
            <LumenCompactMetrics
              label={labels.io}
              metrics={metrics([
                ...(includeHost ? (['hostDiskReadBytesPerSecond', 'hostDiskWriteBytesPerSecond'] as const) : []),
                ...(includeSystem
                  ? (['systemNetworkReceiveBytesPerSecond', 'systemNetworkTransmitBytesPerSecond'] as const)
                  : []),
              ])}
            />
          </HbarLumenDisclosure>
        </LumenFrame>
      ) : section === 'usage' && usageReport ? (
        <LumenFrame as="main" className="hbar-app-react-global-usage">
          {usageReport.gap && (
            <LumenText as="p" className="hbar-app-react-status-gap" role="status">
              {labels.usage.gap}
            </LumenText>
          )}
          <LumenFrame as="section">
            <LumenText as="h2">{labels.usage.title}</LumenText>
            <LumenCompactMetrics
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
          </LumenFrame>
          <LumenFrame as="section">
            <LumenText as="h2">{labels.usage.rates}</LumenText>
            <LumenCompactMetrics
              label={labels.usage.rates}
              metrics={[
                usageItem('input-rate', labels.usage.inputRate, usageReport.rates.input, labels.tokenRate),
                usageItem('output-rate', labels.usage.outputRate, usageReport.rates.output, labels.tokenRate),
                usageItem('total-rate', labels.usage.totalRate, usageReport.rates.total, labels.tokenRate),
              ]}
            />
          </LumenFrame>
          <LumenFrame as="section" className="hbar-app-react-usage-latency">
            <LumenText as="h2">{labels.usage.latency}</LumenText>
            <LumenCompactMetrics
              label={labels.usage.latency}
              metrics={[
                latencyItem('first-provider', labels.usage.firstProviderEvent, usageReport.latency.firstProviderEvent),
                latencyItem('first-thinking', labels.usage.firstThinking, usageReport.latency.firstThinking),
                latencyItem('first-text', labels.usage.firstText, usageReport.latency.firstText),
                latencyItem('response', labels.usage.response, usageReport.latency.response),
              ]}
            />
          </LumenFrame>
          <LumenFrame as="section">
            <LumenText as="h2">{labels.usage.timeline}</LumenText>
            <LumenBarSeries
              label={labels.usage.timeline}
              points={usageReport.series.map((point) => ({
                id: String(point.start),
                value: point.billableTokens,
                label: `${labels.observedAt(point.start)} · ${labels.tokenCount(point.billableTokens)}`,
              }))}
              empty={<LumenText as="p" className="hbar-app-react-status-empty-chart">{labels.unavailable(null)}</LumenText>}
            />
          </LumenFrame>
          <LumenFrame as="section">
            <LumenText as="h2">{labels.usage.models}</LumenText>
            {usageReport.models.length === 0 ? (
              <LumenText as="p">{labels.unavailable(null)}</LumenText>
            ) : (
              <LumenCollection as="ul" className="hbar-app-react-usage-models">
                {usageReport.models.map((model) => (
                  <LumenCollectionItem key={model.modelSelectionId}>
                    <LumenText as="strong">{labels.usage.model(model.providerId, model.modelId)}</LumenText>
                    <LumenText as="span">{labels.tokenCount(model.input + model.output)}</LumenText>
                    <LumenText as="span">{usageValue(model.cost, labels, labels.currency)}</LumenText>
                  </LumenCollectionItem>
                ))}
              </LumenCollection>
            )}
          </LumenFrame>
          <HbarLumenDisclosure className="hbar-app-react-status-details" label={labels.usage.execution}>
            {usageReport.execution ? (
              <LumenCompactMetrics
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
              <LumenText as="p">{labels.usage.executionUnavailable}</LumenText>
            )}
          </HbarLumenDisclosure>
        </LumenFrame>
      ) : gitReport ? (
        <LumenFrame as="main" className="hbar-app-react-git-status">
          {gitReport.gap && (
            <LumenText as="p" className="hbar-app-react-status-gap" role="status">
              {labels.git.gap}
            </LumenText>
          )}
          <LumenFrame as="section">
            <LumenText as="h2">{labels.git.title}</LumenText>
            {!gitStatus?.root ? (
              <LumenText as="p" className="hbar-app-react-git-empty" role="status">
                {labels.git.noRepository}
              </LumenText>
            ) : (
              <LumenCompactMetrics
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
          </LumenFrame>
          {gitStatus?.root && (
            <>
              <LumenFrame as="section">
                <LumenText as="h2">{labels.git.activity}</LumenText>
                {!gitReport.head && <LumenText as="p" className="hbar-app-react-git-empty">{labels.git.emptyHistory}</LumenText>}
                <LumenCompactMetrics
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
              </LumenFrame>
              <LumenFrame as="section">
                <LumenText as="h2">{labels.git.timeline}</LumenText>
                {gitReport.totals.commits === 0 ? (
                  <LumenText as="p">{labels.git.noCommits}</LumenText>
                ) : (
                  <LumenFrame className="hbar-app-react-git-charts">
                    <LumenFrame as="article" className="is-commits">
                      <LumenText as="h3">{labels.git.commits}</LumenText>
                      <LumenBarSeries
                        label={labels.git.commits}
                        points={gitReport.points.map((point) => ({
                          id: String(point.start),
                          value: point.commits,
                          label: `${labels.git.formatCommitDate(new Date(point.start).toISOString())} · ${labels.number(point.commits)} ${labels.git.commits} · ${labels.number(point.autoCommits)} ${labels.git.automatic} · ${labels.number(point.manualCommits)} ${labels.git.manual} · ${labels.number(point.externalCommits)} ${labels.git.external}`,
                        }))}
                        selectedId={entry.gitBucketStart === null ? null : String(entry.gitBucketStart)}
                        selectLabel={(point) => labels.git.selectBucket(point.label)}
                        onSelect={selectGitBucket}
                        empty={<LumenText as="p">{labels.git.noCommits}</LumenText>}
                      />
                    </LumenFrame>
                    <LumenFrame as="article" className="is-files">
                      <LumenText as="h3">{labels.git.files}</LumenText>
                      <LumenBarSeries
                        label={labels.git.files}
                        points={gitReport.points.map((point) => ({
                          id: String(point.start),
                          value: point.filesChanged,
                          label: `${labels.git.formatCommitDate(new Date(point.start).toISOString())} · ${labels.number(point.filesChanged)} ${labels.git.filesChanged}`,
                        }))}
                        selectedId={entry.gitBucketStart === null ? null : String(entry.gitBucketStart)}
                        selectLabel={(point) => labels.git.selectBucket(point.label)}
                        onSelect={selectGitBucket}
                        empty={<LumenText as="p">{labels.git.noCommits}</LumenText>}
                      />
                    </LumenFrame>
                    <LumenFrame as="article" className="is-changes">
                      <LumenText as="h3">{labels.git.changes}</LumenText>
                      <LumenBarSeries
                        label={labels.git.changes}
                        points={gitReport.points.map((point) => ({
                          id: String(point.start),
                          value: point.additions + point.deletions,
                          label: `${labels.git.formatCommitDate(new Date(point.start).toISOString())} · +${labels.number(point.additions)} / -${labels.number(point.deletions)}`,
                        }))}
                        selectedId={entry.gitBucketStart === null ? null : String(entry.gitBucketStart)}
                        selectLabel={(point) => labels.git.selectBucket(point.label)}
                        onSelect={selectGitBucket}
                        empty={<LumenText as="p">{labels.git.noCommits}</LumenText>}
                      />
                    </LumenFrame>
                  </LumenFrame>
                )}
              </LumenFrame>
              <LumenFrame as="section">
                <LumenText as="h2">{labels.git.recentCommits}</LumenText>
                {selectedGitPoint && (
                  <LumenFrame className="hbar-app-react-git-bucket-filter" role="status">
                    <LumenText as="span">
                      {labels.git.selectedBucket(
                        labels.git.formatCommitDate(new Date(selectedGitPoint.start).toISOString()),
                        visibleGitCommits.length,
                      )}
                    </LumenText>
                    <LumenButton
                      onClick={() => invoke('statusWorkspace.selectGitBucket', { instanceId, bucketStart: null })}
                    >
                      {labels.git.showAllCommits}
                    </LumenButton>
                  </LumenFrame>
                )}
                {visibleGitCommits.length === 0 ? (
                  <LumenText as="p">{labels.git.noCommits}</LumenText>
                ) : (
                  <LumenFrame className="hbar-app-react-git-commits">
                    {visibleGitCommits.map((commit) => (
                      <HbarLumenDisclosure
                        key={commit.sha}
                        label={
                          <>
                            <LumenText as="code">{commit.shortSha}</LumenText>
                            <LumenText as="span">
                              <LumenText as="strong">{commit.subject}</LumenText>
                              <LumenText as="small">
                                {labels.git.commitMetadata(
                                  labels.git[
                                    commit.provenance.source === 'auto' ? 'automatic' : commit.provenance.source
                                  ],
                                  labels.git.formatCommitDate(commit.committedAt ?? commit.authoredAt),
                                )}
                              </LumenText>
                            </LumenText>
                          </>
                        }
                      >
                        <LumenCollection as="dl">
                          <LumenFrame>
                            <LumenCollectionItem as="dt">{labels.git.commitAuthor}</LumenCollectionItem>
                            <LumenCollectionItem as="dd">{commit.author}</LumenCollectionItem>
                          </LumenFrame>
                          <LumenFrame>
                            <LumenCollectionItem as="dt">{labels.git.commitDate}</LumenCollectionItem>
                            <LumenCollectionItem as="dd">{labels.git.formatCommitDate(commit.committedAt ?? commit.authoredAt)}</LumenCollectionItem>
                          </LumenFrame>
                          <LumenFrame>
                            <LumenCollectionItem as="dt">{labels.git.commitSource}</LumenCollectionItem>
                            <LumenCollectionItem as="dd">
                              {labels.git[commit.provenance.source === 'auto' ? 'automatic' : commit.provenance.source]}
                            </LumenCollectionItem>
                          </LumenFrame>
                          {commit.provenance.sessionId && (
                            <LumenFrame>
                              <LumenCollectionItem as="dt">{labels.git.session}</LumenCollectionItem>
                              <LumenCollectionItem as="dd">{commit.provenance.sessionId}</LumenCollectionItem>
                            </LumenFrame>
                          )}
                          {commit.provenance.runId && (
                            <LumenFrame>
                              <LumenCollectionItem as="dt">{labels.git.run}</LumenCollectionItem>
                              <LumenCollectionItem as="dd">{commit.provenance.runId}</LumenCollectionItem>
                            </LumenFrame>
                          )}
                          {commit.provenance.operationId && (
                            <LumenFrame>
                              <LumenCollectionItem as="dt">{labels.git.operation}</LumenCollectionItem>
                              <LumenCollectionItem as="dd">{commit.provenance.operationId}</LumenCollectionItem>
                            </LumenFrame>
                          )}
                        </LumenCollection>
                      </HbarLumenDisclosure>
                    ))}
                  </LumenFrame>
                )}
                {entry.gitHistoryTruncated && <LumenText as="p" role="status">{labels.git.historyTruncated}</LumenText>}
              </LumenFrame>
              <HbarLumenDisclosure className="hbar-app-react-status-details" label={labels.git.details}>
                <LumenCompactMetrics
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
              </HbarLumenDisclosure>
            </>
          )}
        </LumenFrame>
      ) : null}
    </LumenFrame>
  )
}
