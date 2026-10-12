export type LumenMonitoringReferenceTone = 'neutral' | 'success' | 'warning' | 'danger'
export type LumenMonitoringReferenceActionId =
  | 'range'
  | 'metric'
  | 'status'
  | 'state'
  | 'level'
  | 'window'
  | 'region'
  | 'query'
  | 'sort'
  | 'select'
  | 'expand'
  | 'group'
  | 'all-groups'
  | 'pause'
  | 'follow'
  | 'attention'
  | 'silence'
  | 'silence-firing'
  | 'resolve'
  | 'incident-resolve'
  | 'reset-alerts'
  | 'draft'
  | 'post'
  | 'clear'
  | 'refresh'
  | 'options'
  | 'new-run'
  | 'run-actions'
  | 'bucket'
export interface LumenMonitoringReferenceChoice {
  readonly id: string
  readonly label: string
  readonly count?: number | undefined
}
export interface LumenMonitoringReferenceMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly delta?: string | undefined
  readonly detail?: string | undefined
  readonly direction?: 'up' | 'down' | undefined
  readonly tone?: LumenMonitoringReferenceTone | undefined
  readonly optionsLabel?: string | undefined
}
export interface LumenMonitoringReferenceChart {
  readonly label: string
  readonly points: readonly number[]
  readonly axis: readonly string[]
  readonly tone?: LumenMonitoringReferenceTone | undefined
  readonly threshold?: number | undefined
  readonly planned?: readonly number[] | undefined
}
export interface LumenMonitoringReferenceLabels {
  readonly empty: string
  readonly unavailable: string
  readonly clearSearch: string
  readonly options: (name: string) => string
  readonly shown: (shown: number, total: number) => string
  readonly progress: (name: string) => string
  readonly percent: (value: number) => string
  readonly metadata: (left: string, right: string) => string
  readonly missingValue: string
}
export interface LumenMonitoringReferenceHeader {
  readonly title: string
  readonly detail: string
  readonly status?: string | undefined
  readonly tone?: LumenMonitoringReferenceTone | undefined
}
export interface LumenMonitoringReferenceBase {
  readonly header: LumenMonitoringReferenceHeader
  readonly labels: LumenMonitoringReferenceLabels
  readonly notice?: string | undefined
  /** Operational feeds own a bounded scroll region. Hosts page beyond 80 records; logs retain 140. */
  readonly expectedMaximum: number
  readonly onAction: (actionId: LumenMonitoringReferenceActionId, value?: string) => void
}
export interface LumenMonitoringReferenceHealth extends LumenMonitoringReferenceBase {
  readonly kind: 'health'
  readonly ranges: readonly LumenMonitoringReferenceChoice[]
  readonly rangeId: string
  readonly rangeLabel: string
  readonly refreshLabel: string
  readonly metrics: readonly LumenMonitoringReferenceMetric[]
  readonly chartTitle: string
  readonly chartValue: string
  readonly chartDetail: string
  readonly chart: LumenMonitoringReferenceChart
  readonly activityLabel: string
  readonly events: readonly {
    readonly id: string
    readonly title: string
    readonly severity: string
    readonly meta: string
    readonly body: string
    readonly tone: LumenMonitoringReferenceTone
  }[]
  readonly available: boolean
}
export interface LumenMonitoringReferenceLive extends LumenMonitoringReferenceBase {
  readonly kind: 'live'
  readonly choices: readonly LumenMonitoringReferenceChoice[]
  readonly metricId: string
  readonly metricLabel: string
  readonly pauseLabel: string
  readonly resumeLabel: string
  readonly paused: boolean
  readonly value: string
  readonly unit: string
  readonly thresholdLabel: string
  readonly chart: LumenMonitoringReferenceChart
  readonly metrics: readonly LumenMonitoringReferenceMetric[]
  readonly available: boolean
}
export interface LumenMonitoringReferenceUpdate {
  readonly id: string
  readonly initials: string
  readonly author: string
  readonly status: string
  readonly time: string
  readonly body: string
  readonly tone: LumenMonitoringReferenceTone
}
export interface LumenMonitoringReferenceIncident extends LumenMonitoringReferenceBase {
  readonly kind: 'incident'
  readonly incidentId: string
  readonly statuses: readonly LumenMonitoringReferenceChoice[]
  readonly statusId: string
  readonly statusLabel: string
  readonly resolveLabel: string
  readonly metrics: readonly LumenMonitoringReferenceMetric[]
  readonly updatesLabel: string
  readonly updates: readonly LumenMonitoringReferenceUpdate[]
  readonly draft: string
  readonly draftLabel: string
  readonly draftPlaceholder: string
  readonly draftDetail: string
  readonly postLabel: string
  readonly affectedLabel: string
  readonly affected: readonly {
    readonly id: string
    readonly name: string
    readonly status: string
    readonly tone: LumenMonitoringReferenceTone
  }[]
  readonly respondersLabel: string
  readonly responders: readonly {
    readonly id: string
    readonly initials: string
    readonly name: string
    readonly role: string
  }[]
  readonly budgetLabel: string
  readonly budgetDetail: string
  readonly budget: number
}
export interface LumenMonitoringReferenceAlert {
  readonly id: string
  readonly title: string
  readonly severity: string
  readonly meta: string
  readonly value: string
  readonly duration: string
  readonly stateId: string
  readonly body?: string | undefined
  readonly points: readonly number[]
  readonly tone: LumenMonitoringReferenceTone
  readonly muted: boolean
}
export interface LumenMonitoringReferenceAlerts extends LumenMonitoringReferenceBase {
  readonly kind: 'alerts'
  readonly states: readonly LumenMonitoringReferenceChoice[]
  readonly stateId: string
  readonly stateLabel: string
  readonly query: string
  readonly queryLabel: string
  readonly queryPlaceholder: string
  readonly rows: readonly LumenMonitoringReferenceAlert[]
  readonly total: number
  readonly expandedIds: readonly string[]
  readonly silenceFiringLabel: string
  readonly resolveLabel: string
  readonly silenceLabel: string
  readonly mutedLabel: string
  readonly resetLabel: string
}
export interface LumenMonitoringReferenceLog {
  readonly id: string
  readonly time: string
  readonly level: string
  readonly service: string
  readonly message: string
  readonly context?: string | undefined
  readonly tone: LumenMonitoringReferenceTone
}
export interface LumenMonitoringReferenceLogs extends LumenMonitoringReferenceBase {
  readonly kind: 'logs'
  readonly levels: readonly LumenMonitoringReferenceChoice[]
  readonly levelId: string
  readonly levelLabel: string
  readonly query: string
  readonly queryLabel: string
  readonly queryPlaceholder: string
  readonly paused: boolean
  readonly follow: boolean
  readonly pauseLabel: string
  readonly resumeLabel: string
  readonly followLabel: string
  readonly clearLabel: string
  readonly lines: readonly LumenMonitoringReferenceLog[]
  readonly expandedIds: readonly string[]
  readonly total: number
  readonly footer: string
  readonly rate: string
}
export interface LumenMonitoringReferenceService {
  readonly id: string
  readonly name: string
  readonly uptime: string
  readonly chartLabel: string
  readonly days: readonly {
    readonly id: string
    readonly tone: LumenMonitoringReferenceTone
    readonly label: string
  }[]
  readonly detail?: string | undefined
  readonly history?: readonly { readonly id: string; readonly time: string; readonly body: string }[] | undefined
}
export interface LumenMonitoringReferenceUptime extends LumenMonitoringReferenceBase {
  readonly kind: 'uptime'
  readonly windows: readonly LumenMonitoringReferenceChoice[]
  readonly windowId: string
  readonly windowLabel: string
  readonly services: readonly LumenMonitoringReferenceService[]
  readonly expandedIds: readonly string[]
  readonly legend: readonly LumenMonitoringReferenceChoice[]
  readonly startLabel: string
  readonly endLabel: string
}
export interface LumenMonitoringReferenceNode {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly region: string
  readonly status: string
  readonly cpu: number
  readonly memory: number
  readonly disk: number
  readonly tone: LumenMonitoringReferenceTone
  readonly detail?: string | undefined
}
export interface LumenMonitoringReferenceColumn {
  readonly id: 'node' | 'cpu' | 'memory' | 'disk' | 'requests' | 'p50' | 'p90' | 'p99' | 'errors'
  readonly label: string
}
export interface LumenMonitoringReferenceFleet extends LumenMonitoringReferenceBase {
  readonly kind: 'fleet'
  readonly regions: readonly LumenMonitoringReferenceChoice[]
  readonly regionId: string
  readonly regionLabel: string
  readonly query: string
  readonly queryLabel: string
  readonly queryPlaceholder: string
  readonly columns: readonly LumenMonitoringReferenceColumn[]
  readonly statusLabel: string
  readonly sortId: string
  readonly descending: boolean
  readonly nodes: readonly LumenMonitoringReferenceNode[]
  readonly expandedIds: readonly string[]
  readonly total: number
  readonly refreshDetail: string
}
export interface LumenMonitoringReferenceRoute {
  readonly id: string
  readonly method: string
  readonly path: string
  readonly requests: number
  readonly p50: number
  readonly p90: number
  readonly p99: number
  readonly errors: number
  readonly p50Label: string
  readonly p90Label: string
  readonly p99Label: string
  readonly errorsLabel: string
}
export interface LumenMonitoringReferenceResponse extends LumenMonitoringReferenceBase {
  readonly kind: 'response'
  readonly routes: readonly LumenMonitoringReferenceRoute[]
  readonly selectedId: string
  readonly columns: readonly LumenMonitoringReferenceColumn[]
  readonly routeLabel: string
  readonly sortId: string
  readonly descending: boolean
  readonly metrics: readonly LumenMonitoringReferenceMetric[]
  readonly budgetLabel: string
  readonly histogramTitle: string
  readonly histogramDetail: string
  readonly histogramLabel: string
  readonly buckets: readonly {
    readonly id: string
    readonly label: string
    readonly accessibleLabel: string
    readonly detailLabel: string
    readonly value: number
    readonly tone: LumenMonitoringReferenceTone
  }[]
}
export interface LumenMonitoringReferenceRun {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly initials: string
  readonly environment: string
  readonly groupId: string
  readonly status: string
  readonly tone: LumenMonitoringReferenceTone
  readonly attention: boolean
  readonly progress?: number | undefined
}
export interface LumenMonitoringReferenceQueue extends LumenMonitoringReferenceBase {
  readonly kind: 'queue'
  readonly summary: readonly LumenMonitoringReferenceMetric[]
  readonly query: string
  readonly queryLabel: string
  readonly queryPlaceholder: string
  readonly attention: boolean
  readonly attentionLabel: string
  readonly collapseLabel: string
  readonly expandLabel: string
  readonly newLabel: string
  readonly groups: readonly {
    readonly id: string
    readonly title: string
    readonly detail: string
  }[]
  readonly expandedGroupIds: readonly string[]
  readonly runs: readonly LumenMonitoringReferenceRun[]
}
export interface LumenMonitoringReferenceObjective {
  readonly id: string
  readonly title: string
  readonly target: string
  readonly detail: string
  readonly remaining: number
  readonly remainingLabel: string
  readonly burn: string
  readonly status: string
  readonly tone: LumenMonitoringReferenceTone
  readonly chart: LumenMonitoringReferenceChart
}
export interface LumenMonitoringReferenceSlo extends LumenMonitoringReferenceBase {
  readonly kind: 'slo'
  readonly windows: readonly LumenMonitoringReferenceChoice[]
  readonly windowId: string
  readonly windowLabel: string
  readonly objectives: readonly LumenMonitoringReferenceObjective[]
  readonly selectedId: string
  readonly remainingLabel: string
  readonly burnLabel: string
  readonly chartTitle: (title: string) => string
}
export type LumenMonitoringReferenceContent =
  | LumenMonitoringReferenceHealth
  | LumenMonitoringReferenceLive
  | LumenMonitoringReferenceIncident
  | LumenMonitoringReferenceAlerts
  | LumenMonitoringReferenceLogs
  | LumenMonitoringReferenceUptime
  | LumenMonitoringReferenceFleet
  | LumenMonitoringReferenceResponse
  | LumenMonitoringReferenceQueue
  | LumenMonitoringReferenceSlo
