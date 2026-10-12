'use client'

import BillingStatement from './billing/BillingStatement'
import ChangePlanBilling from './billing/ChangePlanBilling'
import InvoiceComposerBilling from './billing/InvoiceComposerBilling'
import InvoiceDetailBilling from './billing/InvoiceDetailBilling'
import PaymentMethodsBilling from './billing/PaymentMethodsBilling'
import { PlansBilling } from './billing/PlansBilling'
import RecoveryBilling from './billing/RecoveryBilling'
import UsageOveragesBilling from './billing/UsageOveragesBilling'
import { ReferenceBillingStatement } from './billing/ReferenceBillingStatement'
import { ReferenceBillingPlans } from './billing/ReferenceBillingPlans'
import { ReferenceBillingInvoiceComposer, ReferenceBillingChangePlan } from './billing/ReferenceBillingWorkflows'
import { ReferenceBillingRecovery } from './billing/ReferenceBillingRecovery'
import { ReferenceBillingPaymentMethods } from './billing/ReferenceBillingPaymentMethods'
import { ReferenceBillingUsage } from './billing/ReferenceBillingUsage'
import { ReferenceBillingInvoiceDetail } from './billing/ReferenceBillingInvoiceDetail'
import {
  LumenBillingProvider,
  selectLumenBillingItem,
  uniqueLumenBillingItems,
  useLumenBillingContent,
  type LumenBillingContent,
} from './billing/content'
import { BillingFrame, type LumenBillingCompositionProps } from './billing/primitives'
import './billing.css'

export interface LumenBillingAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenBillingProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenBillingContent | undefined
  readonly onAction?: ((event: LumenBillingAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenBillingVariantProps = Omit<LumenBillingProps, 'variant' | 'variantId'>

export { LumenBillingProvider, selectLumenBillingItem, uniqueLumenBillingItems, useLumenBillingContent }

function compositionProps(props: LumenBillingProps): LumenBillingCompositionProps {
  return {
    spec: {
      id: props.variantId,
      variant: props.variant,
      density: props.density,
      className: props.className,
      profile: {
        surface: props.surface,
        initialState: props.state,
        visualMode: props.visualMode,
      },
    },
    onAction: props.onAction
      ? ({ actionId, value }) => props.onAction?.(value === undefined ? { actionId } : { actionId, value })
      : undefined,
  }
}

function empty(props: LumenBillingProps) {
  return <BillingFrame {...compositionProps(props)}>{null}</BillingFrame>
}

export function LumenBilling(props: LumenBillingProps) {
  const inheritedContent = useLumenBillingContent()
  const content = props.content ?? inheritedContent
  const composition = compositionProps(props)
  if (props.variant === 1 && content?.statement?.referenceLayout) {
    return (
      <ReferenceBillingStatement
        {...composition}
        content={content.statement}
        layout={content.statement.referenceLayout}
      />
    )
  }
  if (props.variant === 2 && content?.plans?.referenceLayout) {
    return <ReferenceBillingPlans {...composition} content={content.plans} layout={content.plans.referenceLayout} />
  }
  if (props.variant === 3 && content?.invoiceComposer?.referenceLayout) {
    return (
      <ReferenceBillingInvoiceComposer
        {...composition}
        content={content.invoiceComposer}
        layout={content.invoiceComposer.referenceLayout}
      />
    )
  }
  if (props.variant === 4 && content?.recovery?.referenceLayout) {
    return (
      <ReferenceBillingRecovery {...composition} content={content.recovery} layout={content.recovery.referenceLayout} />
    )
  }
  if (props.variant === 5 && content?.changePlan?.referenceLayout) {
    return (
      <ReferenceBillingChangePlan
        {...composition}
        content={content.changePlan}
        layout={content.changePlan.referenceLayout}
      />
    )
  }
  if (props.variant === 6 && content?.paymentMethods?.referenceLayout) {
    return (
      <ReferenceBillingPaymentMethods
        {...composition}
        content={content.paymentMethods}
        layout={content.paymentMethods.referenceLayout}
      />
    )
  }
  if (props.variant === 7 && content?.usage?.referenceLayout) {
    return <ReferenceBillingUsage {...composition} content={content.usage} layout={content.usage.referenceLayout} />
  }
  if (props.variant === 8 && content?.invoiceDetail?.referenceLayout) {
    return (
      <ReferenceBillingInvoiceDetail
        {...composition}
        content={content.invoiceDetail}
        layout={content.invoiceDetail.referenceLayout}
      />
    )
  }
  if (props.variant === 1) {
    return content?.statement ? <BillingStatement {...composition} content={content.statement} /> : empty(props)
  }
  if (props.variant === 2) {
    return content?.plans ? <PlansBilling {...composition} content={content.plans} /> : empty(props)
  }
  if (props.variant === 3) {
    return content?.invoiceComposer ? (
      <InvoiceComposerBilling {...composition} content={content.invoiceComposer} />
    ) : (
      empty(props)
    )
  }
  if (props.variant === 4) {
    return content?.recovery ? <RecoveryBilling {...composition} content={content.recovery} /> : empty(props)
  }
  if (props.variant === 5) {
    return content?.changePlan ? <ChangePlanBilling {...composition} content={content.changePlan} /> : empty(props)
  }
  if (props.variant === 6) {
    return content?.paymentMethods ? (
      <PaymentMethodsBilling {...composition} content={content.paymentMethods} />
    ) : (
      empty(props)
    )
  }
  if (props.variant === 7) {
    return content?.usage ? <UsageOveragesBilling {...composition} content={content.usage} /> : empty(props)
  }
  if (props.variant === 8) {
    return content?.invoiceDetail ? (
      <InvoiceDetailBilling {...composition} content={content.invoiceDetail} />
    ) : (
      empty(props)
    )
  }
  return empty(props)
}

function variant(value: number, props: LumenBillingVariantProps) {
  return <LumenBilling {...props} variant={value} variantId={`hbar-app-ui-billing-${value}`} />
}

export function LumenBilling01(props: LumenBillingVariantProps) {
  return variant(1, props)
}

export function LumenBilling02(props: LumenBillingVariantProps) {
  return variant(2, props)
}

export function LumenBilling03(props: LumenBillingVariantProps) {
  return variant(3, props)
}

export function LumenBilling04(props: LumenBillingVariantProps) {
  return variant(4, props)
}

export function LumenBilling05(props: LumenBillingVariantProps) {
  return variant(5, props)
}

export function LumenBilling06(props: LumenBillingVariantProps) {
  return variant(6, props)
}

export function LumenBilling07(props: LumenBillingVariantProps) {
  return variant(7, props)
}

export function LumenBilling08(props: LumenBillingVariantProps) {
  return variant(8, props)
}
