import { useCallback, useEffect } from 'react'
import { HbarAppUiButton, HbarAppUiMetricStrip, HbarAppUiSurface } from 'hbar-app-ui'
import type { MetricValue, PerformanceReadings } from '@hbar/contracts/metrics'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './status-workspace.css'

type ReadingKey = keyof PerformanceReadings

export interface HbarStatusWorkspaceLabels {
  readonly title: string
  readonly description: string
  readonly close: string
  readonly refresh: string
  readonly loading: string
  readonly tabs: string
  readonly sections: Readonly<Record<'dashboard' | 'usage' | 'git', string>>
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
  readonly unavailable: (reason: string | null) => string
  readonly number: (value: number) => string
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
  const readings = report?.current?.readings
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
      {!entry || entry.status === 'loading' ? (
        <p className="hbar-app-react-status-loading">{labels.loading}</p>
      ) : entry.error || !report ? (
        <p className="hbar-app-react-status-loading" role="alert">
          {labels.error(entry.error ?? 'CAPABILITY_UNAVAILABLE')}
        </p>
      ) : (
        <main>
          {report.gap && <p role="status">{labels.gap(report.skippedSamples)}</p>}
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
          <section>
            <h2>{labels.resources}</h2>
            <HbarAppUiMetricStrip
              metrics={metrics([
                'systemCpuPercent',
                'hostCpuPercent',
                'systemLoad1',
                'systemMemoryUsedBytes',
                'systemMemoryTotalBytes',
                'hostRssBytes',
                'hostHeapUsedBytes',
              ])}
            />
          </section>
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
          <section>
            <h2>{labels.io}</h2>
            <HbarAppUiMetricStrip
              metrics={metrics([
                'hostDiskReadBytesPerSecond',
                'hostDiskWriteBytesPerSecond',
                'systemNetworkReceiveBytesPerSecond',
                'systemNetworkTransmitBytesPerSecond',
              ])}
            />
          </section>
          <section>
            <h2>{labels.trends}</h2>
            <div className="hbar-app-react-performance-charts">
              <article>
                <h3>{labels.readings.systemCpuPercent}</h3>
                {chart('systemCpuPercent')}
              </article>
              <article>
                <h3>{labels.readings.hostCpuPercent}</h3>
                {chart('hostCpuPercent')}
              </article>
            </div>
          </section>
        </main>
      )}
    </HbarAppUiSurface>
  )
}
