'use client'

import * as React from 'react'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'
import { LumenBadge, LumenProgress } from './ui-controls'

function uniqueItems<Item extends { id: string }>(items: readonly Item[]): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export interface LumenPanelProps extends Omit<React.ComponentProps<typeof LumenSurface>, 'children'> {
  title?: string | undefined
  description?: string | undefined
  actions?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  elevation?: 'base' | 'overlay' | undefined
  material?: 'glass' | 'frost' | undefined
}

export function LumenPanel({
  title,
  description,
  actions,
  footer,
  children,
  elevation,
  material,
  className,
  ...other
}: LumenPanelProps) {
  return (
    <LumenSurface
      {...other}
      className={['lumen-panel', className].filter(Boolean).join(' ')}
      elevation={elevation}
      material={material}
      role={other.role ?? (title ? 'region' : undefined)}
      aria-label={other['aria-label'] ?? title}
    >
      {title || description || actions ? (
        <header>
          <div>
            {title ? (
              <LumenText as="h2" variant="heading">
                {title}
              </LumenText>
            ) : null}
            {description ? (
              <LumenText as="p" variant="supporting" tone="muted">
                {description}
              </LumenText>
            ) : null}
          </div>
          {actions ? <div className="lumen-panel-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="lumen-panel-body">{children}</div>
      {footer ? <footer>{footer}</footer> : null}
    </LumenSurface>
  )
}

export interface LumenToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  children: React.ReactNode
  wrap?: boolean | undefined
}

export function LumenToolbar({ label, children, wrap = true, className, ...other }: LumenToolbarProps) {
  return (
    <div
      {...other}
      className={['lumen-toolbar', className].filter(Boolean).join(' ')}
      data-wrap={wrap || undefined}
      role="toolbar"
      aria-label={label}
    >
      {children}
    </div>
  )
}

export interface LumenListItem {
  id: string
  primary: React.ReactNode
  secondary?: React.ReactNode
  leading?: React.ReactNode
  trailing?: React.ReactNode
  selected?: boolean | undefined
  disabled?: boolean | undefined
}

export interface LumenListProps {
  label: string
  items: readonly LumenListItem[]
  empty: React.ReactNode
  strategy?: 'content-grown' | 'pane-scroll' | undefined
  onSelect?: ((id: string) => void) | undefined
  className?: string | undefined
}

export function LumenList({ label, items, empty, strategy = 'content-grown', onSelect, className }: LumenListProps) {
  const values = uniqueItems(items)
  if (!values.length) {
    return <div className="lumen-list-empty">{empty}</div>
  }
  return (
    <ul
      className={['lumen-list', className].filter(Boolean).join(' ')}
      aria-label={label}
      data-list-strategy={strategy}
    >
      {values.map((item) => (
        <li key={item.id} data-selected={item.selected || undefined}>
          {onSelect ? (
            <LumenButton
              variant="text"
              disabled={item.disabled}
              aria-pressed={item.selected}
              onClick={() => onSelect(item.id)}
            >
              {item.leading}
              <span>
                <span>{item.primary}</span>
                {item.secondary ? <small>{item.secondary}</small> : null}
              </span>
              {item.trailing}
            </LumenButton>
          ) : (
            <React.Fragment>
              {item.leading}
              <span>
                <span>{item.primary}</span>
                {item.secondary ? <small>{item.secondary}</small> : null}
              </span>
              {item.trailing}
            </React.Fragment>
          )}
        </li>
      ))}
    </ul>
  )
}

export interface LumenDataTableColumn<Row> {
  id: string
  label: string
  render: (row: Row) => React.ReactNode
  basis?: string | undefined
}

export interface LumenDataTableProps<Row extends { id: string }> {
  label: string
  columns: readonly LumenDataTableColumn<Row>[]
  rows: readonly Row[]
  empty: React.ReactNode
  selectedIds?: readonly string[] | undefined
  rowLabel?: ((row: Row) => string) | undefined
  onRowSelect?: ((id: string) => void) | undefined
  className?: string | undefined
}

export function LumenDataTable<Row extends { id: string }>({
  label,
  columns,
  rows,
  empty,
  selectedIds = [],
  rowLabel,
  onRowSelect,
  className,
}: LumenDataTableProps<Row>) {
  const values = uniqueItems(rows)
  if (!values.length) {
    return <div className="lumen-table-empty">{empty}</div>
  }
  return (
    <div className={['lumen-data-table', className].filter(Boolean).join(' ')} role="table" aria-label={label}>
      <div role="rowgroup">
        <div role="row">
          {columns.map((column) => (
            <span key={column.id} role="columnheader" style={{ flexBasis: column.basis }}>
              {column.label}
            </span>
          ))}
        </div>
      </div>
      <div role="rowgroup">
        {values.map((row) => {
          const selected = selectedIds.includes(row.id)
          return (
            <div
              key={row.id}
              role="row"
              aria-selected={onRowSelect ? selected : undefined}
              data-selected={selected || undefined}
            >
              {columns.map((column) => (
                <span key={column.id} role="cell" style={{ flexBasis: column.basis }}>
                  {column.render(row)}
                </span>
              ))}
              {onRowSelect && rowLabel ? (
                <span role="cell" className="lumen-table-action">
                  <LumenIconButton label={rowLabel(row)} onClick={() => onRowSelect(row.id)}>
                    <span className="lumen-row-action-glyph" aria-hidden="true" />
                  </LumenIconButton>
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export interface LumenPaginationLabels {
  previous: string
  next: string
  page: (page: number) => string
}

export interface LumenPaginationProps {
  label: string
  page: number
  pageCount: number
  labels: LumenPaginationLabels
  onChange: (page: number) => void
}

export function LumenPagination({ label, page, pageCount, labels, onChange }: LumenPaginationProps) {
  const count = Math.max(1, Math.floor(pageCount))
  const current = Math.max(1, Math.min(count, Math.floor(page)))
  return (
    <nav className="lumen-pagination" aria-label={label}>
      <LumenButton variant="text" disabled={current <= 1} onClick={() => onChange(current - 1)}>
        {labels.previous}
      </LumenButton>
      {Array.from({ length: count }, (_, index) => index + 1).map((value) => (
        <LumenButton
          key={value}
          variant="text"
          aria-label={labels.page(value)}
          aria-current={value === current ? 'page' : undefined}
          indicatorState={value === current ? 'selected' : undefined}
          onClick={() => onChange(value)}
        >
          {value}
        </LumenButton>
      ))}
      <LumenButton variant="text" disabled={current >= count} onClick={() => onChange(current + 1)}>
        {labels.next}
      </LumenButton>
    </nav>
  )
}

export interface LumenTreeNode {
  id: string
  label: string
  detail?: string | undefined
  children?: readonly LumenTreeNode[] | undefined
}

export interface LumenTreeProps {
  label: string
  nodes: readonly LumenTreeNode[]
  selectedId: string | null
  expandedIds: readonly string[]
  empty: React.ReactNode
  expandLabel: (node: LumenTreeNode, expanded: boolean) => string
  onSelect: (id: string) => void
  onExpandedChange: (id: string, expanded: boolean) => void
}

function TreeNodes(props: Omit<LumenTreeProps, 'label' | 'empty'> & { nodes: readonly LumenTreeNode[] }) {
  return (
    <ul role="group">
      {uniqueItems(props.nodes).map((node) => {
        const children = uniqueItems(node.children ?? [])
        const expanded = props.expandedIds.includes(node.id)
        return (
          <li
            key={node.id}
            role="treeitem"
            aria-selected={props.selectedId === node.id}
            aria-expanded={children.length ? expanded : undefined}
          >
            <div>
              {children.length ? (
                <LumenIconButton
                  size="s"
                  label={props.expandLabel(node, expanded)}
                  onClick={() => props.onExpandedChange(node.id, !expanded)}
                >
                  <span className="lumen-tree-chevron" data-expanded={expanded || undefined} aria-hidden="true" />
                </LumenIconButton>
              ) : null}
              <LumenButton variant="text" onClick={() => props.onSelect(node.id)}>
                <span>
                  <span>{node.label}</span>
                  {node.detail ? <small>{node.detail}</small> : null}
                </span>
              </LumenButton>
            </div>
            {children.length && expanded ? <TreeNodes {...props} nodes={children} /> : null}
          </li>
        )
      })}
    </ul>
  )
}

export function LumenTree({ label, nodes, empty, ...other }: LumenTreeProps) {
  return nodes.length ? (
    <div className="lumen-tree" role="tree" aria-label={label}>
      <TreeNodes {...other} nodes={nodes} />
    </div>
  ) : (
    <div className="lumen-tree-empty">{empty}</div>
  )
}

export type LumenStepState = 'pending' | 'current' | 'complete' | 'failed'

export interface LumenStep {
  id: string
  label: string
  detail?: string | undefined
  state: LumenStepState
  stateLabel: string
}

export interface LumenStepperProps {
  label: string
  steps: readonly LumenStep[]
  onSelect?: ((id: string) => void) | undefined
}

function stepTone(state: LumenStepState): 'neutral' | 'success' | 'danger' {
  if (state === 'failed') {
    return 'danger'
  }
  if (state === 'complete') {
    return 'success'
  }
  return 'neutral'
}

export function LumenStepper({ label, steps, onSelect }: LumenStepperProps) {
  return (
    <ol className="lumen-stepper" aria-label={label}>
      {uniqueItems(steps).map((step, index) => (
        <li key={step.id} data-state={step.state} aria-current={step.state === 'current' ? 'step' : undefined}>
          <span className="lumen-step-index" aria-hidden="true">
            {index + 1}
          </span>
          {onSelect ? (
            <LumenButton variant="text" onClick={() => onSelect(step.id)}>
              <span>{step.label}</span>
              {step.detail ? <small>{step.detail}</small> : null}
            </LumenButton>
          ) : (
            <div>
              <span>{step.label}</span>
              {step.detail ? <small>{step.detail}</small> : null}
            </div>
          )}
          <LumenStatus value={step.stateLabel} tone={stepTone(step.state)} />
        </li>
      ))}
    </ol>
  )
}

export interface LumenTimelineItem {
  id: string
  title: string
  detail?: string | undefined
  time: string
  dateTime?: string | undefined
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | undefined
}

export interface LumenTimelineProps {
  label: string
  items: readonly LumenTimelineItem[]
  empty: React.ReactNode
}

export function LumenTimeline({ label, items, empty }: LumenTimelineProps) {
  const values = uniqueItems(items)
  return values.length ? (
    <ol className="lumen-timeline" aria-label={label}>
      {values.map((item) => (
        <li key={item.id} data-tone={item.tone}>
          <span aria-hidden="true" />
          <div>
            <LumenText as="strong" variant="label">
              {item.title}
            </LumenText>
            {item.detail ? (
              <LumenText as="p" tone="muted">
                {item.detail}
              </LumenText>
            ) : null}
          </div>
          <time dateTime={item.dateTime}>{item.time}</time>
        </li>
      ))}
    </ol>
  ) : (
    <div className="lumen-timeline-empty">{empty}</div>
  )
}

export interface LumenMetricProps {
  label: string
  value: string
  detail?: string | undefined
  trend?: string | undefined
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | undefined
  progress?: { value: number; maximum?: number | undefined; label: string } | undefined
}

export function LumenMetric({ label, value, detail, trend, tone = 'neutral', progress }: LumenMetricProps) {
  return (
    <article className="lumen-metric" data-tone={tone}>
      <LumenText as="small" tone="muted" variant="supporting">
        {label}
      </LumenText>
      <LumenText as="strong" variant="title">
        {value}
      </LumenText>
      {trend ? <LumenBadge value={trend} tone={tone} /> : null}
      {detail ? (
        <LumenText as="small" tone="subtle" variant="supporting">
          {detail}
        </LumenText>
      ) : null}
      {progress ? (
        <LumenProgress label={progress.label} value={progress.value} maximum={progress.maximum} tone={tone} />
      ) : null}
    </article>
  )
}

export interface LumenChartPoint {
  id: string
  label?: string | undefined
  value: number
}

export interface LumenChartSeries {
  id: string
  label: string
  points: readonly LumenChartPoint[]
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | undefined
}

export interface LumenChartProps {
  label: string
  kind: 'area' | 'bar' | 'grouped-bar' | 'line' | 'stacked-area'
  series: readonly LumenChartSeries[]
  empty: React.ReactNode
  className?: string | undefined
  compact?: boolean | undefined
  selectedPointId?: string | undefined
  cursorLabel?: React.ReactNode
  onPointChange?: ((point: LumenChartPoint) => void) | undefined
}

function chartCoordinates(points: readonly LumenChartPoint[], maximum: number): string {
  return points
    .map((point, index) => {
      const x = points.length > 1 ? (index / (points.length - 1)) * 100 : 50
      const safeValue = Number.isFinite(point.value) ? point.value : 0
      const y = 100 - Math.max(0, Math.min(1, safeValue / maximum)) * 92
      return `${x},${y}`
    })
    .join(' ')
}

function chartCoordinate(index: number, count: number, value: number, maximum: number) {
  const x = count > 1 ? (index / (count - 1)) * 100 : 50
  const safeValue = Number.isFinite(value) ? value : 0
  const y = 100 - Math.max(0, Math.min(1, safeValue / maximum)) * 92
  return { x, y }
}

export function LumenChart({
  label,
  kind,
  series,
  empty,
  className,
  compact = false,
  selectedPointId,
  cursorLabel,
  onPointChange,
}: LumenChartProps) {
  const values = uniqueItems(series).map((item) => ({ ...item, points: uniqueItems(item.points) }))
  const pointCount = Math.max(0, ...values.map((item) => item.points.length))
  const maximum =
    kind === 'stacked-area'
      ? Math.max(
          1,
          ...Array.from({ length: pointCount }, (_, index) =>
            values.reduce((sum, item) => sum + Math.max(0, item.points[index]?.value ?? 0), 0),
          ),
        )
      : Math.max(
          1,
          ...values.flatMap((item) => item.points.map((point) => (Number.isFinite(point.value) ? point.value : 0))),
        )
  if (!values.length || values.every((item) => !item.points.length)) {
    return <div className="lumen-chart-empty">{empty}</div>
  }
  const interactivePoints = values[0]?.points ?? []
  const selectedIndex = interactivePoints.findIndex((point) => point.id === selectedPointId)
  const selectedPoint = selectedIndex >= 0 ? interactivePoints[selectedIndex] : undefined
  const moveSelection = (direction: -1 | 1) => {
    if (!onPointChange || !interactivePoints.length) {
      return
    }
    let current = selectedIndex
    if (current < 0) {
      current = direction > 0 ? -1 : 0
    }
    const next = (current + direction + interactivePoints.length) % interactivePoints.length
    const point = interactivePoints[next]
    if (point) {
      onPointChange(point)
    }
  }
  const interactionProps = onPointChange
    ? {
        tabIndex: 0,
        onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            moveSelection(event.key === 'ArrowRight' ? 1 : -1)
          }
        },
        onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          if (!bounds.width || !interactivePoints.length) {
            return
          }
          const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
          const point = interactivePoints[Math.round(ratio * (interactivePoints.length - 1))]
          if (point && point.id !== selectedPointId) {
            onPointChange(point)
          }
        },
      }
    : {}
  const classes = ['lumen-chart', className].filter(Boolean).join(' ')
  if (kind === 'bar' || kind === 'grouped-bar') {
    return (
      <div
        className={`${classes} ${kind === 'grouped-bar' ? 'lumen-chart-grouped-bars' : 'lumen-chart-bars'}`}
        role="img"
        aria-label={label}
        data-kind={kind}
        data-compact={compact || undefined}
      >
        {kind === 'grouped-bar'
          ? Array.from({ length: pointCount }, (_, index) => (
              <span className="lumen-chart-bar-group" key={index}>
                {values.map((item) => {
                  const point = item.points[index]
                  return point ? (
                    <i
                      key={`${item.id}-${point.id}`}
                      data-tone={item.tone}
                      title={point.label ? `${item.label}: ${point.label}` : item.label}
                      style={{
                        blockSize: `${Math.max(0, Math.min(1, point.value / maximum)) * 100}%`,
                      }}
                    />
                  ) : null
                })}
              </span>
            ))
          : values.flatMap((item) =>
              item.points.map((point) => (
                <span key={`${item.id}-${point.id}`} data-tone={item.tone} title={point.label}>
                  <i
                    style={{
                      blockSize: `${Math.max(0, Math.min(1, point.value / maximum)) * 100}%`,
                    }}
                  />
                </span>
              )),
            )}
      </div>
    )
  }
  const cumulative = Array.from({ length: pointCount }, () => 0)
  return (
    <div
      className={classes}
      role="img"
      aria-label={label}
      data-kind={kind}
      data-compact={compact || undefined}
      {...interactionProps}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {values.map((item) => {
          const lower = item.points.map((_, index) => cumulative[index] ?? 0)
          const upper = item.points.map((point, index) => {
            const value = (cumulative[index] ?? 0) + Math.max(0, point.value)
            cumulative[index] = value
            return value
          })
          const points =
            kind === 'stacked-area'
              ? upper
                  .map((value, index) => {
                    const point = chartCoordinate(index, upper.length, value, maximum)
                    return `${point.x},${point.y}`
                  })
                  .join(' ')
              : chartCoordinates(item.points, maximum)
          const area =
            kind === 'stacked-area'
              ? `M ${points.replaceAll(' ', ' L ')} L ${lower
                  .map((value, index) => {
                    const point = chartCoordinate(index, lower.length, value, maximum)
                    return `${point.x},${point.y}`
                  })
                  .reverse()
                  .join(' L ')} Z`
              : `M 0 100 L ${points.replaceAll(' ', ' L ')} L 100 100 Z`
          return (
            <g key={item.id} data-tone={item.tone} data-series={item.id}>
              {kind === 'area' || kind === 'stacked-area' ? <path d={area} /> : null}
              <polyline points={points} />
            </g>
          )
        })}
        {selectedPoint ? (
          <g className="lumen-chart-selection">
            <line
              x1={chartCoordinate(selectedIndex, interactivePoints.length, selectedPoint.value, maximum).x}
              x2={chartCoordinate(selectedIndex, interactivePoints.length, selectedPoint.value, maximum).x}
              y1="4"
              y2="100"
            />
            <circle
              cx={chartCoordinate(selectedIndex, interactivePoints.length, selectedPoint.value, maximum).x}
              cy={chartCoordinate(selectedIndex, interactivePoints.length, selectedPoint.value, maximum).y}
              r="2.25"
            />
          </g>
        ) : null}
      </svg>
      {cursorLabel ? <small className="lumen-chart-cursor-label">{cursorLabel}</small> : null}
    </div>
  )
}

export interface LumenCandlestickPoint {
  id: string
  label: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface LumenCandlestickChartProps {
  label: string
  volumeLabel: string
  points: readonly LumenCandlestickPoint[]
  empty: React.ReactNode
  itemLabel: (point: LumenCandlestickPoint) => string
}

export function LumenCandlestickChart({
  label,
  volumeLabel,
  points: sourcePoints,
  empty,
  itemLabel,
}: LumenCandlestickChartProps) {
  const points = uniqueItems(sourcePoints)
  if (!points.length) {
    return <div className="lumen-chart-empty">{empty}</div>
  }
  const lowest = Math.min(...points.map((point) => point.low))
  const highest = Math.max(...points.map((point) => point.high))
  const range = Math.max(1, highest - lowest)
  const volumeMaximum = Math.max(1, ...points.map((point) => point.volume))
  const priceY = (value: number) => 5 + ((highest - value) / range) * 66
  return (
    <div className="lumen-candlestick-chart" role="img" aria-label={`${label}. ${volumeLabel}`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {points.map((point, index) => {
          const x = points.length > 1 ? 7 + (index / (points.length - 1)) * 86 : 50
          const openY = priceY(point.open)
          const closeY = priceY(point.close)
          const bodyY = Math.min(openY, closeY)
          const bodyHeight = Math.max(1.5, Math.abs(closeY - openY))
          const volumeHeight = Math.max(1, (point.volume / volumeMaximum) * 18)
          return (
            <g key={point.id} data-up={point.close >= point.open}>
              <title>{itemLabel(point)}</title>
              <line className="lumen-candlestick-wick" x1={x} x2={x} y1={priceY(point.high)} y2={priceY(point.low)} />
              <rect className="lumen-candlestick-body" x={x - 1.6} y={bodyY} width="3.2" height={bodyHeight} />
              <rect
                className="lumen-candlestick-volume"
                x={x - 1.6}
                y={96 - volumeHeight}
                width="3.2"
                height={volumeHeight}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export interface LumenScatterChartPoint {
  id: string
  label: string
  x: number
  y: number
  size: number
}

export interface LumenScatterChartProps {
  label: string
  points: readonly LumenScatterChartPoint[]
  selectedPointId?: string | undefined
  pointLabel: (point: LumenScatterChartPoint) => string
  onPointSelect?: ((point: LumenScatterChartPoint) => void) | undefined
  empty: React.ReactNode
}

export function LumenScatterChart({
  label,
  points: sourcePoints,
  selectedPointId,
  pointLabel,
  onPointSelect,
  empty,
}: LumenScatterChartProps) {
  const points = uniqueItems(sourcePoints)
  if (!points.length) {
    return <div className="lumen-chart-empty">{empty}</div>
  }
  const sizeMaximum = Math.max(1, ...points.map((point) => point.size))
  const selectedIndex = Math.max(
    0,
    points.findIndex((point) => point.id === selectedPointId),
  )
  return (
    <div className="lumen-scatter-chart">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={label}
        tabIndex={onPointSelect ? 0 : undefined}
        onKeyDown={(event) => {
          if (!onPointSelect || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) {
            return
          }
          event.preventDefault()
          const direction = event.key === 'ArrowRight' ? 1 : -1
          const point = points[(selectedIndex + direction + points.length) % points.length]
          if (point) {
            onPointSelect(point)
          }
        }}
      >
        <line className="lumen-scatter-guide" x1="50" x2="50" y1="4" y2="96" />
        <line className="lumen-scatter-guide" x1="4" x2="96" y1="50" y2="50" />
        {points.map((point) => (
          <circle
            key={point.id}
            data-selected={point.id === selectedPointId || undefined}
            cx={Math.max(4, Math.min(96, point.x))}
            cy={100 - Math.max(4, Math.min(96, point.y))}
            r={2 + (Math.max(0, point.size) / sizeMaximum) * 4}
            onClick={() => onPointSelect?.(point)}
          >
            <title>{pointLabel(point)}</title>
          </circle>
        ))}
      </svg>
    </div>
  )
}

export interface LumenComboChartProps {
  label: string
  bars: readonly LumenChartPoint[]
  trend: readonly LumenChartPoint[]
  barsLabel: string
  trendLabel: string
  empty: React.ReactNode
}

export function LumenComboChart({
  label,
  bars: sourceBars,
  trend: sourceTrend,
  barsLabel,
  trendLabel,
  empty,
}: LumenComboChartProps) {
  const bars = uniqueItems(sourceBars)
  const trend = uniqueItems(sourceTrend)
  if (!bars.length && !trend.length) {
    return <div className="lumen-chart-empty">{empty}</div>
  }
  const barMaximum = Math.max(1, ...bars.map((point) => point.value))
  const trendMaximum = Math.max(1, ...trend.map((point) => point.value))
  const barWidth = Math.max(2, Math.min(12, 66 / Math.max(1, bars.length)))
  return (
    <div className="lumen-combo-chart" role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <g aria-label={barsLabel}>
          {bars.map((point, index) => {
            const x = bars.length > 1 ? 7 + (index / (bars.length - 1)) * 86 : 50
            const height = Math.max(1, (point.value / barMaximum) * 82)
            return (
              <rect
                key={point.id}
                className="lumen-combo-bar"
                x={x - barWidth / 2}
                y={94 - height}
                width={barWidth}
                height={height}
              />
            )
          })}
        </g>
        <polyline
          aria-label={trendLabel}
          className="lumen-combo-trend"
          points={trend
            .map((point, index) => {
              const coordinate = chartCoordinate(index, trend.length, point.value, trendMaximum)
              return `${coordinate.x},${coordinate.y}`
            })
            .join(' ')}
        />
      </svg>
    </div>
  )
}

export interface LumenCalendarEvent {
  id: string
  title: string
  time?: string | undefined
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | undefined
}

export interface LumenCalendarDay {
  id: string
  label: string
  number: string
  dateTime: string
  muted?: boolean | undefined
  selected?: boolean | undefined
  disabled?: boolean | undefined
  events?: readonly LumenCalendarEvent[] | undefined
}

export interface LumenCalendarProps {
  label: string
  days: readonly LumenCalendarDay[]
  onSelect: (id: string) => void
}

export function LumenCalendar({ label, days, onSelect }: LumenCalendarProps) {
  return (
    <div className="lumen-calendar" aria-label={label}>
      {uniqueItems(days).map((day) => (
        <section key={day.id} data-muted={day.muted || undefined} data-selected={day.selected || undefined}>
          <LumenButton
            variant="text"
            disabled={day.disabled}
            aria-pressed={day.selected}
            onClick={() => onSelect(day.id)}
          >
            <time dateTime={day.dateTime} aria-label={day.label}>
              {day.number}
            </time>
          </LumenButton>
          {day.events?.length ? (
            <ul>
              {uniqueItems(day.events).map((event) => (
                <li key={event.id} data-tone={event.tone}>
                  <span>{event.title}</span>
                  {event.time ? <time>{event.time}</time> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  )
}

export interface LumenMonthGridDay {
  id: string
  label: string
  dateLabel: string
  disabled?: boolean | undefined
  hasEvents?: boolean | undefined
}

export interface LumenMonthGridProps {
  label: string
  days: readonly LumenMonthGridDay[]
  selectedId: string | null
  onSelect: (id: string) => void
  className?: string | undefined
}

export function LumenMonthGrid({ label, days, selectedId, onSelect, className }: LumenMonthGridProps) {
  return (
    <div
      className={['lumen-month-grid', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={label}
      data-lumen-component="month-grid"
    >
      {uniqueItems(days).map((day) => (
        <LumenButton
          key={day.id}
          variant={selectedId === day.id ? 'solid' : 'text'}
          aria-pressed={selectedId === day.id}
          aria-label={day.dateLabel}
          disabled={day.disabled}
          onClick={() => onSelect(day.id)}
        >
          <span>{day.label}</span>
          {day.hasEvents ? <i aria-hidden="true" /> : null}
        </LumenButton>
      ))}
    </div>
  )
}

export interface LumenCodeBlockProps {
  label: string
  code: string
  language?: string | undefined
  copyLabel?: string | undefined
  onCopy?: (() => void) | undefined
}

export function LumenCodeBlock({ label, code, language, copyLabel, onCopy }: LumenCodeBlockProps) {
  return (
    <figure className="lumen-code-block" aria-label={label}>
      <figcaption>
        <LumenText as="span" variant="label">
          {label}
        </LumenText>
        {language ? <LumenBadge value={language} /> : null}
        {copyLabel && onCopy ? (
          <LumenButton size="s" variant="text" onClick={onCopy}>
            {copyLabel}
          </LumenButton>
        ) : null}
      </figcaption>
      <pre>
        <code>{code}</code>
      </pre>
    </figure>
  )
}

export interface LumenDiffLine {
  id: string
  kind: 'context' | 'added' | 'removed'
  value: string
  oldLine?: number | undefined
  newLine?: number | undefined
}

export interface LumenDiffViewProps {
  label: string
  lines: readonly LumenDiffLine[]
  empty: React.ReactNode
}

export function LumenDiffView({ label, lines, empty }: LumenDiffViewProps) {
  const values = uniqueItems(lines)
  return values.length ? (
    <figure className="lumen-diff" aria-label={label}>
      <figcaption>{label}</figcaption>
      <pre>
        {values.map((line) => (
          <code key={line.id} data-kind={line.kind}>
            <span>{line.oldLine ?? ''}</span>
            <span>{line.newLine ?? ''}</span>
            <span>{line.value}</span>
          </code>
        ))}
      </pre>
    </figure>
  ) : (
    <div className="lumen-diff-empty">{empty}</div>
  )
}
