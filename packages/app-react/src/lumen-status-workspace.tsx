import { useCallback, useEffect, type ReactNode } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenContentText,
  LumenButton,
  LumenActionMenu,
  LumenCheckBox,
  LumenCompactMetrics,
  LumenFormField,
  LumenIcon,
  LumenIconButton,
  LumenNavigationButton,
  LumenPageHeader,
  LumenPopupSelect,
  LumenMonitoring01,
  LumenUsage01,
  LumenUsage08,
  LumenDashboard01,
  LumenDashboard02,
  LumenDashboard10,
} from '@lumen/app-ui'
import { workspaceDisplayName, type StatusWorkspaceEntryState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarLumenDisclosure } from './lumen-disclosure'
import { EchartsChart, type EChartsOption } from './echarts-chart'
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

const performanceWindows = ['2m', '15m', '1h'] as const
const performanceTargets = ['all', 'system', 'host'] as const
const usageScopes = ['global', 'workspace', 'session'] as const
const usageWindows = ['1h', '24h', '7d', '30d'] as const
const usageAggregations = ['minute', 'hour', 'day'] as const
const gitWindows = ['7d', '30d', '90d', '1y'] as const

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
    readonly workspaceOption: (name: string, path: string) => string
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
  usageDetails,
}: {
  readonly labels: HbarStatusWorkspaceLabels
  readonly instanceId?: string
  readonly usageDetails?: ReactNode
}) {
  const runtime = useHbarRuntime()
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const status = useHbarRuntimeState(runtime.state.status)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const displayNames = useHbarRuntimeState(runtime.state.workspaceDisplayNameSnapshot)
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
  const gitCommits = new Map<string, NonNullable<StatusWorkspaceEntryState['gitCommits']>[number]>()
  for (const commit of entry?.gitCommits ?? []) {
    if (!gitCommits.has(commit.sha)) gitCommits.set(commit.sha, commit)
  }
  const usageModelsById = new Map<string, UsageReport['models'][number]>()
  for (const model of usageReport?.models ?? []) {
    if (!usageModelsById.has(model.modelSelectionId)) usageModelsById.set(model.modelSelectionId, model)
  }
  const visibleGitCommits = selectedGitPoint
    ? [...gitCommits.values()].filter((commit) => {
        const committedAt = Date.parse(commit.committedAt ?? commit.authoredAt)
        return committedAt >= selectedGitPoint.start && committedAt < selectedGitPoint.end
      })
    : [...gitCommits.values()]
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
  const chart = (key: 'systemCpuPercent' | 'hostCpuPercent') => {
    const points = (report?.points ?? []).map((point) => {
      const metric = point.readings[key]
      return metric.availability === 'available' && metric.value !== null ? metric.value : 0
    })
    const option: EChartsOption = {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: (report?.points ?? []).map((p) => String(p.start)), axisLabel: { show: false } },
      yAxis: { type: 'value', min: 0, max: 100, minInterval: 10 },
      series: [{ type: 'line', data: points, smooth: true, areaStyle: { opacity: 0.15 } }],
    }
    return (
      <EchartsChart
        height="8rem"
        label={labels.readings[key]}
        className="hbar-app-react-status-echarts"
        option={option}
      />
    )
  }
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
  const gitWorkspaces = Object.values(directory.workspaces).sort(
    (left, right) =>
      workspaceDisplayName(left, displayNames).localeCompare(workspaceDisplayName(right, displayNames)) ||
      left.id.localeCompare(right.id),
  )
  const selectedGitWorkspace = gitWorkspaces.find((workspace) => workspace.id === gitQuery?.workspaceId)
  const setGitQuery = (patch: Partial<StatusWorkspaceEntryState['gitQuery']>) => {
    if (!gitQuery?.workspaceId) return
    invoke('statusWorkspace.setGitQuery', { instanceId, ...gitQuery, ...patch })
  }
  const monitoringContent = report
    ? {
        health: {
          labels: {
            title: labels.process,
            detail: labels.description,
            refresh: labels.refresh,
            chart: labels.trends,
            incidents: labels.resources,
            empty: labels.loading,
          },
          metrics: metrics([
            ...(includeSystem ? (['systemCpuPercent'] as const) : []),
            ...(includeHost ? (['hostCpuPercent'] as const) : []),
          ]).map((item) => ({ ...item, tone: 'neutral' as const })),
          series: (report.points ?? []).map((point) => {
            const key = includeHost && !includeSystem ? 'hostCpuPercent' : 'systemCpuPercent'
            const metric = point.readings[key]
            return {
              id: String(point.start),
              value: metric.availability === 'available' && metric.value !== null ? metric.value : 0,
            }
          }),
          incidents: [],
          listStrategy: { kind: 'content-grown' as const, expectedMaximum: 12 },
        },
      }
    : undefined
  const usageContent = usageReport
    ? {
        overview: {
          title: labels.usage.title,
          description: labels.description,
          metrics: [
            {
              id: 'tokens',
              label: labels.usage.tokens,
              value: labels.tokenCount(usageReport.totals.input + usageReport.totals.output),
            },
            { id: 'cost', label: labels.usage.cost, value: usageValue(usageReport.cost, labels, labels.currency) },
            { id: 'runs', label: labels.usage.runs, value: labels.number(usageReport.totals.runs) },
          ],
          meters: [],
        },
      }
    : undefined
  const dashboardContent = report
    ? {
        overview: {
          labels: {
            title: labels.title,
            detail: labels.description,
            period: labels.performanceFilters.timeWindow,
            chart: (label: string) => label,
            empty: labels.unavailable(null),
          },
          metrics: metrics(['systemCpuPercent', 'hostCpuPercent']),
          listStrategy: { kind: 'content-grown' as const, expectedMaximum: 8 },
        },
        explorer: {
          labels: {
            title: labels.title,
            detail: labels.description,
            measures: labels.performanceFilters.target,
            chart: (label: string) => label,
            empty: labels.unavailable(null),
          },
          measures: (['systemCpuPercent', 'hostCpuPercent'] as const).map((key) => ({
            id: key,
            label: labels.readings[key],
            series: (report.points ?? []).map((point) => ({
              id: String(point.start),
              value:
                point.readings[key].availability === 'available' && point.readings[key].value !== null
                  ? point.readings[key].value
                  : 0,
            })),
          })),
          initialMeasureId: includeHost && !includeSystem ? 'hostCpuPercent' : 'systemCpuPercent',
        },
        /* throughput projection is mounted by the usage section when the usage dashboard is available. */
        throughput: usageReport
          ? {
              labels: {
                title: labels.usage.title,
                detail: labels.description,
                ranges: labels.usage.timeWindow,
                chart: labels.usage.timeline,
                chartTitle: labels.usage.timeline,
                source: labels.usage.models,
                value: labels.usage.tokens,
                share: labels.usage.cost,
                empty: labels.unavailable(null),
              },
              ranges: [{ id: usageQuery?.window ?? 'current', label: labels.usage.timeWindow }],
              initialRangeId: usageQuery?.window ?? 'current',
              series: usageReport.series.map((point) => ({
                id: String(point.start),
                value: point.input + point.output,
              })),
              breakdown: usageReport.models.map((model) => ({
                id: model.modelSelectionId,
                source: `${model.providerId} / ${model.modelId}`,
                value: labels.tokenCount(model.input + model.output),
                share: labels.percent(
                  usageReport.totals.input + usageReport.totals.output > 0
                    ? ((model.input + model.output) / (usageReport.totals.input + usageReport.totals.output)) * 100
                    : 0,
                ),
              })),
              listStrategy: { kind: 'content-grown' as const, expectedMaximum: 12 },
            }
          : undefined,
      }
    : undefined
  const toggleGitSource = (source: StatusWorkspaceEntryState['gitQuery']['sources'][number], checked: boolean) => {
    if (!gitQuery) return
    const sources = (['auto', 'manual', 'external'] as const).filter((candidate) =>
      candidate === source ? checked : gitQuery.sources.includes(candidate),
    )
    if (sources.length > 0) setGitQuery({ sources })
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
      <LumenFrame as="nav" aria-label={labels.tabs} tabIndex={0}>
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
      {section === 'dashboard' && performanceQuery && dashboardContent && (
        <>
          <LumenDashboard01 content={dashboardContent} className="hbar-app-react-status-lumen-dashboard" />
          <LumenDashboard10 content={dashboardContent} className="hbar-app-react-status-lumen-dashboard" />
          <LumenFrame
            className="hbar-app-react-status-controls"
            role="group"
            aria-label={labels.performanceFilters.label}
          >
            <LumenFormField
              context={null}
              controlId="hbar-status-performance-window"
              label={labels.performanceFilters.timeWindow}
            >
              <LumenPopupSelect
                id="hbar-status-performance-window"
                value={performanceQuery.window}
                disabled={entry?.status === 'loading'}
                options={performanceWindows.map((window) => ({
                  id: window,
                  label: labels.performanceFilters.windows[window],
                }))}
                onValueChange={(value) => {
                  const window = performanceWindows.find((item) => item === value)
                  if (!window) return
                  invoke('statusWorkspace.setPerformanceQuery', {
                    instanceId,
                    window,
                    target: performanceQuery.target,
                  })
                }}
              />
            </LumenFormField>
            <LumenFormField
              context={null}
              controlId="hbar-status-performance-target"
              label={labels.performanceFilters.target}
            >
              <LumenPopupSelect
                id="hbar-status-performance-target"
                value={performanceQuery.target}
                disabled={entry?.status === 'loading'}
                options={performanceTargets.map((target) => ({
                  id: target,
                  label: labels.performanceFilters.targets[target],
                }))}
                onValueChange={(value) => {
                  const target = performanceTargets.find((item) => item === value)
                  if (!target) return
                  invoke('statusWorkspace.setPerformanceQuery', {
                    instanceId,
                    window: performanceQuery.window,
                    target,
                  })
                }}
              />
            </LumenFormField>
          </LumenFrame>
        </>
      )}
      {section === 'dashboard' && monitoringContent && (
        <LumenMonitoring01 content={monitoringContent} className="hbar-app-react-status-lumen-monitoring" />
      )}
      {section === 'usage' && usageContent && (
        <LumenUsage01 content={usageContent} className="hbar-app-react-status-lumen-usage" />
      )}
      {section === 'usage' && usageQuery && (
        <LumenFrame
          className="hbar-app-react-status-controls hbar-app-react-usage-controls"
          role="group"
          aria-label={labels.usage.filters}
        >
          <LumenFormField context={null} controlId="hbar-status-usage-scope" label={labels.usage.scope}>
            <LumenPopupSelect
              id="hbar-status-usage-scope"
              value={usageQuery.scope}
              disabled={entry?.status === 'loading'}
              options={usageScopes.map((scope) => ({
                id: scope,
                label: labels.usage.scopes[scope],
                disabled: (scope === 'workspace' && !panel.workspaceId) || (scope === 'session' && !panel.sessionId),
              }))}
              onValueChange={(value) => {
                const scope = usageScopes.find((item) => item === value)
                if (scope) setUsageQuery({ scope })
              }}
            />
          </LumenFormField>
          {usageQuery.scope === 'session' && (
            <LumenCheckBox
              label={labels.usage.includeDescendants}
              checked={usageQuery.includeDescendants}
              disabled={entry?.status === 'loading'}
              onChange={(event) => setUsageQuery({ includeDescendants: event.currentTarget.checked })}
            />
          )}
          <LumenFormField context={null} controlId="hbar-status-usage-window" label={labels.usage.timeWindow}>
            <LumenPopupSelect
              id="hbar-status-usage-window"
              value={usageQuery.window}
              disabled={entry?.status === 'loading'}
              options={usageWindows.map((window) => ({
                id: window,
                label: labels.usage.windows[window],
              }))}
              onValueChange={(value) => {
                const window = usageWindows.find((item) => item === value)
                if (window) setUsageQuery({ window })
              }}
            />
          </LumenFormField>
          <HbarLumenDisclosure className="hbar-app-react-status-filter-details" label={labels.usage.advancedFilters}>
            <LumenFrame>
              <LumenFormField context={null} controlId="hbar-status-usage-aggregation" label={labels.usage.aggregation}>
                <LumenPopupSelect
                  id="hbar-status-usage-aggregation"
                  value={usageQuery.aggregation}
                  disabled={entry?.status === 'loading'}
                  options={usageAggregations.map((aggregation) => ({
                    id: aggregation,
                    label: labels.usage.aggregations[aggregation],
                  }))}
                  onValueChange={(value) => {
                    const aggregation = usageAggregations.find((item) => item === value)
                    if (aggregation) setUsageQuery({ aggregation })
                  }}
                />
              </LumenFormField>
              <LumenFormField context={null} controlId="hbar-status-usage-provider" label={labels.usage.provider}>
                <LumenPopupSelect
                  id="hbar-status-usage-provider"
                  value={usageQuery.providerId ?? ''}
                  disabled={entry?.status === 'loading'}
                  options={[
                    { id: '', label: labels.usage.allProviders },
                    ...usageProviders.map((providerId) => ({ id: providerId, label: providerId })),
                  ]}
                  selectedLabel={usageQuery.providerId ?? undefined}
                  onValueChange={(providerId) => setUsageQuery({ providerId: providerId || null, modelId: null })}
                />
              </LumenFormField>
              <LumenFormField context={null} controlId="hbar-status-usage-model" label={labels.usage.modelFilter}>
                <LumenPopupSelect
                  id="hbar-status-usage-model"
                  value={usageQuery.modelId ?? ''}
                  disabled={entry?.status === 'loading'}
                  options={[
                    { id: '', label: labels.usage.allModels },
                    ...usageModels.map((modelId) => ({ id: modelId, label: modelId })),
                  ]}
                  selectedLabel={usageQuery.modelId ?? undefined}
                  onValueChange={(modelId) => setUsageQuery({ modelId: modelId || null })}
                />
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
            <LumenContentText context="feedback.paragraph" role="status">
              {labels.usage.exported(usageExport.rowCount, usageExport.fileName)}
              {usageExport.incomplete && (
                <LumenContentText tone="warning" context="inline.text" className="hbar-app-react-status-export-warning">
                  {labels.usage.incompleteExport}
                </LumenContentText>
              )}
            </LumenContentText>
          )}
          {usageExport?.status === 'failed' && usageExport.error && (
            <LumenContentText tone="danger" context="feedback.paragraph" role="alert">
              {labels.error(usageExport.error)}
            </LumenContentText>
          )}
        </LumenFrame>
      )}
      {section === 'git' && gitQuery?.workspaceId && (
        <LumenFrame
          className="hbar-app-react-status-controls hbar-app-react-git-controls"
          role="group"
          aria-label={labels.git.filters}
        >
          <LumenFormField context={null} controlId="hbar-status-git-repository" label={labels.git.repositoryFilter}>
            <LumenPopupSelect
              id="hbar-status-git-repository"
              valueContext="choice.title"
              value={gitQuery.workspaceId}
              disabled={entry?.status === 'loading'}
              options={gitWorkspaces.map((workspace) => ({
                id: workspace.id,
                label: labels.git.workspaceOption(workspaceDisplayName(workspace, displayNames), workspace.path),
              }))}
              selectedLabel={
                selectedGitWorkspace
                  ? labels.git.workspaceOption(
                      workspaceDisplayName(selectedGitWorkspace, displayNames),
                      selectedGitWorkspace.path,
                    )
                  : gitQuery.workspaceId
              }
              onValueChange={(workspaceId) => setGitQuery({ workspaceId })}
            />
          </LumenFormField>
          <LumenFormField context={null} controlId="hbar-status-git-window" label={labels.git.timeWindow}>
            <LumenPopupSelect
              id="hbar-status-git-window"
              value={gitQuery.window}
              disabled={entry?.status === 'loading'}
              options={gitWindows.map((window) => ({
                id: window,
                label: labels.git.windows[window],
              }))}
              onValueChange={(value) => {
                const window = gitWindows.find((item) => item === value)
                if (window) setGitQuery({ window })
              }}
            />
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
        <LumenContentText context="feedback.paragraph" className="hbar-app-react-status-loading">
          {labels.loading}
        </LumenContentText>
      ) : entry.error ||
        (section === 'dashboard' && !report) ||
        (section === 'usage' && !usageReport) ||
        (section === 'git' && !gitReport) ? (
        <LumenContentText
          tone="danger"
          context="feedback.paragraph"
          className="hbar-app-react-status-loading"
          role="alert"
        >
          {labels.error(entry.error ?? 'CAPABILITY_UNAVAILABLE')}
        </LumenContentText>
      ) : section === 'dashboard' && report ? (
        <LumenFrame as="main" className="hbar-app-react-performance">
          {report.gap && (
            <LumenContentText
              tone="warning"
              context="feedback.paragraph"
              className="hbar-app-react-status-gap"
              role="status"
            >
              {labels.gap(report.skippedSamples)}
            </LumenContentText>
          )}
          <LumenFrame as="section">
            <LumenContentText context="section.title">{labels.resources}</LumenContentText>
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
              <LumenContentText context="section.title">{labels.runtime}</LumenContentText>
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
            <LumenContentText context="section.title">{labels.trends}</LumenContentText>
            <LumenFrame className="hbar-app-react-performance-charts">
              {includeSystem && (
                <LumenFrame as="article">
                  <LumenContentText context="section.title" level={3}>
                    {labels.readings.systemCpuPercent}
                  </LumenContentText>
                  {chart('systemCpuPercent')}
                </LumenFrame>
              )}
              {includeHost && (
                <LumenFrame as="article">
                  <LumenContentText context="section.title" level={3}>
                    {labels.readings.hostCpuPercent}
                  </LumenContentText>
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
          {dashboardContent?.throughput && (
            <LumenDashboard02 content={dashboardContent} className="hbar-app-react-status-lumen-dashboard" />
          )}
          <LumenUsage08
            content={{
              compact: {
                title: labels.usage.title,
                description: labels.description,
                value: labels.number(usageReport.totals.input + usageReport.totals.output),
                detail: usageValue(usageReport.cost, labels, labels.currency),
                progressLabel: labels.usage.tokens,
                tone: 'accent',
                sparkline: usageReport.series.map((point) => ({
                  id: String(point.start),
                  value: point.input + point.output,
                })),
                sparklineLabel: labels.usage.timeline,
                metrics: [
                  {
                    id: 'tokens',
                    label: labels.usage.tokens,
                    value: labels.number(usageReport.totals.input + usageReport.totals.output),
                  },
                  {
                    id: 'cost',
                    label: labels.usage.cost,
                    value: usageValue(usageReport.cost, labels, labels.currency),
                  },
                ],
              },
            }}
          />
          {usageReport.gap && (
            <LumenContentText
              tone="warning"
              context="feedback.paragraph"
              className="hbar-app-react-status-gap"
              role="status"
            >
              {labels.usage.gap}
            </LumenContentText>
          )}
          <LumenFrame as="section">
            <LumenContentText context="section.title">{labels.usage.title}</LumenContentText>
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
            <LumenContentText context="section.title">{labels.usage.rates}</LumenContentText>
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
            <LumenContentText context="section.title">{labels.usage.latency}</LumenContentText>
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
            <LumenContentText context="section.title">{labels.usage.timeline}</LumenContentText>
            {usageReport.series.length > 0 ? (
              <EchartsChart
                height="8rem"
                label={labels.usage.timeline}
                className="hbar-app-react-status-echarts"
                option={{
                  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                  xAxis: {
                    type: 'category',
                    data: usageReport.series.map((p) => String(p.start)),
                    axisLabel: { show: false },
                  },
                  yAxis: { type: 'value', minInterval: 1 },
                  series: [{ type: 'bar', data: usageReport.series.map((p) => p.billableTokens) }],
                }}
              />
            ) : (
              <LumenContentText context="empty.description" className="hbar-app-react-status-empty-chart">
                {labels.unavailable(null)}
              </LumenContentText>
            )}
          </LumenFrame>
          <LumenFrame as="section">
            <LumenContentText context="section.title">{labels.usage.models}</LumenContentText>
            {usageReport.models.length === 0 ? (
              <LumenContentText context="empty.description">{labels.unavailable(null)}</LumenContentText>
            ) : (
              <LumenCollection as="ul" className="hbar-app-react-usage-models">
                {[...usageModelsById.values()].map((model) => (
                  <LumenCollectionItem
                    key={model.modelSelectionId}
                    tabIndex={0}
                    aria-label={labels.usage.model(model.providerId, model.modelId)}
                  >
                    <LumenContentText context="collection.title">
                      {labels.usage.model(model.providerId, model.modelId)}
                    </LumenContentText>
                    <LumenContentText context="metric.value">
                      {labels.tokenCount(model.input + model.output)}
                    </LumenContentText>
                    <LumenContentText context="metric.value">
                      {usageValue(model.cost, labels, labels.currency)}
                    </LumenContentText>
                  </LumenCollectionItem>
                ))}
              </LumenCollection>
            )}
          </LumenFrame>
          {usageDetails}
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
              <LumenContentText context="feedback.paragraph">{labels.usage.executionUnavailable}</LumenContentText>
            )}
          </HbarLumenDisclosure>
        </LumenFrame>
      ) : gitReport ? (
        <LumenFrame as="main" className="hbar-app-react-git-status">
          {gitReport.gap && (
            <LumenContentText
              tone="warning"
              context="feedback.paragraph"
              className="hbar-app-react-status-gap"
              role="status"
            >
              {labels.git.gap}
            </LumenContentText>
          )}
          <LumenFrame as="section">
            <LumenContentText context="section.title">{labels.git.title}</LumenContentText>
            {!gitStatus?.root ? (
              <LumenContentText context="empty.description" className="hbar-app-react-git-empty" role="status">
                {labels.git.noRepository}
              </LumenContentText>
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
                <LumenContentText context="section.title">{labels.git.activity}</LumenContentText>
                {!gitReport.head && (
                  <LumenContentText context="empty.description" className="hbar-app-react-git-empty">
                    {labels.git.emptyHistory}
                  </LumenContentText>
                )}
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
                <LumenContentText context="section.title">{labels.git.timeline}</LumenContentText>
                {gitReport.totals.commits === 0 ? (
                  <LumenContentText context="empty.description">{labels.git.noCommits}</LumenContentText>
                ) : (
                  <LumenFrame className="hbar-app-react-git-charts">
                    <LumenFrame as="article" className="is-commits">
                      <LumenContentText context="section.title" level={3}>
                        {labels.git.commits}
                      </LumenContentText>
                      <EchartsChart
                        height="7rem"
                        label={labels.git.commits}
                        className="hbar-app-react-status-echarts"
                        option={{
                          tooltip: { trigger: 'axis' },
                          xAxis: {
                            type: 'category',
                            data: gitReport.points.map((p) => String(p.start)),
                            axisLabel: { show: false },
                          },
                          yAxis: { type: 'value', minInterval: 1 },
                          series: [{ type: 'bar', data: gitReport.points.map((p) => p.commits) }],
                        }}
                      />
                    </LumenFrame>
                    <LumenFrame as="article" className="is-files">
                      <LumenContentText context="section.title" level={3}>
                        {labels.git.files}
                      </LumenContentText>
                      <EchartsChart
                        height="7rem"
                        label={labels.git.files}
                        className="hbar-app-react-status-echarts"
                        option={{
                          tooltip: { trigger: 'axis' },
                          xAxis: {
                            type: 'category',
                            data: gitReport.points.map((p) => String(p.start)),
                            axisLabel: { show: false },
                          },
                          yAxis: { type: 'value', minInterval: 1 },
                          series: [{ type: 'bar', data: gitReport.points.map((p) => p.filesChanged) }],
                        }}
                      />
                    </LumenFrame>
                    <LumenFrame as="article" className="is-changes">
                      <LumenContentText context="section.title" level={3}>
                        {labels.git.changes}
                      </LumenContentText>
                      <EchartsChart
                        height="7rem"
                        label={labels.git.changes}
                        className="hbar-app-react-status-echarts"
                        option={{
                          tooltip: { trigger: 'axis' },
                          xAxis: {
                            type: 'category',
                            data: gitReport.points.map((p) => String(p.start)),
                            axisLabel: { show: false },
                          },
                          yAxis: { type: 'value', minInterval: 1 },
                          series: [{ type: 'bar', data: gitReport.points.map((p) => p.additions + p.deletions) }],
                        }}
                      />
                    </LumenFrame>
                  </LumenFrame>
                )}
              </LumenFrame>
              <LumenFrame as="section">
                <LumenContentText context="section.title">{labels.git.recentCommits}</LumenContentText>
                {selectedGitPoint && (
                  <LumenFrame className="hbar-app-react-git-bucket-filter" role="status">
                    <LumenContentText context="feedback.paragraph">
                      {labels.git.selectedBucket(
                        labels.git.formatCommitDate(new Date(selectedGitPoint.start).toISOString()),
                        visibleGitCommits.length,
                      )}
                    </LumenContentText>
                    <LumenFrame
                      className="hbar-status-action-reading"
                      role="toolbar"
                      aria-label={labels.git.showAllCommits}
                      tabIndex={0}
                    >
                      <LumenButton
                        onClick={() => invoke('statusWorkspace.selectGitBucket', { instanceId, bucketStart: null })}
                      >
                        {labels.git.showAllCommits}
                      </LumenButton>
                    </LumenFrame>
                  </LumenFrame>
                )}
                {visibleGitCommits.length === 0 ? (
                  <LumenContentText context="empty.description">{labels.git.noCommits}</LumenContentText>
                ) : (
                  <LumenFrame className="hbar-app-react-git-commits">
                    {visibleGitCommits.map((commit) => (
                      <HbarLumenDisclosure
                        key={commit.sha}
                        label={
                          <>
                            <LumenContentText context="code.inline">{commit.shortSha}</LumenContentText>
                            <LumenFrame as="span" className="hbar-status-commit-copy">
                              <LumenContentText context="collection.title">{commit.subject}</LumenContentText>
                              <LumenContentText context="collection.detail">
                                {labels.git.commitMetadata(
                                  labels.git[
                                    commit.provenance.source === 'auto' ? 'automatic' : commit.provenance.source
                                  ],
                                  labels.git.formatCommitDate(commit.committedAt ?? commit.authoredAt),
                                )}
                              </LumenContentText>
                            </LumenFrame>
                          </>
                        }
                      >
                        <LumenCollection as="dl">
                          <LumenFrame>
                            <LumenContentText context="detail.term" className="hbar-status-detail-term" tabIndex={0}>
                              {labels.git.commitAuthor}
                            </LumenContentText>
                            <LumenContentText context="detail.value">{commit.author}</LumenContentText>
                          </LumenFrame>
                          <LumenFrame>
                            <LumenContentText context="detail.term" className="hbar-status-detail-term" tabIndex={0}>
                              {labels.git.commitDate}
                            </LumenContentText>
                            <LumenContentText context="detail.value">
                              {labels.git.formatCommitDate(commit.committedAt ?? commit.authoredAt)}
                            </LumenContentText>
                          </LumenFrame>
                          <LumenFrame>
                            <LumenContentText context="detail.term" className="hbar-status-detail-term" tabIndex={0}>
                              {labels.git.commitSource}
                            </LumenContentText>
                            <LumenContentText context="detail.value">
                              {labels.git[commit.provenance.source === 'auto' ? 'automatic' : commit.provenance.source]}
                            </LumenContentText>
                          </LumenFrame>
                          {commit.provenance.sessionId && (
                            <LumenFrame>
                              <LumenContentText context="detail.term" className="hbar-status-detail-term" tabIndex={0}>
                                {labels.git.session}
                              </LumenContentText>
                              <LumenContentText context="detail.value">{commit.provenance.sessionId}</LumenContentText>
                            </LumenFrame>
                          )}
                          {commit.provenance.runId && (
                            <LumenFrame>
                              <LumenContentText context="detail.term" className="hbar-status-detail-term" tabIndex={0}>
                                {labels.git.run}
                              </LumenContentText>
                              <LumenContentText context="detail.value">{commit.provenance.runId}</LumenContentText>
                            </LumenFrame>
                          )}
                          {commit.provenance.operationId && (
                            <LumenFrame>
                              <LumenContentText context="detail.term" className="hbar-status-detail-term" tabIndex={0}>
                                {labels.git.operation}
                              </LumenContentText>
                              <LumenContentText context="detail.value">
                                {commit.provenance.operationId}
                              </LumenContentText>
                            </LumenFrame>
                          )}
                        </LumenCollection>
                      </HbarLumenDisclosure>
                    ))}
                  </LumenFrame>
                )}
                {entry.gitHistoryTruncated && (
                  <LumenContentText context="feedback.paragraph" role="status">
                    {labels.git.historyTruncated}
                  </LumenContentText>
                )}
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
                      ...(gitReport.head ? { detail: gitReport.head } : {}),
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
