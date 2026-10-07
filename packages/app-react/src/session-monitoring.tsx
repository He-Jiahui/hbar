import { useMemo } from 'react'
import { ChartNoAxesColumnIncreasing } from 'lucide-react'
import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
  LumenCompactMetrics,
  LumenToolPane,
} from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarLumenDisclosure } from './lumen-disclosure'
import { EchartsChart, type EChartsOption } from './echarts-chart'
import { HbarSessionRunHistory, type HbarSessionRunHistoryLabels } from './session-run-history'
import './session-monitoring.css'

export interface HbarSessionMonitoringLabels {
  readonly history: HbarSessionRunHistoryLabels
  readonly title: string
  readonly description: string
  readonly close: string
  readonly empty: string
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
  readonly tokens: (value: number) => string
  readonly currency: (value: number) => string
  readonly percent: (value: number) => string
  readonly duration: (value: number) => string
  readonly rate: (value: number) => string
  readonly model: (provider: string, model: string) => string
}

export function HbarSessionMonitoring({
  labels,
  instanceId: requestedInstanceId,
  targetLabel,
  connected = false,
}: {
  readonly labels: HbarSessionMonitoringLabels
  readonly instanceId?: string
  readonly targetLabel?: string | undefined
  readonly connected?: boolean
}) {
  const runtime = useHbarRuntime()
  const controls = useHbarRuntimeState(runtime.state.controls)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const instanceId = requestedInstanceId ?? presentation.toolInstanceId
  const sessionId = (instanceId ? surfaces.panels[instanceId]?.sessionId : null) ?? navigation.sessionId
  const report =
    controls.sessionId === sessionId &&
    controls.usage?.scope.kind === 'session' &&
    controls.usage.scope.sessionId === sessionId
      ? controls.usage
      : null
  const value = (metric: { value: number | null; availability: string }, format: (item: number) => string) =>
    metric.availability === 'available' && metric.value !== null ? format(metric.value) : labels.unavailable
  const metric = (id: string, label: string, metricValue: string, detail?: string) => ({
    id,
    label,
    value: metricValue,
    ...(detail ? { detail } : {}),
  })
  const close = () => {
    if (instanceId) void runtime.commands.execute('app.closePanel', { instanceId }).catch(() => {})
  }
  const seriesOption = useMemo<EChartsOption>(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: report?.series.map((p) => String(p.start)) ?? [], axisLabel: { show: false } },
      yAxis: { type: 'value', minInterval: 1 },
      series: [{ type: 'bar', data: report?.series.map((p) => p.billableTokens) ?? [] }],
    }),
    [report?.series],
  )

  return (
    <LumenToolPane
      title={labels.title}
      targetLabel={targetLabel}
      description={labels.description}
      icon={ChartNoAxesColumnIncreasing}
      closeLabel={labels.close}
      onClose={close}
      className="hbar-app-react-session-monitoring"
    >
      <HbarSessionRunHistory sessionId={sessionId} connected={connected} labels={labels.history} />
      {!report ? (
        <LumenText as="p" className="hbar-app-react-monitoring-empty">
          {labels.empty}
        </LumenText>
      ) : (
        <LumenFrame as="main">
          {report.gap && (
            <LumenText as="p" className="hbar-app-react-monitoring-gap" role="status">
              {labels.gap}
            </LumenText>
          )}
          <LumenCompactMetrics
            label={labels.title}
            metrics={[
              metric('tokens', labels.totals.tokens, labels.number(report.totals.input + report.totals.output)),
              metric('cost', labels.totals.cost, value(report.cost, labels.currency)),
              metric('rate', labels.totals.rate, value(report.rates.total, labels.rate)),
              metric('runs', labels.totals.runs, labels.number(report.totals.runs)),
              metric('attempts', labels.totals.attempts, labels.number(report.totals.attempts)),
              metric('cache', labels.totals.cache, value(report.cacheHitRate, labels.percent)),
            ]}
          />
          <LumenFrame as="section">
            <LumenText as="h2">{labels.series}</LumenText>
            {report.series.length > 0 ? (
              <EchartsChart
                height="8rem"
                label={labels.series}
                className="hbar-app-react-monitoring-echarts"
                option={seriesOption}
              />
            ) : (
              <LumenText as="p">{labels.unavailable}</LumenText>
            )}
          </LumenFrame>
          <HbarLumenDisclosure label={labels.latency.title}>
            <LumenCompactMetrics
              label={labels.latency.title}
              metrics={[
                metric(
                  'first-token',
                  labels.latency.firstToken,
                  report.latency.firstText.p95 === null
                    ? labels.unavailable
                    : labels.duration(report.latency.firstText.p95),
                ),
                metric(
                  'response',
                  labels.latency.response,
                  report.latency.response.p95 === null
                    ? labels.unavailable
                    : labels.duration(report.latency.response.p95),
                ),
              ]}
            />
          </HbarLumenDisclosure>
          {report.execution && (
            <HbarLumenDisclosure label={labels.execution.title}>
              <LumenCompactMetrics
                label={labels.execution.title}
                metrics={[
                  metric(
                    'tool-calls',
                    labels.execution.toolCalls,
                    labels.number(report.execution.toolCalls.total),
                    labels.execution.toolCallsDetail(
                      report.execution.toolCalls.succeeded,
                      report.execution.toolCalls.failed,
                      report.execution.toolCalls.unknown,
                    ),
                  ),
                  metric(
                    'request-concurrency',
                    labels.execution.requestConcurrency,
                    value(report.execution.requestConcurrency, labels.number),
                  ),
                  metric(
                    'tool-concurrency',
                    labels.execution.toolConcurrency,
                    value(report.execution.toolConcurrency, labels.number),
                  ),
                  metric(
                    'total-duration',
                    labels.execution.totalDuration,
                    value(report.execution.totalRunDuration, labels.duration),
                  ),
                  metric(
                    'run-duration',
                    labels.execution.runDuration,
                    report.execution.runDuration.p95 === null
                      ? labels.unavailable
                      : labels.duration(report.execution.runDuration.p95),
                  ),
                  metric(
                    'tool-duration',
                    labels.execution.toolDuration,
                    report.execution.toolDuration.p95 === null
                      ? labels.unavailable
                      : labels.duration(report.execution.toolDuration.p95),
                  ),
                ]}
              />
            </HbarLumenDisclosure>
          )}
          <HbarLumenDisclosure label={labels.models}>
            {report.models.length ? (
              <LumenCollection as="ul">
                {report.models.map((model) => (
                  <LumenCollectionItem key={model.modelSelectionId}>
                    <LumenText as="strong" title={labels.model(model.providerId, model.modelId)}>
                      {labels.model(model.providerId, model.modelId)}
                    </LumenText>
                    <LumenText as="span">{labels.tokens(model.input + model.output)}</LumenText>
                    <LumenText as="span">{value(model.cost, labels.currency)}</LumenText>
                  </LumenCollectionItem>
                ))}
              </LumenCollection>
            ) : (
              <LumenText as="p">{labels.unavailable}</LumenText>
            )}
          </HbarLumenDisclosure>
        </LumenFrame>
      )}
    </LumenToolPane>
  )
}
