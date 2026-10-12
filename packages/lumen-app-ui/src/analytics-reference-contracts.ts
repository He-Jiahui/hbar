import type { LumenAnalyticsChoice, LumenAnalyticsListStrategy } from './analytics'

export interface LumenAnalyticsReferenceMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly detail?: string | undefined
  readonly delta?: string | undefined
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' | undefined
  readonly points?: readonly number[] | undefined
}
export interface LumenAnalyticsReferenceSeries {
  readonly id: string
  readonly label: string
  readonly points: readonly number[]
  readonly color: string
  readonly visible: boolean
}
export interface LumenAnalyticsReferenceChart {
  readonly label: string
  readonly type: 'line' | 'area' | 'grouped' | 'stacked'
  readonly maximum: number
  readonly series: readonly LumenAnalyticsReferenceSeries[]
  readonly axis: readonly string[]
  readonly ticks: readonly string[]
  readonly guide?: { readonly value: number; readonly label: string } | undefined
  readonly pointLabels: readonly string[]
  readonly cursorId: string
  readonly cursorLabel: (index: number) => string
}
export interface LumenAnalyticsReferenceEntry {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly detail: string
  readonly amount: number
  readonly color: string
  readonly abbreviation?: string | undefined
  readonly delta?: string | undefined
  readonly points?: readonly number[] | undefined
  readonly disabled?: boolean | undefined
}
interface Base {
  readonly title: string
  readonly subtitle?: string | undefined
  readonly value?: string | undefined
  readonly delta?: string | undefined
  readonly footer?: string | undefined
  readonly listStrategy: LumenAnalyticsListStrategy
  readonly labels: {
    readonly empty: string
    readonly unavailable: string
    readonly choices: string
    readonly detail: string
  }
  readonly available?: boolean | undefined
  readonly choices: readonly LumenAnalyticsChoice[]
  readonly selectedId: string
  readonly onSelect: (slotId: string, itemId: string) => void
  readonly onFlag: (flagId: string, value: boolean) => void
  readonly onRequest: (actionId: string) => void
}
interface Pulse extends Base {
  readonly kind: 'pulse'
  readonly metrics: readonly LumenAnalyticsReferenceMetric[]
  readonly reportLabel: string
}
interface Chart extends Base {
  readonly kind: 'revenue' | 'tickets' | 'latency' | 'storage'
  readonly chart: LumenAnalyticsReferenceChart
  readonly metrics: readonly LumenAnalyticsReferenceMetric[]
}
interface Channels extends Base {
  readonly kind: 'channels'
  readonly entries: readonly LumenAnalyticsReferenceEntry[]
  readonly total: string
  readonly unit: string
  readonly activeEntryId: string
  readonly selectedSummary: (entry: LumenAnalyticsReferenceEntry) => string
}
interface Referrals extends Base {
  readonly kind: 'referrals'
  readonly entries: readonly LumenAnalyticsReferenceEntry[]
  readonly contribution: readonly LumenAnalyticsReferenceEntry[]
  readonly activeEntryId: string
}
interface Service extends Base {
  readonly kind: 'service'
  readonly metrics: readonly LumenAnalyticsReferenceMetric[]
  readonly activeMetricId: string
  readonly detailTitle: string
  readonly chart: LumenAnalyticsReferenceChart | undefined
  readonly detailMetrics: readonly LumenAnalyticsReferenceMetric[]
}
interface Funnel extends Base {
  readonly kind: 'funnel'
  readonly entries: readonly LumenAnalyticsReferenceEntry[]
  readonly drops: readonly string[]
  readonly activeEntryId: string
}
interface Heatmap extends Base {
  readonly kind: 'heatmap'
  readonly cells: readonly {
    readonly id: string
    readonly label: string
    readonly count: number
  }[]
  readonly months: readonly string[]
  readonly weekdays: readonly string[]
  readonly less: string
  readonly more: string
  readonly activeCellId: string
}
interface Goals extends Base {
  readonly kind: 'goals'
  readonly entries: readonly LumenAnalyticsReferenceEntry[]
  readonly activeEntryId: string
}
interface Cohort extends Base {
  readonly kind: 'cohort'
  readonly displayChoices: readonly LumenAnalyticsChoice[]
  readonly displayId: string
  readonly columnLabel: string
  readonly periods: readonly string[]
  readonly rows: readonly {
    readonly id: string
    readonly label: string
    readonly detail: string
    readonly values: readonly { readonly label: string; readonly percent: number }[]
  }[]
  readonly averageLabel: string
  readonly averages: readonly string[]
}
interface Candles extends Base {
  readonly kind: 'candles'
  readonly chartLabel: string
  readonly candles: readonly {
    readonly id: string
    readonly label: string
    readonly open: number
    readonly high: number
    readonly low: number
    readonly close: number
    readonly volume: number
    readonly detail: string
  }[]
  readonly axis: readonly string[]
  readonly ticks: readonly string[]
  readonly minimum: number
  readonly maximum: number
  readonly activeCandleId: string
}
interface Scatter extends Base {
  readonly kind: 'scatter'
  readonly chartLabel: string
  readonly points: readonly {
    readonly id: string
    readonly label: string
    readonly seats: number
    readonly active: number
    readonly size: number
    readonly segment: 'growth' | 'enterprise'
    readonly detail: string
  }[]
  readonly quadrants: readonly string[]
  readonly xAxis: readonly string[]
  readonly yAxis: readonly string[]
  readonly maximumSeats: number
  readonly medianSeats: number
  readonly threshold: number
  readonly activePointId: string
}
interface Bullets extends Base {
  readonly kind: 'bullets'
  readonly entries: readonly (LumenAnalyticsReferenceEntry & { readonly quota: number })[]
  readonly activeEntryId: string
}
interface Live extends Base {
  readonly kind: 'live'
  readonly chart: LumenAnalyticsReferenceChart
  readonly metrics: readonly LumenAnalyticsReferenceMetric[]
  readonly paused: boolean
  readonly pauseLabel: string
  readonly resumeLabel: string
  readonly liveLabel: string
  readonly pausedLabel: string
}
export type LumenAnalyticsReferenceContent =
  | Pulse
  | Chart
  | Channels
  | Referrals
  | Service
  | Funnel
  | Heatmap
  | Goals
  | Cohort
  | Candles
  | Scatter
  | Bullets
  | Live
