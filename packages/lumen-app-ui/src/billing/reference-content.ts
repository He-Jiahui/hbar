import type { LumenBillingChangePlanSummary, LumenBillingValueRow } from './content'

export interface LumenBillingReferenceFeedback {
  readonly pending: boolean
  readonly error: string | null
  readonly feedback: string | null
}

export interface LumenBillingStatementReferenceLayout {
  readonly labels: { readonly tableCaption: string }
}
export interface LumenBillingStatementReferenceFlow {
  readonly query: string
  readonly onQueryChange: (query: string) => void
}

export interface LumenBillingPlanReferenceFlag {
  readonly planId: string
  readonly toggleId: string
  readonly enabled: boolean
}
export interface LumenBillingPlansReferenceLayout {
  readonly ownerId: string
}
export interface LumenBillingPlansReferenceFlow extends LumenBillingReferenceFeedback {
  readonly flags: readonly LumenBillingPlanReferenceFlag[]
  readonly dirty: boolean
  readonly onToggle: (planId: string, toggleId: string, enabled: boolean) => void
  readonly onDiscard: () => void
  readonly onSave: () => void
}

export interface LumenBillingInvoiceComposerReferenceLayout {
  readonly draftId: string
  readonly valueLimit: number
  readonly stepNumber: (position: number) => string
}
export interface LumenBillingInvoiceComposerReferenceFlow extends LumenBillingReferenceFeedback {
  readonly values: Readonly<Record<string, string>>
  readonly onFieldChange: (fieldId: string, value: string) => void
  readonly onSaveDraft: () => void
  readonly onNext: () => void
}

export interface LumenBillingRecoveryReferenceLayout {
  readonly metricRows: readonly {
    readonly metricId: string
    readonly rows: readonly LumenBillingValueRow[]
  }[]
  readonly labels: {
    readonly tableCaption: string
    readonly expand: (customer: string) => string
  }
}
export interface LumenBillingRecoveryReferenceFlow {
  readonly expandedIds: readonly string[]
  readonly onToggleSubscription: (subscriptionId: string) => void
}

export interface LumenBillingChangePlanReferenceLayout {
  readonly ownerId: string
  readonly initialStepId: string
  readonly stepNumber: (position: number) => string
  readonly summaries: readonly {
    readonly choiceId: string
    readonly summary: LumenBillingChangePlanSummary
  }[]
}
export interface LumenBillingChangePlanReferenceFlow {
  readonly choiceId: string | null
  readonly onChoiceChange: (choiceId: string) => void
  readonly onContinue: () => void
  readonly onCancel: () => void
}

export interface LumenBillingPaymentMethodsReferenceLayout {
  readonly ownerId: string
}
export interface LumenBillingPaymentMethodsReferenceFlow extends LumenBillingReferenceFeedback {
  readonly primaryMethodId: string | null
  readonly onMakePrimary: (methodId: string) => void
}

export interface LumenBillingUsageReferenceLayout {
  readonly ownerId: string
}
export interface LumenBillingUsageReferenceFlow {
  readonly periodId: string | null
  readonly onPeriodChange: (periodId: string) => void
}

export interface LumenBillingInvoiceDetailReferenceLayout {
  readonly showHeader: boolean
}
