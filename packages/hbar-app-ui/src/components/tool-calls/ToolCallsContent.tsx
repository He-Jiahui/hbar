import {createContext, useContext, type ReactNode} from 'react'

/**
 * Explicit capacity ownership for every collection in the tool-call family.
 * Tool traces, activity feeds, diffs, search output and terminal output live
 * in a bounded workbench pane. Permission groups are a small configuration
 * document and deliberately grow with their content instead of pretending to
 * be a virtualized feed.
 */
export type HbarAppUiToolCallsListStrategy =
    | {readonly kind: 'content-grown'; readonly expectedMaximum: number}
    | {readonly kind: 'pane-scroll'; readonly expectedMaximum: number}

export function uniqueHbarAppUiToolCallsItems<T extends {readonly id: string}>(items: readonly T[]): readonly T[] {
    const seen = new Set<string>()
    return items.filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
    })
}

export function selectHbarAppUiToolCallsItem<T extends {readonly id: string}>(items: readonly T[], selectedId: string): T | undefined {
    return items.find((item) => item.id === selectedId) ?? items[0]
}

/** Technical state drives presentation only; every rendered state label is host-owned. */
export type HbarAppUiToolCallsState =
    | 'complete'
    | 'failed'
    | 'running'
    | 'streaming'
    | 'approved'
    | 'pending'
    | 'needs-approval'
    | 'skipped'

export interface HbarAppUiToolCallsTraceItem {
    readonly id: string
    readonly name: string
    readonly duration: string
    readonly state: HbarAppUiToolCallsState
    readonly stateLabel: string
    readonly startedAt?: string | undefined
    readonly argumentsText?: string | undefined
    readonly resultText?: string | undefined
}

export interface HbarAppUiToolCallsTraceContent {
    readonly labels: {
        readonly title: string
        readonly stop: string
        readonly started: string
        readonly duration: string
        readonly arguments: string
        readonly result: string
    }
    readonly items: readonly HbarAppUiToolCallsTraceItem[]
    readonly activeItemId: string
    readonly listStrategy: HbarAppUiToolCallsListStrategy
}

export interface HbarAppUiToolCallsActivityFilter {
    readonly id: string
    readonly label: string
}

export interface HbarAppUiToolCallsActivityItem {
    readonly id: string
    readonly name: string
    readonly detail: string
    readonly duration: string
    /** IDs of host-provided filters that include this row. */
    readonly filterIds: readonly string[]
    readonly state: HbarAppUiToolCallsState
    readonly stateLabel: string
    readonly retryLabel?: string | undefined
}

export interface HbarAppUiToolCallsActivityContent {
    readonly labels: {
        readonly title: string
        readonly stop: string
        readonly filtersLabel: string
    }
    readonly filters: readonly HbarAppUiToolCallsActivityFilter[]
    readonly activeFilterId: string
    readonly items: readonly HbarAppUiToolCallsActivityItem[]
    readonly listStrategy: HbarAppUiToolCallsListStrategy
}

export type HbarAppUiToolCallsDiffLineKind = 'context' | 'added' | 'removed'

export interface HbarAppUiToolCallsDiffLine {
    readonly id: string
    readonly beforeLine?: string | undefined
    readonly afterLine?: string | undefined
    readonly marker?: string | undefined
    readonly text: string
    readonly kind: HbarAppUiToolCallsDiffLineKind
}

export interface HbarAppUiToolCallsDiffFile {
    readonly id: string
    readonly fileName: string
    readonly fileSummary: string
    readonly lines: readonly HbarAppUiToolCallsDiffLine[]
}

export interface HbarAppUiToolCallsDiffContent {
    readonly toolName: string
    readonly title: string
    readonly summary: string
    readonly files: readonly HbarAppUiToolCallsDiffFile[]
    readonly activeFileId: string
    readonly listStrategy: HbarAppUiToolCallsListStrategy
}

export interface HbarAppUiToolCallsSearchResult {
    readonly id: string
    readonly title: string
    readonly source: string
    readonly excerpt: string
    readonly relevance: string
}

export interface HbarAppUiToolCallsSearchContent {
    readonly toolName: string
    readonly query: string
    readonly statusLabel: string
    readonly items: readonly HbarAppUiToolCallsSearchResult[]
    readonly listStrategy: HbarAppUiToolCallsListStrategy
}

export interface HbarAppUiToolCallsOutputTab {
    readonly id: string
    readonly label: string
    readonly output: string
}

export interface HbarAppUiToolCallsCommandContent {
    readonly toolName: string
    readonly title: string
    readonly duration: string
    readonly command: string
    readonly exitLabel: string
    readonly tabsLabel: string
    readonly tabs: readonly HbarAppUiToolCallsOutputTab[]
    readonly initialTabId: string
    readonly outputStrategy: HbarAppUiToolCallsListStrategy
}

export type HbarAppUiToolCallsPermissionItemKind = 'request' | 'toggle' | 'status'

export interface HbarAppUiToolCallsPermissionAction {
    readonly id: string
    readonly label: string
    readonly tone?: 'neutral' | 'accent' | 'danger' | undefined
}

export interface HbarAppUiToolCallsPermissionItem {
    readonly id: string
    readonly kind: HbarAppUiToolCallsPermissionItemKind
    readonly name: string
    readonly description: string
    readonly statusLabel?: string | undefined
    readonly enabled?: boolean | undefined
    readonly toggleLabel?: string | undefined
    readonly actions?: readonly HbarAppUiToolCallsPermissionAction[] | undefined
}

export interface HbarAppUiToolCallsPermissionGroup {
    readonly id: string
    readonly label: string
    readonly items: readonly HbarAppUiToolCallsPermissionItem[]
}

export interface HbarAppUiToolCallsPermissionsContent {
    readonly title: string
    readonly pendingLabel: string
    readonly groups: readonly HbarAppUiToolCallsPermissionGroup[]
    readonly groupStrategy: HbarAppUiToolCallsListStrategy
}

export interface HbarAppUiToolCallsContent {
    readonly trace?: HbarAppUiToolCallsTraceContent | undefined
    readonly activity?: HbarAppUiToolCallsActivityContent | undefined
    readonly diff?: HbarAppUiToolCallsDiffContent | undefined
    readonly search?: HbarAppUiToolCallsSearchContent | undefined
    readonly command?: HbarAppUiToolCallsCommandContent | undefined
    readonly permissions?: HbarAppUiToolCallsPermissionsContent | undefined
}

export interface HbarAppUiToolCallsProviderProps {
    readonly content: HbarAppUiToolCallsContent
    readonly children: ReactNode
}

const toolCallsContentContext = createContext<HbarAppUiToolCallsContent | undefined>(undefined)

export function HbarAppUiToolCallsProvider({content, children}: HbarAppUiToolCallsProviderProps) {
    return <toolCallsContentContext.Provider value={content}>{children}</toolCallsContentContext.Provider>
}

export function useHbarAppUiToolCallsContent(): HbarAppUiToolCallsContent | undefined {
    return useContext(toolCallsContentContext)
}
