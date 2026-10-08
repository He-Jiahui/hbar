import { useMemo, useState } from 'react'
import { ChartNoAxesColumnIncreasing, RefreshCw } from 'lucide-react'
import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenContentText,
  LumenButton,
  LumenIconButton,
  LumenIcon,
  LumenCompactMetrics,
  LumenToolPane,
} from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarLumenDisclosure } from './lumen-disclosure'
import { EchartsChart, type EChartsOption } from './echarts-chart'
import './session-monitoring.css'

export interface HbarSessionMonitoringLabels {
  readonly title: string
  readonly description: string
  readonly close: string
  readonly empty: string
  readonly unavailable: string
  readonly gap: string
  readonly refresh: string
  readonly loading: string
  readonly offline: string
  readonly oldResult: string
  readonly error: (code: string) => string
  readonly previous: string
  readonly next: string
  readonly page: (from: number, to: number, total: number) => string
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

export const SESSION_MONITORING_MODELS_PER_PAGE = 8

export function HbarSessionMonitoring({
  labels,
  instanceId: requestedInstanceId,
  targetLabel,
  connected = true,
}: {
  readonly labels: HbarSessionMonitoringLabels
  readonly instanceId?: string
  readonly targetLabel?: string | undefined
  readonly connected?: boolean | undefined
}) {
  const runtime = useHbarRuntime()
  const controls = useHbarRuntimeState(runtime.state.controls)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const instanceId = requestedInstanceId ?? presentation.toolInstanceId
  const report = controls.usage
  const loading = controls.status === 'loading'
  const [pagination, setPagination] = useState<{ readonly report: typeof report; readonly page: number } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const models =
    report?.models.filter(
      (model, index, all) => all.findIndex((other) => other.modelSelectionId === model.modelSelectionId) === index,
    ) ?? []
  const lastPage = Math.max(0, Math.ceil(models.length / SESSION_MONITORING_MODELS_PER_PAGE) - 1)
  const page = pagination?.report === report ? Math.min(pagination?.page ?? 0, lastPage) : 0
  const pageStart = page * SESSION_MONITORING_MODELS_PER_PAGE
  const refresh = () => {
    const sessionId = controls.sessionId
    if (!sessionId) return
    setActionError(null)
    void runtime.commands.execute('sessionControls.refresh', { sessionId }).catch((reason: unknown) => {
      if (runtime.state.controls.getSnapshot().sessionId !== sessionId) return
      setActionError(
        reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
          ? reason.code
          : 'EXECUTION_FAILED',
      )
    })
  }
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
      busy={loading}
      actions={
        <LumenIconButton
          label={labels.refresh}
          disabled={loading || !connected || !controls.sessionId}
          onClick={refresh}
        >
          <LumenIcon icon={RefreshCw} tier="sm" />
        </LumenIconButton>
      }
      className="hbar-app-react-session-monitoring"
    >
      {!connected && (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.offline}
        </LumenContentText>
      )}
      {loading && (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {(controls.errors.usage || actionError) && (
        <LumenContentText context="feedback.paragraph" role="alert">
          {labels.error(controls.errors.usage ?? actionError ?? 'EXECUTION_FAILED')}
        </LumenContentText>
      )}
      {report && (!connected || loading || controls.errors.usage) && (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.oldResult}
        </LumenContentText>
      )}
      {!report ? (
        !loading &&
        !controls.errors.usage &&
        connected && (
          <LumenContentText context="empty.description" className="hbar-app-react-monitoring-empty">
            {labels.empty}
          </LumenContentText>
        )
      ) : (
        <LumenFrame as="main">
          {report.gap && (
            <LumenContentText context="feedback.paragraph" className="hbar-app-react-monitoring-gap" role="status">
              {labels.gap}
            </LumenContentText>
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
            <LumenContentText context="section.title">{labels.series}</LumenContentText>
            {report.series.length > 0 ? (
              <EchartsChart
                height="8rem"
                label={labels.series}
                className="hbar-app-react-monitoring-echarts"
                option={seriesOption}
              />
            ) : (
              <LumenContentText context="empty.description">{labels.unavailable}</LumenContentText>
            )}
          </LumenFrame>
          <HbarLumenDisclosure label={labels.latency.title} labelContext="collection.title">
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
            <HbarLumenDisclosure label={labels.execution.title} labelContext="collection.title">
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
          <HbarLumenDisclosure label={labels.models} labelContext="collection.title">
            {models.length ? (
              <LumenCollection as="ul">
                {models.slice(pageStart, pageStart + SESSION_MONITORING_MODELS_PER_PAGE).map((model) => (
                  <LumenCollectionItem key={model.modelSelectionId}>
                    <LumenContentText context="collection.title">
                      {labels.model(model.providerId, model.modelId)}
                    </LumenContentText>
                    <LumenFrame
                      className="hbar-monitoring-model-metadata"
                      role="group"
                      aria-label={labels.model(model.providerId, model.modelId)}
                      tabIndex={0}
                    >
                      <LumenContentText context="metadata">
                        {labels.tokens(model.input + model.output)}
                      </LumenContentText>
                      <LumenContentText context="metadata">{value(model.cost, labels.currency)}</LumenContentText>
                    </LumenFrame>
                  </LumenCollectionItem>
                ))}
              </LumenCollection>
            ) : (
              <LumenContentText context="empty.description">{labels.unavailable}</LumenContentText>
            )}
            {models.length > SESSION_MONITORING_MODELS_PER_PAGE && (
              <LumenFrame className="hbar-monitoring-pagination" role="group" aria-label={labels.models} tabIndex={0}>
                <LumenButton disabled={page === 0} onClick={() => setPagination({ report, page: page - 1 })}>
                  {labels.previous}
                </LumenButton>
                <LumenContentText context="metadata">
                  {labels.page(
                    pageStart + 1,
                    Math.min(pageStart + SESSION_MONITORING_MODELS_PER_PAGE, models.length),
                    models.length,
                  )}
                </LumenContentText>
                <LumenButton disabled={page === lastPage} onClick={() => setPagination({ report, page: page + 1 })}>
                  {labels.next}
                </LumenButton>
              </LumenFrame>
            )}
          </HbarLumenDisclosure>
        </LumenFrame>
      )}
    </LumenToolPane>
  )
}
