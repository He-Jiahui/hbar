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
  readonly models: string
  readonly series: string
  readonly number: (value: number) => string
  readonly currency: (value: number) => string
  readonly percent: (value: number) => string
  readonly duration: (value: number) => string
  readonly rate: (value: number) => string
  readonly model: (provider: string, model: string) => string
}

export function HbarSessionMonitoring({ labels }: { readonly labels: HbarSessionMonitoringLabels }) {
  const runtime = useHbarRuntime()
  const controls = useHbarRuntimeState(runtime.state.controls)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const report = controls.usage
  const value = (metric: { value: number | null; availability: string }, format: (item: number) => string) =>
    metric.availability === 'available' && metric.value !== null ? format(metric.value) : labels.unavailable
  const close = () => {
    if (surfaces.focusedPanelId)
      void runtime.commands.execute('app.closePanel', { instanceId: surfaces.focusedPanelId }).catch(() => {})
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
