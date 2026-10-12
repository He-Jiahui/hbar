'use client'

import * as React from 'react'
import { LumenButton } from './primitives'
import type { LumenUsageOverviewContent } from './usage'
import './usage-overview.css'

export interface LumenUsageChartPoint {
  readonly id: string
  readonly label: string
  readonly accessibleLabel: string
  readonly detail: string
  /** Host-normalized proportions, not token counts. Non-finite values render as zero. */
  readonly totalRatio: number
  readonly outputShare: number
}

export interface LumenUsageOverviewChart {
  readonly inputLabel: string
  readonly outputLabel: string
  readonly hint: string
  readonly emptyLabel: string
  /** Short, host-aggregated series (normally 3–7, recommended maximum 31).
   * Beyond seven points the plot owns horizontal scrolling; never silently truncate.
   * Hosts must aggregate/page unbounded histories before passing a series.
   */
  readonly points: readonly LumenUsageChartPoint[]
}

function boundedRatio(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
}

function uniqueRecords<Item extends { readonly id: string }>(items: readonly Item[]): Item[] {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}

function UsageOverviewPlot({ chart }: { readonly chart: LumenUsageOverviewChart }) {
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const points = uniqueRecords(chart.points)
  const active = points.find((point) => point.id === activeId)
  return (
    <div className="lumen-usage-overview-chart">
      <div className="lumen-usage-overview-chart-heading">
        <div className="lumen-usage-overview-legend">
          <span>
            <i data-series="input" />
            {chart.inputLabel}
          </span>
          <span>
            <i data-series="output" />
            {chart.outputLabel}
          </span>
        </div>
        <p className="lumen-usage-overview-detail">{active?.detail ?? chart.hint}</p>
      </div>
      {points.length === 0 ? (
        <p className="lumen-usage-overview-empty">{chart.emptyLabel}</p>
      ) : (
        <div className="lumen-usage-overview-plot" data-overflow={points.length > 7}>
          {points.map((point) => (
            <LumenButton
              type="button"
              variant="text"
              indicator="none"
              key={point.id}
              className="lumen-usage-overview-bar"
              aria-label={point.accessibleLabel}
              data-active={active?.id === point.id}
              onMouseEnter={() => setActiveId(point.id)}
              onMouseLeave={() => setActiveId(null)}
              onFocus={() => setActiveId(point.id)}
              onBlur={() => setActiveId(null)}
            >
              <div
                className="lumen-usage-overview-stack"
                style={{ blockSize: `${boundedRatio(point.totalRatio) * 100}%` }}
              >
                <div data-series="output" style={{ blockSize: `${boundedRatio(point.outputShare) * 100}%` }} />
                <div data-series="input" style={{ blockSize: `${(1 - boundedRatio(point.outputShare)) * 100}%` }} />
              </div>
              <span>{point.label}</span>
            </LumenButton>
          ))}
        </div>
      )}
    </div>
  )
}

export function UsageOverviewChartContent({
  content,
  chart,
}: {
  readonly content: LumenUsageOverviewContent
  readonly chart: LumenUsageOverviewChart
}) {
  const range = content.range
  return (
    <div className="lumen-usage-overview hbar-app-ui-usage-variant-1">
      <div className="lumen-usage-overview-heading">
        <div className="lumen-usage-overview-title">
          <h2>{content.title}</h2>
          <p>{content.description}</p>
        </div>
        {range ? (
          <div className="lumen-usage-overview-tabs" role="tablist" aria-label={range.label}>
            {uniqueRecords(range.options).map((option) => (
              <LumenButton
                type="button"
                variant="text"
                size="s"
                indicatorState={option.id === range.value ? 'selected' : 'idle'}
                role="tab"
                key={option.id}
                aria-selected={option.id === range.value}
                onClick={() => range.onChange(option.id)}
              >
                {option.label}
              </LumenButton>
            ))}
          </div>
        ) : null}
      </div>
      <div className="lumen-usage-overview-card">
        <div className="lumen-usage-overview-metrics">
          {content.metrics.map((metric, index) => (
            <div key={metric.id ?? `${metric.label}:${index}`}>
              <p>{metric.label}</p>
              <p>{metric.value}</p>
            </div>
          ))}
        </div>
        <UsageOverviewPlot key={range?.value} chart={chart} />
      </div>
    </div>
  )
}
