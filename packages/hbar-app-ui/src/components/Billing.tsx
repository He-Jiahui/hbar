import { LumenBilling, LumenBillingProvider as HbarAppUiBillingProvider, type LumenBillingContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiBillingProps = HbarAppUiVariantProps & {
  readonly billingContent?: LumenBillingContent | undefined
}

export { HbarAppUiBillingProvider }
export { selectLumenBillingItem as selectHbarAppUiBillingItem, uniqueLumenBillingItems as uniqueHbarAppUiBillingItems, useLumenBillingContent as useHbarAppUiBillingContent } from '@lumen/app-ui/catalog'
export type { LumenBillingChangePlanChoice as HbarAppUiBillingChangePlanChoice, LumenBillingChangePlanContent as HbarAppUiBillingChangePlanContent, LumenBillingChangePlanSummary as HbarAppUiBillingChangePlanSummary, LumenBillingChoice as HbarAppUiBillingChoice, LumenBillingContact as HbarAppUiBillingContact, LumenBillingContent as HbarAppUiBillingContent, LumenBillingFieldKind as HbarAppUiBillingFieldKind, LumenBillingInvoiceActivity as HbarAppUiBillingInvoiceActivity, LumenBillingInvoiceComposerContent as HbarAppUiBillingInvoiceComposerContent, LumenBillingInvoiceDetailContent as HbarAppUiBillingInvoiceDetailContent, LumenBillingInvoiceField as HbarAppUiBillingInvoiceField, LumenBillingInvoiceLine as HbarAppUiBillingInvoiceLine, LumenBillingInvoiceSection as HbarAppUiBillingInvoiceSection, LumenBillingListStrategy as HbarAppUiBillingListStrategy, LumenBillingMetric as HbarAppUiBillingMetric, LumenBillingPaymentMethod as HbarAppUiBillingPaymentMethod, LumenBillingPaymentMethodsContent as HbarAppUiBillingPaymentMethodsContent, LumenBillingPlan as HbarAppUiBillingPlan, LumenBillingPlanFeature as HbarAppUiBillingPlanFeature, LumenBillingPlansContent as HbarAppUiBillingPlansContent, LumenBillingPlanToggle as HbarAppUiBillingPlanToggle, LumenBillingProviderProps as HbarAppUiBillingProviderProps, LumenBillingRecoveryContent as HbarAppUiBillingRecoveryContent, LumenBillingRetryAttempt as HbarAppUiBillingRetryAttempt, LumenBillingStatementContent as HbarAppUiBillingStatementContent, LumenBillingStatementInvoice as HbarAppUiBillingStatementInvoice, LumenBillingSubscription as HbarAppUiBillingSubscription, LumenBillingTone as HbarAppUiBillingTone, LumenBillingUsageContent as HbarAppUiBillingUsageContent, LumenBillingUsageMeter as HbarAppUiBillingUsageMeter, LumenBillingUsagePeriod as HbarAppUiBillingUsagePeriod, LumenBillingValueRow as HbarAppUiBillingValueRow, LumenBillingWorkflowStep as HbarAppUiBillingWorkflowStep } from '@lumen/app-ui/catalog'

export function Billing({ spec, onAction, billingContent, className }: HbarAppUiBillingProps) {
  return (
    <LumenBilling
      variant={spec.variant}
      variantId={spec.id}
      content={billingContent}
      className={className}
      density={spec.density}
      surface={spec.profile.surface}
      state={spec.profile.initialState}
      visualMode={spec.profile.visualMode}
      onAction={
        onAction
          ? ({ actionId, value }) =>
              onAction(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
          : undefined
      }
    />
  )
}
