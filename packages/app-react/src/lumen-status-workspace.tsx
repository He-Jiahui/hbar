import { useCallback, useEffect, type ReactNode } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import {
  LumenContentText,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
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
  LumenUsage01,
  LumenUsage08,
  LumenDashboard02,
} from '@lumen/app-ui'
import { workspaceDisplayName, type StatusWorkspaceEntryState } from '@hbar/app-runtime'
import { statusWorkspaceSectionSchema } from '@hbar/contracts/commands/status-workspace'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarLumenDisclosure } from './lumen-disclosure'
import { EchartsChart, type EChartsOption } from './echarts-chart'
import { cpuPerformanceChartData, type CpuReadingKey } from './status-performance-chart-model'
import {
  statusGitMessages,
  statusNavigationMessages,
  statusPerformanceMessages,
  statusUsageMessages,
} from './status-workspace-messages'
import type { StatusGitLabels, StatusNavigationLabels, StatusPerformanceLabels, StatusUsageLabels } from './status-workspace-messages'
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
  readonly sections: Readonly<Record<StatusWorkspaceEntryState['section'], string>>
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

function formatMetric(
  metric: MetricValue,
  labels: Pick<StatusPerformanceLabels, 'unavailable' | 'percent' | 'bytes' | 'bytesPerSecond' | 'milliseconds' | 'number'>,
): string {
  if (metric.availability !== 'available' || metric.value === null) return labels.unavailable(metric.reason)
  if (metric.unit === 'percent') return labels.percent(metric.value)
  if (metric.unit === 'bytes') return labels.bytes(metric.value)
  if (metric.unit === 'bytes_per_second') return labels.bytesPerSecond(metric.value)
  if (metric.unit === 'milliseconds') return labels.milliseconds(metric.value)
  return labels.number(metric.value)
}

function usageValue(metric: UsageMetric, unavailable: HbarStatusWorkspaceLabels['unavailable'], format: (value: number) => string) {
  return metric.availability === 'available' && metric.value !== null
    ? format(metric.value)
    : unavailable(metric.reason)
}

type HbarStatusWorkspaceProps = {
  readonly labels: HbarStatusWorkspaceLabels
  readonly instanceId?: string
  readonly usageDetails?: ReactNode
  readonly renderSection?: (section: 'runs' | 'diagnostics', instanceId: string) => ReactNode
}

export function HbarStatusWorkspace(props: HbarStatusWorkspaceProps) {
  const { labels, ...contentProps } = props
  const navigationMessages: StatusNavigationLabels = {
    title: labels.title,
    description: labels.description,
    close: labels.close,
    refresh: labels.refresh,
    loading: labels.loading,
    tabs: labels.tabs,
    sections: labels.sections,
    error: labels.error,
  }
  const performanceMessages: StatusPerformanceLabels = {
    performanceFilters: labels.performanceFilters,
    gap: labels.gap,
    process: labels.process,
    resources: labels.resources,
    runtime: labels.runtime,
    io: labels.io,
    trends: labels.trends,
    readings: labels.readings,
    processLabels: labels.processLabels,
    unavailable: labels.unavailable,
    number: labels.number,
    percent: labels.percent,
    bytes: labels.bytes,
    bytesPerSecond: labels.bytesPerSecond,
    milliseconds: labels.milliseconds,
    duration: labels.duration,
  }
  const usageMessages: StatusUsageLabels = {
    usage: labels.usage,
    unavailable: labels.unavailable,
    number: labels.number,
    percent: labels.percent,
    duration: labels.duration,
    milliseconds: labels.milliseconds,
    currency: labels.currency,
    tokenCount: labels.tokenCount,
    tokenRate: labels.tokenRate,
  }
  const gitMessages: StatusGitLabels = {
    git: labels.git,
    unavailable: labels.unavailable,
    number: labels.number,
    percent: labels.percent,
    duration: labels.duration,
    milliseconds: labels.milliseconds,
  }
  return (
    <statusNavigationMessages.Provider messages={navigationMessages}>
      <statusPerformanceMessages.Provider messages={performanceMessages}>
        <statusUsageMessages.Provider messages={usageMessages}>
          <statusGitMessages.Provider messages={gitMessages}>
            <StatusWorkspaceContent {...contentProps} />
          </statusGitMessages.Provider>
        </statusUsageMessages.Provider>
      </statusPerformanceMessages.Provider>
    </statusNavigationMessages.Provider>
  )
}

