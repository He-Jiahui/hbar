'use client'

import * as React from 'react'
import {
  type LumenBillingStatementReferenceLayout,
  type LumenBillingStatementReferenceFlow,
  type LumenBillingPlansReferenceLayout,
  type LumenBillingPlansReferenceFlow,
  type LumenBillingInvoiceComposerReferenceLayout,
  type LumenBillingInvoiceComposerReferenceFlow,
  type LumenBillingRecoveryReferenceLayout,
  type LumenBillingRecoveryReferenceFlow,
  type LumenBillingChangePlanReferenceLayout,
  type LumenBillingChangePlanReferenceFlow,
  type LumenBillingPaymentMethodsReferenceLayout,
  type LumenBillingPaymentMethodsReferenceFlow,
  type LumenBillingUsageReferenceLayout,
  type LumenBillingUsageReferenceFlow,
  type LumenBillingInvoiceDetailReferenceLayout,
} from './reference-content'

/**
 * Billing data is supplied by the host. Short product lists may grow with
 * their content, dense ledger/recovery panes own their scroll boundary, and
 * any unbounded service collection must be paged or virtualized upstream.
 */
export type LumenBillingListStrategy =
  | { readonly kind: 'content-grown'; readonly expectedMaximum: number }
  | { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }
  | { readonly kind: 'virtualized'; readonly expectedMaximum: number }

export type LumenBillingTone = 'neutral' | 'positive' | 'warning' | 'danger'

export interface LumenBillingMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly detail?: string | undefined
  readonly trend?: string | undefined
  readonly tone?: LumenBillingTone | undefined
  readonly progress?: number | undefined
}

export interface LumenBillingValueRow {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly detail?: string | undefined
  readonly tone?: LumenBillingTone | undefined
}

export interface LumenBillingStatementInvoice {
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
  readonly statusTone: LumenBillingTone
}

export interface LumenBillingStatementContent {
  readonly referenceLayout?: LumenBillingStatementReferenceLayout | undefined
  readonly referenceFlow?: LumenBillingStatementReferenceFlow | undefined
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
    readonly metrics: readonly LumenBillingMetric[]
  }
  readonly invoices: readonly LumenBillingStatementInvoice[]
  readonly listStrategy: LumenBillingListStrategy
}

export interface LumenBillingPlanToggle {
  readonly id: string
  readonly label: string
  readonly enabled: boolean
}

export interface LumenBillingPlanFeature {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly icon: 'people' | 'bolt' | 'storage' | 'layers' | 'shield' | 'sparkles'
}

export interface LumenBillingPlan {
  readonly id: string
  readonly name: string
  readonly status: string
  readonly statusTone: LumenBillingTone
  readonly meta: string
  readonly price: string
  readonly priceSuffix: string
  readonly entitlements: readonly LumenBillingPlanFeature[]
  readonly addOns: readonly LumenBillingPlanFeature[]
  readonly toggles: readonly LumenBillingPlanToggle[]
}

export interface LumenBillingPlansContent {
  readonly referenceLayout?: LumenBillingPlansReferenceLayout | undefined
  readonly referenceFlow?: LumenBillingPlansReferenceFlow | undefined
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
  readonly plans: readonly LumenBillingPlan[]
  readonly initialDirty?: boolean | undefined
  readonly listStrategy: LumenBillingListStrategy
}

export type LumenBillingFieldKind = 'text' | 'date' | 'select'

export interface LumenBillingChoice {
  readonly id: string
  readonly label: string
}

export interface LumenBillingInvoiceField {
  readonly id: string
  readonly label: string
  readonly kind: LumenBillingFieldKind
  readonly value: string
  readonly placeholder?: string | undefined
  readonly description?: string | undefined
  readonly choices?: readonly LumenBillingChoice[] | undefined
  readonly prefix?: string | undefined
  readonly clearLabel?: string | undefined
}

export interface LumenBillingWorkflowStep {
  readonly id: string
  readonly label: string
  readonly description: string
}

export interface LumenBillingInvoiceSection {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly fields: readonly LumenBillingInvoiceField[]
}

export interface LumenBillingInvoiceComposerContent {
  readonly referenceLayout?: LumenBillingInvoiceComposerReferenceLayout | undefined
  readonly referenceFlow?: LumenBillingInvoiceComposerReferenceFlow | undefined
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
  readonly steps: readonly LumenBillingWorkflowStep[]
  readonly sections: readonly LumenBillingInvoiceSection[]
  readonly initialStepId: string
}

export interface LumenBillingRetryAttempt {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly code: string
  readonly date: string
}

export interface LumenBillingSubscription {
  readonly id: string
  readonly customer: string
  readonly customerMeta: string
  readonly status: string
  readonly statusTone: LumenBillingTone
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
  readonly attempts: readonly LumenBillingRetryAttempt[]
  readonly actionLabel: string
}

export interface LumenBillingRecoveryContent {
  readonly referenceLayout?: LumenBillingRecoveryReferenceLayout | undefined
  readonly referenceFlow?: LumenBillingRecoveryReferenceFlow | undefined
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
  readonly metrics: readonly LumenBillingMetric[]
  readonly subscriptions: readonly LumenBillingSubscription[]
  readonly initialExpandedId?: string | undefined
  readonly listStrategy: LumenBillingListStrategy
}

export interface LumenBillingChangePlanChoice {
  readonly id: string
  readonly name: string
  readonly marker?: string | undefined
  readonly description: string
  readonly price: string
  readonly priceSuffix: string
  readonly accessibleLabel: string
}

