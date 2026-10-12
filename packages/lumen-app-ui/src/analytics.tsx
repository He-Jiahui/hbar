'use client'

import * as React from 'react'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'
import './analytics.css'
import './analytics-reference.css'
import LumenAnalyticsReference from './analytics-reference'
import { type LumenAnalyticsReferenceContent } from './analytics-reference-contracts'
import { LumenBulletProgress, LumenGauge, LumenProgress, LumenTabs } from './ui-controls'
import {
  LumenCandlestickChart,
  LumenChart,
  LumenComboChart,
  LumenScatterChart,
  type LumenChartPoint,
  type LumenChartSeries,
} from './ui-compositions'

export interface LumenAnalyticsListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenAnalyticsChoice {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean | undefined
}

export interface LumenAnalyticsPoint {
  readonly id: string
  readonly value: number
  readonly label?: string | undefined
}

export interface LumenAnalyticsMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly detail?: string | undefined
  readonly trend?: string | undefined
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' | undefined
  readonly series?: readonly LumenAnalyticsPoint[] | undefined
}

export interface LumenAnalyticsRangeContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly ranges: string
    readonly chart: (label: string) => string
    readonly empty: string
  }
  readonly ranges: readonly LumenAnalyticsChoice[]
  readonly initialRangeId: string
  readonly metricsByRange: Readonly<Record<string, readonly LumenAnalyticsMetric[]>>
  readonly listStrategy: LumenAnalyticsListStrategy
}

export interface LumenAnalyticsAreaContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly moveCursor: string
    readonly chart: string
    readonly cursor: (position: number, value: string) => string
    readonly empty: string
  }
  readonly points: readonly LumenAnalyticsPoint[]
  readonly cursorStep: number
  readonly cursorValue: string
  readonly metrics: readonly LumenAnalyticsMetric[]
}

export interface LumenAnalyticsSeries {
  readonly id: string
  readonly label: string
  readonly values: readonly number[]
  readonly tone?: string | undefined
}

export interface LumenAnalyticsGroupedContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly series: string
    readonly value: (series: string, index: number, value: number) => string
    readonly empty: string
  }
  readonly series: readonly LumenAnalyticsSeries[]
  readonly initialSeriesIds: readonly string[]
  readonly listStrategy: LumenAnalyticsListStrategy
}

export interface LumenAnalyticsStackedContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly totals: string
    readonly share: string
    readonly chart: string
    readonly empty: string
  }
  readonly series: readonly LumenAnalyticsSeries[]
  readonly totalValues: readonly number[]
  readonly shareValues: readonly number[]
}

export interface LumenAnalyticsDonutItem {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly percent: number
  readonly tone?: string | undefined
}

export interface LumenAnalyticsDonutContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly chart: string
    readonly select: (label: string) => string
    readonly percent?: ((value: number) => string) | undefined
    readonly empty: string
  }
  readonly initialItemId: string
  readonly items: readonly LumenAnalyticsDonutItem[]
}

export interface LumenAnalyticsRankedItem {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly share: number
  readonly series: readonly LumenAnalyticsPoint[]
}

export interface LumenAnalyticsRankedContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly sourceView: string
    readonly progress: (label: string) => string
    readonly chart: (label: string) => string
    readonly empty: string
  }
  readonly items: readonly LumenAnalyticsRankedItem[]
  readonly listStrategy: LumenAnalyticsListStrategy
}

export interface LumenAnalyticsCardsContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly promote: (label: string) => string
    readonly panelTitle: (label: string) => string
    readonly panelBody: string
    readonly empty: string
  }
  readonly initialMetricId: string
  readonly metrics: readonly LumenAnalyticsMetric[]
  readonly listStrategy: LumenAnalyticsListStrategy
}

export interface LumenAnalyticsFunnelStage {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly detail: string
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' | undefined
}

export interface LumenAnalyticsFunnelContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly highlight: string
    readonly progress: (label: string) => string
    readonly percent?: ((value: number) => string) | undefined
    readonly empty: string
  }
  readonly worstStageId: string
  readonly stages: readonly LumenAnalyticsFunnelStage[]
  readonly listStrategy: LumenAnalyticsListStrategy
}

export interface LumenAnalyticsHeatCell {
  readonly id: string
  readonly label: string
  readonly level: 0 | 1 | 2 | 3 | 4
}

export interface LumenAnalyticsHeatmapContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly cursor: (label: string) => string
    readonly less: string
    readonly more: string
    readonly selected: (label: string) => string
    readonly empty: string
  }
  readonly initialCellId: string
  readonly cells: readonly LumenAnalyticsHeatCell[]
  readonly listStrategy: LumenAnalyticsListStrategy
}

