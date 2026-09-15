import {createContext, useContext, type ReactNode} from 'react'

/**
 * Paywall lists are host-owned.  A host chooses whether a list is allowed to
 * grow with its content or is bounded by a scrollable surface.
 */
export type HbarAppUiPaywallListStrategy =
    | {readonly kind: 'content-grown'; readonly expectedMaximum: number}
    | {readonly kind: 'pane-scroll'; readonly expectedMaximum: number}
    | {readonly kind: 'virtualized'; readonly expectedMaximum: number}

export interface HbarAppUiPaywallFeature {
    readonly id: string
    readonly title: string
    readonly description: string
}

export interface HbarAppUiPaywallArticleContent {
    readonly labels: {
        readonly eyebrow: string
        readonly title: string
        readonly byline: string
        readonly memberTitle: string
        readonly memberDescription: string
        readonly memberAction: string
        readonly alreadyAction: string
        readonly lockLabel: string
    }
    readonly paragraphs: readonly string[]
    readonly benefits: readonly string[]
}

export interface HbarAppUiPaywallFeatureGateContent {
    readonly labels: {
        readonly title: string
        readonly description: string
        readonly dismiss: string
        readonly seeIncluded: string
        readonly price: string
        readonly defer: string
        readonly upgrade: string
    }
    readonly features: readonly HbarAppUiPaywallFeature[]
    readonly listStrategy: HbarAppUiPaywallListStrategy
}

export interface HbarAppUiPaywallPlan {
    readonly id: string
    readonly name: string
    readonly monthlyPrice: string
    readonly yearlyPrice: string
    readonly priceSuffix: string
    readonly description: string
    readonly features: readonly string[]
    readonly current?: boolean | undefined
    readonly featured?: boolean | undefined
}

export interface HbarAppUiPaywallPlanContent {
    readonly labels: {
        readonly title: string
        readonly description: string
        readonly yearlyNote: string
        readonly billingPeriod: string
        readonly monthly: string
        readonly yearly: string
        readonly recommended: string
        readonly current: string
        readonly choose: string
        readonly compare: string
        readonly priceNote: string
    }
    readonly plans: readonly HbarAppUiPaywallPlan[]
    readonly initialPeriod: 'monthly' | 'yearly'
    readonly listStrategy: HbarAppUiPaywallListStrategy
}

export interface HbarAppUiPaywallUsageMeter {
    readonly id: string
    readonly label: string
    readonly value: string
    readonly progress: number
}

export interface HbarAppUiPaywallUsageContent {
    readonly labels: {
        readonly title: string
        readonly description: string
        readonly proTitle: string
        readonly proDescription: string
        readonly topUp: string
        readonly upgrade: string
    }
    readonly meters: readonly HbarAppUiPaywallUsageMeter[]
    readonly listStrategy: HbarAppUiPaywallListStrategy
}

export interface HbarAppUiPaywallTrialRow {
    readonly id: string
    readonly label: string
    readonly value: string
}

export interface HbarAppUiPaywallTrialContent {
    readonly labels: {
        readonly eyebrow: string
        readonly title: string
        readonly description: string
        readonly paymentTitle: string
        readonly paymentDescription: string
        readonly change: string
        readonly reactivate: string
        readonly renewalNote: string
    }
    readonly rows: readonly HbarAppUiPaywallTrialRow[]
    readonly listStrategy: HbarAppUiPaywallListStrategy
}

export interface HbarAppUiPaywallReadsContent {
    readonly labels: {
        readonly eyebrow: string
        readonly title: string
        readonly description: string
        readonly emailLabel: string
        readonly emailPlaceholder: string
        readonly keepReading: string
        readonly alreadySubscribed: string
        readonly signIn: string
    }
    readonly assurances: readonly string[]
    readonly readProgress: number
    readonly listStrategy: HbarAppUiPaywallListStrategy
}

export interface HbarAppUiPaywallAdmin {
    readonly id: string
    readonly initials: string
    readonly name: string
    readonly role: string
}

export interface HbarAppUiPaywallSeatContent {
    readonly labels: {
        readonly title: string
        readonly description: string
        readonly cardTitle: string
        readonly cardDescription: string
        readonly reasonLabel: string
        readonly reasonPlaceholder: string
        readonly compare: string
        readonly send: string
    }
    readonly admins: readonly HbarAppUiPaywallAdmin[]
    readonly listStrategy: HbarAppUiPaywallListStrategy
}

export interface HbarAppUiPaywallContent {
    readonly article?: HbarAppUiPaywallArticleContent | undefined
    readonly featureGate?: HbarAppUiPaywallFeatureGateContent | undefined
    readonly plans?: HbarAppUiPaywallPlanContent | undefined
    readonly usage?: HbarAppUiPaywallUsageContent | undefined
    readonly trial?: HbarAppUiPaywallTrialContent | undefined
    readonly reads?: HbarAppUiPaywallReadsContent | undefined
    readonly seat?: HbarAppUiPaywallSeatContent | undefined
}

export interface HbarAppUiPaywallProviderProps {
    readonly content: HbarAppUiPaywallContent
    readonly children: ReactNode
}

export function uniqueHbarAppUiPaywallItems<T extends {readonly id: string}>(items: readonly T[]): readonly T[] {
    const seen = new Set<string>()
    return items.filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
    })
}

const paywallContentContext = createContext<HbarAppUiPaywallContent | undefined>(undefined)

export function HbarAppUiPaywallProvider({content, children}: HbarAppUiPaywallProviderProps) {
    return <paywallContentContext.Provider value={content}>{children}</paywallContentContext.Provider>
}

export function useHbarAppUiPaywallContent(): HbarAppUiPaywallContent | undefined {
    return useContext(paywallContentContext)
}
