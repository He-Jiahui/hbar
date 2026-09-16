import {createContext, type ReactNode, useContext} from 'react'

/**
 * Billing data is supplied by the host. Short product lists may grow with
 * their content, dense ledger/recovery panes own their scroll boundary, and
 * any unbounded service collection must be paged or virtualized upstream.
 */
export type HbarAppUiBillingListStrategy =
    | { readonly kind: 'content-grown'; readonly expectedMaximum: number }
    | { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }
    | { readonly kind: 'virtualized'; readonly expectedMaximum: number }

export type HbarAppUiBillingTone = 'neutral' | 'positive' | 'warning' | 'danger'

export interface HbarAppUiBillingMetric {
    readonly id: string
    readonly label: string
    readonly value: string
    readonly detail?: string | undefined
    readonly trend?: string | undefined
    readonly tone?: HbarAppUiBillingTone | undefined
    readonly progress?: number | undefined
}

export interface HbarAppUiBillingValueRow {
    readonly id: string
    readonly label: string
    readonly value: string
    readonly detail?: string | undefined
    readonly tone?: HbarAppUiBillingTone | undefined
}

export interface HbarAppUiBillingStatementInvoice {
    readonly id: string
    readonly customer: string
    readonly customerMeta: string
    readonly invoice: string
    readonly invoiceMeta: string
    readonly plan: string
    readonly amount: string
    readonly paymentMethod: string
    readonly dueDate: string
    readonly dueDetail: string
    readonly status: string
    readonly statusTone: HbarAppUiBillingTone
}

export interface HbarAppUiBillingStatementContent {
    readonly labels: {
        readonly pageTitle: string
        readonly pageDescription: string
        readonly export: string
        readonly balanceLabel: string
        readonly ledgerTitle: string
        readonly ledgerSummary: string
        readonly recoveryLeading: string
        readonly recoveryEmphasis: string
        readonly recoveryTrailing: string
        readonly viewStatement: string
        readonly startRecovery: string
        readonly searchLabel: string
        readonly searchPlaceholder: string
        readonly newInvoice: string
        readonly customerColumn: string
        readonly invoiceColumn: string
        readonly planColumn: string
        readonly amountColumn: string
        readonly dueColumn: string
        readonly statusColumn: string
        readonly actionsForInvoice: (invoice: string) => string
        readonly emptyLedger: string
    }
    readonly balance: {
        readonly amount: string
        readonly detail: string
        readonly metrics: readonly HbarAppUiBillingMetric[]
    }
    readonly invoices: readonly HbarAppUiBillingStatementInvoice[]
    readonly listStrategy: HbarAppUiBillingListStrategy
}

export interface HbarAppUiBillingPlanToggle {
    readonly id: string
    readonly label: string
    readonly enabled: boolean
}

export interface HbarAppUiBillingPlanFeature {
    readonly id: string
    readonly label: string
    readonly value: string
    readonly icon: 'people' | 'bolt' | 'storage' | 'layers' | 'shield' | 'sparkles'
}

export interface HbarAppUiBillingPlan {
    readonly id: string
    readonly name: string
    readonly status: string
    readonly statusTone: HbarAppUiBillingTone
    readonly meta: string
    readonly price: string
    readonly priceSuffix: string
    readonly entitlements: readonly HbarAppUiBillingPlanFeature[]
    readonly addOns: readonly HbarAppUiBillingPlanFeature[]
    readonly toggles: readonly HbarAppUiBillingPlanToggle[]
}

export interface HbarAppUiBillingPlansContent {
    readonly labels: {
        readonly pageTitle: string
        readonly pageDescription: string
        readonly newPlan: string
        readonly unsavedTitle: string
        readonly unsavedDescription: string
        readonly discard: string
        readonly save: string
        readonly entitlementsTitle: string
        readonly addOnsTitle: string
        readonly addEntitlement: string
        readonly editPlan: (name: string) => string
        readonly togglePlan: (name: string, label: string) => string
        readonly emptyPlans: string
    }
    readonly plans: readonly HbarAppUiBillingPlan[]
    readonly initialDirty?: boolean | undefined
    readonly listStrategy: HbarAppUiBillingListStrategy
}

export type HbarAppUiBillingFieldKind = 'text' | 'date' | 'select'

export interface HbarAppUiBillingChoice {
    readonly id: string
    readonly label: string
}

export interface HbarAppUiBillingInvoiceField {
    readonly id: string
    readonly label: string
    readonly kind: HbarAppUiBillingFieldKind
    readonly value: string
    readonly placeholder?: string | undefined
    readonly description?: string | undefined
    readonly choices?: readonly HbarAppUiBillingChoice[] | undefined
    readonly prefix?: string | undefined
    readonly clearLabel?: string | undefined
}

