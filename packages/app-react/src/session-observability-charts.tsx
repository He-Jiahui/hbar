import { LumenContentText, LumenFrame } from '@lumen/app-ui'
import { useState } from 'react'
import type { SessionObservabilityReport } from '@hbar/contracts/session-observability'
import { sessionObservabilityMessages } from './session-observability-messages'

export function ObservabilityOutcomes({
  value,
}: {
  readonly value: SessionObservabilityReport['tools']
}) {
  const { t } = sessionObservabilityMessages.useMessages()
  const outcomes = ['succeeded', 'failed', 'denied', 'cancelled', 'interrupted', 'unknown', 'pending'] as const
  return (
    <LumenFrame className="hbar-observability-outcomes">
      <LumenFrame className="hbar-observability-outcome-bar" aria-hidden="true">
        {outcomes
          .filter((kind) => value[kind] > 0)
          .map((kind) => (
            <LumenFrame as="span" key={kind} data-outcome={kind} style={{ flexGrow: value[kind] }} />
          ))}
      </LumenFrame>
      <LumenFrame className="hbar-observability-legend">
        {outcomes
          .filter((kind) => value[kind] > 0)
          .map((kind) => (
            <LumenContentText key={kind} context="message.inline" data-outcome={kind}>
              {t('outcomes')[kind]} {t('number')(value[kind])}
            </LumenContentText>
          ))}
      </LumenFrame>
    </LumenFrame>
  )
}

export function ObservabilityTokenChart({
  report,
}: {
  readonly report: SessionObservabilityReport
}) {
  const { t } = sessionObservabilityMessages.useMessages()
  const maximum = Math.max(1, ...report.series.map((bucket) => bucket.input + bucket.output))
  const bucketMs = Math.max(1, Math.ceil((report.range.endedAt - report.range.startedAt + 1) / 40))
  const bucketCount = Math.min(
    40,
    Math.max(1, Math.ceil((report.range.endedAt - report.range.startedAt + 1) / bucketMs)),
  )
  const width = 320 / bucketCount
  const [focused, setFocused] = useState<number | null>(null)
  const selected = report.series.find((bucket) => bucket.start === focused)
  return (
    <LumenFrame as="section" className="hbar-monitoring-token-timeline">
      <LumenFrame as="header" className="hbar-monitoring-section-heading">
        <LumenContentText context="section.subtitle">{t('series')}</LumenContentText>
        <LumenContentText context="message.inline" tone="muted">
          {t('chart').peak(Math.max(0, ...report.series.map((bucket) => bucket.input + bucket.output)))}
        </LumenContentText>
      </LumenFrame>
      {report.series.length > 0 && (
        <svg
          className="hbar-monitoring-token-chart"
          viewBox="0 0 320 104"
          role="img"
          aria-label={t('series')}
          onMouseLeave={() => setFocused(null)}
        >
          {[2, 35, 68, 102].map((y) => (
            <path key={y} className="hbar-monitoring-chart-line" d={`M0 ${y}H320`} />
          ))}
          {report.series.map((bucket) => {
            const index = Math.min(
              bucketCount - 1,
              Math.max(0, Math.round((bucket.start - report.range.startedAt) / bucketMs)),
            )
            const input = (bucket.input / maximum) * 100,
              output = (bucket.output / maximum) * 100
            const caption = t('chart').bucket(bucket.start, bucket.start + bucketMs, bucket.input, bucket.output)
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
                <title>{caption}</title>
                <rect
                  className="hbar-monitoring-chart-input"
                  x={index * width + width * 0.18}
                  y={102 - input}
                  width={width * 0.64}
                  height={input}
                  rx="1"
                />
                <rect
                  className="hbar-monitoring-chart-output"
                  x={index * width + width * 0.18}
                  y={102 - input - output}
                  width={width * 0.64}
                  height={output}
                  rx="1"
                />
              </g>
            )
          })}
        </svg>
      )}
      <LumenContentText
        context="section.description"
        tone="muted"
        className="hbar-monitoring-chart-caption"
        aria-live="polite"
      >
        {selected
          ? t('chart').bucket(selected.start, selected.start + bucketMs, selected.input, selected.output)
          : t('chart').window(report.range.startedAt, report.range.endedAt)}
      </LumenContentText>
    </LumenFrame>
  )
}

export function ObservabilityCompression({
  before,
  after,
}: {
  readonly before: number
  readonly after: number
}) {
  const { t } = sessionObservabilityMessages.useMessages()
  const maximum = Math.max(1, before, after)
  return (
    <LumenFrame
      className="hbar-observability-compression"
      role="img"
      aria-label={`${t('fields').before} ${t('number')(before)} · ${t('fields').after} ${t('number')(after)}`}
    >
      <LumenFrame as="span" data-compression="before" style={{ inlineSize: `${(before / maximum) * 100}%` }} />
      <LumenFrame as="span" data-compression="after" style={{ inlineSize: `${(after / maximum) * 100}%` }} />
    </LumenFrame>
  )
}
