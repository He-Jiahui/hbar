import type { HbarAppUiBillingContent } from '../../packages/hbar-app-ui/src/index'
import { createBillingStatementReferenceFixture } from './hbar-app-ui-billing-statement-reference-fixtures'
import { createBillingPlansReferenceFixture } from './hbar-app-ui-billing-plans-reference-fixtures'
import { createBillingRecoveryReferenceFixture } from './hbar-app-ui-billing-recovery-reference-fixtures'
import { createBillingPaymentMethodsReferenceFixture } from './hbar-app-ui-billing-payment-methods-reference-fixtures'
import { createBillingUsageReferenceFixture } from './hbar-app-ui-billing-usage-reference-fixtures'
import { createBillingInvoiceDetailReferenceFixture } from './hbar-app-ui-billing-invoice-detail-reference-fixtures'
import { createBillingWorkflowReferenceFixtures } from './hbar-app-ui-billing-workflow-reference-fixtures'
import { createHbarAppUiBillingOverflowFixtures } from './hbar-app-ui-billing-fixtures'

export function createBillingReferencePreviewFixtures(
  locale: 'en' | 'de-long' = 'en',
  overflow = false,
): HbarAppUiBillingContent {
  const source: HbarAppUiBillingContent = {
    statement: createBillingStatementReferenceFixture(locale),
    plans: createBillingPlansReferenceFixture(locale),
    ...createBillingWorkflowReferenceFixtures(locale),
    recovery: createBillingRecoveryReferenceFixture(locale),
    paymentMethods: createBillingPaymentMethodsReferenceFixture(locale),
    usage: createBillingUsageReferenceFixture(locale),
    invoiceDetail: createBillingInvoiceDetailReferenceFixture(locale),
  }
  if (!overflow) return source
  const pressure = createHbarAppUiBillingOverflowFixtures()
  return {
    ...source,
    statement: source.statement
      ? { ...source.statement, invoices: pressure.statement?.invoices ?? source.statement.invoices }
      : undefined,
    recovery: source.recovery
      ? { ...source.recovery, subscriptions: pressure.recovery?.subscriptions ?? source.recovery.subscriptions }
      : undefined,
    paymentMethods: source.paymentMethods
      ? {
          ...source.paymentMethods,
          methods: pressure.paymentMethods?.methods ?? source.paymentMethods.methods,
          contacts: pressure.paymentMethods?.contacts ?? source.paymentMethods.contacts,
          methodListStrategy: { kind: 'pane-scroll', expectedMaximum: 8 },
          contactListStrategy: { kind: 'pane-scroll', expectedMaximum: 12 },
        }
      : undefined,
    usage: source.usage ? { ...source.usage, meters: pressure.usage?.meters ?? source.usage.meters } : undefined,
    invoiceDetail: source.invoiceDetail
      ? {
          ...source.invoiceDetail,
          lines: pressure.invoiceDetail?.lines ?? source.invoiceDetail.lines,
          listStrategy: { kind: 'pane-scroll', expectedMaximum: 12 },
        }
      : undefined,
  }
}