export interface HbarAppUiBillingWorkflowStep {
    readonly id: string
    readonly label: string
    readonly description: string
}

export interface HbarAppUiBillingInvoiceSection {
    readonly id: string
    readonly title: string
    readonly description: string
    readonly fields: readonly HbarAppUiBillingInvoiceField[]
}

export interface HbarAppUiBillingInvoiceComposerContent {
    readonly labels: {
        readonly pageTitle: string
        readonly pageDescription: string
        readonly draft: string
        readonly stepDetail: (position: number, total: number, label: string) => string
        readonly saveDraft: string
        readonly previousStep: string
        readonly nextStep: string
        readonly complete: string
        readonly savedNotice: string
    }
    readonly steps: readonly HbarAppUiBillingWorkflowStep[]
    readonly sections: readonly HbarAppUiBillingInvoiceSection[]
    readonly initialStepId: string
}

export interface HbarAppUiBillingRetryAttempt {
    readonly id: string
    readonly title: string
    readonly description: string
    readonly code: string
    readonly date: string
}

export interface HbarAppUiBillingSubscription {
    readonly id: string
    readonly customer: string
    readonly customerMeta: string
    readonly status: string
    readonly statusTone: HbarAppUiBillingTone
    readonly plan: string
    readonly planMeta: string
    readonly owner: string
    readonly amount: string
    readonly paymentMethod: string
    readonly nextRetry: string
    readonly attemptSummary: string
    readonly retryTitle: string
    readonly retryDescription: string
    readonly invoice: string
    readonly attempts: readonly HbarAppUiBillingRetryAttempt[]
    readonly actionLabel: string
}

export interface HbarAppUiBillingRecoveryContent {
    readonly labels: {
        readonly pageTitle: string
        readonly pageDescriptionLeading: string
        readonly pageDescriptionEmphasis: string
        readonly rules: string
        readonly export: string
        readonly retryDue: string
        readonly retryAll: string
        readonly retryNow: string
        readonly listTitle: string
        readonly listDescription: string
        readonly managePlaybooks: string
        readonly customerColumn: string
        readonly statusColumn: string
        readonly billingColumn: string
        readonly ownerColumn: string
        readonly amountColumn: string
        readonly retryColumn: string
        readonly emptySubscriptions: string
        readonly retryAttemptLabel: (position: number, title: string) => string
    }
    readonly metrics: readonly HbarAppUiBillingMetric[]
    readonly subscriptions: readonly HbarAppUiBillingSubscription[]
    readonly initialExpandedId?: string | undefined
    readonly listStrategy: HbarAppUiBillingListStrategy
}

export interface HbarAppUiBillingChangePlanChoice {
    readonly id: string
    readonly name: string
    readonly marker?: string | undefined
    readonly description: string
    readonly price: string
    readonly priceSuffix: string
    readonly accessibleLabel: string
}

export interface HbarAppUiBillingChangePlanSummary {
    readonly title: string
    readonly description: string
    readonly actionBadge: string
    readonly dueLabel: string
    readonly dueAmount: string
    readonly dueDetail: string
    readonly rows: readonly HbarAppUiBillingValueRow[]
    readonly assurances: readonly string[]
}

export interface HbarAppUiBillingChangePlanContent {
    readonly labels: {
        readonly pageTitle: string
        readonly pageDescription: string
        readonly draft: string
        readonly cancel: string
        readonly continue: string
        readonly footerNotice: string
        readonly planSelection: string
    }
    readonly steps: readonly HbarAppUiBillingWorkflowStep[]
    readonly choices: readonly HbarAppUiBillingChangePlanChoice[]
    readonly initialChoiceId: string
    readonly summary: HbarAppUiBillingChangePlanSummary
}

export interface HbarAppUiBillingPaymentMethod {
    readonly id: string
    readonly kind: 'card' | 'bank'
    readonly name: string
    readonly status?: string | undefined
    readonly statusTone?: HbarAppUiBillingTone | undefined
    readonly detail: string
    readonly primary: boolean
    readonly actionLabel: string
}

export interface HbarAppUiBillingContact {
    readonly id: string
    readonly initials: string
    readonly name: string
    readonly detail: string
    readonly actionLabel: string
}

export interface HbarAppUiBillingPaymentMethodsContent {
    readonly labels: {
        readonly pageTitle: string
        readonly pageDescription: string
        readonly addMethod: string
        readonly primary: string
        readonly makePrimary: string
        readonly billingContactsTitle: string
        readonly billingContactsDescription: string
        readonly inviteContact: string
        readonly billingAddressTitle: string
        readonly editAddress: string
        readonly taxTitle: string
        readonly emptyMethods: string
        readonly emptyContacts: string
    }
    readonly methods: readonly HbarAppUiBillingPaymentMethod[]
    readonly contacts: readonly HbarAppUiBillingContact[]
    readonly addressLines: readonly string[]
    readonly taxRows: readonly HbarAppUiBillingValueRow[]
    readonly taxNotice: string
    readonly methodListStrategy: HbarAppUiBillingListStrategy
    readonly contactListStrategy: HbarAppUiBillingListStrategy
}

