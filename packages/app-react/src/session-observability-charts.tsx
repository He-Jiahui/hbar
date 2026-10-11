import { LumenContentText, LumenFrame } from '@lumen/app-ui'
import { useState } from 'react'
import type { SessionObservabilityReport } from '@hbar/contracts/session-observability'
import type { HbarSessionObservabilityLabels } from './session-observability-labels'

export function ObservabilityOutcomes({
  value,
  labels,
}: {
  readonly value: SessionObservabilityReport['tools']
  readonly labels: HbarSessionObservabilityLabels
}) {
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
              {labels.outcomes[kind]} {labels.number(value[kind])}
            </LumenContentText>
          ))}
      </LumenFrame>
    </LumenFrame>
  )
}

export function ObservabilityTokenChart({
  report,
  labels,
}: {
  readonly report: SessionObservabilityReport
  readonly labels: HbarSessionObservabilityLabels
}) {
  const maximum = Math.max(1, ...report.series.map((bucket) => bucket.input + bucket.output))
  const width = 320 / Math.max(1, report.series.length)
  const bucketMs = Math.max(1, Math.ceil((report.range.endedAt - report.range.startedAt + 1) / 40))
  const [focused, setFocused] = useState<number | null>(null)
  const selected = report.series.find((bucket) => bucket.start === focused)
  return (
    <LumenFrame as="section" className="hbar-monitoring-token-timeline">
      <LumenFrame as="header" className="hbar-monitoring-section-heading">
        <LumenContentText context="section.subtitle">{labels.series}</LumenContentText>
        <LumenContentText context="message.inline" tone="muted">
          {labels.chart.peak(Math.max(0, ...report.series.map((bucket) => bucket.input + bucket.output)))}
        </LumenContentText>
      </LumenFrame>
      {report.series.length > 0 && (
        <svg
          className="hbar-monitoring-token-chart"
          viewBox="0 0 320 104"
          role="img"
          aria-label={labels.series}
          onMouseLeave={() => setFocused(null)}
        >
          {[2, 35, 68, 102].map((y) => (
            <path key={y} className="hbar-monitoring-chart-line" d={`M0 ${y}H320`} />
          ))}
          {report.series.map((bucket, index) => {
            const input = (bucket.input / maximum) * 100,
              output = (bucket.output / maximum) * 100
            const caption = labels.chart.bucket(bucket.start, bucket.start + bucketMs, bucket.input, bucket.output)
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
          ? labels.chart.bucket(selected.start, selected.start + bucketMs, selected.input, selected.output)
          : labels.chart.window(report.range.startedAt, report.range.endedAt)}
      </LumenContentText>
    </LumenFrame>
  )
}

export function ObservabilityCompression({
  before,
  after,
  labels,
}: {
  readonly before: number
  readonly after: number
  readonly labels: HbarSessionObservabilityLabels
}) {
  const maximum = Math.max(1, before, after)
  return (
    <LumenFrame
      className="hbar-observability-compression"
      role="img"
      aria-label={`${labels.fields.before} ${labels.number(before)} · ${labels.fields.after} ${labels.number(after)}`}
    >
      <LumenFrame as="span" data-compression="before" style={{ inlineSize: `${(before / maximum) * 100}%` }} />
      <LumenFrame as="span" data-compression="after" style={{ inlineSize: `${(after / maximum) * 100}%` }} />
    </LumenFrame>
  )
}
