import type { HbarAppUiPlanEditorControls } from './PlanEditor'
import {createContext, useContext, type ReactNode} from 'react'

/**
 * Lists in the plan surfaces are intentionally small workflow projections.
 * The host declares whether content should grow with the plan or live in a
 * bounded, scrollable workbench pane.  Larger/unbounded plans should be
 * paged or virtualized by the host before they reach this package.
 */
export type HbarAppUiAgentPlanListStrategy =
    | {readonly kind: 'content-grown'; readonly expectedMaximum: number}
    | {readonly kind: 'pane-scroll'; readonly expectedMaximum: number}

export type HbarAppUiAgentPlanState =
    | 'queued'
    | 'running'
    | 'done'
    | 'skipped'
    | 'failed'
    | 'blocked'
    | 'waiting'

export interface HbarAppUiAgentPlanStep {
    readonly id: string
    readonly title: string
    readonly state: HbarAppUiAgentPlanState
    readonly stateLabel: string
    readonly detail?: string | undefined
    readonly target?: string | undefined
    readonly estimate?: string | undefined
    readonly duration?: string | undefined
}

export interface HbarAppUiAgentPlanChecklistContent {
    readonly labels: {
        readonly title: string
        readonly progress: (done: number, total: number) => string
        readonly stop: string
        readonly target: string
        readonly estimate: string
        readonly empty: string
        readonly workingOn: (title: string) => string
    }
    readonly steps: readonly HbarAppUiAgentPlanStep[]
    readonly activeStepId?: string | undefined
    readonly listStrategy: HbarAppUiAgentPlanListStrategy
}

export interface HbarAppUiAgentPlanEditableContent extends HbarAppUiPlanEditorControls {
    readonly labels: {
        readonly title: string
        readonly summary: string
        readonly review: string
        readonly addPlaceholder: string
        readonly add: string
        readonly start: (count: number) => string
        readonly moveUp: (title: string) => string
        readonly moveDown: (title: string) => string
        readonly skip: (title: string) => string
        readonly restore: (title: string) => string
        readonly newStepStateLabel: string
        readonly empty: string
    }
    readonly steps: readonly HbarAppUiAgentPlanStep[]
    readonly listStrategy: HbarAppUiAgentPlanListStrategy
}

export interface HbarAppUiAgentPlanGroup {
    readonly id: string
    readonly title: string
    readonly done: number
    readonly total: number
    readonly progressLabel: string
    readonly items: readonly HbarAppUiAgentPlanStep[]
    readonly openByDefault: boolean
}

export interface HbarAppUiAgentPlanTreeContent {
    readonly labels: {
        readonly title: string
        readonly progress: (done: number, total: number) => string
        readonly expand: (title: string) => string
        readonly collapse: (title: string) => string
        readonly retry: string
        readonly empty: string
    }
    readonly groups: readonly HbarAppUiAgentPlanGroup[]
    readonly listStrategy: HbarAppUiAgentPlanListStrategy
}

export interface HbarAppUiAgentPlanActualRow {
    readonly id: string
    readonly title: string
    /** Normalized duration bar value supplied by the host (0 to 1). */
    readonly durationProgress?: number | undefined
    readonly planned: string
    readonly actual: string
    readonly drift: string
    readonly tone?: 'neutral' | 'positive' | 'warning' | 'danger' | undefined
}

export interface HbarAppUiAgentPlanActualMetric {
    readonly id: string
    readonly label: string
    readonly value: string
    readonly tone?: 'neutral' | 'positive' | 'warning' | 'danger' | undefined
}

export interface HbarAppUiAgentPlanActualContent {
    readonly labels: {
        readonly title: string
        readonly remaining: string
        readonly description: string
        readonly step: string
        readonly duration: string
        readonly planned: string
        readonly actual: string
        readonly drift: string
        readonly empty: string
    }
    readonly metrics: readonly HbarAppUiAgentPlanActualMetric[]
    readonly rows: readonly HbarAppUiAgentPlanActualRow[]
    readonly listStrategy: HbarAppUiAgentPlanListStrategy
}

export interface HbarAppUiAgentPlanBoardSection {
    readonly id: string
    readonly title: string
    readonly done: number
    readonly total: number
    readonly progressLabel: string
    readonly items: readonly HbarAppUiAgentPlanStep[]
}

export interface HbarAppUiAgentPlanBoardContent {
    readonly labels: {
        readonly title: string
        readonly progress: (done: number, total: number) => string
        readonly separator: string
        readonly empty: string
    }
    readonly sections: readonly HbarAppUiAgentPlanBoardSection[]
    readonly listStrategy: HbarAppUiAgentPlanListStrategy
}

export interface HbarAppUiAgentPlanBreakdownRow {
    readonly id: string
    readonly title: string
    readonly countLabel: string
    readonly duration: string
}

export interface HbarAppUiAgentPlanSummaryMetric {
    readonly id: string
    readonly label: string
    readonly value: string
}

export interface HbarAppUiAgentPlanSummaryContent {
    readonly labels: {
        readonly title: string
        readonly stepCount: string
        readonly goal: string
        readonly tools: string
        readonly breakdown: string
        readonly review: string
        readonly edit: string
        readonly run: string
        readonly empty: string
    }
    readonly goal: string
    readonly metrics: readonly HbarAppUiAgentPlanSummaryMetric[]
    readonly tools: readonly string[]
    readonly breakdown: readonly HbarAppUiAgentPlanBreakdownRow[]
    readonly listStrategy: HbarAppUiAgentPlanListStrategy
}

export interface HbarAppUiAgentPlanContent {
    readonly checklist?: HbarAppUiAgentPlanChecklistContent | undefined
    readonly editable?: HbarAppUiAgentPlanEditableContent | undefined
    readonly tree?: HbarAppUiAgentPlanTreeContent | undefined
    readonly actual?: HbarAppUiAgentPlanActualContent | undefined
    readonly board?: HbarAppUiAgentPlanBoardContent | undefined
    readonly summary?: HbarAppUiAgentPlanSummaryContent | undefined
}

export interface HbarAppUiAgentPlanProviderProps {
    readonly content: HbarAppUiAgentPlanContent
    readonly children: ReactNode
}

export function uniqueHbarAppUiAgentPlanItems<T extends {readonly id: string}>(items: readonly T[]): readonly T[] {
    const seen = new Set<string>()
    return items.filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
    })
}

export function selectHbarAppUiAgentPlanItem<T extends {readonly id: string}>(
    items: readonly T[],
    selectedId: string | undefined,
): T | undefined {
    return items.find((item) => item.id === selectedId) ?? items[0]
}

const agentPlanContentContext = createContext<HbarAppUiAgentPlanContent | undefined>(undefined)

export function HbarAppUiAgentPlanProvider({content, children}: HbarAppUiAgentPlanProviderProps) {
    return <agentPlanContentContext.Provider value={content}>{children}</agentPlanContentContext.Provider>
}

export function useHbarAppUiAgentPlanContent(): HbarAppUiAgentPlanContent | undefined {
    return useContext(agentPlanContentContext)
}
