import { useMemo, useState } from 'react'
import { LumenContentText, LumenButton, LumenCompactMetrics, LumenFrame } from '@lumen/app-ui'
import type { UsageQueryResult } from '@hbar/contracts/commands/usage'
import { HbarLumenDisclosure } from './lumen-disclosure'
import { monitoringModels, monitoringUsageBuckets, SESSION_MONITORING_MODEL_PAGE } from './session-monitoring-model'
import { createMessageScope } from './messages'

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

export const sessionMonitoringUsageMessages = createMessageScope<HbarSessionMonitoringUsageLabels>()

function metricValue(
  metric: { readonly value: number | null; readonly availability: string },
  format: (value: number) => string,
  unavailable: string,
): string {
  return metric.availability === 'available' && metric.value !== null ? format(metric.value) : unavailable
}

function TokenTimeline({
  report,
}: {
  readonly report: UsageQueryResult
}) {
  const { t } = sessionMonitoringUsageMessages.useMessages()
  const buckets = useMemo(() => monitoringUsageBuckets(report.series), [report.series])
  const [focused, setFocused] = useState<number | null>(null)
  const maximum = Math.max(0, ...buckets.map((bucket) => bucket.input + bucket.output))
  const point = focused === null ? null : buckets.find((bucket) => bucket.start === focused)
  const width = 320 / Math.max(1, buckets.length)
  return (
    <LumenFrame as="section" className="hbar-monitoring-token-timeline" aria-label={t('series')}>
      <LumenFrame as="header" className="hbar-monitoring-section-heading">
        <LumenContentText context="section.subtitle">{t('series')}</LumenContentText>
        <LumenContentText context="message.inline" tone="muted">
          {t('chart').peak(maximum)}
        </LumenContentText>
      </LumenFrame>
      {buckets.length > 0 ? (
        <svg
          className="hbar-monitoring-token-chart"
          viewBox="0 0 320 104"
          role="img"
          aria-label={t('series')}
          onMouseLeave={() => setFocused(null)}
        >
          {[0, 33, 66, 100].map((y) => (
            <path key={y} className="hbar-monitoring-chart-line" d={`M0 ${y + 2}H320`} />
          ))}
          {buckets.map((bucket, index) => {
            const input = maximum === 0 ? 0 : (bucket.input / maximum) * 100
            const output = maximum === 0 ? 0 : (bucket.output / maximum) * 100
            const caption = t('chart').bucket(bucket.start, bucket.end, bucket.input, bucket.output)
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
          {t('unavailable')}
        </LumenContentText>
      )}
      <LumenContentText context="section.description" className="hbar-monitoring-chart-caption" aria-live="polite">
        {point
          ? t('chart').bucket(point.start, point.end, point.input, point.output)
          : t('chart').window(report.window.from, report.window.to)}
      </LumenContentText>
    </LumenFrame>
  )
}

export function SessionMonitoringUsageView({
  report,
}: {
  readonly report: UsageQueryResult
}) {
  const { t } = sessionMonitoringUsageMessages.useMessages()
  const [visibleModels, setVisibleModels] = useState(SESSION_MONITORING_MODEL_PAGE)
  const models = useMemo(() => monitoringModels(report.models), [report.models])
  const total = report.totals.input + report.totals.output
  const inputShare = total === 0 ? 0 : (report.totals.input / total) * 100
  const value = (
    metric: { readonly value: number | null; readonly availability: string },
    format: (item: number) => string,
  ) => metricValue(metric, format, t('unavailable'))
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
          label={t('composition').title}
          metrics={[
            metric('tokens', t('totals').tokens, t('number')(total)),
            metric('cost', t('totals').cost, value(report.cost, t('currency'))),
          ]}
        />
      </LumenFrame>
      <LumenCompactMetrics
        label={t('composition').title}
        metrics={[
          metric('rate', t('totals').rate, value(report.rates.total, t('rate'))),
          metric('cache', t('totals').cache, value(report.cacheHitRate, t('percent'))),
          metric('runs', t('totals').runs, t('number')(report.totals.runs)),
          metric('attempts', t('totals').attempts, t('number')(report.totals.attempts)),
        ]}
      />
      <LumenFrame as="section" className="hbar-monitoring-composition">
        <LumenContentText context="section.subtitle">{t('composition').title}</LumenContentText>
        <LumenFrame className="hbar-monitoring-composition-body">
          <svg
            className="hbar-monitoring-token-ring"
            viewBox="0 0 100 100"
            role="img"
            aria-label={t('composition').summary(report.totals.input, report.totals.output)}
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
              label={t('composition').title}
              metrics={[
                metric('input', t('composition').input, t('number')(report.totals.input)),
                metric('output', t('composition').output, t('number')(report.totals.output)),
                metric('billable', t('composition').billable, t('number')(report.totals.billableTokens)),
              ]}
            />
          </LumenFrame>
        </LumenFrame>
        <LumenCompactMetrics
          label={t('composition').title}
          metrics={[
            metric('cache-read', t('composition').cacheRead, t('number')(report.totals.cacheRead)),
            metric('cache-write', t('composition').cacheWrite, t('number')(report.totals.cacheWrite)),
          ]}
        />
      </LumenFrame>
      <TokenTimeline report={report} />
      <LumenFrame as="section" className="hbar-monitoring-models" aria-label={t('models')}>
        <LumenContentText context="section.subtitle">{t('models')}</LumenContentText>
        <LumenFrame role="list">
          {models.slice(0, visibleModels).map((model) => {
            const amount = model.input + model.output
            const fraction = modelTotal === 0 ? 0 : amount / modelTotal
            const name = t('model')(model.providerId, model.modelId)
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
                  <LumenContentText context="message.inline">{t('tokens')(amount)}</LumenContentText>
                  <LumenContentText context="message.inline">{t('percent')(fraction)}</LumenContentText>
                  <LumenContentText context="message.inline">{value(model.cost, t('currency'))}</LumenContentText>
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
            {t('unavailable')}
          </LumenContentText>
        )}
        {visibleModels < models.length && (
          <LumenButton
            size="s"
            variant="text"
            indicator="none"
            onClick={() => setVisibleModels((count) => count + SESSION_MONITORING_MODEL_PAGE)}
          >
            {t('moreModels')(Math.min(SESSION_MONITORING_MODEL_PAGE, models.length - visibleModels))}
          </LumenButton>
        )}
      </LumenFrame>
      <HbarLumenDisclosure label={t('latency').title}>
        <LumenFrame className="hbar-monitoring-latency">
          {[
            { id: 'first-token', label: t('latency').firstToken, latency: report.latency.firstText },
            { id: 'response', label: t('latency').response, latency: report.latency.response },
          ].map(({ id, label, latency }) => {
            const available = latency.availability === 'available' && latency.p95 !== null
            return (
              <LumenFrame key={id} className="hbar-monitoring-latency-row">
                <LumenFrame className="hbar-monitoring-section-heading">
                  <LumenContentText context="control.label">{label}</LumenContentText>
                  <LumenContentText context="choice.title">
                    {available ? t('duration')(latency.p95 ?? 0) : t('unavailable')}
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
                  {t('chart').samples(latency.sampleCount)}
                </LumenContentText>
              </LumenFrame>
            )
          })}
        </LumenFrame>
      </HbarLumenDisclosure>
      {report.execution && (
        <HbarLumenDisclosure label={t('execution').title}>
          <LumenCompactMetrics
            label={t('execution').title}
            metrics={[
              metric(
                'tool-calls',
                t('execution').toolCalls,
                t('number')(report.execution.toolCalls.total),
                t('execution').toolCallsDetail(
                  report.execution.toolCalls.succeeded,
                  report.execution.toolCalls.failed,
                  report.execution.toolCalls.unknown,
                ),
              ),
              metric(
                'request-concurrency',
                t('execution').requestConcurrency,
                value(report.execution.requestConcurrency, t('number')),
              ),
              metric(
                'tool-concurrency',
                t('execution').toolConcurrency,
                value(report.execution.toolConcurrency, t('number')),
              ),
              metric(
                'total-duration',
                t('execution').totalDuration,
                value(report.execution.totalRunDuration, t('duration')),
              ),
              metric(
                'run-duration',
                t('execution').runDuration,
                report.execution.runDuration.availability !== 'available' || report.execution.runDuration.p95 === null
                  ? t('unavailable')
                  : t('duration')(report.execution.runDuration.p95),
              ),
              metric(
                'tool-duration',
                t('execution').toolDuration,
                report.execution.toolDuration.availability !== 'available' || report.execution.toolDuration.p95 === null
                  ? t('unavailable')
                  : t('duration')(report.execution.toolDuration.p95),
              ),
            ]}
          />
        </HbarLumenDisclosure>
      )}
      <LumenContentText context="section.description" tone="muted" className="hbar-monitoring-observed">
        {t('chart').observed(report.observedAt)}
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
  return (
    <sessionMonitoringUsageMessages.Provider messages={labels}>
      <SessionMonitoringUsageView report={report} />
    </sessionMonitoringUsageMessages.Provider>
  )
}
