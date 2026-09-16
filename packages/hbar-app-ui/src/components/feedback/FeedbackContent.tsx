import {createContext, useContext, type ReactNode} from 'react'

export type HbarAppUiFeedbackListStrategy =
    | {readonly kind: 'content-grown'; readonly expectedMaximum: number}
    | {readonly kind: 'pane-scroll'; readonly expectedMaximum: number}

export type HbarAppUiFeedbackType = 'idea' | 'issue' | 'praise'

export interface HbarAppUiFeedbackTypeOption {
    readonly id: HbarAppUiFeedbackType
    readonly label: string
}

export interface HbarAppUiFeedbackAttachment {
    readonly name: string
    readonly countLabel: string
}

export interface HbarAppUiFeedbackWidgetContent {
    readonly labels: {
        readonly title: string
        readonly description: string
        readonly close: string
        readonly typeGroup: string
        readonly prompt: string
        readonly promptPlaceholder: string
        readonly attachment: string
        readonly privacyNotice: string
        readonly characterCount: (count: number, maximum: number) => string
        readonly cancel: string
        readonly send: string
        readonly sentTitle: string
        readonly sentDescription: (kind: string) => string
        readonly sendAnother: string
    }
    readonly types: readonly HbarAppUiFeedbackTypeOption[]
    readonly initialTypeId: HbarAppUiFeedbackType
    readonly attachment: HbarAppUiFeedbackAttachment
    readonly maximumCharacters: number
}

export interface HbarAppUiFeedbackSurveyReason {
    readonly id: string
    readonly label: string
}

export interface HbarAppUiFeedbackSurveyContent {
    readonly labels: {
        readonly eyebrow: string
        readonly question: string
        readonly close: string
        readonly scoreGroup: string
        readonly scoreLow: string
        readonly scoreHigh: string
        readonly scorePrompt: string
        readonly reasonGroup: string
        readonly commentPlaceholder: string
        readonly note: string
        readonly later: string
        readonly submit: string
        readonly submitted: string
        readonly scoreAccessible: (score: number) => string
    }
    readonly scores: readonly number[]
    readonly reasons: readonly HbarAppUiFeedbackSurveyReason[]
    readonly initialScore?: number | undefined
    readonly listStrategy: HbarAppUiFeedbackListStrategy
}

export interface HbarAppUiFeedbackTicket {
    readonly initials: string
    readonly agentName: string
    readonly header: string
    readonly summary: string
    readonly ticketId: string
    readonly subject: string
    readonly detail: string
}

export interface HbarAppUiFeedbackRatingOption {
    readonly value: number
    readonly label: string
}

export interface HbarAppUiFeedbackPostResolutionContent {
    readonly labels: {
        readonly question: string
        readonly ratingGroup: string
        readonly reasonGroup: string
        readonly commentPlaceholder: string
        readonly noThanks: string
        readonly submit: string
        readonly submitted: string
    }
    readonly ticket: HbarAppUiFeedbackTicket
    readonly ratings: readonly HbarAppUiFeedbackRatingOption[]
    readonly reasons: readonly HbarAppUiFeedbackSurveyReason[]
    readonly listStrategy: HbarAppUiFeedbackListStrategy
}

export type HbarAppUiFeedbackRequestStatus = 'shipped' | 'in-progress' | 'planned' | 'under-review'

export interface HbarAppUiFeedbackRequest {
    readonly id: string
    readonly title: string
    readonly status: HbarAppUiFeedbackRequestStatus
    readonly statusLabel: string
    readonly description: string
    readonly category: string
    readonly commentCount: number
    readonly voteCount: number
    readonly votedByDefault?: boolean | undefined
}

export interface HbarAppUiFeedbackFeatureBoardContent {
    readonly labels: {
        readonly title: string
        readonly description: string
        readonly newRequest: string
        readonly sortGroup: string
        readonly search: string
        readonly commentCount: (count: number) => string
        readonly voteFor: (title: string) => string
        readonly removeVote: (title: string) => string
        readonly empty: string
    }
    readonly sortOptions: readonly {readonly id: string; readonly label: string}[]
    readonly initialSortId: string
    readonly requests: readonly HbarAppUiFeedbackRequest[]
    readonly listStrategy: HbarAppUiFeedbackListStrategy
}

