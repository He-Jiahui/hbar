import type { LumenFilteringListStrategy } from './filtering'

export type LumenFilteringReferenceValue = string | number | boolean | readonly string[]
export interface LumenFilteringReferenceOption {
  readonly id: string
  readonly label: string
  readonly detail?: string | undefined
  readonly color?: string | undefined
  readonly disabled?: boolean | undefined
}
interface FieldBase {
  readonly id: string
  readonly label: string
  readonly placement: 'facet' | 'toolbar' | 'header'
  readonly disabled?: boolean | undefined
}
export type LumenFilteringReferenceField =
  | (FieldBase & {
      readonly kind: 'single'
      readonly display: 'pills' | 'select' | 'radio' | 'rail'
      readonly options: readonly LumenFilteringReferenceOption[]
      readonly value: string
      readonly scrollLabels?: readonly [string, string] | undefined
    })
  | (FieldBase & {
      readonly kind: 'multi'
      readonly display: 'checks' | 'pills' | 'swatches' | 'menu'
      readonly options: readonly LumenFilteringReferenceOption[]
      readonly value: readonly string[]
      readonly unavailable?: string | undefined
      readonly search?: { readonly label: string; readonly placeholder: string } | undefined
    })
  | (FieldBase & {
      readonly kind: 'range'
      readonly minimumId: string
      readonly maximumId: string
      readonly minimum: number
      readonly maximum: number
      readonly step: number
      readonly value: readonly [number, number]
      readonly valueLabel: (minimum: number, maximum: number) => string
      readonly endpointLabels: readonly [string, string]
    })
  | (FieldBase & {
      readonly kind: 'stepper'
      readonly value: number
      readonly minimum: number
      readonly maximum: number
      readonly valueLabel: (value: number) => string
      readonly stepLabels: readonly [string, string]
    })
  | (FieldBase & {
      readonly kind: 'boolean'
      readonly value: boolean
      readonly detail?: string | undefined
    })
  | (FieldBase & { readonly kind: 'text'; readonly value: string; readonly placeholder: string })
  | (FieldBase & {
      readonly kind: 'tokens'
      readonly value: readonly string[]
      readonly draft: string
      readonly draftId: string
      readonly maximum: number
      readonly placeholder: string
      readonly detail: string
      readonly removeLabel: (value: string) => string
      readonly limitLabel: string
    })
export interface LumenFilteringReferenceRecord {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly value: string
  readonly meta?: string | undefined
  readonly secondary?: string | undefined
  readonly abbreviation?: string | undefined
  readonly tags?: readonly string[] | undefined
  readonly color?: string | undefined
}
export interface LumenFilteringReferenceRule {
  readonly id: string
  readonly label: string
  readonly removeLabel: string
  readonly field: LumenFilteringReferenceField
}
interface Base {
  readonly title: string
  readonly subtitle: string
  readonly fields: readonly LumenFilteringReferenceField[]
  readonly listStrategy: LumenFilteringListStrategy
  readonly available: boolean
  readonly labels: {
    readonly empty: string
    readonly unavailable: string
    readonly filters: string
    readonly close: string
    readonly reset: string
  }
  readonly onChange: (fieldId: string, value: LumenFilteringReferenceValue) => void
  readonly onReset: () => void
  readonly onRequest: (actionId: string, value?: string) => void
}
interface Catalog extends Base {
  readonly kind: 'catalog'
  readonly rows: readonly (LumenFilteringReferenceRecord & {
    readonly price: number
    readonly categoryId: string
    readonly makerId: string
    readonly glazeId: string
    readonly sizeId?: string | undefined
  })[]
}
interface Bikes extends Base {
  readonly kind: 'bikes'
  readonly rows: readonly LumenFilteringReferenceRecord[]
  readonly open: boolean
  readonly dirty: boolean
  readonly applyLabel: string
  readonly clearLabel: string
  readonly appliedLabel?: string | undefined
}
interface Deals extends Base {
  readonly kind: 'deals'
  readonly rows: readonly (LumenFilteringReferenceRecord & {
    readonly company: string
    readonly stage: string
    readonly owner: string
    readonly amount: number
    readonly probability: number
    readonly close: string
  })[]
  readonly rules: readonly LumenFilteringReferenceRule[]
  readonly addLabel: string
  readonly builderLabel: string
  readonly clearLabel: string
  readonly ruleOptions: readonly LumenFilteringReferenceOption[]
  readonly activeRuleId: string
  readonly columns: readonly [string, string, string, string, string, string]
  readonly tableLabel: string
}
interface Logs extends Base {
  readonly kind: 'logs'
  readonly rows: readonly (LumenFilteringReferenceRecord & {
    readonly time: string
    readonly severity: string
    readonly service: string
    readonly minute: number
  })[]
  readonly volume: readonly number[]
  readonly volumeLabels: readonly [string, string, string, string]
  readonly footer: string
}
interface Rentals extends Base {
  readonly kind: 'rentals'
  readonly rows: readonly (LumenFilteringReferenceRecord & {
    readonly propertyType: string
    readonly beds: number
    readonly baths: number
    readonly rent: number
    readonly availableDays: number
    readonly amenityIds?: readonly string[] | undefined
  })[]
}
interface Candidates extends Base {
  readonly kind: 'candidates'
  readonly rows: readonly (LumenFilteringReferenceRecord & {
    readonly skills: readonly string[]
    readonly seniority: string
    readonly compensation: number
    readonly location: string
    readonly remote: boolean
  })[]
}
interface Assets extends Base {
  readonly kind: 'assets'
  readonly rows: readonly (LumenFilteringReferenceRecord & {
    readonly assetType: string
    readonly format: string
    readonly width: number
    readonly height: number
    readonly bytes: number
    readonly tagIds?: readonly string[] | undefined
    readonly ageDays?: number | undefined
  })[]
  readonly density: string
}
interface Flights extends Base {
  readonly kind: 'flights'
  readonly rows: readonly (LumenFilteringReferenceRecord & {
    readonly airline: string
    readonly price: number
    readonly stops: number
    readonly departure: number
    readonly duration: number
    readonly carryOn: boolean
  })[]
  readonly selectedId: string
  readonly selectLabel: string
  readonly selectedLabel: string
}
interface Restaurants extends Base {
  readonly kind: 'restaurants'
  readonly rows: readonly (LumenFilteringReferenceRecord & {
    readonly cuisine: string
    readonly rating: number
    readonly priceLevel: string
    readonly deliveryMinutes: number
    readonly dietIds?: readonly string[] | undefined
  })[]
}
export type LumenFilteringReferenceContent =
  Catalog | Bikes | Deals | Logs | Rentals | Candidates | Assets | Flights | Restaurants
