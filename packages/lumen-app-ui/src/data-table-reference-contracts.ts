export interface LumenDataTableReferenceChoice {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean | undefined
}
export interface LumenDataTableReferenceColumn extends LumenDataTableReferenceChoice {
  readonly visible: boolean
  readonly sortable?: boolean | undefined
  readonly numeric?: boolean | undefined
  readonly toggleable?: boolean | undefined
}
export interface LumenDataTableReferenceCell {
  readonly id: string
  readonly text: string
  readonly value?: number | undefined
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' | undefined
  readonly editable?: boolean | undefined
  readonly editor?: { readonly draft: string; readonly error?: string | undefined } | undefined
}
export interface LumenDataTableReferenceRow {
  readonly id: string
  readonly name: string
  readonly subline?: string | undefined
  readonly categoryId?: string | undefined
  readonly searchText: string
  readonly cells: readonly LumenDataTableReferenceCell[]
  readonly selected?: boolean | undefined
  readonly expanded?: boolean | undefined
  readonly disabled?: boolean | undefined
  readonly detail?:
    | {
        readonly body: string
        readonly tags: readonly { readonly id: string; readonly label: string }[]
      }
    | undefined
  readonly groupId?: string | undefined
}
export interface LumenDataTableReferenceBase {
  readonly title: string
  readonly subtitle?: string | undefined
  readonly caption: string
  readonly columns: readonly LumenDataTableReferenceColumn[]
  readonly rows: readonly LumenDataTableReferenceRow[]
  readonly total: number
  readonly listStrategy: {
    readonly kind: 'content-grown' | 'pane-scroll'
    readonly expectedMaximum: number
  }
  readonly sort?: { readonly field: string; readonly direction: 'asc' | 'desc' } | undefined
  readonly query?: string | undefined
  readonly copy: {
    readonly empty: string
    readonly count: (shown: number, total: number) => string
    readonly search?: string | undefined
    readonly sort: (column: string) => string
  }
  readonly onQuery?: ((query: string) => void) | undefined
  readonly onSort?: ((field: string) => void) | undefined
}
export interface LumenDataTableReferenceAccounts extends LumenDataTableReferenceBase {
  readonly kind: 'accounts'
  readonly filters: readonly LumenDataTableReferenceChoice[]
  readonly filterId: string | undefined
  readonly labels: {
    readonly export: string
    readonly columns: string
    readonly filters: string
    readonly renews: (date: string) => string
    readonly noMatches: string
    readonly noMatchesBody: string
    readonly clear: string
  }
  readonly onFilter?: ((id: string) => void) | undefined
  readonly onColumn?: ((id: string, visible: boolean) => void) | undefined
  readonly onClearFilters?: (() => void) | undefined
}
export interface LumenDataTableReferencePayments extends LumenDataTableReferenceBase {
  readonly kind: 'payments'
  readonly page: number
  readonly pageSize: number
  readonly pageSizes: readonly number[]
  readonly selectedCount: number
  readonly selectedAmount: string
  readonly labels: {
    readonly pending: (count: number) => string
    readonly selected: (count: number) => string
    readonly selectPage: string
    readonly selectRow: (name: string) => string
    readonly hold: string
    readonly export: string
    readonly clear: string
    readonly rowsPerPage: string
    readonly previous: string
    readonly next: string
    readonly page: (page: number) => string
    readonly range: (start: number, end: number, total: number) => string
    readonly unavailable: string
  }
  readonly onSelect?: ((id: string, selected: boolean) => void) | undefined
  readonly onSelectPage?: ((selected: boolean) => void) | undefined
  readonly onClear?: (() => void) | undefined
  readonly onPage?: ((page: number) => void) | undefined
  readonly onPageSize?: ((size: number) => void) | undefined
}
export interface LumenDataTableReferenceBudget extends LumenDataTableReferenceBase {
  readonly kind: 'budget'
  readonly totalBudget: string
  readonly labels: {
    readonly total: string
    readonly edit: (name: string, column: string) => string
  }
  readonly onBeginEdit?: ((id: string, field: string) => void) | undefined
  readonly onDraft?: ((draft: string) => void) | undefined
  readonly onCommit?: (() => void) | undefined
  readonly onCancel?: (() => void) | undefined
}
export interface LumenDataTableReferenceChecks extends LumenDataTableReferenceBase {
  readonly kind: 'checks'
  readonly labels: {
    readonly expand: string
    readonly toggle: (name: string, expanded: boolean) => string
  }
  readonly onExpand?: ((id: string, expanded: boolean) => void) | undefined
}
export interface LumenDataTableReferenceDispatch extends LumenDataTableReferenceBase {
  readonly kind: 'dispatch'
  readonly groups: readonly LumenDataTableReferenceChoice[]
  readonly densities: readonly LumenDataTableReferenceChoice[]
  readonly densityId: string | undefined
  readonly densityLabel: string
  readonly onDensity?: ((id: string) => void) | undefined
}
export interface LumenDataTableReferenceCapacity extends LumenDataTableReferenceBase {
  readonly kind: 'capacity'
}
export interface LumenDataTableReferenceShipment {
  readonly id: string
  readonly displayId?: string | undefined
  readonly name: string
  readonly route: string
  readonly status: string
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger'
  readonly disabled?: boolean | undefined
  readonly detail?:
    | {
        readonly metadata: readonly {
          readonly id: string
          readonly label: string
          readonly value: string
        }[]
        readonly notes: string
        readonly activity: readonly {
          readonly id: string
          readonly text: string
          readonly time: string
        }[]
      }
    | undefined
}
export interface LumenDataTableReferenceShipments {
  readonly kind: 'shipments'
  readonly title: string
  readonly items: readonly LumenDataTableReferenceShipment[]
  readonly query: string
  readonly selectedId: string | undefined
  readonly total: number
  readonly listStrategy: LumenDataTableReferenceBase['listStrategy']
  readonly labels: {
    readonly count: (count: number) => string
    readonly search: string
    readonly empty: string
    readonly unavailable: string
    readonly notes: string
    readonly activity: string
    readonly message: string
    readonly deliver: string
  }
  readonly onQuery?: ((query: string) => void) | undefined
  readonly onSelect?: ((id: string) => void) | undefined
}
export interface LumenDataTableReferenceSources {
  readonly kind: 'sources'
  readonly title: string
  readonly caption: string
  readonly columns: readonly LumenDataTableReferenceChoice[]
  readonly states: readonly LumenDataTableReferenceChoice[]
  readonly selectedStateId: string | undefined
  readonly skeletonRows: number
  readonly labels: {
    readonly states: string
    readonly loading: string
    readonly emptyTitle: string
    readonly emptyBody: string
    readonly connect: string
    readonly errorTitle: string
    readonly errorBody: string
    readonly retry: string
  }
  readonly onState?: ((id: string) => void) | undefined
}
export type LumenDataTableReferenceContent =
  | LumenDataTableReferenceAccounts
  | LumenDataTableReferencePayments
  | LumenDataTableReferenceBudget
  | LumenDataTableReferenceChecks
  | LumenDataTableReferenceDispatch
  | LumenDataTableReferenceShipments
  | LumenDataTableReferenceSources
  | LumenDataTableReferenceCapacity