function StatusWorkspaceContent({
  instanceId: requestedInstanceId,
  usageDetails,
  renderSection,
}: Omit<HbarStatusWorkspaceProps, 'labels'>) {
  const { t: n } = statusNavigationMessages.useMessages()
  const { t: p } = statusPerformanceMessages.useMessages()
  const { t: u } = statusUsageMessages.useMessages()
  const { t: g } = statusGitMessages.useMessages()
  const metricLabels = {
    unavailable: p('unavailable'),
    percent: p('percent'),
    bytes: p('bytes'),
    bytesPerSecond: p('bytesPerSecond'),
    milliseconds: p('milliseconds'),
    number: p('number'),
  }
  const runtime = useHbarRuntime()
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const status = useHbarRuntimeState(runtime.state.status)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const displayNames = useHbarRuntimeState(runtime.state.workspaceDisplayNameSnapshot)
  const instanceId = requestedInstanceId ?? (presentation.page.kind === 'status' ? presentation.page.instanceId : null)
  const panel = instanceId ? surfaces.panels[instanceId] : undefined
  const rawSection = panel?.params.section
  const parsedSection = statusWorkspaceSectionSchema.safeParse(rawSection)
  const section = parsedSection.success ? parsedSection.data : 'dashboard'
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
      if (!metric) return { id: key, label: p('readings')[key], value: p('unavailable')(null) }
      if (metric.availability !== 'available' || metric.value === null)
        return {
          id: key,
          label: p('readings')[key],
          value: p('unavailable')(null),
          ...(metric.reason ? { detail: metric.reason } : {}),
        }
      return { id: key, label: p('readings')[key], value: formatMetric(metric, metricLabels) }
    })
  const chart = (key: CpuReadingKey) => {
    const points = cpuPerformanceChartData(report?.points ?? [], key)
    const option: EChartsOption = {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: (report?.points ?? []).map((p) => String(p.start)), axisLabel: { show: false } },
      yAxis: { type: 'value', min: 0, max: 100, minInterval: 10 },
      series: [{ type: 'line', data: points, connectNulls: false, smooth: true, areaStyle: { opacity: 0.15 } }],
    }
    return (
      <EchartsChart
        height="8rem"
        label={p('readings')[key]}
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
          ...(metric.estimated ? { detail: u('usage').estimated } : {}),
        }
      : {
          id,
          label,
          value: p('unavailable')(null),
          ...(metric.reason ? { detail: metric.reason } : {}),
        }
  const latencyItem = (id: string, label: string, metric: UsageLatency) =>
    metric.availability === 'available' && metric.p50 !== null && metric.p95 !== null
      ? { id, label, value: u('usage').p50p95(p('milliseconds')(metric.p50), p('milliseconds')(metric.p95)) }
      : {
          id,
          label,
          value: p('unavailable')(null),
          ...(metric.reason ? { detail: metric.reason } : {}),
        }
  const executionItem = (id: string, label: string, metric: ExecutionMetric) =>
    metric.availability === 'available' && metric.value !== null
      ? {
          id,
          label,
          value: metric.unit === 'milliseconds' ? p('duration')(metric.value) : p('number')(metric.value),
        }
      : {
          id,
          label,
          value: p('unavailable')(metric.reason),
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
  const usageContent = usageReport
    ? {
        overview: {
          title: u('usage').title,
          description: n('description'),
          metrics: [
            {
              id: 'tokens',
              label: u('usage').tokens,
              value: u('tokenCount')(usageReport.totals.input + usageReport.totals.output),
            },
            { id: 'cost', label: u('usage').cost, value: usageValue(usageReport.cost, p('unavailable'), u('currency')) },
            { id: 'runs', label: u('usage').runs, value: p('number')(usageReport.totals.runs) },
          ],
          meters: [],
        },
      }
    : undefined
  const dashboardContent = usageReport
    ? {
        /* throughput projection is mounted by the usage section when the usage dashboard is available. */
        throughput: {
          labels: {
            title: u('usage').title,
            detail: n('description'),
            ranges: u('usage').timeWindow,
            chart: u('usage').timeline,
            chartTitle: u('usage').timeline,
            source: u('usage').models,
            value: u('usage').tokens,
            share: u('usage').cost,
            empty: p('unavailable')(null),
          },
          ranges: [{ id: usageQuery?.window ?? 'current', label: u('usage').timeWindow }],
          initialRangeId: usageQuery?.window ?? 'current',
          series: usageReport.series.map((point) => ({
            id: String(point.start),
            value: point.input + point.output,
          })),
          breakdown: usageReport.models.map((model) => ({
            id: model.modelSelectionId,
            source: `${model.providerId} / ${model.modelId}`,
            value: u('tokenCount')(model.input + model.output),
            share: p('percent')(
              usageReport.totals.input + usageReport.totals.output > 0
                ? ((model.input + model.output) / (usageReport.totals.input + usageReport.totals.output)) * 100
                : 0,
            ),
          })),
          listStrategy: { kind: 'content-grown' as const, expectedMaximum: 12 },
        },
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
        layout="page"
        title={n('title')}
        context={n('description')}
        leading={
          <LumenIconButton label={n('close')} onClick={() => invoke('app.closePanel', { instanceId })}>
            <LumenIcon icon={ArrowLeft} tier="sm" />
          </LumenIconButton>
        }
        actionsLabel={n('refresh')}
        actions={
          <LumenIconButton
            label={n('refresh')}
            disabled={entry?.status === 'loading'}
            onClick={() =>
              invoke(
                section === 'runs'
                  ? 'runBoard.refresh'
                  : section === 'diagnostics'
                    ? 'systemDiagnostics.refresh'
                    : 'statusWorkspace.refresh',
                { instanceId },
              )
            }
          >
            <LumenIcon icon={RefreshCw} tier="sm" />
          </LumenIconButton>
        }
      />
      <LumenFrame as="nav" aria-label={n('tabs')}>
        {statusWorkspaceSectionSchema.options.map((item) => (
          <LumenNavigationButton
            key={item}
            size="s"
            selected={section === item}
            disabled={(item === 'runs' || item === 'diagnostics') && !renderSection}
            onClick={() =>
              invoke('app.openStatus', {
                section: item,
                instanceId,
                binding: panel.binding,
                ...(panel.workspaceId ? { workspaceId: panel.workspaceId } : {}),
                ...(panel.sessionId ? { sessionId: panel.sessionId } : {}),
              })
            }
          >
            {n('sections')[item]}
          </LumenNavigationButton>
        ))}
      </LumenFrame>
      {section === 'dashboard' && performanceQuery && (
        <>
          <LumenFrame
            className="hbar-app-react-status-controls"
            role="group"
            aria-label={p('performanceFilters').label}
          >
            <LumenFormField controlId="hbar-status-performance-window" label={p('performanceFilters').timeWindow}>
              <LumenPopupSelect
                id="hbar-status-performance-window"
                value={performanceQuery.window}
                disabled={entry?.status === 'loading'}
                options={(['2m', '15m', '1h'] as const).map((window) => ({
                  id: window,
                  label: p('performanceFilters').windows[window],
                }))}
                onValueChange={(window) =>
                  invoke('statusWorkspace.setPerformanceQuery', {
                    instanceId,
                    window,
                    target: performanceQuery.target,
                  })
                }
              />
            </LumenFormField>
            <LumenFormField controlId="hbar-status-performance-target" label={p('performanceFilters').target}>
              <LumenPopupSelect
                id="hbar-status-performance-target"
                value={performanceQuery.target}
                disabled={entry?.status === 'loading'}
                options={(['all', 'system', 'host'] as const).map((target) => ({
                  id: target,
                  label: p('performanceFilters').targets[target],
                }))}
                onValueChange={(target) =>
                  invoke('statusWorkspace.setPerformanceQuery', {
                    instanceId,
                    window: performanceQuery.window,
                    target,
                  })
                }
              />
            </LumenFormField>
          </LumenFrame>
        </>
      )}
      {section === 'usage' && usageContent && (
        <LumenUsage01 content={usageContent} className="hbar-app-react-status-lumen-usage" />
      )}
      {section === 'usage' && usageQuery && (
        <LumenFrame
          className="hbar-app-react-status-controls hbar-app-react-usage-controls"
          role="group"
          aria-label={u('usage').filters}
        >
          <LumenFormField controlId="hbar-status-usage-scope" label={u('usage').scope}>
            <LumenPopupSelect
              id="hbar-status-usage-scope"
              value={usageQuery.scope}
              disabled={entry?.status === 'loading'}
              options={(['global', 'workspace', 'session'] as const).map((scope) => ({
                id: scope,
                label: u('usage').scopes[scope],
                disabled: (scope === 'workspace' && !panel.workspaceId) || (scope === 'session' && !panel.sessionId),
              }))}
              onValueChange={(scope) => setUsageQuery({ scope: scope as typeof usageQuery.scope })}
            />
          </LumenFormField>
          {usageQuery.scope === 'session' && (
            <LumenCheckBox
              label={u('usage').includeDescendants}
              checked={usageQuery.includeDescendants}
              disabled={entry?.status === 'loading'}
              onChange={(event) => setUsageQuery({ includeDescendants: event.currentTarget.checked })}
            />
          )}
          <LumenFormField controlId="hbar-status-usage-window" label={u('usage').timeWindow}>
            <LumenPopupSelect
              id="hbar-status-usage-window"
              value={usageQuery.window}
              disabled={entry?.status === 'loading'}
              options={(['1h', '24h', '7d', '30d'] as const).map((window) => ({
                id: window,
                label: u('usage').windows[window],
              }))}
              onValueChange={(window) => setUsageQuery({ window: window as typeof usageQuery.window })}
            />
          </LumenFormField>
          <HbarLumenDisclosure className="hbar-app-react-status-filter-details" label={u('usage').advancedFilters}>
            <LumenFrame>
              <LumenFormField controlId="hbar-status-usage-aggregation" label={u('usage').aggregation}>
                <LumenPopupSelect
                  id="hbar-status-usage-aggregation"
                  value={usageQuery.aggregation}
                  disabled={entry?.status === 'loading'}
                  options={(['minute', 'hour', 'day'] as const).map((aggregation) => ({
                    id: aggregation,
                    label: u('usage').aggregations[aggregation],
                  }))}
                  onValueChange={(aggregation) =>
                    setUsageQuery({ aggregation: aggregation as typeof usageQuery.aggregation })
                  }
                />
              </LumenFormField>
              <LumenFormField controlId="hbar-status-usage-provider" label={u('usage').provider}>
                <LumenPopupSelect
                  id="hbar-status-usage-provider"
                  value={usageQuery.providerId ?? ''}
                  disabled={entry?.status === 'loading'}
                  options={[
                    { id: '', label: u('usage').allProviders },
                    ...usageProviders.map((providerId) => ({ id: providerId, label: providerId })),
                  ]}
                  selectedLabel={usageQuery.providerId ?? undefined}
                  onValueChange={(providerId) => setUsageQuery({ providerId: providerId || null, modelId: null })}
                />
              </LumenFormField>
              <LumenFormField controlId="hbar-status-usage-model" label={u('usage').modelFilter}>
                <LumenPopupSelect
                  id="hbar-status-usage-model"
                  value={usageQuery.modelId ?? ''}
                  disabled={entry?.status === 'loading'}
                  options={[
                    { id: '', label: u('usage').allModels },
                    ...usageModels.map((modelId) => ({ id: modelId, label: modelId })),
                  ]}
                  selectedLabel={usageQuery.modelId ?? undefined}
                  onValueChange={(modelId) => setUsageQuery({ modelId: modelId || null })}
                />
              </LumenFormField>
            </LumenFrame>
          </HbarLumenDisclosure>
          <LumenActionMenu
            label={u('usage').export}
            items={[
              {
                id: 'json',
                label: usageExport?.status === 'exporting' ? u('usage').exporting : u('usage').exportJson,
                disabled: entry?.status === 'loading' || usageExport?.status === 'exporting',
              },
              {
                id: 'csv',
                label: usageExport?.status === 'exporting' ? u('usage').exporting : u('usage').exportCsv,
                disabled: entry?.status === 'loading' || usageExport?.status === 'exporting',
              },
            ]}
            onAction={(format) => invoke('statusWorkspace.exportUsage', { instanceId, format })}
          />
          {usageExport?.status === 'succeeded' && usageExport.fileName && (
            <LumenContentText context="feedback.message" role="status">
              {u('usage').exported(usageExport.rowCount, usageExport.fileName)}
              {usageExport.incomplete && (
                <LumenContentText context="control.status" className="hbar-app-react-status-export-warning">
                  {u('usage').incompleteExport}
                </LumenContentText>
              )}
            </LumenContentText>
          )}
          {usageExport?.status === 'failed' && usageExport.error && (
            <LumenContentText context="feedback.message" role="alert">
              {n('error')(usageExport.error)}
            </LumenContentText>
          )}
        </LumenFrame>
      )}
      {section === 'git' && gitQuery?.workspaceId && (
        <LumenFrame
          className="hbar-app-react-status-controls hbar-app-react-git-controls"
          role="group"
          aria-label={g('git').filters}
        >
          <LumenFormField controlId="hbar-status-git-repository" label={g('git').repositoryFilter}>
            <LumenPopupSelect
              id="hbar-status-git-repository"
              value={gitQuery.workspaceId}
              disabled={entry?.status === 'loading'}
              options={gitWorkspaces.map((workspace) => ({
                id: workspace.id,
                label: g('git').workspaceOption(workspaceDisplayName(workspace, displayNames), workspace.path),
              }))}
              selectedLabel={
                selectedGitWorkspace
                  ? g('git').workspaceOption(
                      workspaceDisplayName(selectedGitWorkspace, displayNames),
                      selectedGitWorkspace.path,
                    )
                  : gitQuery.workspaceId
              }
              onValueChange={(workspaceId) => setGitQuery({ workspaceId })}
            />
          </LumenFormField>
          <LumenFormField controlId="hbar-status-git-window" label={g('git').timeWindow}>
            <LumenPopupSelect
              id="hbar-status-git-window"
              value={gitQuery.window}
              disabled={entry?.status === 'loading'}
              options={(['7d', '30d', '90d', '1y'] as const).map((window) => ({
                id: window,
                label: g('git').windows[window],
              }))}
              onValueChange={(window) => setGitQuery({ window: window as typeof gitQuery.window })}
            />
          </LumenFormField>
          <HbarLumenDisclosure className="hbar-app-react-status-filter-details" label={g('git').advancedFilters}>
            <LumenFrame className="hbar-app-react-git-source-options" role="group" aria-label={g('git').sources}>
              {(['auto', 'manual', 'external'] as const).map((source) => {
                const checked = gitQuery.sources.includes(source)
                return (
                  <LumenCheckBox
                    key={source}
                    label={g('git')[source === 'auto' ? 'automatic' : source]}
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
      {section === 'runs' || section === 'diagnostics' ? (
        renderSection?.(section, instanceId)
      ) : !entry || entry.status === 'loading' ? (
        <LumenContentText context="section.description" className="hbar-app-react-status-loading">
          {n('loading')}
        </LumenContentText>
      ) : entry.error ||
        (section === 'dashboard' && !report) ||
        (section === 'usage' && !usageReport) ||
        (section === 'git' && !gitReport) ? (
        <LumenContentText context="feedback.message" className="hbar-app-react-status-loading" role="alert">
          {n('error')(entry.error ?? 'CAPABILITY_UNAVAILABLE')}
        </LumenContentText>
      ) : section === 'dashboard' && report ? (
        <LumenFrame as="main" className="hbar-app-react-performance">
          {report.gap && (
            <LumenContentText context="feedback.message" className="hbar-app-react-status-gap" role="status">
              {p('gap')(report.skippedSamples)}
            </LumenContentText>
          )}
          <LumenFrame as="section">
            <LumenContentText context="section.title">{p('resources')}</LumenContentText>
            <LumenCompactMetrics
              label={p('resources')}
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
              <LumenContentText context="section.title">{p('runtime')}</LumenContentText>
              <LumenCompactMetrics
                label={p('runtime')}
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
            <LumenContentText context="section.title">{p('trends')}</LumenContentText>
            <LumenFrame className="hbar-app-react-performance-charts">
              {includeSystem && (
                <LumenFrame as="article">
                  <LumenContentText context="section.subtitle">{p('readings').systemCpuPercent}</LumenContentText>
                  {chart('systemCpuPercent')}
                </LumenFrame>
              )}
              {includeHost && (
                <LumenFrame as="article">
                  <LumenContentText context="section.subtitle">{p('readings').hostCpuPercent}</LumenContentText>
                  {chart('hostCpuPercent')}
                </LumenFrame>
              )}
            </LumenFrame>
          </LumenFrame>
          {includeHost && (
            <HbarLumenDisclosure className="hbar-app-react-status-details" label={p('process')}>
              <LumenCompactMetrics
                label={p('process')}
                metrics={[
                  { id: 'pid', label: p('processLabels').pid, value: p('number')(report.process.pid) },
                  { id: 'platform', label: p('processLabels').platform, value: report.process.platform },
                  { id: 'architecture', label: p('processLabels').architecture, value: report.process.arch },
                  {
                    id: 'uptime',
                    label: p('processLabels').uptime,
                    value: p('duration')(report.process.uptimeMs),
                  },
                  {
                    id: 'processors',
                    label: p('processLabels').processors,
                    value: p('number')(report.process.logicalProcessors),
                  },
                ]}
              />
            </HbarLumenDisclosure>
          )}
          <HbarLumenDisclosure className="hbar-app-react-status-details" label={p('io')}>
            <LumenCompactMetrics
              label={p('io')}
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
                title: u('usage').title,
                description: n('description'),
                value: p('number')(usageReport.totals.input + usageReport.totals.output),
                detail: usageValue(usageReport.cost, p('unavailable'), u('currency')),
                progressLabel: u('usage').tokens,
                tone: 'accent',
                sparkline: usageReport.series.map((point) => ({
                  id: String(point.start),
                  value: point.input + point.output,
                })),
                sparklineLabel: u('usage').timeline,
                metrics: [
                  {
                    id: 'tokens',
                    label: u('usage').tokens,
                    value: p('number')(usageReport.totals.input + usageReport.totals.output),
                  },
                  {
                    id: 'cost',
                    label: u('usage').cost,
                    value: usageValue(usageReport.cost, p('unavailable'), u('currency')),
                  },
                ],
              },
            }}
          />
          {usageReport.gap && (
            <LumenContentText context="feedback.message" className="hbar-app-react-status-gap" role="status">
              {u('usage').gap}
            </LumenContentText>
          )}
          <LumenFrame as="section">
            <LumenContentText context="section.title">{u('usage').title}</LumenContentText>
            <LumenCompactMetrics
              label={u('usage').title}
              metrics={[
                {
                  id: 'tokens',
                  label: u('usage').tokens,
                  value: u('tokenCount')(usageReport.totals.input + usageReport.totals.output),
                },
                { id: 'input', label: u('usage').input, value: p('number')(usageReport.totals.input) },
                { id: 'output', label: u('usage').output, value: p('number')(usageReport.totals.output) },
                { id: 'cache-read', label: u('usage').cacheRead, value: p('number')(usageReport.totals.cacheRead) },
                {
                  id: 'cache-write',
                  label: u('usage').cacheWrite,
                  value: p('number')(usageReport.totals.cacheWrite),
                },
                {
                  id: 'billable',
                  label: u('usage').billable,
                  value: p('number')(usageReport.totals.billableTokens),
                },
                { id: 'runs', label: u('usage').runs, value: p('number')(usageReport.totals.runs) },
                { id: 'attempts', label: u('usage').attempts, value: p('number')(usageReport.totals.attempts) },
                usageItem('cost', u('usage').cost, usageReport.cost, u('currency')),
                usageItem('cache-hit', u('usage').cacheHit, usageReport.cacheHitRate, p('percent')),
              ]}
            />
          </LumenFrame>
          <LumenFrame as="section">
            <LumenContentText context="section.title">{u('usage').rates}</LumenContentText>
            <LumenCompactMetrics
              label={u('usage').rates}
              metrics={[
                usageItem('input-rate', u('usage').inputRate, usageReport.rates.input, u('tokenRate')),
                usageItem('output-rate', u('usage').outputRate, usageReport.rates.output, u('tokenRate')),
                usageItem('total-rate', u('usage').totalRate, usageReport.rates.total, u('tokenRate')),
              ]}
            />
          </LumenFrame>
          <LumenFrame as="section" className="hbar-app-react-usage-latency">
            <LumenContentText context="section.title">{u('usage').latency}</LumenContentText>
            <LumenCompactMetrics
              label={u('usage').latency}
              metrics={[
                latencyItem('first-provider', u('usage').firstProviderEvent, usageReport.latency.firstProviderEvent),
                latencyItem('first-thinking', u('usage').firstThinking, usageReport.latency.firstThinking),
                latencyItem('first-text', u('usage').firstText, usageReport.latency.firstText),
                latencyItem('response', u('usage').response, usageReport.latency.response),
              ]}
            />
          </LumenFrame>
          <LumenFrame as="section">
            <LumenContentText context="section.title">{u('usage').timeline}</LumenContentText>
            {usageReport.series.length > 0 ? (
              <EchartsChart
                height="8rem"
                label={u('usage').timeline}
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
              <LumenContentText context="section.description" className="hbar-app-react-status-empty-chart">
                {p('unavailable')(null)}
              </LumenContentText>
            )}
          </LumenFrame>
          <LumenFrame as="section">
            <LumenContentText context="section.title">{u('usage').models}</LumenContentText>
            {usageReport.models.length === 0 ? (
              <LumenContentText context="section.description">{p('unavailable')(null)}</LumenContentText>
            ) : (
              <LumenCollection as="ul" className="hbar-app-react-usage-models">
                {usageReport.models.map((model) => (
                  <LumenCollectionItem key={model.modelSelectionId}>
                    <LumenContentText context="record.title">
                      {u('usage').model(model.providerId, model.modelId)}
                    </LumenContentText>
                    <LumenContentText context="message.inline">
                      {u('tokenCount')(model.input + model.output)}
                    </LumenContentText>
                    <LumenContentText context="message.inline">
                      {usageValue(model.cost, p('unavailable'), u('currency'))}
                    </LumenContentText>
                  </LumenCollectionItem>
                ))}
              </LumenCollection>
            )}
          </LumenFrame>
          {usageDetails}
          <HbarLumenDisclosure className="hbar-app-react-status-details" label={u('usage').execution}>
            {usageReport.execution ? (
              <LumenCompactMetrics
                label={u('usage').execution}
                metrics={[
                  {
                    id: 'tool-calls',
                    label: u('usage').toolCalls,
                    value: p('number')(usageReport.execution.toolCalls.total),
                    detail: u('usage').toolCallsDetail(
                      usageReport.execution.toolCalls.succeeded,
                      usageReport.execution.toolCalls.failed,
                      usageReport.execution.toolCalls.unknown,
                    ),
                  },
                  executionItem(
                    'request-concurrency',
                    u('usage').requestConcurrency,
                    usageReport.execution.requestConcurrency,
                  ),
                  executionItem(
                    'tool-concurrency',
                    u('usage').toolConcurrency,
                    usageReport.execution.toolConcurrency,
                  ),
                  executionItem('total-duration', u('usage').totalDuration, usageReport.execution.totalRunDuration),
                  latencyItem('run-duration', u('usage').runDuration, usageReport.execution.runDuration),
                  latencyItem('tool-duration', u('usage').toolDuration, usageReport.execution.toolDuration),
                ]}
              />
            ) : (
              <LumenContentText context="section.description">{u('usage').executionUnavailable}</LumenContentText>
            )}
          </HbarLumenDisclosure>
        </LumenFrame>
      ) : gitReport ? (
        <LumenFrame as="main" className="hbar-app-react-git-status">
          {gitReport.gap && (
            <LumenContentText context="feedback.message" className="hbar-app-react-status-gap" role="status">
              {g('git').gap}
            </LumenContentText>
          )}
          <LumenFrame as="section">
            <LumenContentText context="section.title">{g('git').title}</LumenContentText>
            {!gitStatus?.root ? (
              <LumenContentText context="feedback.message" className="hbar-app-react-git-empty" role="status">
                {g('git').noRepository}
              </LumenContentText>
            ) : (
              <LumenCompactMetrics
                label={g('git').repositoryStatus}
                metrics={[
                  { id: 'branch', label: g('git').branch, value: gitStatus.branch ?? g('git').noHead },
                  { id: 'upstream', label: g('git').upstream, value: gitStatus.upstream ?? g('git').noUpstream },
                  {
                    id: 'working-tree',
                    label: g('git').workingTree,
                    value: gitStatus.dirty ? g('git').dirty : g('git').clean,
                    detail: g('git').aheadBehind(gitStatus.ahead, gitStatus.behind),
                  },
                  {
                    id: 'changed-paths',
                    label: g('git').changedPaths,
                    value: p('number')(gitStatus.entries.length),
                  },
                ]}
              />
            )}
          </LumenFrame>
          {gitStatus?.root && (
            <>
              <LumenFrame as="section">
                <LumenContentText context="section.title">{g('git').activity}</LumenContentText>
                {!gitReport.head && (
                  <LumenContentText context="section.description" className="hbar-app-react-git-empty">
                    {g('git').emptyHistory}
                  </LumenContentText>
                )}
                <LumenCompactMetrics
                  label={g('git').activity}
                  metrics={[
                    { id: 'commits', label: g('git').commits, value: p('number')(gitReport.totals.commits) },
                    {
                      id: 'automatic',
                      label: g('git').automatic,
                      value: p('number')(gitReport.totals.autoCommits),
                    },
                    { id: 'manual', label: g('git').manual, value: p('number')(gitReport.totals.manualCommits) },
                    {
                      id: 'external',
                      label: g('git').external,
                      value: p('number')(gitReport.totals.externalCommits),
                    },
                    {
                      id: 'files',
                      label: g('git').filesChanged,
                      value: p('number')(gitReport.totals.filesChanged),
                    },
                    {
                      id: 'additions',
                      label: g('git').additions,
                      value: p('number')(gitReport.totals.additions),
                    },
                    {
                      id: 'deletions',
                      label: g('git').deletions,
                      value: p('number')(gitReport.totals.deletions),
                    },
                  ]}
                />
              </LumenFrame>
              <LumenFrame as="section">
                <LumenContentText context="section.title">{g('git').timeline}</LumenContentText>
                {gitReport.totals.commits === 0 ? (
                  <LumenContentText context="section.description">{g('git').noCommits}</LumenContentText>
                ) : (
                  <LumenFrame className="hbar-app-react-git-charts">
                    <LumenFrame as="article" className="is-commits">
                      <LumenContentText context="section.subtitle">{g('git').commits}</LumenContentText>
                      <EchartsChart
                        height="7rem"
                        label={g('git').commits}
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
                      <LumenContentText context="section.subtitle">{g('git').files}</LumenContentText>
                      <EchartsChart
                        height="7rem"
                        label={g('git').files}
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
                      <LumenContentText context="section.subtitle">{g('git').changes}</LumenContentText>
                      <EchartsChart
                        height="7rem"
                        label={g('git').changes}
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
                <LumenContentText context="section.title">{g('git').recentCommits}</LumenContentText>
                {selectedGitPoint && (
                  <LumenFrame className="hbar-app-react-git-bucket-filter" role="status">
                    <LumenContentText context="message.inline">
                      {g('git').selectedBucket(
                        g('git').formatCommitDate(new Date(selectedGitPoint.start).toISOString()),
                        visibleGitCommits.length,
                      )}
                    </LumenContentText>
                    <LumenButton
                      onClick={() => invoke('statusWorkspace.selectGitBucket', { instanceId, bucketStart: null })}
                    >
                      {g('git').showAllCommits}
                    </LumenButton>
                  </LumenFrame>
                )}
                {visibleGitCommits.length === 0 ? (
                  <LumenContentText context="section.description">{g('git').noCommits}</LumenContentText>
                ) : (
                  <LumenFrame className="hbar-app-react-git-commits">
                    {visibleGitCommits.map((commit) => (
                      <HbarLumenDisclosure
                        key={commit.sha}
                        label={
                          <>
                            <LumenText as="code">{commit.shortSha}</LumenText>
                            <LumenContentText context="control.label">
                              <LumenContentText context="choice.title">{commit.subject}</LumenContentText>
                              <LumenContentText context="choice.description">
                                {g('git').commitMetadata(
                                  g('git')[
                                    commit.provenance.source === 'auto' ? 'automatic' : commit.provenance.source
                                  ],
                                  g('git').formatCommitDate(commit.committedAt ?? commit.authoredAt),
                                )}
                              </LumenContentText>
                            </LumenContentText>
                          </>
                        }
                      >
                        <LumenCollection as="dl">
                          <LumenFrame>
                            <LumenCollectionItem as="dt">{g('git').commitAuthor}</LumenCollectionItem>
                            <LumenCollectionItem as="dd">{commit.author}</LumenCollectionItem>
                          </LumenFrame>
                          <LumenFrame>
                            <LumenCollectionItem as="dt">{g('git').commitDate}</LumenCollectionItem>
                            <LumenCollectionItem as="dd">
                              {g('git').formatCommitDate(commit.committedAt ?? commit.authoredAt)}
                            </LumenCollectionItem>
                          </LumenFrame>
                          <LumenFrame>
                            <LumenCollectionItem as="dt">{g('git').commitSource}</LumenCollectionItem>
                            <LumenCollectionItem as="dd">
                              {g('git')[commit.provenance.source === 'auto' ? 'automatic' : commit.provenance.source]}
                            </LumenCollectionItem>
                          </LumenFrame>
                          {commit.provenance.sessionId && (
                            <LumenFrame>
                              <LumenCollectionItem as="dt">{g('git').session}</LumenCollectionItem>
                              <LumenCollectionItem as="dd">{commit.provenance.sessionId}</LumenCollectionItem>
                            </LumenFrame>
                          )}
                          {commit.provenance.runId && (
                            <LumenFrame>
                              <LumenCollectionItem as="dt">{g('git').run}</LumenCollectionItem>
                              <LumenCollectionItem as="dd">{commit.provenance.runId}</LumenCollectionItem>
                            </LumenFrame>
                          )}
                          {commit.provenance.operationId && (
                            <LumenFrame>
                              <LumenCollectionItem as="dt">{g('git').operation}</LumenCollectionItem>
                              <LumenCollectionItem as="dd">{commit.provenance.operationId}</LumenCollectionItem>
                            </LumenFrame>
                          )}
                        </LumenCollection>
                      </HbarLumenDisclosure>
                    ))}
                  </LumenFrame>
                )}
                {entry.gitHistoryTruncated && (
                  <LumenContentText context="feedback.message" role="status">
                    {g('git').historyTruncated}
                  </LumenContentText>
                )}
              </LumenFrame>
              <HbarLumenDisclosure className="hbar-app-react-status-details" label={g('git').details}>
                <LumenCompactMetrics
                  label={g('git').details}
                  metrics={[
                    { id: 'repository', label: g('git').repository, value: gitReport.repoId },
                    {
                      id: 'head',
                      label: g('git').head,
                      value: gitReport.head?.slice(0, 12) ?? g('git').noHead,
                      ...(gitReport.head ? { detail: gitReport.head } : {}),
                    },
                    { id: 'scanned', label: g('git').scanned, value: p('number')(gitReport.scannedCommits) },
                    { id: 'index', label: g('git').indexMode, value: gitReport.indexMode },
                    { id: 'history', label: g('git').historyPolicy, value: gitReport.historyPolicy },
                    { id: 'time', label: g('git').timeBasis, value: gitReport.timeBasis },
                    { id: 'timezone', label: g('git').timezone, value: gitReport.timezone },
                    { id: 'renames', label: g('git').renames, value: p('number')(gitReport.totals.renames) },
                    {
                      id: 'binary-files',
                      label: g('git').binaryFiles,
                      value: p('number')(gitReport.totals.binaryFiles),
                    },
                    {
                      id: 'binary-lines',
                      label: g('git').binaryChanges,
                      value:
                        gitReport.binaryLineChanges.availability === 'available' &&
                        gitReport.binaryLineChanges.value !== null
                          ? p('number')(gitReport.binaryLineChanges.value)
                          : g('git').binaryUnavailable,
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