export interface HbarAppUiBillingUsageMeter {
    readonly id: string
    readonly icon: 'people' | 'bolt' | 'storage' | 'mail'
    readonly label: string
    readonly status?: string | undefined
    readonly statusTone?: HbarAppUiBillingTone | undefined
    readonly currentValue: string
    readonly percentage: number
    readonly percentageLabel: string
    readonly detail: string
    readonly amount: string
}

export interface HbarAppUiBillingUsagePeriod {
    readonly id: string
    readonly label: string
}

export interface HbarAppUiBillingUsageContent {
    readonly labels: {
        readonly pageTitle: string
        readonly pageDescription: string
        readonly periodGroup: string
        readonly meterTitle: string
        readonly meterDescription: string
        readonly setAlert: string
        readonly cycleNotice: string
        readonly emptyMeters: string
        readonly meterProgress: (label: string) => string
    }
    readonly periods: readonly HbarAppUiBillingUsagePeriod[]
    readonly initialPeriodId: string
    readonly metrics: readonly HbarAppUiBillingMetric[]
    readonly meters: readonly HbarAppUiBillingUsageMeter[]
    readonly cycleAmount: string
    readonly listStrategy: HbarAppUiBillingListStrategy
}

export interface HbarAppUiBillingInvoiceLine {
    readonly id: string
    readonly description: string
    readonly detail: string
    readonly quantity: string
    readonly rate: string
    readonly amount: string
}

export interface HbarAppUiBillingInvoiceActivity {
    readonly id: string
    readonly title: string
    readonly description: string
    readonly date: string
    readonly tone?: HbarAppUiBillingTone | undefined
}

export interface HbarAppUiBillingInvoiceDetailContent {
    readonly labels: {
        readonly print: string
        readonly pdf: string
        readonly sendReminder: string
        readonly billedTo: string
        readonly lineItemsTitle: string
        readonly descriptionColumn: string
        readonly quantityColumn: string
        readonly rateColumn: string
        readonly amountColumn: string
        readonly activityTitle: string
        readonly collectionTitle: string
        readonly chargeNow: string
        readonly helpNotice: string
        readonly emptyLines: string
    }
    readonly invoice: string
    readonly status: string
    readonly statusTone: HbarAppUiBillingTone
    readonly description: string
    readonly addressLines: readonly string[]
    readonly metadata: readonly HbarAppUiBillingValueRow[]
    readonly lines: readonly HbarAppUiBillingInvoiceLine[]
    readonly totals: readonly HbarAppUiBillingValueRow[]
    readonly activities: readonly HbarAppUiBillingInvoiceActivity[]
    readonly collection: readonly HbarAppUiBillingValueRow[]
    readonly listStrategy: HbarAppUiBillingListStrategy
}

export interface HbarAppUiBillingContent {
    readonly statement?: HbarAppUiBillingStatementContent | undefined
    readonly plans?: HbarAppUiBillingPlansContent | undefined
    readonly invoiceComposer?: HbarAppUiBillingInvoiceComposerContent | undefined
    readonly recovery?: HbarAppUiBillingRecoveryContent | undefined
    readonly changePlan?: HbarAppUiBillingChangePlanContent | undefined
    readonly paymentMethods?: HbarAppUiBillingPaymentMethodsContent | undefined
    readonly usage?: HbarAppUiBillingUsageContent | undefined
    readonly invoiceDetail?: HbarAppUiBillingInvoiceDetailContent | undefined
}

export interface HbarAppUiBillingProviderProps {
    readonly content: HbarAppUiBillingContent
    readonly children: ReactNode
}

export function uniqueHbarAppUiBillingItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
    const seen = new Set<string>()
    return items.filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
    })
}

export function selectHbarAppUiBillingItem<T extends { readonly id: string }>(items: readonly T[], activeId: string | undefined): T | undefined {
    const uniqueItems = uniqueHbarAppUiBillingItems(items)
    return uniqueItems.find((item) => item.id === activeId) ?? uniqueItems[0]
}

const billingContentContext = createContext<HbarAppUiBillingContent | undefined>(undefined)

export function HbarAppUiBillingProvider({content, children}: HbarAppUiBillingProviderProps) {
    return <billingContentContext.Provider value={content}>{children}</billingContentContext.Provider>
}

export function useHbarAppUiBillingContent(): HbarAppUiBillingContent | undefined {
    return useContext(billingContentContext)
}