export interface LumenBillingChangePlanSummary {
  readonly title: string
  readonly description: string
  readonly actionBadge: string
  readonly dueLabel: string
  readonly dueAmount: string
  readonly dueDetail: string
  readonly rows: readonly LumenBillingValueRow[]
  readonly assurances: readonly string[]
}

export interface LumenBillingChangePlanContent {
  readonly referenceLayout?: LumenBillingChangePlanReferenceLayout | undefined
  readonly referenceFlow?: LumenBillingChangePlanReferenceFlow | undefined
  readonly labels: {
    readonly pageTitle: string
    readonly pageDescription: string
    readonly draft: string
    readonly cancel: string
    readonly continue: string
    readonly footerNotice: string
    readonly planSelection: string
  }
  readonly steps: readonly LumenBillingWorkflowStep[]
  readonly choices: readonly LumenBillingChangePlanChoice[]
  readonly initialChoiceId: string
  readonly summary: LumenBillingChangePlanSummary
}

export interface LumenBillingPaymentMethod {
  readonly id: string
  readonly kind: 'card' | 'bank'
  readonly name: string
  readonly status?: string | undefined
  readonly statusTone?: LumenBillingTone | undefined
  readonly detail: string
  readonly primary: boolean
  readonly actionLabel: string
}

export interface LumenBillingContact {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly detail: string
  readonly actionLabel: string
}

export interface LumenBillingPaymentMethodsContent {
  readonly referenceLayout?: LumenBillingPaymentMethodsReferenceLayout | undefined
  readonly referenceFlow?: LumenBillingPaymentMethodsReferenceFlow | undefined
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
  readonly methods: readonly LumenBillingPaymentMethod[]
  readonly contacts: readonly LumenBillingContact[]
  readonly addressLines: readonly string[]
  readonly taxRows: readonly LumenBillingValueRow[]
  readonly taxNotice: string
  readonly methodListStrategy: LumenBillingListStrategy
  readonly contactListStrategy: LumenBillingListStrategy
}

export interface LumenBillingUsageMeter {
  readonly id: string
  readonly icon: 'people' | 'bolt' | 'storage' | 'mail'
  readonly label: string
  readonly status?: string | undefined
  readonly statusTone?: LumenBillingTone | undefined
  readonly currentValue: string
  readonly percentage: number
  readonly percentageLabel: string
  readonly detail: string
  readonly amount: string
}

export interface LumenBillingUsagePeriod {
  readonly id: string
  readonly label: string
}

export interface LumenBillingUsageContent {
  readonly referenceLayout?: LumenBillingUsageReferenceLayout | undefined
  readonly referenceFlow?: LumenBillingUsageReferenceFlow | undefined
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
  readonly periods: readonly LumenBillingUsagePeriod[]
  readonly initialPeriodId: string
  readonly metrics: readonly LumenBillingMetric[]
  readonly meters: readonly LumenBillingUsageMeter[]
  readonly cycleAmount: string
  readonly listStrategy: LumenBillingListStrategy
}

export interface LumenBillingInvoiceLine {
  readonly id: string
  readonly description: string
  readonly detail: string
  readonly quantity: string
  readonly rate: string
  readonly amount: string
}

export interface LumenBillingInvoiceActivity {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly date: string
  readonly tone?: LumenBillingTone | undefined
}

export interface LumenBillingInvoiceDetailContent {
  readonly referenceLayout?: LumenBillingInvoiceDetailReferenceLayout | undefined
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
  readonly statusTone: LumenBillingTone
  readonly description: string
  readonly addressLines: readonly string[]
  readonly metadata: readonly LumenBillingValueRow[]
  readonly lines: readonly LumenBillingInvoiceLine[]
  readonly totals: readonly LumenBillingValueRow[]
  readonly activities: readonly LumenBillingInvoiceActivity[]
  readonly collection: readonly LumenBillingValueRow[]
  readonly listStrategy: LumenBillingListStrategy
}

export interface LumenBillingContent {
  readonly statement?: LumenBillingStatementContent | undefined
  readonly plans?: LumenBillingPlansContent | undefined
  readonly invoiceComposer?: LumenBillingInvoiceComposerContent | undefined
  readonly recovery?: LumenBillingRecoveryContent | undefined
  readonly changePlan?: LumenBillingChangePlanContent | undefined
  readonly paymentMethods?: LumenBillingPaymentMethodsContent | undefined
  readonly usage?: LumenBillingUsageContent | undefined
  readonly invoiceDetail?: LumenBillingInvoiceDetailContent | undefined
}

export interface LumenBillingProviderProps {
  readonly content: LumenBillingContent
  readonly children: React.ReactNode
}

export function uniqueLumenBillingItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenBillingItem<T extends { readonly id: string }>(
  items: readonly T[],
  activeId: string | undefined,
): T | undefined {
  const uniqueItems = uniqueLumenBillingItems(items)
  return uniqueItems.find((item) => item.id === activeId) ?? uniqueItems[0]
}

const billingContentContext = React.createContext<LumenBillingContent | undefined>(undefined)

export function LumenBillingProvider({ content, children }: LumenBillingProviderProps) {
  return <billingContentContext.Provider value={content}>{children}</billingContentContext.Provider>
}

export function useLumenBillingContent(): LumenBillingContent | undefined {
  return React.useContext(billingContentContext)
}
