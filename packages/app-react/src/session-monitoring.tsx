import { HbarAppUiButton, HbarAppUiMetricStrip, HbarAppUiSurface } from 'hbar-app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './session-monitoring.css'

export interface HbarSessionMonitoringLabels {
  readonly title: string
  readonly description: string
  readonly close: string
  readonly unavailable: string
  readonly gap: string
  readonly totals: {
    readonly tokens: string
    readonly runs: string
    readonly attempts: string
    readonly cost: string
    readonly cache: string
    readonly rate: string
  }
  readonly latency: { readonly title: string; readonly firstToken: string; readonly response: string }
  readonly execution: {
    readonly title: string
    readonly toolCalls: string
    readonly toolCallsDetail: (succeeded: number, failed: number, unknown: number) => string
    readonly requestConcurrency: string
    readonly toolConcurrency: string
    readonly totalDuration: string
    readonly runDuration: string
    readonly toolDuration: string
  }
  readonly models: string
  readonly series: string
  readonly number: (value: number) => string
  readonly currency: (value: number) => string
  readonly percent: (value: number) => string
  readonly duration: (value: number) => string
  readonly rate: (value: number) => string
  readonly model: (provider: string, model: string) => string
}

export function HbarSessionMonitoring({
  labels,
  instanceId: requestedInstanceId,
}: {
  readonly labels: HbarSessionMonitoringLabels
  readonly instanceId?: string
}) {
  const runtime = useHbarRuntime()
  const controls = useHbarRuntimeState(runtime.state.controls)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const instanceId = requestedInstanceId ?? presentation.toolInstanceId
  const report = controls.usage
  const value = (metric: { value: number | null; availability: string }, format: (item: number) => string) =>
    metric.availability === 'available' && metric.value !== null ? format(metric.value) : labels.unavailable
  const close = () => {
    if (instanceId) void runtime.commands.execute('app.closePanel', { instanceId }).catch(() => {})
  }
  const maximum = Math.max(1, ...(report?.series.map((point) => point.billableTokens) ?? []))
  return (
    <HbarAppUiSurface className="hbar-app-react-session-monitoring">
      <header>
        <div>
          <h1>{labels.title}</h1>
          <p>{labels.description}</p>
        </div>
        <HbarAppUiButton onClick={close}>{labels.close}</HbarAppUiButton>
      </header>
      {!report ? (
        <p className="hbar-app-react-monitoring-empty">{labels.unavailable}</p>
      ) : (
        <main>
          {report.gap && <p role="status">{labels.gap}</p>}
          <HbarAppUiMetricStrip
            metrics={[
              { label: labels.totals.tokens, value: labels.number(report.totals.input + report.totals.output) },
              { label: labels.totals.runs, value: labels.number(report.totals.runs) },
              { label: labels.totals.attempts, value: labels.number(report.totals.attempts) },
              { label: labels.totals.cost, value: value(report.cost, labels.currency) },
              { label: labels.totals.cache, value: value(report.cacheHitRate, labels.percent) },
              { label: labels.totals.rate, value: value(report.rates.total, labels.rate) },
            ]}
          />
          <section>
            <h2>{labels.latency.title}</h2>
            <HbarAppUiMetricStrip
              metrics={[
                {
                  label: labels.latency.firstToken,
                  value:
                    report.latency.firstText.p95 === null
                      ? labels.unavailable
                      : labels.duration(report.latency.firstText.p95),
                },
                {
                  label: labels.latency.response,
                  value:
                    report.latency.response.p95 === null
                      ? labels.unavailable
                      : labels.duration(report.latency.response.p95),
                },
              ]}
            />
          </section>
          {report.execution && (
            <section>
              <h2>{labels.execution.title}</h2>
              <HbarAppUiMetricStrip
                metrics={[
                  {
                    label: labels.execution.toolCalls,
                    value: labels.number(report.execution.toolCalls.total),
                    detail: labels.execution.toolCallsDetail(
                      report.execution.toolCalls.succeeded,
                      report.execution.toolCalls.failed,
                      report.execution.toolCalls.unknown,
                    ),
                  },
                  {
                    label: labels.execution.requestConcurrency,
                    value: value(report.execution.requestConcurrency, labels.number),
                  },
                  {
                    label: labels.execution.toolConcurrency,
                    value: value(report.execution.toolConcurrency, labels.number),
                  },
                  {
                    label: labels.execution.totalDuration,
                    value: value(report.execution.totalRunDuration, labels.duration),
                  },
                  {
                    label: labels.execution.runDuration,
                    value:
                      report.execution.runDuration.p95 === null
                        ? labels.unavailable
                        : labels.duration(report.execution.runDuration.p95),
                  },
                  {
                    label: labels.execution.toolDuration,
                    value:
                      report.execution.toolDuration.p95 === null
                        ? labels.unavailable
                        : labels.duration(report.execution.toolDuration.p95),
                  },
                ]}
              />
            </section>
          )}
          <section>
            <h2>{labels.series}</h2>
            <div className="hbar-app-react-monitoring-series" aria-label={labels.series}>
              {report.series.map((point) => (
                <i
                  key={point.start}
                  style={{
                    blockSize: `${point.billableTokens === 0 ? 0 : Math.max(0.125, point.billableTokens / maximum) * 100}%`,
                  }}
                  title={`${labels.number(point.billableTokens)} tokens`}
                />
              ))}
            </div>
          </section>
          <section>
            <h2>{labels.models}</h2>
            {report.models.length ? (
              <ul>
                {report.models.map((model) => (
                  <li key={model.modelSelectionId}>
                    <strong>{labels.model(model.providerId, model.modelId)}</strong>
                    <span>{labels.number(model.input + model.output)} tokens</span>
                    <span>{value(model.cost, labels.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{labels.unavailable}</p>
            )}
          </section>
        </main>
      )}
    </HbarAppUiSurface>
  )
}
