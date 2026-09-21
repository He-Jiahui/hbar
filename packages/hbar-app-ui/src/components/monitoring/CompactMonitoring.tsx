import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenButton } from '@lumen/app-ui'
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
    <LumenCollection as="dl" className="hbar-app-ui-compact-metrics" aria-label={label}>
      {uniqueItems(metrics).map((metric) => (
        <LumenFrame key={metric.id}>
          <LumenCollectionItem as="dt">{metric.label}</LumenCollectionItem>
          <LumenCollectionItem as="dd">{metric.value}</LumenCollectionItem>
          {metric.detail && <LumenText as="small">{metric.detail}</LumenText>}
        </LumenFrame>
      ))}
    </LumenCollection>
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
  selectedId,
  selectLabel,
  onSelect,
}: {
  readonly label: string
  readonly points: readonly HbarAppUiBarPoint[]
  readonly empty: ReactNode
  readonly maximum?: number | undefined
  readonly selectedId?: string | null | undefined
  readonly selectLabel?: ((point: HbarAppUiBarPoint) => string) | undefined
  readonly onSelect?: ((id: string) => void) | undefined
}) {
  const records = uniqueItems(points)
  const scale =
    maximum !== undefined && Number.isFinite(maximum) && maximum > 0
      ? maximum
      : Math.max(1, ...records.map((point) => (Number.isFinite(point.value) ? point.value : 0)))
  return records.length ? (
    <LumenFrame className="hbar-app-ui-bar-series" role="img" aria-label={label}>
      {records.map((point) => {
        const style = {
          blockSize: `${Math.max(0, Math.min(1, Number.isFinite(point.value) ? point.value / scale : 0)) * 100}%`,
        }
        return onSelect ? (
          <LumenButton
            key={point.id}
            type="button"
            title={point.label}
            aria-label={selectLabel?.(point) ?? point.label}
            aria-pressed={selectedId === point.id}
            style={style}
            onClick={() => onSelect(point.id)}
          />
        ) : (
          <LumenFrame as="i" key={point.id} title={point.label} style={style} />
        )
      })}
    </LumenFrame>
  ) : (
    <>{empty}</>
  )
}
