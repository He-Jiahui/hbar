import type {HbarAppUiVariantProps} from '../types'
import {BillingFrame} from './billing/BillingPrimitives'
import {useHbarAppUiBillingContent} from './billing/BillingContent'
import {BillingStatement} from './billing/BillingStatement'
import {PlansBilling} from './billing/PlansBilling'
import {InvoiceComposerBilling} from './billing/InvoiceComposerBilling'
import {RecoveryBilling} from './billing/RecoveryBilling'
import {ChangePlanBilling} from './billing/ChangePlanBilling'
import {PaymentMethodsBilling} from './billing/PaymentMethodsBilling'
import {UsageOveragesBilling} from './billing/UsageOveragesBilling'
import {InvoiceDetailBilling} from './billing/InvoiceDetailBilling'

export type HbarAppUiBillingProps = HbarAppUiVariantProps & {
    readonly billingContent?: import('./billing/BillingContent').HbarAppUiBillingContent | undefined
}

export {HbarAppUiBillingProvider, selectHbarAppUiBillingItem, uniqueHbarAppUiBillingItems} from './billing/BillingContent'
export type {
    HbarAppUiBillingChangePlanChoice,
    HbarAppUiBillingChangePlanContent,
    HbarAppUiBillingChangePlanSummary,
    HbarAppUiBillingChoice,
    HbarAppUiBillingContent,
    HbarAppUiBillingFieldKind,
    HbarAppUiBillingInvoiceActivity,
    HbarAppUiBillingInvoiceComposerContent,
    HbarAppUiBillingInvoiceDetailContent,
    HbarAppUiBillingInvoiceField,
    HbarAppUiBillingInvoiceLine,
    HbarAppUiBillingInvoiceSection,
    HbarAppUiBillingListStrategy,
    HbarAppUiBillingMetric,
    HbarAppUiBillingPaymentMethod,
    HbarAppUiBillingPaymentMethodsContent,
    HbarAppUiBillingPlan,
    HbarAppUiBillingPlanFeature,
    HbarAppUiBillingPlanToggle,
    HbarAppUiBillingPlansContent,
    HbarAppUiBillingRecoveryContent,
    HbarAppUiBillingRetryAttempt,
    HbarAppUiBillingStatementContent,
    HbarAppUiBillingStatementInvoice,
    HbarAppUiBillingSubscription,
    HbarAppUiBillingTone,
    HbarAppUiBillingUsageContent,
    HbarAppUiBillingUsageMeter,
    HbarAppUiBillingUsagePeriod,
    HbarAppUiBillingValueRow,
    HbarAppUiBillingWorkflowStep,
    HbarAppUiBillingContact,
    HbarAppUiBillingProviderProps,
} from './billing/BillingContent'

function EmptyBillingSurface({spec, onAction}: HbarAppUiVariantProps) {
    return <BillingFrame spec={spec} onAction={onAction}>{null}</BillingFrame>
}

export function Billing({spec, onAction, billingContent}: HbarAppUiBillingProps) {
    const providedContent = useHbarAppUiBillingContent()
    const content = billingContent ?? providedContent
    if (!content) return <EmptyBillingSurface spec={spec} onAction={onAction}/>
    switch (spec.variant) {
        case 1:
            return content.statement ? <BillingStatement spec={spec} onAction={onAction} content={content.statement}/> : <EmptyBillingSurface spec={spec} onAction={onAction}/>
        case 2:
            return content.plans ? <PlansBilling spec={spec} onAction={onAction} content={content.plans}/> : <EmptyBillingSurface spec={spec} onAction={onAction}/>
        case 3:
            return content.invoiceComposer ? <InvoiceComposerBilling spec={spec} onAction={onAction} content={content.invoiceComposer}/> : <EmptyBillingSurface spec={spec} onAction={onAction}/>
        case 4:
            return content.recovery ? <RecoveryBilling spec={spec} onAction={onAction} content={content.recovery}/> : <EmptyBillingSurface spec={spec} onAction={onAction}/>
        case 5:
            return content.changePlan ? <ChangePlanBilling spec={spec} onAction={onAction} content={content.changePlan}/> : <EmptyBillingSurface spec={spec} onAction={onAction}/>
        case 6:
            return content.paymentMethods ? <PaymentMethodsBilling spec={spec} onAction={onAction} content={content.paymentMethods}/> : <EmptyBillingSurface spec={spec} onAction={onAction}/>
        case 7:
            return content.usage ? <UsageOveragesBilling spec={spec} onAction={onAction} content={content.usage}/> : <EmptyBillingSurface spec={spec} onAction={onAction}/>
        case 8:
            return content.invoiceDetail ? <InvoiceDetailBilling spec={spec} onAction={onAction} content={content.invoiceDetail}/> : <EmptyBillingSurface spec={spec} onAction={onAction}/>
        default:
            return <EmptyBillingSurface spec={spec} onAction={onAction}/>
    }
}
