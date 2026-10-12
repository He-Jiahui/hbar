import type { LumenDashboardListStrategy } from './dashboard'

export type LumenDashboardReferenceTone = 'neutral' | 'success' | 'warning' | 'danger'
export interface LumenDashboardReferenceChoice {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean | undefined
}
export interface LumenDashboardReferenceMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly detail?: string | undefined
  readonly delta?: string | undefined
  readonly tone?: LumenDashboardReferenceTone | undefined
  readonly points?: readonly number[] | undefined
}
export interface LumenDashboardReferenceChart {
  readonly title: string
  readonly label: string
  readonly detail?: string | undefined
  readonly value?: string | undefined
  readonly delta?: string | undefined
  readonly unit?: string | undefined
  readonly type: 'bar' | 'line' | 'dual-line' | 'demand'
  readonly points: readonly number[]
  readonly secondary?: readonly number[] | undefined
  readonly axis: readonly string[]
  readonly ticks: readonly string[]
  readonly legend?: readonly string[] | undefined
}
export interface LumenDashboardReferenceAction {
  readonly id: string
  readonly label: string
  readonly value?: string | undefined
  readonly disabled?: boolean | undefined
  readonly primary?: boolean | undefined
}
export interface LumenDashboardReferenceColumn {
  readonly id: string
  readonly label: string
  readonly narrow?: boolean | undefined
  readonly numeric?: boolean | undefined
}
export interface LumenDashboardReferenceCell {
  readonly text: string
  readonly detail?: string | undefined
  readonly progress?: number | undefined
  readonly tone?: LumenDashboardReferenceTone | undefined
  readonly points?: readonly number[] | undefined
}
export interface LumenDashboardReferenceRow {
  readonly id: string
  readonly cells: readonly LumenDashboardReferenceCell[]
  readonly disabled?: boolean | undefined
}
export interface LumenDashboardReferenceTable {
  readonly title: string
  readonly detail?: string | undefined
  readonly columns: readonly LumenDashboardReferenceColumn[]
  readonly rows: readonly LumenDashboardReferenceRow[]
  readonly footer?: string | undefined
}
export interface LumenDashboardReferenceEntry {
  readonly id: string
  readonly title: string
  readonly detail?: string | undefined
  readonly value?: string | undefined
  readonly progress?: number | undefined
  readonly tone?: LumenDashboardReferenceTone | undefined
  readonly action?: LumenDashboardReferenceAction | undefined
}
interface Base {
  readonly title: string
  readonly subtitle?: string | undefined
  readonly period?: string | undefined
  readonly listStrategy: LumenDashboardListStrategy
  readonly labels: {
    readonly empty: string
    readonly unavailable: string
    readonly clear: string
  }
  readonly onSelect: (slotId: string, itemId: string) => void
  readonly onFlag: (flagId: string, value: boolean) => void
  readonly onQuery: (value: string) => void
  readonly onRequest: (action: LumenDashboardReferenceAction) => void
}
interface Range {
  readonly choices: readonly LumenDashboardReferenceChoice[]
  readonly selectedId: string
  readonly choiceLabel: string
}
interface Revenue extends Base, Range {
  readonly kind: 'revenue'
  readonly metrics: readonly LumenDashboardReferenceMetric[]
  readonly chart: LumenDashboardReferenceChart | undefined
}
interface Signups extends Base, Range {
  readonly kind: 'signups'
  readonly chart: LumenDashboardReferenceChart | undefined
  readonly breakdown: LumenDashboardReferenceTable | undefined
}
interface WebAnalytics extends Base {
  readonly kind: 'web-analytics'
  readonly metrics: readonly LumenDashboardReferenceMetric[]
  readonly chart: LumenDashboardReferenceChart
  readonly pages: readonly LumenDashboardReferenceEntry[]
  readonly devices: readonly LumenDashboardReferenceEntry[]
  readonly funnel: readonly LumenDashboardReferenceEntry[]
  readonly titles: {
    readonly pages: string
    readonly devices: string
    readonly funnel: string
    readonly menu: (title: string) => string
  }
  readonly menuId?: string | undefined
  readonly menuActions: readonly LumenDashboardReferenceAction[]
  readonly hiddenWidgetIds: readonly string[]
}
interface Status extends Base {
  readonly kind: 'status'
  readonly metrics: readonly LumenDashboardReferenceMetric[]
  readonly services: LumenDashboardReferenceTable
  readonly incidents: readonly LumenDashboardReferenceEntry[]
  readonly incidentTitle: string
  readonly refresh: LumenDashboardReferenceAction
}
interface Usage extends Base {
  readonly kind: 'usage'
  readonly plan: {
    readonly title: string
    readonly detail: string
    readonly action: LumenDashboardReferenceAction
  }
  readonly quotaTitle: string
  readonly quotas: readonly LumenDashboardReferenceEntry[]
  readonly chart: LumenDashboardReferenceChart
}
interface Channels extends Base, Range {
  readonly kind: 'channels'
  readonly compare: boolean
  readonly compareLabel: string
  readonly table: LumenDashboardReferenceTable | undefined
}
interface Recurring extends Base, Range {
  readonly kind: 'recurring'
  readonly mode: 'ready' | 'loading' | 'empty'
  readonly chart: LumenDashboardReferenceChart
  readonly metrics: readonly LumenDashboardReferenceMetric[]
  readonly emptyTitle: string
  readonly emptyBody: string
  readonly loadingLabel: string
}
interface Modules extends Base {
  readonly kind: 'modules'
  readonly metrics: readonly LumenDashboardReferenceMetric[]
  readonly table: LumenDashboardReferenceTable
  readonly query: string
  readonly descending: boolean
  readonly sortColumnId: string
  readonly starredIds: readonly string[]
  readonly filterOpen: boolean
  readonly filters: readonly LumenDashboardReferenceChoice[]
  readonly selectedFilterId: string
  readonly menuRowId?: string | undefined
  readonly menuActions: readonly LumenDashboardReferenceAction[]
  readonly emptyTitle: (query: string) => string
  readonly emptyBody: string
  readonly clearSearch: string
  readonly actions: readonly LumenDashboardReferenceAction[]
  readonly toolbar: {
    readonly search: string
    readonly ascending: string
    readonly descending: string
    readonly filters: string
    readonly sort: (name: string) => string
    readonly document: (name: string) => string
    readonly star: (name: string) => string
    readonly more: (name: string) => string
  }
}
interface Delivery extends Base, Range {
  readonly kind: 'delivery'
  readonly metrics: readonly LumenDashboardReferenceMetric[]
  readonly worklog: LumenDashboardReferenceTable | undefined
  readonly previousWorklog?: LumenDashboardReferenceTable | undefined
  readonly weeks: readonly LumenDashboardReferenceChoice[]
  readonly selectedWeekId: string
  readonly weekLabel: string
  readonly previous: string
  readonly next: string
  readonly bookmarked: boolean
  readonly bookmarkLabel: string
}
export interface LumenDashboardReferenceMeasure extends LumenDashboardReferenceChoice {
  readonly value: string
  readonly chart: LumenDashboardReferenceChart
  readonly minimum: string
  readonly maximum: string
}
interface Explorer extends Base {
  readonly kind: 'explorer'
  readonly measures: readonly LumenDashboardReferenceMeasure[]
  readonly selectedId: string
  readonly measureLabel: string
  readonly rangeLabel: (minimum: string, maximum: string) => string
  readonly agents: readonly LumenDashboardReferenceEntry[]
  readonly integrations: readonly LumenDashboardReferenceEntry[]
  readonly titles: {
    readonly agents: string
    readonly agentDetail: string
    readonly integrations: string
    readonly integrationDetail: string
  }
  readonly report: LumenDashboardReferenceAction
  readonly manage: LumenDashboardReferenceAction
}
interface Coverage extends Base {
  readonly kind: 'coverage'
  readonly metrics: readonly LumenDashboardReferenceMetric[]
  readonly review: LumenDashboardReferenceTable
  readonly chart: LumenDashboardReferenceChart
  readonly queue: readonly LumenDashboardReferenceEntry[]
  readonly queueTitle: string
  readonly queueDetail: string
  readonly queueFooter: string
  readonly export: LumenDashboardReferenceAction
}
interface Payout extends Base {
  readonly kind: 'payout'
  readonly desk: {
    readonly category: string
    readonly date: string
    readonly title: string
    readonly detail: string
    readonly balanceLabel: string
    readonly balance: string
    readonly pending: string
  }
  readonly metrics: readonly LumenDashboardReferenceMetric[]
  readonly actions: readonly LumenDashboardReferenceAction[]
  readonly chart: LumenDashboardReferenceChart
  readonly moves: LumenDashboardReferenceTable
  readonly release: {
    readonly title: string
    readonly detail: string
    readonly badge: string
    readonly label: string
    readonly progress: number
    readonly value: string
    readonly held: string
    readonly limit: string
    readonly action: LumenDashboardReferenceAction
    readonly lanes: readonly LumenDashboardReferenceEntry[]
    readonly footer: string
    readonly total: string
  }
  readonly export: LumenDashboardReferenceAction
}
export interface LumenDashboardReferenceObjective extends LumenDashboardReferenceEntry {
  readonly chart: LumenDashboardReferenceChart | undefined
  readonly results: readonly LumenDashboardReferenceEntry[]
}
interface Goals extends Base {
  readonly kind: 'goals'
  readonly metrics: readonly LumenDashboardReferenceMetric[]
  readonly objectives: readonly LumenDashboardReferenceObjective[]
  readonly selectedId: string
  readonly titles: {
    readonly objectives: string
    readonly footer: string
    readonly results: string
    readonly resultDetail: string
    readonly resultFooter: string
  }
}
export interface LumenDashboardReferenceService extends LumenDashboardReferenceEntry {
  readonly points: readonly number[]
  readonly metadata?: string | undefined
  readonly metrics?: readonly LumenDashboardReferenceMetric[] | undefined
  readonly chart?: LumenDashboardReferenceChart | undefined
  readonly activity?: readonly LumenDashboardReferenceEntry[] | undefined
}
interface Service extends Base {
  readonly kind: 'service'
  readonly query: string
  readonly selectedId: string
  readonly services: readonly LumenDashboardReferenceService[]
  readonly search: string
  readonly live: string
  readonly activityTitle: string
  readonly refresh: LumenDashboardReferenceAction
  readonly actions: readonly LumenDashboardReferenceAction[]
}

export type LumenDashboardReferenceContent =
  | Revenue
  | Signups
  | WebAnalytics
  | Status
  | Usage
  | Channels
  | Recurring
  | Modules
  | Delivery
  | Explorer
  | Coverage
  | Payout
  | Goals
  | Service
