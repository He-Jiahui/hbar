'use client'

import * as React from 'react'
import { LumenButton } from './primitives'
import type {
  LumenAnalyticsReferenceChart,
  LumenAnalyticsReferenceContent,
  LumenAnalyticsReferenceEntry,
  LumenAnalyticsReferenceMetric,
} from './analytics-reference-contracts'

function unique<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter(({ id }) => {
    if (!id.trim() || seen.has(id)) {
      return false
    }
    seen.add(id)
    return true
  })
}
function finite(value: number): number {
  return Number.isFinite(value) ? value : 0
}
function percent(value: number): number {
  return Math.max(0, Math.min(100, finite(value)))
}
function line(points: readonly number[], maximum: number): string {
  return points
    .map(
      (value, index) =>
        `${(index * 100) / Math.max(1, points.length - 1)},${100 - percent((value / Math.max(1, maximum)) * 100)}`,
    )
    .join(' ')
}
function Spark({ points }: { readonly points: readonly number[] }) {
  return (
    <svg
      className="lumen-analytics-reference-spark"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline points={line(points, Math.max(1, ...points))} />
    </svg>
  )
}
function keyboard(event: React.KeyboardEvent<SVGElement>, select: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    select()
  }
}
function Tabs({
  content,
  display = false,
}: {
  readonly content: LumenAnalyticsReferenceContent
  readonly display?: boolean | undefined
}) {
  const choices = display && content.kind === 'cohort' ? content.displayChoices : content.choices
  const selected = display && content.kind === 'cohort' ? content.displayId : content.selectedId
  if (!choices.length) {
    return null
  }
  return (
    <div className="lumen-analytics-reference-tabs" role="tablist" aria-label={content.labels.choices}>
      {unique(choices).map((choice) => (
        <LumenButton
          key={choice.id}
          role="tab"
          aria-selected={choice.id === selected}
          variant="text"
          tone={choice.id === selected ? 'primary' : 'neutral'}
          indicatorState={choice.id === selected ? 'selected' : 'idle'}
          disabled={choice.disabled}
          onClick={() => content.onSelect(display ? 'display' : 'range', choice.id)}
        >
          {choice.label}
        </LumenButton>
      ))}
    </div>
  )
}
function Header({ content }: { readonly content: LumenAnalyticsReferenceContent }) {
  return (
    <header className="lumen-analytics-reference-header">
      <div className="lumen-analytics-reference-heading">
        <h2>{content.title}</h2>
        {content.subtitle ? <p>{content.subtitle}</p> : null}
        {content.value ? (
          <p className="lumen-analytics-reference-headline">
            <strong>{content.value}</strong>
            {content.delta ? <span>{content.delta}</span> : null}
          </p>
        ) : null}
      </div>
      <div className="lumen-analytics-reference-controls">
        {content.kind === 'live' ? (
          <React.Fragment>
            <span className="lumen-analytics-reference-live-state">
              {content.paused ? content.pausedLabel : content.liveLabel}
            </span>
            <LumenButton variant="outlined" onClick={() => content.onFlag('paused', !content.paused)}>
              {content.paused ? content.resumeLabel : content.pauseLabel}
            </LumenButton>
          </React.Fragment>
        ) : null}
        <Tabs content={content} />
        {content.kind === 'cohort' ? <Tabs content={content} display /> : null}
      </div>
    </header>
  )
}
function Empty({ content }: { readonly content: LumenAnalyticsReferenceContent }) {
  return (
    <p className="lumen-analytics-reference-empty" role="status">
      {content.labels.empty}
    </p>
  )
}
function Metric({ metric }: { readonly metric: LumenAnalyticsReferenceMetric }) {
  return (
    <div className={`lumen-analytics-reference-metric-card is-${metric.tone ?? 'neutral'}`}>
      <h3>{metric.label}</h3>
      <strong className="lumen-analytics-reference-metric-value">{metric.value}</strong>
      {metric.delta ? <p className="lumen-analytics-reference-metric-delta">{metric.delta}</p> : null}
      {metric.points?.length ? <Spark points={metric.points} /> : null}
      {metric.detail ? <p className="lumen-analytics-reference-metric-detail">{metric.detail}</p> : null}
    </div>
  )
}
function Metrics({
  metrics,
  summary = false,
}: {
  readonly metrics: readonly LumenAnalyticsReferenceMetric[]
  readonly summary?: boolean | undefined
}) {
  return (
    <div className={summary ? 'lumen-analytics-reference-chart-summary' : 'lumen-analytics-reference-metric-strip'}>
      {unique(metrics).map((metric) => (
        <Metric key={metric.id} metric={metric} />
      ))}
    </div>
  )
}
function Chart({
  chart,
  content,
}: {
  readonly chart: LumenAnalyticsReferenceChart
  readonly content: LumenAnalyticsReferenceContent
}) {
  const series = unique(chart.series).filter(({ visible }) => visible)
  const count = Math.max(0, ...series.map(({ points }) => points.length))
  const maximum = Math.max(1, finite(chart.maximum))
  const index = chart.pointLabels.findIndex((_, i) => `point-${i}` === chart.cursorId)
  const active = Math.max(0, index)
  const cursorX = (active * 100) / Math.max(1, count - 1)
  const select = (i: number) => content.onSelect('cursor', `point-${i}`)
  return (
    <div className="lumen-analytics-reference-chart">
      {chart.series.length > 1 ? (
        <div className="lumen-analytics-reference-series-controls">
          {unique(chart.series).map((item) => (
            <LumenButton
              key={item.id}
              variant="text"
              aria-pressed={item.visible}
              style={{ '--analytics-series-color': item.color } as React.CSSProperties}
              onClick={() => content.onFlag(`series-${item.id}`, !item.visible)}
            >
              <i aria-hidden="true" />
              {item.label}
            </LumenButton>
          ))}
        </div>
      ) : null}
      {count ? (
        <div className="lumen-analytics-reference-chart-layout">
          <div className="lumen-analytics-reference-chart-y">
            {chart.ticks.map((tick, i) => (
              <span key={i}>{tick}</span>
            ))}
          </div>
          <div className="lumen-analytics-reference-chart-body">
            <svg
              className="lumen-analytics-reference-chart-svg"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              role="img"
              aria-label={chart.label}
            >
              {[0, 25, 50, 75, 100].map((y) => (
                <line className="lumen-analytics-reference-gridline" key={y} x1={0} x2={100} y1={y} y2={y} />
              ))}
              {chart.guide ? (
                <g className="lumen-analytics-reference-guide">
                  <line
                    x1={0}
                    x2={100}
                    y1={100 - (chart.guide.value / maximum) * 100}
                    y2={100 - (chart.guide.value / maximum) * 100}
                  />
                  <title>{chart.guide.label}</title>
                </g>
              ) : null}
              {series.map((item, si) => {
                const lower = item.points.map((_, i) =>
                  series.slice(0, si).reduce((sum, other) => sum + finite(other.points[i] ?? 0), 0),
                )
                const upper = item.points.map((value, i) => finite(value) + (lower[i] ?? 0))
                const color = item.color
                if (chart.type === 'grouped') {
                  return (
                    <g key={item.id} fill={color}>
                      {item.points.map((value, i) => (
                        <rect
                          key={i}
                          x={((i + si / Math.max(1, series.length)) * 100) / count}
                          y={100 - percent((value / maximum) * 100)}
                          width={70 / count / Math.max(1, series.length)}
                          height={percent((value / maximum) * 100)}
                          rx={0.4}
                        />
                      ))}
                    </g>
                  )
                }
                if (chart.type === 'stacked') {
                  return (
                    <polygon
                      key={item.id}
                      points={`${line(upper, maximum)} ${lower
                        .map(
                          (value, i) =>
                            `${(i * 100) / Math.max(1, lower.length - 1)},${100 - percent((value / maximum) * 100)}`,
                        )
                        .reverse()
                        .join(' ')}`}
                      fill={color}
                      opacity={0.8}
                    />
                  )
                }
                return (
                  <g key={item.id} stroke={color}>
                    {chart.type === 'area' ? (
                      <polygon
                        points={`0,100 ${line(item.points, maximum)} 100,100`}
                        fill={color}
                        opacity={0.13}
                        stroke="none"
                      />
                    ) : null}
                    <polyline fill="none" points={line(item.points, maximum)} />
                  </g>
                )
              })}
              <line className="lumen-analytics-reference-cursor" x1={cursorX} x2={cursorX} y1={0} y2={100} />
              {chart.pointLabels.slice(0, count).map((label, i) => (
                <rect
                  key={i}
                  className="lumen-analytics-reference-hit"
                  x={(i * 100) / count}
                  y={0}
                  width={100 / count}
                  height={100}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  aria-pressed={chart.cursorId === `point-${i}`}
                  onMouseEnter={() => select(i)}
                  onFocus={() => select(i)}
                  onClick={() => select(i)}
                  onKeyDown={(event) => keyboard(event, () => select(i))}
                />
              ))}
            </svg>
            <div className="lumen-analytics-reference-chart-x">
              {chart.axis.map((label, i) => (
                <span key={i}>{label}</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <Empty content={content} />
      )}
      {count ? (
        <p className="lumen-analytics-reference-chart-detail" aria-live="polite">
          {chart.cursorLabel(active)}
        </p>
      ) : null}
    </div>
  )
}
function Donut({ content }: { readonly content: Extract<LumenAnalyticsReferenceContent, { kind: 'channels' }> }) {
  const entries = unique(content.entries)
  const total = entries.reduce((sum, item) => sum + Math.max(0, finite(item.amount)), 0)
  const active = entries.find(({ id }) => id === content.activeEntryId)
  let offset = 0
  return (
    <div className="lumen-analytics-reference-channel-layout">
      <div className="lumen-analytics-reference-donut">
        <svg viewBox="0 0 120 120" role="img" aria-label={content.title}>
          {entries.map((item) => {
            const share = total > 0 ? (item.amount / total) * 100 : 0
            const start = offset
            offset += share
            return (
              <circle
                key={item.id}
                cx={60}
                cy={60}
                r={45}
                pathLength={100}
                fill="none"
                stroke={item.color}
                strokeWidth={15}
                strokeDasharray={`${share} ${100 - share}`}
                strokeDashoffset={-start}
                transform="rotate(-90 60 60)"
                opacity={content.activeEntryId && content.activeEntryId !== item.id ? 0.35 : 1}
              >
                <title>{`${item.label} ${item.value} ${item.detail}`}</title>
              </circle>
            )
          })}
          <text className="lumen-analytics-reference-donut-total" x={60} y={57}>
            {active?.value ?? content.total}
          </text>
          <text className="lumen-analytics-reference-donut-unit" x={60} y={73}>
            {active ? content.selectedSummary(active) : content.unit}
          </text>
        </svg>
      </div>
      <div className="lumen-analytics-reference-channel-list collection">
        {entries.map((item) => (
          <LumenButton
            key={item.id}
            variant="text"
            className="lumen-analytics-reference-channel-row"
            tone={content.activeEntryId === item.id ? 'primary' : 'neutral'}
            aria-pressed={content.activeEntryId === item.id}
            disabled={item.disabled}
            onClick={() => content.onSelect('entry', item.id)}
          >
            <i style={{ backgroundColor: item.color }} aria-hidden="true" />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <span>{item.detail}</span>
          </LumenButton>
        ))}
      </div>
    </div>
  )
}
function Referrals({ content }: { readonly content: Extract<LumenAnalyticsReferenceContent, { kind: 'referrals' }> }) {
  const total = content.contribution.reduce((sum, entry) => sum + entry.amount, 0)
  return (
    <React.Fragment>
      <div className="lumen-analytics-reference-contribution" role="img" aria-label={content.title}>
        {unique(content.contribution).map((entry) => (
          <span
            key={entry.id}
            style={{
              flexGrow: Math.max(0, entry.amount / Math.max(1, total)),
              backgroundColor: entry.color,
            }}
          >
            <span>{entry.label}</span>
            <strong>{entry.value}</strong>
          </span>
        ))}
      </div>
      <div className="lumen-analytics-reference-ranked-list collection">
        {unique(content.entries).map((entry) => (
          <LumenButton
            key={entry.id}
            variant="text"
            className="lumen-analytics-reference-ranked-row"
            tone={content.activeEntryId === entry.id ? 'primary' : 'neutral'}
            aria-pressed={content.activeEntryId === entry.id}
            disabled={entry.disabled}
            onClick={() => content.onSelect('entry', entry.id)}
          >
            <span className="lumen-analytics-reference-abbreviation">{entry.abbreviation}</span>
            <span className="lumen-analytics-reference-ranked-identity">{entry.label}</span>
            {entry.points?.length ? <Spark points={entry.points} /> : null}
            <strong>{entry.value}</strong>
            <span>{entry.delta}</span>
          </LumenButton>
        ))}
      </div>
    </React.Fragment>
  )
}
function Service({ content }: { readonly content: Extract<LumenAnalyticsReferenceContent, { kind: 'service' }> }) {
  return (
    <React.Fragment>
      <div className="lumen-analytics-reference-metric-selectors">
        {unique(content.metrics).map((metric) => (
          <LumenButton
            key={metric.id}
            variant="outlined"
            className="lumen-analytics-reference-metric-selector"
            tone={metric.id === content.activeMetricId ? 'primary' : 'neutral'}
            aria-pressed={metric.id === content.activeMetricId}
            onClick={() => content.onSelect('metric', metric.id)}
          >
            <Metric metric={metric} />
          </LumenButton>
        ))}
      </div>
      {content.chart ? (
        <section className="lumen-analytics-reference-metric-detail-panel">
          <h3>{content.detailTitle}</h3>
          <Chart chart={content.chart} content={content} />
          <Metrics metrics={content.detailMetrics} summary />
        </section>
      ) : (
        <Empty content={content} />
      )}
    </React.Fragment>
  )
}
function Funnel({ content }: { readonly content: Extract<LumenAnalyticsReferenceContent, { kind: 'funnel' }> }) {
  const entries = unique(content.entries)
  const maximum = Math.max(1, ...entries.map(({ amount }) => amount))
  return (
    <div className="lumen-analytics-reference-funnel collection">
      {entries.map((entry, i) => (
        <React.Fragment key={entry.id}>
          <LumenButton
            variant="text"
            className="lumen-analytics-reference-funnel-stage"
            aria-pressed={entry.id === content.activeEntryId}
            disabled={entry.disabled}
            onClick={() => content.onSelect('entry', entry.id)}
          >
            <span className="lumen-analytics-reference-value-row">
              <span>{entry.label}</span>
              <strong>{entry.value}</strong>
              <span>{entry.detail}</span>
            </span>
            <svg viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
              <rect width={percent((entry.amount / maximum) * 100)} height={4} rx={0.6} fill={entry.color} />
            </svg>
          </LumenButton>
          {content.drops[i] ? <p className="lumen-analytics-reference-funnel-drop">{content.drops[i]}</p> : null}
        </React.Fragment>
      ))}
    </div>
  )
}
function Heatmap({ content }: { readonly content: Extract<LumenAnalyticsReferenceContent, { kind: 'heatmap' }> }) {
  const cells = unique(content.cells)
  const weeks = Math.max(1, Math.ceil(cells.length / 7))
  const active = cells.find(({ id }) => id === content.activeCellId)
  return (
    <div className="lumen-analytics-reference-heatmap">
      <div className="lumen-analytics-reference-heatmap-months">
        {content.months.map((month, i) => (
          <span key={i}>{month}</span>
        ))}
      </div>
      <div className="lumen-analytics-reference-chart-layout">
        <div className="lumen-analytics-reference-chart-y">
          {content.weekdays.map((day, i) => (
            <span key={i}>{day}</span>
          ))}
        </div>
        <svg
          className="lumen-analytics-reference-heatmap-svg"
          viewBox={`0 0 ${weeks * 10} 70`}
          role="img"
          aria-label={content.title}
        >
          {cells.map((cell, i) => {
            const select = () => content.onSelect('cell', cell.id)
            return (
              <rect
                key={cell.id}
                x={Math.floor(i / 7) * 10}
                y={(i % 7) * 10}
                width={8}
                height={8}
                rx={1.4}
                fill={`color-mix(in srgb, var(--analytics-primary) ${Math.max(8, percent(cell.count * 10))}%, var(--analytics-panel))`}
                stroke={cell.id === content.activeCellId ? 'currentColor' : 'none'}
                role="button"
                tabIndex={0}
                aria-label={cell.label}
                onMouseEnter={select}
                onFocus={select}
                onClick={select}
                onKeyDown={(event) => keyboard(event, select)}
              />
            )
          })}
        </svg>
      </div>
      <div className="lumen-analytics-reference-heatmap-key">
        <span>{content.less}</span>
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} style={{ opacity: (i + 1) / 5 }} />
        ))}
        <span>{content.more}</span>
      </div>
      {active ? (
        <p className="lumen-analytics-reference-chart-detail" aria-live="polite">
          {active.label}
        </p>
      ) : null}
    </div>
  )
}
function Ring({ entry }: { readonly entry: LumenAnalyticsReferenceEntry }) {
  return (
    <div className="lumen-analytics-reference-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx={60} cy={60} r={48} fill="none" stroke="currentColor" opacity={0.1} strokeWidth={10} />
        <circle
          cx={60}
          cy={60}
          r={48}
          fill="none"
          pathLength={100}
          stroke={entry.color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${percent(entry.amount)} 100`}
          transform="rotate(-90 60 60)"
        />
        <text x={60} y={60}>
          {entry.value}
        </text>
      </svg>
    </div>
  )
}
function Goals({ content }: { readonly content: Extract<LumenAnalyticsReferenceContent, { kind: 'goals' }> }) {
  return (
    <div className="lumen-analytics-reference-goals collection">
      {unique(content.entries).map((entry) => (
        <LumenButton
          key={entry.id}
          variant="text"
          className="lumen-analytics-reference-goal"
          aria-pressed={entry.id === content.activeEntryId}
          disabled={entry.disabled}
          onClick={() => content.onSelect('entry', entry.id)}
        >
          <Ring entry={entry} />
          <strong>{entry.label}</strong>
          <span>{entry.detail}</span>
        </LumenButton>
      ))}
    </div>
  )
}
function Cohort({ content }: { readonly content: Extract<LumenAnalyticsReferenceContent, { kind: 'cohort' }> }) {
  return (
    <div className="lumen-analytics-reference-cohort-scroll">
      <table className="lumen-analytics-reference-cohort">
        <thead>
          <tr>
            <th scope="col">{content.columnLabel}</th>
            {content.periods.map((period, i) => (
              <th scope="col" key={i}>
                {period}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {unique(content.rows).map((row) => (
            <tr key={row.id}>
              <th scope="row">
                <strong>{row.label}</strong>
                <small>{row.detail}</small>
              </th>
              {content.periods.map((_, i) => {
                const value = row.values[i]
                return (
                  <td
                    key={i}
                    style={
                      value
                        ? {
                            backgroundColor: `color-mix(in srgb, var(--analytics-primary) ${percent(value.percent) * 0.5}%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    {value?.label}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{content.averageLabel}</th>
            {content.averages.map((average, i) => (
              <td key={i}>{average}</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
function Candles({ content }: { readonly content: Extract<LumenAnalyticsReferenceContent, { kind: 'candles' }> }) {
  const candles = unique(content.candles)
  const range = Math.max(1, content.maximum - content.minimum)
  const y = (value: number) => 80 - ((finite(value) - content.minimum) / range) * 80
  const volumeMax = Math.max(1, ...candles.map(({ volume }) => volume))
  const active = candles.find(({ id }) => id === content.activeCandleId)
  return (
    <React.Fragment>
      <div className="lumen-analytics-reference-chart-layout">
        <div className="lumen-analytics-reference-chart-y">
          {content.ticks.map((tick, i) => (
            <span key={i}>{tick}</span>
          ))}
        </div>
        <div className="lumen-analytics-reference-chart-body">
          <svg
            className="lumen-analytics-reference-chart-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={content.chartLabel}
          >
            {candles.map((candle, i) => {
              const select = () => content.onSelect('candle', candle.id)
              const x = ((i + 0.5) * 100) / Math.max(1, candles.length)
              return (
                <g
                  key={candle.id}
                  className={candle.close >= candle.open ? 'is-up' : 'is-down'}
                  role="button"
                  tabIndex={0}
                  aria-label={candle.label}
                  aria-pressed={candle.id === content.activeCandleId}
                  onMouseEnter={select}
                  onFocus={select}
                  onClick={select}
                  onKeyDown={(event) => keyboard(event, select)}
                >
                  <line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} />
                  <rect
                    x={x - 30 / candles.length}
                    y={y(Math.max(candle.open, candle.close))}
                    width={60 / candles.length}
                    height={Math.max(0.3, (Math.abs(candle.close - candle.open) / range) * 80)}
                  />
                  <rect
                    opacity={0.3}
                    x={x - 30 / candles.length}
                    y={100 - (candle.volume / volumeMax) * 15}
                    width={60 / candles.length}
                    height={(candle.volume / volumeMax) * 15}
                  />
                  <rect
                    className="lumen-analytics-reference-hit"
                    x={(i * 100) / candles.length}
                    y={0}
                    width={100 / candles.length}
                    height={100}
                  />
                </g>
              )
            })}
          </svg>
          <div className="lumen-analytics-reference-chart-x">
            {content.axis.map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
        </div>
      </div>
      {active ? (
        <p className="lumen-analytics-reference-chart-detail" aria-live="polite">
          {active.detail}
        </p>
      ) : null}
    </React.Fragment>
  )
}
function Scatter({ content }: { readonly content: Extract<LumenAnalyticsReferenceContent, { kind: 'scatter' }> }) {
  const points = unique(content.points)
  const active = points.find(({ id }) => id === content.activePointId)
  return (
    <React.Fragment>
      <div className="lumen-analytics-reference-scatter-quadrants">
        {content.quadrants.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
      <div className="lumen-analytics-reference-chart-layout">
        <div className="lumen-analytics-reference-chart-y">
          {content.yAxis.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
        <div className="lumen-analytics-reference-chart-body">
          <svg
            className="lumen-analytics-reference-chart-svg lumen-analytics-reference-scatter"
            viewBox="0 0 600 300"
            role="img"
            aria-label={content.chartLabel}
          >
            <line
              className="lumen-analytics-reference-guide"
              x1={(content.medianSeats / Math.max(1, content.maximumSeats)) * 600}
              x2={(content.medianSeats / Math.max(1, content.maximumSeats)) * 600}
              y1={0}
              y2={300}
            />
            <line
              className="lumen-analytics-reference-guide"
              x1={0}
              x2={600}
              y1={(100 - content.threshold) * 3}
              y2={(100 - content.threshold) * 3}
            />
            {points.map((point) => {
              const select = () => content.onSelect('point', point.id)
              return (
                <circle
                  key={point.id}
                  cx={percent((point.seats / Math.max(1, content.maximumSeats)) * 100) * 6}
                  cy={(100 - percent(point.active)) * 3}
                  r={Math.max(5, Math.min(14, finite(point.size) * 3.5))}
                  className={
                    point.active < content.threshold && point.seats > content.medianSeats ? 'is-risk' : 'is-healthy'
                  }
                  role="button"
                  tabIndex={0}
                  aria-label={point.label}
                  aria-pressed={point.id === content.activePointId}
                  onMouseEnter={select}
                  onFocus={select}
                  onClick={select}
                  onKeyDown={(event) => keyboard(event, select)}
                />
              )
            })}
          </svg>
          <div className="lumen-analytics-reference-chart-x">
            {content.xAxis.map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
        </div>
      </div>
      {active ? (
        <p className="lumen-analytics-reference-chart-detail" aria-live="polite">
          {active.detail}
        </p>
      ) : null}
    </React.Fragment>
  )
}
function Bullets({ content }: { readonly content: Extract<LumenAnalyticsReferenceContent, { kind: 'bullets' }> }) {
  const entries = unique(content.entries)
  const max = Math.max(1, ...entries.map(({ amount, quota }) => Math.max(amount, quota) * 1.2))
  return (
    <div className="lumen-analytics-reference-bullet-list collection">
      {entries.map((entry) => (
        <LumenButton
          key={entry.id}
          variant="text"
          className="lumen-analytics-reference-bullet-row"
          aria-pressed={entry.id === content.activeEntryId}
          disabled={entry.disabled}
          onClick={() => content.onSelect('entry', entry.id)}
        >
          <span className="lumen-analytics-reference-value-row">
            <strong>{entry.label}</strong>
            <span>{entry.detail}</span>
          </span>
          <svg
            className="lumen-analytics-reference-bullet-chart"
            viewBox="0 0 100 6"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <rect width={percent((entry.quota / max) * 100)} height={6} fill="currentColor" opacity={0.08} />
            <rect width={percent((entry.amount / max) * 100)} height={6} fill={entry.color} rx={0.7} />
            <line x1={(entry.quota / max) * 100} x2={(entry.quota / max) * 100} y1={0} y2={6} />
          </svg>
          <strong>{entry.value}</strong>
        </LumenButton>
      ))}
    </div>
  )
}
function Body({ content }: { readonly content: LumenAnalyticsReferenceContent }) {
  if (content.available === false) {
    return (
      <p className="lumen-analytics-reference-empty" role="status">
        {content.labels.unavailable}
      </p>
    )
  }
  switch (content.kind) {
    case 'pulse':
      return content.metrics.length ? <Metrics metrics={content.metrics} /> : <Empty content={content} />
    case 'revenue':
    case 'tickets':
    case 'latency':
    case 'storage':
    case 'live':
      return (
        <React.Fragment>
          <Chart chart={content.chart} content={content} />
          <Metrics metrics={content.metrics} summary />
        </React.Fragment>
      )
    case 'channels':
      return content.entries.length ? <Donut content={content} /> : <Empty content={content} />
    case 'referrals':
      return content.entries.length ? <Referrals content={content} /> : <Empty content={content} />
    case 'service':
      return <Service content={content} />
    case 'funnel':
      return content.entries.length ? <Funnel content={content} /> : <Empty content={content} />
    case 'heatmap':
      return content.cells.length ? <Heatmap content={content} /> : <Empty content={content} />
    case 'goals':
      return content.entries.length ? <Goals content={content} /> : <Empty content={content} />
    case 'cohort':
      return content.rows.length ? <Cohort content={content} /> : <Empty content={content} />
    case 'candles':
      return content.candles.length ? <Candles content={content} /> : <Empty content={content} />
    case 'scatter':
      return content.points.length ? <Scatter content={content} /> : <Empty content={content} />
    case 'bullets':
      return content.entries.length ? <Bullets content={content} /> : <Empty content={content} />
    default:
      return null
  }
}
export default function LumenAnalyticsReference({
  content,
  notice,
}: {
  readonly content: LumenAnalyticsReferenceContent
  readonly notice?: string | undefined
}) {
  return (
    <div
      className={`lumen-analytics-reference is-${content.kind} is-${content.listStrategy.kind}`}
      data-list-strategy={content.listStrategy.kind}
      data-expected-maximum={content.listStrategy.expectedMaximum}
      data-reference-kind={content.kind}
    >
      <Header content={content} />
      <Body content={content} />
      {content.footer || content.kind === 'pulse' ? (
        <footer className="lumen-analytics-reference-footer">
          <span>{content.footer}</span>
          {content.kind === 'pulse' ? (
            <LumenButton variant="text" onClick={() => content.onRequest('open-report')}>
              {content.reportLabel}
            </LumenButton>
          ) : null}
        </footer>
      ) : null}
      {notice ? (
        <p className="lumen-analytics-reference-notice" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  )
}
