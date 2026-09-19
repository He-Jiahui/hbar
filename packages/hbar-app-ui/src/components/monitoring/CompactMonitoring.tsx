import type { ReactNode } from 'react'
import { uniqueItems } from '../../collection'
import './CompactMonitoring.css'

export interface HbarAppUiCompactMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly detail?: string | undefined
}

export function HbarAppUiCompactMetrics({
  label,
  metrics,
}: {
  readonly label: string
  readonly metrics: readonly HbarAppUiCompactMetric[]
}) {
  return (
    <dl className="hbar-app-ui-compact-metrics" aria-label={label}>
      {uniqueItems(metrics).map((metric) => (
        <div key={metric.id}>
          <dt>{metric.label}</dt>
          <dd>{metric.value}</dd>
          {metric.detail && <small>{metric.detail}</small>}
        </div>
      ))}
    </dl>
  )
}

export interface HbarAppUiBarPoint {
  readonly id: string
  readonly value: number
  readonly label: string
}

export function HbarAppUiBarSeries({
  label,
  points,
  empty,
  maximum,
}: {
  readonly label: string
  readonly points: readonly HbarAppUiBarPoint[]
  readonly empty: ReactNode
  readonly maximum?: number | undefined
}) {
  const records = uniqueItems(points)
  const scale =
    maximum !== undefined && Number.isFinite(maximum) && maximum > 0
      ? maximum
      : Math.max(1, ...records.map((point) => (Number.isFinite(point.value) ? point.value : 0)))
  return records.length ? (
    <div className="hbar-app-ui-bar-series" role="img" aria-label={label}>
      {records.map((point) => (
        <i
          key={point.id}
          title={point.label}
          style={{
            blockSize: `${Math.max(0, Math.min(1, Number.isFinite(point.value) ? point.value / scale : 0)) * 100}%`,
          }}
        />
      ))}
    </div>
  ) : (
    <>{empty}</>
  )
}
