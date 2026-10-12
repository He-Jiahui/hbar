import type { LumenListChoice, LumenListStrategy } from './list'

export interface LumenListReferenceAction {
  readonly id: string
  readonly label: string
  readonly value?: string | undefined
  readonly disabled?: boolean | undefined
}
export interface LumenListReferenceRow {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly abbreviation?: string | undefined
  readonly value?: string | undefined
  readonly delta?: string | undefined
  readonly time?: string | undefined
  readonly status?: string | undefined
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' | undefined
  readonly disabled?: boolean | undefined
}
interface Base {
  readonly title: string
  readonly subtitle: string
  readonly choices: readonly LumenListChoice[]
  readonly selectedId: string
  readonly actions: readonly LumenListReferenceAction[]
  readonly listStrategy: LumenListStrategy
  readonly available?: boolean | undefined
  readonly footer?: string | undefined
  readonly labels: {
    readonly empty: string
    readonly unavailable: string
    readonly choices: string
  }
  readonly onSelect: (slotId: string, itemId: string) => void
  readonly onFlag: (flagId: string, value: boolean) => void
  readonly onQuery: (value: string) => void
  readonly onMove: (itemId: string, beforeId: string | undefined) => void
  readonly onRequest: (action: LumenListReferenceAction) => void
}
interface Metrics extends Base {
  readonly kind: 'metrics'
  readonly rows: readonly (LumenListReferenceRow & { readonly definition: string })[]
  readonly expandedIds: readonly string[]
  readonly showLabel: (title: string) => string
}
interface Spend extends Base {
  readonly kind: 'spend'
  readonly rows: readonly LumenListReferenceRow[]
  readonly activeId: string
  readonly selectedLabel: (row: LumenListReferenceRow) => string
}
interface Security extends Base {
  readonly kind: 'security'
  readonly rows: readonly (LumenListReferenceRow & {
    readonly group: string
    readonly categoryId: string
    readonly flagged: boolean
  })[]
  readonly flaggedOnly: boolean
  readonly flaggedLabel: string
}
interface Queue extends Base {
  readonly kind: 'queue'
  readonly rows: readonly LumenListReferenceRow[]
  readonly reorderLabel: (title: string, position: number, count: number) => string
  readonly moveLabel: (title: string, position: number) => string
  readonly pickedLabel: (title: string) => string
  readonly cancelledLabel: string
}
interface Assets extends Base {
  readonly kind: 'assets'
  readonly rows: readonly (LumenListReferenceRow & {
    readonly owner: string
    readonly categoryId: string
    readonly media: 'image' | 'video'
  })[]
  readonly selectedIds: readonly string[]
  readonly selectAllLabel: string
  readonly selectLabel: (title: string) => string
  readonly selectionLabel: (count: number) => string
  readonly bulkActions: readonly LumenListReferenceAction[]
}
interface Deliveries extends Base {
  readonly kind: 'deliveries'
  readonly rows: readonly (LumenListReferenceRow & {
    readonly endpointId: string
    readonly failed: boolean
    readonly request: string
    readonly response: string
  })[]
  readonly endpointChoices: readonly LumenListChoice[]
  readonly endpointId: string
  readonly endpointLabel: string
  readonly expandedIds: readonly string[]
  readonly requestLabel: string
  readonly responseLabel: string
  readonly replayLabel: string
}
interface Suppliers extends Base {
  readonly kind: 'suppliers'
  readonly rows: readonly (LumenListReferenceRow & {
    readonly categoryId: string
    readonly category: string
  })[]
  readonly query: string
  readonly searchLabel: string
  readonly searchPlaceholder: string
  readonly clearLabel: string
  readonly emptyDetail: (query: string) => string
  readonly columns: readonly [string, string, string, string]
}
interface Inbox extends Base {
  readonly kind: 'inbox'
  readonly rows: readonly (LumenListReferenceRow & { readonly unread: boolean })[]
  readonly markReadLabel: string
  readonly markUnreadLabel: string
  readonly snoozeLabel: string
  readonly archiveLabel: string
  readonly archiveNotice?: string | undefined
  readonly undoLabel: string
}
interface Contacts extends Base {
  readonly kind: 'contacts'
  readonly rows: readonly (LumenListReferenceRow & {
    readonly letter: string
    readonly categoryId: string
  })[]
  readonly letters: readonly string[]
  readonly selectedLetter: string
  readonly jumpLabel: (letter: string) => string
  readonly emailLabel: (title: string) => string
}
interface Runbook extends Base {
  readonly kind: 'runbook'
  readonly eyebrow: string
  readonly rows: readonly LumenListReferenceRow[]
  readonly completedIds: readonly string[]
  readonly progressLabel: (count: number, total: number) => string
  readonly completeLabel: (title: string, index: number) => string
  readonly incompleteLabel: (title: string, index: number) => string
  readonly openLabel: (title: string) => string
  readonly runbookLabel: string
  readonly runbookHref: (rowId: string) => string
}
interface Leaderboard extends Base {
  readonly kind: 'leaderboard'
  readonly rows: readonly (LumenListReferenceRow & {
    readonly resolved: number
    readonly responseSeconds: number
    readonly response: string
    readonly satisfaction: number
    readonly trend: string
  })[]
  readonly periodChoices: readonly LumenListChoice[]
  readonly periodId: string
  readonly columns: readonly [string, string, string, string, string, string]
  readonly totals: readonly [string, string, string, string]
}
export interface LumenListReferenceNode {
  readonly id: string
  readonly parentId: string | undefined
  readonly name: string
  readonly detail: string
  readonly kind: 'folder' | 'file'
  readonly childrenKnown: boolean
}
interface Tree extends Base {
  readonly kind: 'tree'
  readonly nodes: readonly LumenListReferenceNode[]
  readonly expandedIds: readonly string[]
  readonly activeId: string
  readonly openLabel: (name: string) => string
  readonly unknownLabel: string
}
export type LumenListReferenceContent =
  Metrics | Spend | Security | Queue | Assets | Deliveries | Suppliers | Inbox | Contacts | Runbook | Leaderboard | Tree