export interface HbarAppUiFeedbackInboxThread {
    readonly id: string
    readonly sender: string
    readonly initials: string
    readonly relativeTime: string
    readonly subject: string
    readonly account: string
    readonly channel: string
    readonly unread?: boolean | undefined
}

export interface HbarAppUiFeedbackInboxMetric {
    readonly id: string
    readonly label: string
    readonly value: string
}

export interface HbarAppUiFeedbackInboxDetail {
    readonly threadId: string
    readonly sentiment: string
    readonly body: string
    readonly tags: readonly string[]
    readonly metrics: readonly HbarAppUiFeedbackInboxMetric[]
    readonly related: readonly {readonly id: string; readonly text: string; readonly author: string}[]
}

export interface HbarAppUiFeedbackInboxContent {
    readonly labels: {
        readonly title: string
        readonly summary: string
        readonly archiveRead: string
        readonly detailLabel: string
        readonly addTag: string
        readonly internalNotePlaceholder: string
        readonly addInternalNote: string
        readonly reply: string
        readonly createIssue: string
        readonly archive: string
        readonly empty: string
        readonly openThread: (subject: string) => string
        readonly threadMeta: (account: string, channel: string, relativeTime: string) => string
    }
    readonly threads: readonly HbarAppUiFeedbackInboxThread[]
    readonly details: readonly HbarAppUiFeedbackInboxDetail[]
    readonly initialThreadId?: string | undefined
    readonly listStrategy: HbarAppUiFeedbackListStrategy
}

export interface HbarAppUiFeedbackMetric {
    readonly id: string
    readonly label: string
    readonly value: string
    readonly detail: string
}

export interface HbarAppUiFeedbackSentiment {
    readonly id: string
    readonly label: string
    readonly value: string
    readonly percent: number
}

export interface HbarAppUiFeedbackTheme {
    readonly id: string
    readonly label: string
    readonly mentions: number
    readonly changeLabel: string
    readonly progress: number
}

export interface HbarAppUiFeedbackVolumePoint {
    readonly id: string
    readonly label: string
    readonly value: number
}

export interface HbarAppUiFeedbackInsightsContent {
    readonly labels: {
        readonly title: string
        readonly description: string
        readonly periodGroup: string
        readonly responsesPerDay: string
        readonly topThemes: string
        readonly mentionsPeriod: string
        readonly weeklyVolume: string
        readonly periodStart: string
        readonly periodEnd: string
        readonly sentiment: string
    }
    readonly periods: readonly {readonly id: string; readonly label: string}[]
    readonly initialPeriodId: string
    readonly metrics: readonly HbarAppUiFeedbackMetric[]
    readonly sentiment: readonly HbarAppUiFeedbackSentiment[]
    readonly themes: readonly HbarAppUiFeedbackTheme[]
    readonly volume: readonly HbarAppUiFeedbackVolumePoint[]
    readonly listStrategy: HbarAppUiFeedbackListStrategy
}

export interface HbarAppUiFeedbackContent {
    readonly widget?: HbarAppUiFeedbackWidgetContent | undefined
    readonly survey?: HbarAppUiFeedbackSurveyContent | undefined
    readonly postResolution?: HbarAppUiFeedbackPostResolutionContent | undefined
    readonly featureBoard?: HbarAppUiFeedbackFeatureBoardContent | undefined
    readonly inbox?: HbarAppUiFeedbackInboxContent | undefined
    readonly insights?: HbarAppUiFeedbackInsightsContent | undefined
}

export interface HbarAppUiFeedbackProviderProps {
    readonly content: HbarAppUiFeedbackContent
    readonly children: ReactNode
}

export function uniqueHbarAppUiFeedbackItems<T extends {readonly id: string}>(items: readonly T[]): readonly T[] {
    const seen = new Set<string>()
    return items.filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
    })
}

export function selectHbarAppUiFeedbackItem<T extends {readonly id: string}>(items: readonly T[], selectedId: string | undefined): T | undefined {
    return items.find((item) => item.id === selectedId) ?? items[0]
}

const feedbackContentContext = createContext<HbarAppUiFeedbackContent | undefined>(undefined)

export function HbarAppUiFeedbackProvider({content, children}: HbarAppUiFeedbackProviderProps) {
    return <feedbackContentContext.Provider value={content}>{children}</feedbackContentContext.Provider>
}

export function useHbarAppUiFeedbackContent(): HbarAppUiFeedbackContent | undefined {
    return useContext(feedbackContentContext)
}
