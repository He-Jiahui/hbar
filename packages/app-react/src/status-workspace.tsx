import { useCallback, useEffect } from 'react'
import { HbarAppUiButton, HbarAppUiMetricStrip, HbarAppUiSurface } from 'hbar-app-ui'
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
    readonly provenance: string
    readonly changes: string
    readonly timeline: string
    readonly policy: string
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

export function HbarStatusWorkspace({ labels }: { readonly labels: HbarStatusWorkspaceLabels }) {
  const runtime = useHbarRuntime()
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const status = useHbarRuntimeState(runtime.state.status)
  const instanceId = surfaces.focusedPanelId
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
  const readings = report?.current?.readings
  const performanceQuery = entry?.performanceQuery
  const includeSystem = performanceQuery?.target !== 'host'
  const includeHost = performanceQuery?.target !== 'system'
  const metrics = (keys: readonly ReadingKey[]) =>
    keys.map((key) => {
      const metric = readings?.[key]
      if (!metric) return { label: labels.readings[key], value: '—' }
      if (metric.availability !== 'available' || metric.value === null)
        return {
          label: labels.readings[key],
          value: labels.unavailable(null),
          ...(metric.reason ? { detail: metric.reason } : {}),
        }
      return { label: labels.readings[key], value: formatMetric(metric, labels) }
    })
  const chart = (key: 'systemCpuPercent' | 'hostCpuPercent') => (
    <div className="hbar-app-react-performance-series" aria-label={labels.readings[key]}>
      {(report?.points ?? []).map((point) => {
        const metric = point.readings[key]
        const value = metric.availability === 'available' && metric.value !== null ? metric.value : 0
        return (
          <i
            key={point.start}
            className={metric.availability === 'available' ? undefined : 'is-unavailable'}
            style={{ blockSize: `${Math.max(0, Math.min(100, value))}%` }}
            title={`${labels.observedAt(point.start)} · ${formatMetric(metric, labels)}`}
          />
        )
      })}
    </div>
  )
  const usageMaximum = Math.max(1, ...(usageReport?.series.map((point) => point.billableTokens) ?? []))
  const usageItem = (label: string, metric: UsageMetric, format: (value: number) => string) =>
    metric.availability === 'available' && metric.value !== null
      ? {
          label,
          value: format(metric.value),
          ...(metric.estimated ? { detail: labels.usage.estimated } : {}),
        }
      : {
          label,
          value: labels.unavailable(null),
          ...(metric.reason ? { detail: metric.reason } : {}),
        }
  const latencyItem = (label: string, metric: UsageLatency) =>
    metric.availability === 'available' && metric.p50 !== null && metric.p95 !== null
      ? { label, value: labels.usage.p50p95(labels.milliseconds(metric.p50), labels.milliseconds(metric.p95)) }
      : {
          label,
          value: labels.unavailable(null),
          ...(metric.reason ? { detail: metric.reason } : {}),
        }
  const executionItem = (label: string, metric: ExecutionMetric) =>
    metric.availability === 'available' && metric.value !== null
      ? {
          label,
          value: metric.unit === 'milliseconds' ? labels.duration(metric.value) : labels.number(metric.value),
        }
      : {
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

  return (
    <HbarAppUiSurface className="hbar-app-react-status-workspace">
      <header>
        <div>
          <h1>{labels.title}</h1>
          <p>{labels.description}</p>
        </div>
        <div>
          <HbarAppUiButton
            disabled={entry?.status === 'loading'}
            onClick={() => invoke('statusWorkspace.refresh', { instanceId })}
          >
            {labels.refresh}
          </HbarAppUiButton>
          <HbarAppUiButton onClick={() => invoke('app.closePanel', { instanceId })}>{labels.close}</HbarAppUiButton>
        </div>
      </header>
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
            <select
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
            </select>
          </label>
          <label>
            <span>{labels.performanceFilters.target}</span>
            <select
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
            </select>
          </label>
        </div>
      )}
      {section === 'usage' && usageQuery && (
        <div className="hbar-app-react-status-controls" role="group" aria-label={labels.usage.filters}>
          <label>
            <span>{labels.usage.scope}</span>
            <select
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
            </select>
          </label>
          {usageQuery.scope === 'session' && (
            <label>
              <input
                type="checkbox"
                checked={usageQuery.includeDescendants}
                disabled={entry?.status === 'loading'}
                onChange={(event) => setUsageQuery({ includeDescendants: event.currentTarget.checked })}
              />
              <span>{labels.usage.includeDescendants}</span>
            </label>
          )}
          <label>
            <span>{labels.usage.timeWindow}</span>
            <select
              value={usageQuery.window}
              disabled={entry?.status === 'loading'}
              onChange={(event) => setUsageQuery({ window: event.currentTarget.value as typeof usageQuery.window })}
            >
              {(['1h', '24h', '7d', '30d'] as const).map((window) => (
                <option key={window} value={window}>
                  {labels.usage.windows[window]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{labels.usage.aggregation}</span>
            <select
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
            </select>
          </label>
          <label>
            <span>{labels.usage.provider}</span>
            <select
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
            </select>
          </label>
          <label>
            <span>{labels.usage.modelFilter}</span>
            <select
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
            </select>
          </label>
          <div className="hbar-app-react-status-export-actions">
            <HbarAppUiButton
              disabled={entry?.status === 'loading' || usageExport?.status === 'exporting'}
              onClick={() => invoke('statusWorkspace.exportUsage', { instanceId, format: 'json' })}
            >
              {usageExport?.status === 'exporting' ? labels.usage.exporting : labels.usage.exportJson}
            </HbarAppUiButton>
            <HbarAppUiButton
              disabled={entry?.status === 'loading' || usageExport?.status === 'exporting'}
              onClick={() => invoke('statusWorkspace.exportUsage', { instanceId, format: 'csv' })}
            >
              {usageExport?.status === 'exporting' ? labels.usage.exporting : labels.usage.exportCsv}
            </HbarAppUiButton>
          </div>
          {usageExport?.status === 'succeeded' && usageExport.fileName && (
            <p role="status">
              {labels.usage.exported(usageExport.rowCount, usageExport.fileName)}
              {usageExport.incomplete ? ` ${labels.usage.incompleteExport}` : ''}
            </p>
          )}
          {usageExport?.status === 'failed' && usageExport.error && (
            <p role="alert">{labels.error(usageExport.error)}</p>
          )}
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
        <main>
          {report.gap && <p role="status">{labels.gap(report.skippedSamples)}</p>}
          {includeHost && (
            <section>
              <h2>{labels.process}</h2>
              <HbarAppUiMetricStrip
                metrics={[
                  { label: labels.processLabels.pid, value: labels.number(report.process.pid) },
                  { label: labels.processLabels.platform, value: report.process.platform },
                  { label: labels.processLabels.architecture, value: report.process.arch },
                  { label: labels.processLabels.uptime, value: labels.duration(report.process.uptimeMs) },
                  { label: labels.processLabels.processors, value: labels.number(report.process.logicalProcessors) },
                ]}
              />
            </section>
          )}
          <section>
            <h2>{labels.resources}</h2>
            <HbarAppUiMetricStrip
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
              <HbarAppUiMetricStrip
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
            <h2>{labels.io}</h2>
            <HbarAppUiMetricStrip
              metrics={metrics([
                ...(includeHost ? (['hostDiskReadBytesPerSecond', 'hostDiskWriteBytesPerSecond'] as const) : []),
                ...(includeSystem
                  ? (['systemNetworkReceiveBytesPerSecond', 'systemNetworkTransmitBytesPerSecond'] as const)
                  : []),
              ])}
            />
          </section>
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
        </main>
      ) : section === 'usage' && usageReport ? (
        <main className="hbar-app-react-global-usage">
          {usageReport.gap && <p role="status">{labels.usage.gap}</p>}
          <section>
            <h2>{labels.usage.title}</h2>
            <HbarAppUiMetricStrip
              metrics={[
                {
                  label: labels.usage.tokens,
                  value: labels.tokenCount(usageReport.totals.input + usageReport.totals.output),
                },
                { label: labels.usage.runs, value: labels.number(usageReport.totals.runs) },
                { label: labels.usage.attempts, value: labels.number(usageReport.totals.attempts) },
                usageItem(labels.usage.cost, usageReport.cost, labels.currency),
                usageItem(labels.usage.cacheHit, usageReport.cacheHitRate, labels.percent),
              ]}
            />
          </section>
          <section>
            <h2>{labels.usage.totals}</h2>
            <HbarAppUiMetricStrip
              metrics={[
                { label: labels.usage.input, value: labels.number(usageReport.totals.input) },
                { label: labels.usage.output, value: labels.number(usageReport.totals.output) },
                { label: labels.usage.cacheRead, value: labels.number(usageReport.totals.cacheRead) },
                { label: labels.usage.cacheWrite, value: labels.number(usageReport.totals.cacheWrite) },
                { label: labels.usage.billable, value: labels.number(usageReport.totals.billableTokens) },
              ]}
            />
          </section>
          <section>
            <h2>{labels.usage.rates}</h2>
            <HbarAppUiMetricStrip
              metrics={[
                usageItem(labels.usage.inputRate, usageReport.rates.input, labels.tokenRate),
                usageItem(labels.usage.outputRate, usageReport.rates.output, labels.tokenRate),
                usageItem(labels.usage.totalRate, usageReport.rates.total, labels.tokenRate),
              ]}
            />
          </section>
          <section>
            <h2>{labels.usage.latency}</h2>
            <HbarAppUiMetricStrip
              metrics={[
                latencyItem(labels.usage.firstProviderEvent, usageReport.latency.firstProviderEvent),
                latencyItem(labels.usage.firstThinking, usageReport.latency.firstThinking),
                latencyItem(labels.usage.firstText, usageReport.latency.firstText),
                latencyItem(labels.usage.response, usageReport.latency.response),
              ]}
            />
          </section>
          <section>
            <h2>{labels.usage.timeline}</h2>
            <div className="hbar-app-react-usage-series" aria-label={labels.usage.timeline}>
              {usageReport.series.map((point) => (
                <i
                  key={point.start}
                  style={{
                    blockSize: `${point.billableTokens === 0 ? 0 : Math.max(0.08, point.billableTokens / usageMaximum) * 100}%`,
                  }}
                  title={`${labels.observedAt(point.start)} · ${labels.tokenCount(point.billableTokens)}`}
                />
              ))}
            </div>
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
          <section>
            <h2>{labels.usage.execution}</h2>
            {usageReport.execution ? (
              <HbarAppUiMetricStrip
                metrics={[
                  {
                    label: labels.usage.toolCalls,
                    value: labels.number(usageReport.execution.toolCalls.total),
                    detail: labels.usage.toolCallsDetail(
                      usageReport.execution.toolCalls.succeeded,
                      usageReport.execution.toolCalls.failed,
                      usageReport.execution.toolCalls.unknown,
                    ),
                  },
                  executionItem(labels.usage.requestConcurrency, usageReport.execution.requestConcurrency),
                  executionItem(labels.usage.toolConcurrency, usageReport.execution.toolConcurrency),
                  executionItem(labels.usage.totalDuration, usageReport.execution.totalRunDuration),
                  latencyItem(labels.usage.runDuration, usageReport.execution.runDuration),
                  latencyItem(labels.usage.toolDuration, usageReport.execution.toolDuration),
                ]}
              />
            ) : (
              <p>{labels.usage.executionUnavailable}</p>
            )}
          </section>
        </main>
      ) : gitReport ? (
        <main className="hbar-app-react-git-status">
          {gitReport.gap && <p role="status">{labels.git.gap}</p>}
          <section>
            <h2>{labels.git.title}</h2>
            <HbarAppUiMetricStrip
              metrics={[
                { label: labels.git.repository, value: gitReport.repoId },
                { label: labels.git.head, value: gitReport.head?.slice(0, 12) ?? labels.git.noHead },
                { label: labels.git.scanned, value: labels.number(gitReport.scannedCommits) },
                { label: labels.git.indexMode, value: gitReport.indexMode },
              ]}
            />
          </section>
          <section>
            <h2>{labels.git.provenance}</h2>
            <HbarAppUiMetricStrip
              metrics={[
                { label: labels.git.commits, value: labels.number(gitReport.totals.commits) },
                { label: labels.git.automatic, value: labels.number(gitReport.totals.autoCommits) },
                { label: labels.git.manual, value: labels.number(gitReport.totals.manualCommits) },
                { label: labels.git.external, value: labels.number(gitReport.totals.externalCommits) },
              ]}
            />
          </section>
          <section>
            <h2>{labels.git.changes}</h2>
            <HbarAppUiMetricStrip
              metrics={[
                { label: labels.git.filesChanged, value: labels.number(gitReport.totals.filesChanged) },
                { label: labels.git.additions, value: labels.number(gitReport.totals.additions) },
                { label: labels.git.deletions, value: labels.number(gitReport.totals.deletions) },
                { label: labels.git.renames, value: labels.number(gitReport.totals.renames) },
                { label: labels.git.binaryFiles, value: labels.number(gitReport.totals.binaryFiles) },
                {
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
          </section>
          <section>
            <h2>{labels.git.timeline}</h2>
            <div className="hbar-app-react-git-charts">
              <article>
                <h3>{labels.git.commits}</h3>
                <div className="hbar-app-react-git-series" aria-label={labels.git.commits}>
                  {gitReport.points.map((point) => {
                    const maximum = Math.max(1, ...gitReport.points.map((item) => item.commits))
                    return (
                      <span
                        key={point.start}
                        style={{
                          blockSize: `${point.commits === 0 ? 0 : Math.max(0.08, point.commits / maximum) * 100}%`,
                        }}
                        title={`${labels.observedAt(point.start)} · ${labels.number(point.commits)} ${labels.git.commits}`}
                      >
                        {point.autoCommits > 0 && <i className="is-auto" style={{ flex: point.autoCommits }} />}
                        {point.manualCommits > 0 && <i className="is-manual" style={{ flex: point.manualCommits }} />}
                        {point.externalCommits > 0 && (
                          <i className="is-external" style={{ flex: point.externalCommits }} />
                        )}
                      </span>
                    )
                  })}
                </div>
                <footer>
                  <span className="is-auto">{labels.git.automatic}</span>
                  <span className="is-manual">{labels.git.manual}</span>
                  <span className="is-external">{labels.git.external}</span>
                </footer>
              </article>
              <article>
                <h3>{labels.git.changes}</h3>
                <div className="hbar-app-react-git-series" aria-label={labels.git.changes}>
                  {gitReport.points.map((point) => {
                    const value = point.additions + point.deletions
                    const maximum = Math.max(1, ...gitReport.points.map((item) => item.additions + item.deletions))
                    return (
                      <span
                        key={point.start}
                        style={{ blockSize: `${value === 0 ? 0 : Math.max(0.08, value / maximum) * 100}%` }}
                        title={`${labels.observedAt(point.start)} · +${labels.number(point.additions)} / -${labels.number(point.deletions)}`}
                      >
                        {point.additions > 0 && <i className="is-addition" style={{ flex: point.additions }} />}
                        {point.deletions > 0 && <i className="is-deletion" style={{ flex: point.deletions }} />}
                      </span>
                    )
                  })}
                </div>
                <footer>
                  <span className="is-addition">{labels.git.additions}</span>
                  <span className="is-deletion">{labels.git.deletions}</span>
                </footer>
              </article>
            </div>
          </section>
          <section>
            <h2>{labels.git.policy}</h2>
            <HbarAppUiMetricStrip
              metrics={[
                { label: labels.git.historyPolicy, value: gitReport.historyPolicy },
                { label: labels.git.timeBasis, value: gitReport.timeBasis },
                { label: labels.git.timezone, value: gitReport.timezone },
              ]}
            />
          </section>
        </main>
      ) : null}
    </HbarAppUiSurface>
  )
}
