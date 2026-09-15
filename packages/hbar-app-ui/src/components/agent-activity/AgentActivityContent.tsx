import {createContext, useContext, type ReactNode} from 'react'

/**
 * Agent activity collections are bounded workbench records.  The host owns
 * pagination or incremental loading when a run grows beyond the declared
 * bound; these surfaces do not invent records or silently truncate them.
 */
export type HbarAppUiAgentActivityListStrategy =
    | {readonly kind: 'content-grown'; readonly expectedMaximum: number}
    | {readonly kind: 'pane-scroll'; readonly expectedMaximum: number}

export function uniqueHbarAppUiAgentActivityItems<T extends {readonly id: string}>(items: readonly T[]): readonly T[] {
    const seen = new Set<string>()
    return items.filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
    })
}

export function selectHbarAppUiAgentActivityItem<T extends {readonly id: string}>(
    items: readonly T[],
    selectedId: string | undefined,
): T | undefined {
    return items.find((item) => item.id === selectedId) ?? items[0]
}

export type HbarAppUiAgentActivityState =
    | 'complete'
    | 'running'
    | 'queued'
    | 'failed'
    | 'cancelled'
    | 'needs-approval'

export interface HbarAppUiAgentActivityLiveStep {
    readonly id: string
    readonly label: string
    readonly duration: string
    readonly state: HbarAppUiAgentActivityState
}

export interface HbarAppUiAgentActivityLiveContent {
    readonly labels: {
        readonly title: string
        readonly status: string
        readonly elapsed: string
        readonly separator: string
        readonly stop: string
    }
    readonly steps: readonly HbarAppUiAgentActivityLiveStep[]
    readonly activeStepId?: string | undefined
    readonly listStrategy: HbarAppUiAgentActivityListStrategy
}

export interface HbarAppUiAgentActivityNestedChild {
    readonly id: string
    readonly label: string
    readonly duration: string
    readonly progress: number
}

export interface HbarAppUiAgentActivityNestedGroup {
    readonly id: string
    readonly label: string
    readonly duration: string
    readonly children: readonly HbarAppUiAgentActivityNestedChild[]
    readonly openByDefault: boolean
}

export interface HbarAppUiAgentActivityNestedContent {
    readonly labels: {
        readonly title: string
        readonly status: string
        readonly elapsed: string
        readonly separator: string
        readonly expand: string
        readonly collapse: string
        readonly expandGroup: string
        readonly collapseGroup: string
    }
    readonly groups: readonly HbarAppUiAgentActivityNestedGroup[]
    readonly listStrategy: HbarAppUiAgentActivityListStrategy
}

export interface HbarAppUiAgentActivityDeploymentStep {
    readonly id: string
    readonly label: string
    readonly state: HbarAppUiAgentActivityState
    readonly stateLabel: string
}

export interface HbarAppUiAgentActivityDeploymentContent {
    readonly labels: {
        readonly title: string
        readonly status: string
        readonly currentStep: string
        readonly elapsed: string
        readonly stop: string
    }
    readonly steps: readonly HbarAppUiAgentActivityDeploymentStep[]
    readonly activeStepId?: string | undefined
    readonly progress: number
    readonly progressLabel: string
    readonly listStrategy: HbarAppUiAgentActivityListStrategy
}

export interface HbarAppUiAgentActivityHistoryRow {
    readonly id: string
    readonly name: string
    readonly state: HbarAppUiAgentActivityState
    readonly stateLabel: string
    readonly duration: string
    readonly cost: string
    readonly started: string
}

export interface HbarAppUiAgentActivityHistoryContent {
    readonly labels: {
        readonly title: string
        readonly count: string
        readonly description: string
        readonly run: string
        readonly status: string
        readonly duration: string
        readonly cost: string
        readonly started: string
        readonly actions: string
        readonly rerun: string
    }
    readonly rows: readonly HbarAppUiAgentActivityHistoryRow[]
    readonly listStrategy: HbarAppUiAgentActivityListStrategy
}