export interface LumenAnalyticsGoal {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly valueLabel: string
}

export interface LumenAnalyticsGoalsContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly replay: string
    readonly progress: (label: string) => string
    readonly empty: string
  }
  readonly goals: readonly LumenAnalyticsGoal[]
}

export interface LumenAnalyticsCohort {
  readonly id: string
  readonly label: string
  readonly values: readonly number[]
}

export interface LumenAnalyticsCohortContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly change: string
    readonly cohort: string
    readonly value: (cohort: string, period: string, value: number) => string
    readonly percent?: ((value: number) => string) | undefined
    readonly empty: string
  }
  readonly periods: readonly LumenAnalyticsChoice[]
  readonly cohorts: readonly LumenAnalyticsCohort[]
  readonly listStrategy: LumenAnalyticsListStrategy
}

export interface LumenAnalyticsRankingItem {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly delta: number
}

export interface LumenAnalyticsRankingContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly sort: (label: string) => string
    readonly sorts: readonly [string, string]
    readonly progress: (label: string) => string
    readonly empty: string
  }
  readonly items: readonly LumenAnalyticsRankingItem[]
  readonly listStrategy: LumenAnalyticsListStrategy
}

export interface LumenAnalyticsCandle {
  readonly id: string
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly volume: number
}

export interface LumenAnalyticsCandlesContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly show: string
    readonly chart: string
    readonly candle: (item: LumenAnalyticsCandle) => string
    readonly volume: string
    readonly empty: string
  }
  readonly candles: readonly LumenAnalyticsCandle[]
}

export interface LumenAnalyticsScatterPoint {
  readonly id: string
  readonly label: string
  readonly x: number
  readonly y: number
  readonly size: number
}

export interface LumenAnalyticsScatterContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly nearest: string
    readonly chart: string
    readonly point: (label: string) => string
    readonly selected: (label: string) => string
    readonly empty: string
  }
  readonly nearestPointId: string
  readonly points: readonly LumenAnalyticsScatterPoint[]
}

export interface LumenAnalyticsBulletItem {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly target: number
  readonly detail: string
}

export interface LumenAnalyticsBulletContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly sort: (label: string) => string
    readonly sorts: readonly [string, string]
    readonly progress: (label: string) => string
    readonly empty: string
  }
  readonly items: readonly LumenAnalyticsBulletItem[]
  readonly listStrategy: LumenAnalyticsListStrategy
}

export interface LumenAnalyticsComboContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly inspect: string
    readonly bars: string
    readonly trend: string
    readonly primaryAxis: string
    readonly secondaryAxis: string
    readonly empty: string
  }
  readonly bars: readonly LumenAnalyticsPoint[]
  readonly trend: readonly LumenAnalyticsPoint[]
}

export interface LumenAnalyticsContent {
  readonly reference?: LumenAnalyticsReferenceContent | undefined
  readonly presentation?: { readonly ownerId: string; readonly notice?: string | undefined } | undefined
  readonly range?: LumenAnalyticsRangeContent | undefined
  readonly area?: LumenAnalyticsAreaContent | undefined
  readonly grouped?: LumenAnalyticsGroupedContent | undefined
  readonly stacked?: LumenAnalyticsStackedContent | undefined
  readonly donut?: LumenAnalyticsDonutContent | undefined
  readonly ranked?: LumenAnalyticsRankedContent | undefined
  readonly cards?: LumenAnalyticsCardsContent | undefined
  readonly funnel?: LumenAnalyticsFunnelContent | undefined
  readonly heatmap?: LumenAnalyticsHeatmapContent | undefined
  readonly goals?: LumenAnalyticsGoalsContent | undefined
  readonly cohort?: LumenAnalyticsCohortContent | undefined
  readonly ranking?: LumenAnalyticsRankingContent | undefined
  readonly candles?: LumenAnalyticsCandlesContent | undefined
  readonly scatter?: LumenAnalyticsScatterContent | undefined
  readonly bullets?: LumenAnalyticsBulletContent | undefined
  readonly combo?: LumenAnalyticsComboContent | undefined
}

export interface LumenAnalyticsProviderProps {
  readonly content: LumenAnalyticsContent
  readonly children: React.ReactNode
}

