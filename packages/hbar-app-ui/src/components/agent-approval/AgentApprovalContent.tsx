import {createContext, useContext, type ReactNode} from 'react'

/** Approval lists are bounded by the host; larger histories should be paged upstream. */
export type HbarAppUiAgentApprovalListStrategy =
    | {readonly kind: 'content-grown'; readonly expectedMaximum: number}
    | {readonly kind: 'pane-scroll'; readonly expectedMaximum: number}

export function uniqueHbarAppUiAgentApprovalItems<T extends {readonly id: string}>(items: readonly T[]): readonly T[] {
    const seen = new Set<string>()
    return items.filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
    })
}

export function selectHbarAppUiAgentApprovalItem<T extends {readonly id: string}>(
    items: readonly T[],
    selectedId: string | undefined,
): T | undefined {
    return items.find((item) => item.id === selectedId) ?? items[0]
}

export type HbarAppUiAgentApprovalState =
    | 'complete'
    | 'needs-approval'
    | 'queued'
    | 'approved'
    | 'skipped'
    | 'expired'
    | 'auto-approved'
    | 'rejected'

export interface HbarAppUiAgentApprovalInlineContent {
    readonly labels: {
        readonly day: string
        readonly showRequest: string
        readonly reject: string
        readonly approve: string
    }
    readonly userMessage: string
    readonly detailMessage: string
    readonly toolName: string
    readonly toolDuration: string
    readonly requestTitle: string
    readonly requestDescription: string
    readonly requestStatusLabel: string
}

export interface HbarAppUiAgentApprovalChange {
    readonly id: string
    readonly label: string
    readonly previousValue: string
    readonly nextValue: string
}

export interface HbarAppUiAgentApprovalDiffContent {
    readonly labels: {
        readonly headerTitle: string
        readonly agent: string
        readonly status: string
        readonly separator: string
        readonly showDiff: string
        readonly reject: string
        readonly alwaysAllow: string
        readonly approve: string
        readonly changeSeparator: string
    }
    readonly title: string
    readonly description: string
    readonly changes: readonly HbarAppUiAgentApprovalChange[]
    readonly listStrategy: HbarAppUiAgentApprovalListStrategy
}

export interface HbarAppUiAgentApprovalQueueItem {
    readonly id: string
    readonly title: string
    readonly detail: string
    readonly state: HbarAppUiAgentApprovalState
    readonly stateLabel: string
    readonly when: string
    readonly expandable: boolean
}

export interface HbarAppUiAgentApprovalQueueContent {
    readonly labels: {
        readonly title: string
        readonly waiting: string
        readonly separator: string
        readonly status: string
        readonly showRequest: string
        readonly reject: string
        readonly approve: string
    }
    readonly pending: readonly HbarAppUiAgentApprovalQueueItem[]
    readonly history: readonly HbarAppUiAgentApprovalQueueItem[]
    readonly listStrategy: HbarAppUiAgentApprovalListStrategy
}

export interface HbarAppUiAgentApprovalScope {
    readonly id: string
    readonly title: string
    readonly description: string
    readonly checked: boolean
}

export interface HbarAppUiAgentApprovalPermissionContent {
    readonly labels: {
        readonly title: string
        readonly agent: string
        readonly status: string
        readonly showRequest: string
        readonly scopes: string
        readonly expires: string
        readonly reject: string
        readonly approve: string
        readonly separator: string
    }
    readonly requestTitle: string
    readonly description: string
    readonly scopes: readonly HbarAppUiAgentApprovalScope[]
    readonly expiry: string
    readonly listStrategy: HbarAppUiAgentApprovalListStrategy
}

export interface HbarAppUiAgentApprovalCostMetric {
    readonly id: string
    readonly label: string
    readonly value: string
    readonly detail: string
}

export interface HbarAppUiAgentApprovalCostContent {
    readonly labels: {
        readonly badge: string
        readonly agent: string
        readonly title: string
        readonly runtime: string
        readonly background: string
        readonly usage: string
        readonly cap: string
        readonly queries: string
        readonly readOnly: string
        readonly projected: string
        readonly separator: string
        readonly showRequest: string
        readonly reject: string
        readonly approve: string
    }
    readonly description: string
    readonly metrics: readonly HbarAppUiAgentApprovalCostMetric[]
    readonly projectedValue: string
    readonly progress: number
    readonly progressLabel: string
    readonly listStrategy: HbarAppUiAgentApprovalListStrategy
}

export interface HbarAppUiAgentApprovalHistoryEntry {
    readonly id: string
    readonly title: string
    readonly detail: string
    readonly state: HbarAppUiAgentApprovalState
    readonly stateLabel: string
    readonly when: string
    readonly filterIds: readonly string[]
}

export interface HbarAppUiAgentApprovalHistoryFilter {
    readonly id: string
    readonly label: string
}

export interface HbarAppUiAgentApprovalHistoryContent {
    readonly labels: {
        readonly title: string
        readonly export: string
        readonly searchLabel: string
        readonly filtersLabel: string
    }
    readonly searchPlaceholder: string
    readonly filters: readonly HbarAppUiAgentApprovalHistoryFilter[]
    readonly activeFilterId: string
    readonly entries: readonly HbarAppUiAgentApprovalHistoryEntry[]
    readonly listStrategy: HbarAppUiAgentApprovalListStrategy
}

export interface HbarAppUiAgentApprovalContent {
    readonly inline?: HbarAppUiAgentApprovalInlineContent | undefined
    readonly diff?: HbarAppUiAgentApprovalDiffContent | undefined
    readonly queue?: HbarAppUiAgentApprovalQueueContent | undefined
    readonly permission?: HbarAppUiAgentApprovalPermissionContent | undefined
    readonly cost?: HbarAppUiAgentApprovalCostContent | undefined
    readonly history?: HbarAppUiAgentApprovalHistoryContent | undefined
}

export interface HbarAppUiAgentApprovalProviderProps {
    readonly content: HbarAppUiAgentApprovalContent
    readonly children: ReactNode
}

const agentApprovalContentContext = createContext<HbarAppUiAgentApprovalContent | undefined>(undefined)

export function HbarAppUiAgentApprovalProvider({content, children}: HbarAppUiAgentApprovalProviderProps) {
    return <agentApprovalContentContext.Provider value={content}>{children}</agentApprovalContentContext.Provider>
}

export function useHbarAppUiAgentApprovalContent(): HbarAppUiAgentApprovalContent | undefined {
    return useContext(agentApprovalContentContext)
}