export type HbarAppUiAgentActivityLogLevel = 'info' | 'warning' | 'error'

export interface HbarAppUiAgentActivityLogFilter {
    readonly id: string
    readonly label: string
    readonly level?: HbarAppUiAgentActivityLogLevel | undefined
}

export interface HbarAppUiAgentActivityLogEntry {
    readonly id: string
    readonly time: string
    readonly level: HbarAppUiAgentActivityLogLevel
    readonly message: string
}

export interface HbarAppUiAgentActivityLogContent {
    readonly labels: {
        readonly title: string
        readonly lineCount: string
        readonly filters: string
        readonly stop: string
    }
    readonly filters: readonly HbarAppUiAgentActivityLogFilter[]
    readonly activeFilterId: string
    readonly entries: readonly HbarAppUiAgentActivityLogEntry[]
    readonly listStrategy: HbarAppUiAgentActivityListStrategy
}

export interface HbarAppUiAgentActivityWorker {
    readonly id: string
    readonly name: string
    readonly rate: string
    readonly task: string
    readonly state: HbarAppUiAgentActivityState
    readonly stateLabel: string
    readonly progress: number
    readonly progressLabel: string
}

export interface HbarAppUiAgentActivityWorkersContent {
    readonly labels: {
        readonly title: string
        readonly activeSummary: string
        readonly queuedSummary: string
    }
    readonly workers: readonly HbarAppUiAgentActivityWorker[]
    readonly listStrategy: HbarAppUiAgentActivityListStrategy
}

export interface HbarAppUiAgentActivityInput {
    readonly id: string
    readonly label: string
    readonly value: string
}

export interface HbarAppUiAgentActivityAttempt {
    readonly id: string
    readonly label: string
    readonly description: string
    readonly duration: string
}

export interface HbarAppUiAgentActivityOutput {
    readonly id: string
    readonly name: string
    readonly detail: string
    readonly downloadLabel: string
}

export interface HbarAppUiAgentActivityFailureContent {
    readonly labels: {
        readonly title: string
        readonly status: string
        readonly duration: string
        readonly separator: string
        readonly viewLog: string
        readonly errorTitle: string
        readonly inputs: string
        readonly attempts: string
        readonly output: string
        readonly retry: string
        readonly download: string
    }
    readonly summaryTitle: string
    readonly summaryDescription: string
    readonly inputs: readonly HbarAppUiAgentActivityInput[]
    readonly attempts: readonly HbarAppUiAgentActivityAttempt[]
    readonly outputs: readonly HbarAppUiAgentActivityOutput[]
    readonly listStrategy: HbarAppUiAgentActivityListStrategy
}

export interface HbarAppUiAgentActivityContent {
    readonly live?: HbarAppUiAgentActivityLiveContent | undefined
    readonly nested?: HbarAppUiAgentActivityNestedContent | undefined
    readonly deployment?: HbarAppUiAgentActivityDeploymentContent | undefined
    readonly history?: HbarAppUiAgentActivityHistoryContent | undefined
    readonly log?: HbarAppUiAgentActivityLogContent | undefined
    readonly workers?: HbarAppUiAgentActivityWorkersContent | undefined
    readonly failure?: HbarAppUiAgentActivityFailureContent | undefined
}

export interface HbarAppUiAgentActivityProviderProps {
    readonly content: HbarAppUiAgentActivityContent
    readonly children: ReactNode
}

const agentActivityContentContext = createContext<HbarAppUiAgentActivityContent | undefined>(undefined)

export function HbarAppUiAgentActivityProvider({content, children}: HbarAppUiAgentActivityProviderProps) {
    return <agentActivityContentContext.Provider value={content}>{children}</agentActivityContentContext.Provider>
}

export function useHbarAppUiAgentActivityContent(): HbarAppUiAgentActivityContent | undefined {
    return useContext(agentActivityContentContext)
}
