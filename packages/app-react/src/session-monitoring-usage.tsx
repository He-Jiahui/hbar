import { useMemo, useState } from 'react'
import { LumenContentText, LumenButton, LumenCompactMetrics, LumenFrame } from '@lumen/app-ui'
import type { UsageQueryResult } from '@hbar/contracts/commands/usage'
import { HbarLumenDisclosure } from './lumen-disclosure'
import { monitoringModels, monitoringUsageBuckets, SESSION_MONITORING_MODEL_PAGE } from './session-monitoring-model'

export interface HbarSessionMonitoringUsageLabels {
  readonly unavailable: string
  readonly totals: Readonly<Record<'tokens' | 'runs' | 'attempts' | 'cost' | 'cache' | 'rate', string>>
  readonly composition: {
    readonly title: string
    readonly input: string
    readonly output: string
    readonly cacheRead: string
    readonly cacheWrite: string
    readonly billable: string
    readonly summary: (input: number, output: number) => string
  }
  readonly chart: {
    readonly window: (from: number, to: number) => string
    readonly observed: (timestamp: number) => string
    readonly peak: (tokens: number) => string
    readonly bucket: (from: number, to: number, input: number, output: number) => string
    readonly samples: (count: number) => string
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
  readonly moreModels: (count: number) => string
  readonly series: string
  readonly number: (value: number) => string
  readonly tokens: (value: number) => string
  readonly currency: (value: number) => string
  readonly percent: (value: number) => string
  readonly duration: (value: number) => string
  readonly rate: (value: number) => string
  readonly model: (provider: string, model: string) => string
}

function metricValue(
  metric: { readonly value: number | null; readonly availability: string },
  format: (value: number) => string,
  unavailable: string,
): string {
  return metric.availability === 'available' && metric.value !== null ? format(metric.value) : unavailable
}

function TokenTimeline({
  report,
  labels,
}: {
  readonly report: UsageQueryResult
  readonly labels: HbarSessionMonitoringUsageLabels
}) {
  const buckets = useMemo(() => monitoringUsageBuckets(report.series), [report.series])
  const [focused, setFocused] = useState<number | null>(null)
  const maximum = Math.max(0, ...buckets.map((bucket) => bucket.input + bucket.output))
  const point = focused === null ? null : buckets.find((bucket) => bucket.start === focused)
  const width = 320 / Math.max(1, buckets.length)
  return (
    <LumenFrame as="section" className="hbar-monitoring-token-timeline" aria-label={labels.series}>
      <LumenFrame as="header" className="hbar-monitoring-section-heading">
        <LumenContentText context="section.subtitle">{labels.series}</LumenContentText>
        <LumenContentText context="message.inline" tone="muted">
          {labels.chart.peak(maximum)}
        </LumenContentText>
      </LumenFrame>
      {buckets.length > 0 ? (
        <svg
          className="hbar-monitoring-token-chart"
          viewBox="0 0 320 104"
          role="img"
          aria-label={labels.series}
          onMouseLeave={() => setFocused(null)}
        >
          {[0, 33, 66, 100].map((y) => (
            <path key={y} className="hbar-monitoring-chart-line" d={`M0 ${y + 2}H320`} />
          ))}
          {buckets.map((bucket, index) => {
            const input = maximum === 0 ? 0 : (bucket.input / maximum) * 100
            const output = maximum === 0 ? 0 : (bucket.output / maximum) * 100
            const caption = labels.chart.bucket(bucket.start, bucket.end, bucket.input, bucket.output)
            return (
              <g
                key={bucket.start}
                tabIndex={0}
                role="img"
                aria-label={caption}
                data-chart-bucket={bucket.start}
                onFocus={() => setFocused(bucket.start)}
                onBlur={() => setFocused(null)}
                onMouseEnter={() => setFocused(bucket.start)}
              >
                <rect
                  className="hbar-monitoring-chart-input"
                  x={index * width + width * 0.18}
                  y={102 - input}
                  width={width * 0.64}
                  height={input}
                  rx="0.5"
                />
                <rect
                  className="hbar-monitoring-chart-output"
                  x={index * width + width * 0.18}
                  y={102 - input - output}
                  width={width * 0.64}
                  height={output}
                  rx="0.5"
                />
              </g>
            )
          })}
        </svg>
      ) : (
        <LumenContentText context="section.description" tone="muted">
          {labels.unavailable}
        </LumenContentText>
      )}
      <LumenContentText context="section.description" className="hbar-monitoring-chart-caption" aria-live="polite">
        {point
          ? labels.chart.bucket(point.start, point.end, point.input, point.output)
          : labels.chart.window(report.window.from, report.window.to)}
      </LumenContentText>
    </LumenFrame>
  )
}

export function HbarSessionMonitoringUsage({
  report,
  labels,
}: {
  readonly report: UsageQueryResult
  readonly labels: HbarSessionMonitoringUsageLabels
}) {
  const [visibleModels, setVisibleModels] = useState(SESSION_MONITORING_MODEL_PAGE)
  const models = useMemo(() => monitoringModels(report.models), [report.models])
  const total = report.totals.input + report.totals.output
  const inputShare = total === 0 ? 0 : (report.totals.input / total) * 100
  const value = (
    metric: { readonly value: number | null; readonly availability: string },
    format: (item: number) => string,
  ) => metricValue(metric, format, labels.unavailable)
  const metric = (id: string, label: string, text: string, detail?: string) => ({
    id,
    label,
    value: text,
    ...(detail ? { detail } : {}),
  })
  const modelTotal = models.reduce((sum, model) => sum + model.input + model.output, 0)
  const latencyMaximum = Math.max(report.latency.firstText.p95 ?? 0, report.latency.response.p95 ?? 0)
  return (
    <LumenFrame className="hbar-monitoring-usage">
      <LumenFrame className="hbar-monitoring-primary-metrics">
        <LumenCompactMetrics
          label={labels.composition.title}
          metrics={[
            metric('tokens', labels.totals.tokens, labels.number(total)),
            metric('cost', labels.totals.cost, value(report.cost, labels.currency)),
          ]}
        />
      </LumenFrame>
      <LumenCompactMetrics
        label={labels.composition.title}
        metrics={[
          metric('rate', labels.totals.rate, value(report.rates.total, labels.rate)),
          metric('cache', labels.totals.cache, value(report.cacheHitRate, labels.percent)),
          metric('runs', labels.totals.runs, labels.number(report.totals.runs)),
          metric('attempts', labels.totals.attempts, labels.number(report.totals.attempts)),
        ]}
      />
      <LumenFrame as="section" className="hbar-monitoring-composition">
        <LumenContentText context="section.subtitle">{labels.composition.title}</LumenContentText>
        <LumenFrame className="hbar-monitoring-composition-body">
          <svg
            className="hbar-monitoring-token-ring"
            viewBox="0 0 100 100"
            role="img"
            aria-label={labels.composition.summary(report.totals.input, report.totals.output)}
          >
            <circle className="hbar-monitoring-ring-track" cx="50" cy="50" r="40" />
            {total > 0 && (
              <>
                <circle className="hbar-monitoring-ring-output" cx="50" cy="50" r="40" />
                <circle
                  className="hbar-monitoring-ring-input"
                  cx="50"
                  cy="50"
                  r="40"
                  pathLength="100"
                  strokeDasharray={`${inputShare} 100`}
                  transform="rotate(-90 50 50)"
                />
              </>
            )}
          </svg>
          <LumenFrame className="hbar-monitoring-composition-legend">
            <LumenCompactMetrics
              label={labels.composition.title}
              metrics={[
                metric('input', labels.composition.input, labels.number(report.totals.input)),
                metric('output', labels.composition.output, labels.number(report.totals.output)),
                metric('billable', labels.composition.billable, labels.number(report.totals.billableTokens)),
              ]}
            />
          </LumenFrame>
        </LumenFrame>
        <LumenCompactMetrics
          label={labels.composition.title}
          metrics={[
            metric('cache-read', labels.composition.cacheRead, labels.number(report.totals.cacheRead)),
            metric('cache-write', labels.composition.cacheWrite, labels.number(report.totals.cacheWrite)),
          ]}
        />
      </LumenFrame>
      <TokenTimeline report={report} labels={labels} />
      <LumenFrame as="section" className="hbar-monitoring-models" aria-label={labels.models}>
        <LumenContentText context="section.subtitle">{labels.models}</LumenContentText>
        <LumenFrame role="list">
          {models.slice(0, visibleModels).map((model) => {
            const amount = model.input + model.output
            const fraction = modelTotal === 0 ? 0 : amount / modelTotal
            const name = labels.model(model.providerId, model.modelId)
            return (
              <LumenFrame
                role="listitem"
                key={model.modelSelectionId}
                data-model-usage={model.modelSelectionId}
                className="hbar-monitoring-model-row"
              >
                <LumenContentText context="section.description" className="hbar-monitoring-model-name">
                  {name}
                </LumenContentText>
                <LumenFrame className="hbar-monitoring-model-values">
                  <LumenContentText context="message.inline">{labels.tokens(amount)}</LumenContentText>
                  <LumenContentText context="message.inline">{labels.percent(fraction)}</LumenContentText>
                  <LumenContentText context="message.inline">{value(model.cost, labels.currency)}</LumenContentText>
                </LumenFrame>
                <LumenFrame className="hbar-monitoring-model-track" aria-hidden="true">
                  <LumenFrame as="span" style={{ inlineSize: `${fraction * 100}%` }} />
                </LumenFrame>
              </LumenFrame>
            )
          })}
        </LumenFrame>
        {models.length === 0 && (
          <LumenContentText context="section.description" tone="muted">
            {labels.unavailable}
          </LumenContentText>
        )}
        {visibleModels < models.length && (
          <LumenButton
            size="s"
            variant="text"
            indicator="none"
            onClick={() => setVisibleModels((count) => count + SESSION_MONITORING_MODEL_PAGE)}
          >
            {labels.moreModels(Math.min(SESSION_MONITORING_MODEL_PAGE, models.length - visibleModels))}
          </LumenButton>
        )}
      </LumenFrame>
      <HbarLumenDisclosure label={labels.latency.title}>
        <LumenFrame className="hbar-monitoring-latency">
          {[
            { id: 'first-token', label: labels.latency.firstToken, latency: report.latency.firstText },
            { id: 'response', label: labels.latency.response, latency: report.latency.response },
          ].map(({ id, label, latency }) => {
            const available = latency.availability === 'available' && latency.p95 !== null
            return (
              <LumenFrame key={id} className="hbar-monitoring-latency-row">
                <LumenFrame className="hbar-monitoring-section-heading">
                  <LumenContentText context="control.label">{label}</LumenContentText>
                  <LumenContentText context="choice.title">
                    {available ? labels.duration(latency.p95 ?? 0) : labels.unavailable}
                  </LumenContentText>
                </LumenFrame>
                {available && (
                  <LumenFrame className="hbar-monitoring-model-track" aria-hidden="true">
                    <LumenFrame
                      as="span"
                      style={{
                        inlineSize: `${latencyMaximum === 0 ? 0 : ((latency.p95 ?? 0) / latencyMaximum) * 100}%`,
                      }}
                    />
                  </LumenFrame>
                )}
                <LumenContentText context="choice.description" tone="muted">
                  {labels.chart.samples(latency.sampleCount)}
                </LumenContentText>
              </LumenFrame>
            )
          })}
        </LumenFrame>
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
                report.execution.runDuration.availability !== 'available' || report.execution.runDuration.p95 === null
                  ? labels.unavailable
                  : labels.duration(report.execution.runDuration.p95),
              ),
              metric(
                'tool-duration',
                labels.execution.toolDuration,
                report.execution.toolDuration.availability !== 'available' || report.execution.toolDuration.p95 === null
                  ? labels.unavailable
                  : labels.duration(report.execution.toolDuration.p95),
              ),
            ]}
          />
        </HbarLumenDisclosure>
      )}
      <LumenContentText context="section.description" tone="muted" className="hbar-monitoring-observed">
        {labels.chart.observed(report.observedAt)}
      </LumenContentText>
    </LumenFrame>
  )
}