export interface LumenAnalyticsAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenAnalyticsProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenAnalyticsContent | undefined
  readonly onAction?: ((event: LumenAnalyticsAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenAnalyticsVariantProps = Omit<LumenAnalyticsProps, 'variant' | 'variantId'>

const Context = React.createContext<LumenAnalyticsContent | undefined>(undefined)

export function LumenAnalyticsProvider({ content, children }: LumenAnalyticsProviderProps) {
  return <Context.Provider value={content}>{children}</Context.Provider>
}

export function useLumenAnalyticsContent() {
  return React.useContext(Context)
}

export function uniqueLumenAnalyticsItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenAnalyticsItem<T extends { readonly id: string }>(
  items: readonly T[],
  id: string | undefined,
): T | undefined {
  return items.find((item) => item.id === id) ?? items[0]
}

const report = (fn: LumenAnalyticsProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({ name }: { name: 'up' | 'down' | 'crosshair' | 'pointer' | 'sort' | 'info' }) {
  const paths = {
    up: 'm4 10 4-5 4 5M8 5v8',
    down: 'm4 6 4 5 4-5M8 3v8',
    crosshair: 'M8 1v3m0 8v3M1 8h3m8 0h3M8 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
    pointer: 'M4 2.5 12.5 9 8 10l-2 3z',
    sort: 'M3 4h10M5 8h6m-4 4h2',
    info: 'M8 7v5m0-8h.01M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z',
  }
  return (
    <svg className="lumen-analytics-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

function Root({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  children,
}: Omit<LumenAnalyticsProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const contentClassName = [
    'lumen-analytics',
    `hbar-app-ui-analytics-variant-${variant}`,
    density ? `hbar-app-ui-density-${density}` : '',
    surface ? `hbar-app-ui-surface-${surface}` : '',
    state ? `hbar-app-ui-state-${state}` : '',
    visualMode ? `hbar-app-ui-visual-${visualMode}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <LumenSurface
      as="section"
      boundary="horizontal"
      className="lumen-analytics-surface"
      contentClassName={contentClassName}
      data-lumen-component="analytics"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function Header({
  title,
  detail,
  actions,
}: {
  readonly title: string
  readonly detail: string
  readonly actions?: React.ReactNode
}) {
  return (
    <header className="lumen-analytics-header">
      <div>
        <LumenText as="h2" variant="title">
          {title}
        </LumenText>
        <LumenText as="p" variant="supporting" tone="muted">
          {detail}
        </LumenText>
      </div>
      {actions}
    </header>
  )
}

function Empty({ children }: { readonly children: string }) {
  return (
    <LumenText as="p" className="lumen-analytics-empty" tone="muted">
      {children}
    </LumenText>
  )
}

function Tabs({
  choices,
  selectedId,
  label,
  onChange,
}: {
  readonly choices: readonly LumenAnalyticsChoice[]
  readonly selectedId: string | undefined
  readonly label: string
  readonly onChange: (id: string) => void
}) {
  return (
    <LumenTabs
      className="lumen-analytics-tabs"
      label={label}
      items={choices}
      selectedId={selectedId ?? null}
      onChange={onChange}
    />
  )
}

function Progress({
  value,
  label,
  tone,
}: {
  readonly value: number
  readonly label: string
  readonly tone?: string | undefined
}) {
  return (
    <LumenProgress
      className="lumen-analytics-progress"
      label={label}
      value={value}
      tone={tone === 'warning' ? 'warning' : 'info'}
    />
  )
}

function Metrics({ items, empty }: { readonly items: readonly LumenAnalyticsMetric[]; readonly empty: string }) {
  const values = uniqueLumenAnalyticsItems(items)
  return (
    <div className="lumen-analytics-metrics">
      {values.length ? (
        values.map((item) => (
          <article key={item.id}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            {item.trend ? (
              <span data-tone={item.tone}>
                <Glyph name={item.tone === 'danger' ? 'down' : 'up'} />
                {item.trend}
              </span>
            ) : null}
            {item.detail ? <small>{item.detail}</small> : null}
            {item.series ? <Sparkline points={item.series} label={item.label} /> : null}
          </article>
        ))
      ) : (
        <Empty>{empty}</Empty>
      )}
    </div>
  )
}

function Range(props: Omit<LumenAnalyticsProps, 'content'> & { content: LumenAnalyticsRangeContent }) {
  const ranges = uniqueLumenAnalyticsItems(props.content.ranges)
  const [rangeId, setRangeId] = React.useState(props.content.initialRangeId)
  const range = selectLumenAnalyticsItem(ranges, rangeId)
  const metrics = props.content.metricsByRange[range?.id ?? ''] ?? []
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <Tabs
        choices={ranges}
        selectedId={range?.id}
        label={props.content.labels.ranges}
        onChange={(id) => {
          setRangeId(id)
          report(props.onAction, 'range', id)
        }}
      />
      <div data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        <Metrics
          items={metrics.map((item) => ({ ...item, detail: item.detail ?? range?.label }))}
          empty={props.content.labels.empty}
        />
      </div>
    </Root>
  )
}

function Area(props: Omit<LumenAnalyticsProps, 'content'> & { content: LumenAnalyticsAreaContent }) {
  const points = uniqueLumenAnalyticsItems(props.content.points)
  const [cursorId, setCursorId] = React.useState(points[Math.floor(points.length / 2)]?.id)
  const cursorIndex = Math.max(
    0,
    points.findIndex((point) => point.id === cursorId),
  )
  const cursorPosition = Math.round((cursorIndex / Math.max(1, points.length - 1)) * 100)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton
            variant="outlined"
            onClick={() => {
              const next = points[(cursorIndex + props.content.cursorStep) % Math.max(1, points.length)]
              if (next) {
                setCursorId(next.id)
              }
            }}
          >
            <Glyph name="crosshair" />
            {props.content.labels.moveCursor}
          </LumenButton>
        }
      />
      {points.length ? (
        <LumenChart
          className="lumen-analytics-area-chart"
          label={props.content.labels.chart}
          kind="area"
          series={[
            {
              id: 'area',
              label: props.content.labels.chart,
              points: chartPoints(points),
              tone: 'info',
            },
          ]}
          selectedPointId={cursorId}
          cursorLabel={props.content.labels.cursor(cursorPosition, props.content.cursorValue)}
          onPointChange={(point) => setCursorId(point.id)}
          empty={props.content.labels.empty}
        />
      ) : (
        <Empty>{props.content.labels.empty}</Empty>
      )}
      <Metrics items={props.content.metrics} empty={props.content.labels.empty} />
    </Root>
  )
}

function Grouped(props: Omit<LumenAnalyticsProps, 'content'> & { content: LumenAnalyticsGroupedContent }) {
  const series = uniqueLumenAnalyticsItems(props.content.series)
  const [activeIds, setActiveIds] = React.useState<readonly string[]>(props.content.initialSeriesIds)
  const active = series.filter((item) => activeIds.includes(item.id))
  const count = Math.max(0, ...active.map((item) => item.values.length))
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-analytics-pills" aria-label={props.content.labels.series}>
        {series.map((item) => (
          <LumenButton
            key={item.id}
            size="s"
            variant={activeIds.includes(item.id) ? 'solid' : 'outlined'}
            onClick={() =>
              setActiveIds((current) =>
                current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
              )
            }
          >
            {item.label}
          </LumenButton>
        ))}
      </div>
      {active.length ? (
        <LumenChart
          className="lumen-analytics-grouped-chart"
          label={props.content.labels.series}
          kind="grouped-bar"
          series={active.map((item, seriesIndex) => ({
            id: item.id,
            label: item.label,
            tone: chartTone(seriesIndex),
            points: Array.from({ length: count }, (_, index) => ({
              id: `${item.id}-${index}`,
              label: props.content.labels.value(item.label, index, item.values[index] ?? 0),
              value: item.values[index] ?? 0,
            })),
          }))}
          empty={props.content.labels.empty}
        />
      ) : (
        <Empty>{props.content.labels.empty}</Empty>
      )}
    </Root>
  )
}

function Stacked(props: Omit<LumenAnalyticsProps, 'content'> & { content: LumenAnalyticsStackedContent }) {
  const series = uniqueLumenAnalyticsItems(props.content.series)
  const [share, setShare] = React.useState(false)
  const pointCount = Math.max(0, ...series.map((item) => item.values.length))
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton
            variant="outlined"
            onClick={() => {
              setShare((value) => !value)
              report(props.onAction, 'mode', share ? 'totals' : 'share')
            }}
          >
            {share ? props.content.labels.totals : props.content.labels.share}
          </LumenButton>
        }
      />
      {series.length ? (
        <React.Fragment>
          <LumenChart
            className="lumen-analytics-stacked-chart"
            label={props.content.labels.chart}
            kind="stacked-area"
            series={series.map((item, seriesIndex) => ({
              id: item.id,
              label: item.label,
              tone: chartTone(seriesIndex),
              points: Array.from({ length: pointCount }, (_, index) => {
                const raw = item.values[index] ?? 0
                const total = series.reduce((sum, candidate) => sum + Math.max(0, candidate.values[index] ?? 0), 0)
                return {
                  id: `${item.id}-${index}`,
                  label: `${item.label} ${index + 1}`,
                  value: share && total ? (raw / total) * 100 : raw,
                }
              }),
            }))}
            empty={props.content.labels.empty}
          />
          <div className="lumen-analytics-legend">
            {series.map((item, index) => (
              <span key={item.id}>
                <i data-index={index} />
                {item.label}
              </span>
            ))}
          </div>
        </React.Fragment>
      ) : (
        <Empty>{props.content.labels.empty}</Empty>
      )}
    </Root>
  )
}

function Donut(props: Omit<LumenAnalyticsProps, 'content'> & { content: LumenAnalyticsDonutContent }) {
  const items = uniqueLumenAnalyticsItems(props.content.items)
  const [itemId, setItemId] = React.useState(props.content.initialItemId)
  const item = selectLumenAnalyticsItem(items, itemId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      {item ? (
        <div className="lumen-analytics-donut-layout">
          <div
            className="lumen-analytics-donut"
            style={
              {
                '--percent': `${Math.max(0, Math.min(100, item.percent)) * 3.6}deg`,
              } as React.CSSProperties
            }
            role="img"
            aria-label={props.content.labels.chart}
          >
            <strong>{item.value}</strong>
            <small>{item.label}</small>
          </div>
          <div className="lumen-analytics-donut-legend">
            {items.map((candidate) => (
              <LumenButton
                key={candidate.id}
                variant="text"
                aria-pressed={item.id === candidate.id}
                aria-label={props.content.labels.select(candidate.label)}
                onFocus={() => setItemId(candidate.id)}
                onMouseEnter={() => setItemId(candidate.id)}
                onClick={() => report(props.onAction, 'select', candidate.id)}
              >
                <i data-tone={candidate.tone} />
                {candidate.label}
                <b>{candidate.percent}%</b>
              </LumenButton>
            ))}
          </div>
        </div>
      ) : (
        <Empty>{props.content.labels.empty}</Empty>
      )}
    </Root>
  )
}

function Ranked(props: Omit<LumenAnalyticsProps, 'content'> & { content: LumenAnalyticsRankedContent }) {
  const items = uniqueLumenAnalyticsItems(props.content.items)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton variant="outlined" onClick={() => report(props.onAction, 'view', 'source')}>
            {props.content.labels.sourceView}
          </LumenButton>
        }
      />
      <div className="lumen-analytics-ranked" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {items.length ? (
          items.map((item, index) => (
            <article key={item.id}>
              <span>{index + 1}</span>
              <div>
                <strong>{item.label}</strong>
                <small>{item.value}</small>
              </div>
              <Progress value={item.share} label={props.content.labels.progress(item.label)} />
              <Sparkline points={item.series} label={props.content.labels.chart(item.label)} />
            </article>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}

function Cards(props: Omit<LumenAnalyticsProps, 'content'> & { content: LumenAnalyticsCardsContent }) {
  const metrics = uniqueLumenAnalyticsItems(props.content.metrics)
  const [metricId, setMetricId] = React.useState(props.content.initialMetricId)
  const metric = selectLumenAnalyticsItem(metrics, metricId)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          metric ? (
            <LumenButton
              variant="outlined"
              onClick={() => {
                const index = Math.max(
                  0,
                  metrics.findIndex((item) => item.id === metric.id),
                )
                setMetricId(metrics[(index + 1) % metrics.length]?.id ?? metric.id)
              }}
            >
              {props.content.labels.promote(metric.label)}
            </LumenButton>
          ) : undefined
        }
      />
      <div className="lumen-analytics-cards" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {metrics.length ? (
          metrics.map((item) => (
            <LumenButton
              key={item.id}
              variant="text"
              aria-pressed={metric?.id === item.id}
              onClick={() => setMetricId(item.id)}
            >
              <small>{item.label}</small>
              <strong>{item.value}</strong>
              <span data-tone={item.tone}>
                <Glyph name={item.tone === 'danger' ? 'down' : 'up'} />
                {item.trend}
              </span>
            </LumenButton>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
      {metric ? (
        <section className="lumen-analytics-panel">
          <strong>{props.content.labels.panelTitle(metric.label)}</strong>
          <LumenText as="p" tone="muted">
            {props.content.labels.panelBody}
          </LumenText>
        </section>
      ) : null}
    </Root>
  )
}

function Funnel(props: Omit<LumenAnalyticsProps, 'content'> & { content: LumenAnalyticsFunnelContent }) {
  const stages = uniqueLumenAnalyticsItems(props.content.stages)
  const [highlight, setHighlight] = React.useState(false)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton
            variant={highlight ? 'solid' : 'outlined'}
            onClick={() => {
              setHighlight((value) => !value)
              report(props.onAction, 'highlight', props.content.worstStageId)
            }}
          >
            {props.content.labels.highlight}
          </LumenButton>
        }
      />
      <div className="lumen-analytics-funnel" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {stages.length ? (
          stages.map((stage) => (
            <article
              key={stage.id}
              data-highlight={(highlight && stage.id === props.content.worstStageId) || undefined}
            >
              <span>{stage.label}</span>
              <Progress value={stage.value} label={props.content.labels.progress(stage.label)} tone={stage.tone} />
              <b>{stage.value}%</b>
              <small>{stage.detail}</small>
            </article>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}

function Heatmap(props: Omit<LumenAnalyticsProps, 'content'> & { content: LumenAnalyticsHeatmapContent }) {
  const cells = uniqueLumenAnalyticsItems(props.content.cells)
  const [cellId, setCellId] = React.useState(props.content.initialCellId)
  const cell = selectLumenAnalyticsItem(cells, cellId)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          cell ? (
            <LumenButton
              variant="outlined"
              onClick={() => {
                const index = Math.max(
                  0,
                  cells.findIndex((item) => item.id === cell.id),
                )
                setCellId(cells[(index + 1) % cells.length]?.id ?? cell.id)
              }}
            >
              <Glyph name="pointer" />
              {props.content.labels.cursor(cell.label)}
            </LumenButton>
          ) : undefined
        }
      />
      {cells.length ? (
        <div className="lumen-analytics-heatmap" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
          {cells.map((item) => (
            <LumenIconButton
              key={item.id}
              label={item.label}
              className={`heat-${item.level}`}
              aria-pressed={cell?.id === item.id}
              onClick={() => setCellId(item.id)}
            />
          ))}
        </div>
      ) : (
        <Empty>{props.content.labels.empty}</Empty>
      )}
      <div className="lumen-analytics-heat-legend">
        <span>{props.content.labels.less}</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <i className={`heat-${level}`} key={level} />
        ))}
        <span>{props.content.labels.more}</span>
      </div>
      {cell ? (
        <LumenText as="p" tone="muted">
          {props.content.labels.selected(cell.label)}
        </LumenText>
      ) : null}
    </Root>
  )
}

function Goals(props: Omit<LumenAnalyticsProps, 'content'> & { content: LumenAnalyticsGoalsContent }) {
  const goals = uniqueLumenAnalyticsItems(props.content.goals)
  const [replay, setReplay] = React.useState(0)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton
            variant="outlined"
            onClick={() => {
              setReplay((value) => value + 1)
              report(props.onAction, 'replay', String(replay + 1))
            }}
          >
            {props.content.labels.replay}
          </LumenButton>
        }
      />
      <div className="lumen-analytics-goals" data-replay={replay}>
        {goals.length ? (
          goals.map((goal) => (
            <article key={goal.id}>
              <LumenGauge
                className="lumen-analytics-gauge"
                label={props.content.labels.progress(goal.label)}
                value={goal.value}
                valueLabel={goal.valueLabel}
              />
              <small>{goal.label}</small>
            </article>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}

function Cohort(props: Omit<LumenAnalyticsProps, 'content'> & { content: LumenAnalyticsCohortContent }) {
  const periods = uniqueLumenAnalyticsItems(props.content.periods)
  const cohorts = uniqueLumenAnalyticsItems(props.content.cohorts)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton variant="outlined" onClick={() => report(props.onAction, 'change', 'cohort')}>
            {props.content.labels.change}
          </LumenButton>
        }
      />
      <div
        className="lumen-analytics-cohort"
        role="table"
        data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
      >
        <div role="row">
          <span role="columnheader">{props.content.labels.cohort}</span>
          {periods.map((period) => (
            <span role="columnheader" key={period.id}>
              {period.label}
            </span>
          ))}
        </div>
        {cohorts.length ? (
          cohorts.map((cohort) => (
            <div role="row" key={cohort.id}>
              <strong role="cell">{cohort.label}</strong>
              {periods.map((period, index) => {
                const value = cohort.values[index] ?? 0
                return (
                  <span
                    role="cell"
                    className={`heat-${Math.min(4, Math.floor(value / 20))}`}
                    aria-label={props.content.labels.value(cohort.label, period.label, value)}
                    key={period.id}
                  >
                    {value}%
                  </span>
                )
              })}
            </div>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}

function Ranking(props: Omit<LumenAnalyticsProps, 'content'> & { content: LumenAnalyticsRankingContent }) {
  const source = uniqueLumenAnalyticsItems(props.content.items)
  const [sortDelta, setSortDelta] = React.useState(false)
  const items = [...source].sort((a, b) => (sortDelta ? b.delta - a.delta : b.value - a.value))
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton
            variant="outlined"
            onClick={() => {
              setSortDelta((value) => !value)
              report(props.onAction, 'sort', sortDelta ? 'value' : 'delta')
            }}
          >
            <Glyph name="sort" />
            {props.content.labels.sort(props.content.labels.sorts[sortDelta ? 1 : 0])}
          </LumenButton>
        }
      />
      <div className="lumen-analytics-ranking" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {items.length ? (
          items.map((item) => (
            <article key={item.id}>
              <strong>{item.label}</strong>
              <Progress value={item.value} label={props.content.labels.progress(item.label)} />
              <b>{item.value}</b>
            </article>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}

function Candles(props: Omit<LumenAnalyticsProps, 'content'> & { content: LumenAnalyticsCandlesContent }) {
  const candles = uniqueLumenAnalyticsItems(props.content.candles)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton variant="outlined" onClick={() => report(props.onAction, 'tooltip', 'ohlc')}>
            <Glyph name="info" />
            {props.content.labels.show}
          </LumenButton>
        }
      />
      {candles.length ? (
        <LumenCandlestickChart
          label={props.content.labels.chart}
          volumeLabel={props.content.labels.volume}
          points={candles.map((item) => ({ ...item, label: item.id }))}
          itemLabel={(item) => props.content.labels.candle(item)}
          empty={props.content.labels.empty}
        />
      ) : (
        <Empty>{props.content.labels.empty}</Empty>
      )}
    </Root>
  )
}

function Scatter(props: Omit<LumenAnalyticsProps, 'content'> & { content: LumenAnalyticsScatterContent }) {
  const points = uniqueLumenAnalyticsItems(props.content.points)
  const [pointId, setPointId] = React.useState<string>()
  const point = points.find((item) => item.id === pointId)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton
            variant="outlined"
            onClick={() => {
              setPointId(props.content.nearestPointId)
              report(props.onAction, 'select', props.content.nearestPointId)
            }}
          >
            <Glyph name="pointer" />
            {props.content.labels.nearest}
          </LumenButton>
        }
      />
      {points.length ? (
        <LumenScatterChart
          label={props.content.labels.chart}
          points={points}
          selectedPointId={pointId}
          pointLabel={(item) => props.content.labels.point(item.label)}
          onPointSelect={(item) => setPointId(item.id)}
          empty={props.content.labels.empty}
        />
      ) : (
        <Empty>{props.content.labels.empty}</Empty>
      )}
      {point ? <LumenStatus value={props.content.labels.selected(point.label)} tone="success" /> : null}
    </Root>
  )
}

function Bullets(props: Omit<LumenAnalyticsProps, 'content'> & { content: LumenAnalyticsBulletContent }) {
  const source = uniqueLumenAnalyticsItems(props.content.items)
  const [sortTarget, setSortTarget] = React.useState(false)
  const items = [...source].sort((a, b) =>
    sortTarget ? b.target - a.target : Math.abs(b.value - b.target) - Math.abs(a.value - a.target),
  )
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton
            variant="outlined"
            onClick={() => {
              setSortTarget((value) => !value)
              report(props.onAction, 'sort', sortTarget ? 'delta' : 'target')
            }}
          >
            {props.content.labels.sort(props.content.labels.sorts[sortTarget ? 1 : 0])}
          </LumenButton>
        }
      />
      <div className="lumen-analytics-bullets" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {items.length ? (
          items.map((item) => (
            <article key={item.id}>
              <strong>{item.label}</strong>
              <LumenBulletProgress
                className="lumen-analytics-bullet"
                label={props.content.labels.progress(item.label)}
                value={item.value}
                target={item.target}
              />
              <small>{item.detail}</small>
            </article>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}

function Combo(props: Omit<LumenAnalyticsProps, 'content'> & { content: LumenAnalyticsComboContent }) {
  const bars = uniqueLumenAnalyticsItems(props.content.bars)
  const trend = uniqueLumenAnalyticsItems(props.content.trend)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton variant="outlined" onClick={() => report(props.onAction, 'inspect', 'axes')}>
            {props.content.labels.inspect}
          </LumenButton>
        }
      />
      {bars.length || trend.length ? (
        <LumenComboChart
          label={`${props.content.labels.bars}. ${props.content.labels.trend}`}
          bars={chartPoints(bars)}
          trend={chartPoints(trend)}
          barsLabel={props.content.labels.bars}
          trendLabel={props.content.labels.trend}
          empty={props.content.labels.empty}
        />
      ) : (
        <Empty>{props.content.labels.empty}</Empty>
      )}
      <div className="lumen-analytics-axis">
        <span>{props.content.labels.primaryAxis}</span>
        <span>{props.content.labels.secondaryAxis}</span>
      </div>
    </Root>
  )
}

function empty(props: LumenAnalyticsProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenAnalytics(props: LumenAnalyticsProps) {
  const inheritedContent = useLumenAnalyticsContent()
  const content = props.content ?? inheritedContent
  if (content?.reference) {
    return (
      <Root {...props}>
        <LumenAnalyticsReference content={content.reference} notice={content.presentation?.notice} />
      </Root>
    )
  }
  if (props.variant === 1) {
    return content?.range ? <Range {...props} content={content.range} /> : empty(props)
  }
  if (props.variant === 2) {
    return content?.area ? <Area {...props} content={content.area} /> : empty(props)
  }
  if (props.variant === 3) {
    return content?.grouped ? <Grouped {...props} content={content.grouped} /> : empty(props)
  }
  if (props.variant === 4) {
    return content?.stacked ? <Stacked {...props} content={content.stacked} /> : empty(props)
  }
  if (props.variant === 5) {
    return content?.donut ? <Donut {...props} content={content.donut} /> : empty(props)
  }
  if (props.variant === 6) {
    return content?.ranked ? <Ranked {...props} content={content.ranked} /> : empty(props)
  }
  if (props.variant === 7) {
    return content?.cards ? <Cards {...props} content={content.cards} /> : empty(props)
  }
  if (props.variant === 8) {
    return content?.funnel ? <Funnel {...props} content={content.funnel} /> : empty(props)
  }
  if (props.variant === 9) {
    return content?.heatmap ? <Heatmap {...props} content={content.heatmap} /> : empty(props)
  }
  if (props.variant === 10) {
    return content?.goals ? <Goals {...props} content={content.goals} /> : empty(props)
  }
  if (props.variant === 11) {
    return content?.cohort ? <Cohort {...props} content={content.cohort} /> : empty(props)
  }
  if (props.variant === 12) {
    return content?.ranking ? <Ranking {...props} content={content.ranking} /> : empty(props)
  }
  if (props.variant === 13) {
    return content?.candles ? <Candles {...props} content={content.candles} /> : empty(props)
  }
  if (props.variant === 14) {
    return content?.scatter ? <Scatter {...props} content={content.scatter} /> : empty(props)
  }
  if (props.variant === 15) {
    return content?.bullets ? <Bullets {...props} content={content.bullets} /> : empty(props)
  }
  if (props.variant === 16) {
    return content?.combo ? <Combo {...props} content={content.combo} /> : empty(props)
  }
  return empty(props)
}

function variant(value: number, props: LumenAnalyticsVariantProps) {
  return <LumenAnalytics {...props} variant={value} variantId={`hbar-app-ui-analytics-${value}`} />
}

export const LumenAnalytics01 = (props: LumenAnalyticsVariantProps) => variant(1, props),
  LumenAnalytics02 = (props: LumenAnalyticsVariantProps) => variant(2, props),
  LumenAnalytics03 = (props: LumenAnalyticsVariantProps) => variant(3, props),
  LumenAnalytics04 = (props: LumenAnalyticsVariantProps) => variant(4, props),
  LumenAnalytics05 = (props: LumenAnalyticsVariantProps) => variant(5, props),
  LumenAnalytics06 = (props: LumenAnalyticsVariantProps) => variant(6, props),
  LumenAnalytics07 = (props: LumenAnalyticsVariantProps) => variant(7, props),
  LumenAnalytics08 = (props: LumenAnalyticsVariantProps) => variant(8, props),
  LumenAnalytics09 = (props: LumenAnalyticsVariantProps) => variant(9, props),
  LumenAnalytics10 = (props: LumenAnalyticsVariantProps) => variant(10, props),
  LumenAnalytics11 = (props: LumenAnalyticsVariantProps) => variant(11, props),
  LumenAnalytics12 = (props: LumenAnalyticsVariantProps) => variant(12, props),
  LumenAnalytics13 = (props: LumenAnalyticsVariantProps) => variant(13, props),
  LumenAnalytics14 = (props: LumenAnalyticsVariantProps) => variant(14, props),
  LumenAnalytics15 = (props: LumenAnalyticsVariantProps) => variant(15, props),
  LumenAnalytics16 = (props: LumenAnalyticsVariantProps) => variant(16, props)

function chartPoints(points: readonly LumenAnalyticsPoint[]): readonly LumenChartPoint[] {
  return uniqueLumenAnalyticsItems(points).map((point) => ({
    id: point.id,
    label: point.label ?? point.id,
    value: point.value,
  }))
}

function chartTone(index: number): LumenChartSeries['tone'] {
  return (['info', 'success', 'warning', 'danger'] as const)[index % 4]
}

function Sparkline({ points, label }: { points: readonly LumenAnalyticsPoint[]; label: string }) {
  return (
    <LumenChart
      className="lumen-analytics-sparkline"
      compact
      label={label}
      kind="line"
      series={[{ id: 'sparkline', label, points: chartPoints(points), tone: 'info' }]}
      empty=""
    />
  )
}
