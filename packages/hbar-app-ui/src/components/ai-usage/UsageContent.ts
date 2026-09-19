import type { HbarAppUiMetric, HbarAppUiOption } from '../../types'

export interface UsageHeading {
  readonly title: string
  readonly description: string
}
export interface UsageAction {
  readonly label: string
  readonly disabled?: boolean
  readonly onInvoke: () => void
}
export interface UsageChoice {
  readonly label: string
  readonly value: string
  readonly options: readonly HbarAppUiOption[]
  readonly onChange: (id: string) => void
}
export interface UsageMeter {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly progress: number
  readonly progressLabel: string
  readonly detail: string
  readonly tone: 'accent' | 'positive' | 'warning' | 'danger'
}
export interface UsageCollection {
  readonly strategy: 'content-grown' | 'virtual'
  readonly emptyLabel: string
}
export interface HbarAppUiUsageOverviewContent extends UsageHeading {
  /** Short host-defined totals and quota groups grow with their content. */
  readonly metrics: readonly HbarAppUiMetric[]
  readonly meters: readonly UsageMeter[]
  readonly range?: UsageChoice | undefined
}
export interface HbarAppUiModelSpendRow {
  readonly id: string
  readonly model: string
  readonly share: number
  readonly shareLabel: string
  readonly spend: string
  readonly change: string
  readonly direction: 'up' | 'down' | 'unchanged'
}
export interface HbarAppUiModelSpendContent extends UsageHeading, UsageCollection {
  readonly rows: readonly HbarAppUiModelSpendRow[]
  readonly columns: { readonly model: string; readonly share: string; readonly spend: string; readonly change: string }
  readonly sort?: UsageAction | undefined
}
export interface HbarAppUiRateLimitsContent extends UsageHeading {
  /** Quota windows are a bounded host configuration, never generated or truncated here. */
  readonly tier?: UsageChoice | undefined
  readonly meters: readonly UsageMeter[]
  readonly emptyLabel: string
}
export interface HbarAppUiSeatUsageRow {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly detail: string
  readonly progress: number
  readonly progressLabel: string
  readonly spend: string
}
export interface HbarAppUiSeatUsageContent extends UsageHeading, UsageCollection {
  readonly query: string
  readonly searchLabel: string
  readonly onQueryChange: (value: string) => void
  readonly filter?: UsageAction | undefined
  readonly rows: readonly HbarAppUiSeatUsageRow[]
}
export interface HbarAppUiBudgetSettingsContent extends UsageHeading {
  readonly labels: { readonly cap: string; readonly save: string; readonly saving: string }
  readonly cap: {
    readonly value: string
    readonly display: string
    readonly input: 'number' | 'range'
    readonly minimum: number
    readonly maximum?: number | undefined
    readonly step: number
  }
  readonly status?: { readonly label: string; readonly tone: 'neutral' | 'positive' | 'warning' | 'danger' } | undefined
  readonly threshold?: UsageChoice | undefined
  readonly hardStop?:
    { readonly label: string; readonly checked: boolean; readonly onChange: (checked: boolean) => void } | undefined
  readonly busy: boolean
  readonly canSave: boolean
  readonly error?: string | undefined
  readonly onCapChange: (value: string) => void
  readonly onSave: () => void
  readonly clear?: UsageAction | undefined
}
export interface HbarAppUiOverageContent extends UsageHeading {
  readonly status: string
  readonly meters: readonly UsageMeter[]
  readonly plan?: UsageChoice | undefined
  readonly review?: UsageAction | undefined
}
export interface HbarAppUiUsageRequest {
  readonly id: string
  readonly tokens: string
  readonly latency: string
  readonly cost: string
  readonly details: string
  readonly expandLabel: string
}
export interface HbarAppUiUsageRequestLogContent extends UsageHeading, UsageCollection {
  readonly rows: readonly HbarAppUiUsageRequest[]
  readonly filter?: UsageAction | undefined
}
export interface HbarAppUiCompactUsageContent extends UsageHeading {
  readonly density?: 'default' | 'inline' | undefined
  readonly value: string
  readonly detail: string
  readonly progress: number
  readonly progressLabel: string
  readonly tone: UsageMeter['tone']
  readonly sparkline: readonly { readonly id: string; readonly value: number }[]
  readonly sparklineLabel: string
  readonly metrics: readonly (HbarAppUiMetric & { readonly id: string })[]
  readonly action?: UsageAction | undefined
}
export interface HbarAppUiUsageContent {
  readonly overview?: HbarAppUiUsageOverviewContent | undefined
  readonly modelSpend?: HbarAppUiModelSpendContent | undefined
  readonly rateLimits?: HbarAppUiRateLimitsContent | undefined
  readonly seats?: HbarAppUiSeatUsageContent | undefined
  readonly budget?: HbarAppUiBudgetSettingsContent | undefined
  readonly overage?: HbarAppUiOverageContent | undefined
  readonly requests?: HbarAppUiUsageRequestLogContent | undefined
  readonly compact?: HbarAppUiCompactUsageContent | undefined
}
