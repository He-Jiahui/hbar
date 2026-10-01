import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenFormsProvider,
  useLumenFormsContent,
  type LumenForms6Content,
  type LumenForms6ViewModel,
  type LumenFormsContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Forms6PreviewFixture } from './forms6PreviewFixtures'
import { createForms6PreviewStore } from './forms6PreviewStore'

type FormsForm6PreviewHostProps = HbarAppUiVariantProps & {
  readonly content: LumenFormsContent
  readonly referenceFixture: Forms6PreviewFixture
  readonly children: ReactNode
}

export function FormsForm6PreviewHost(props: FormsForm6PreviewHostProps) {
  if (props.spec.category !== 'forms' || props.spec.variant !== 6) return props.children
  return <FormsForm6PreviewHostOwner key={props.spec.id} {...props} />
}

function FormsForm6PreviewHostOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: FormsForm6PreviewHostProps) {
  const parentContent = useLumenFormsContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createForms6PreviewStore(referenceFixture.storeSeed), [referenceFixture])
  const state = useStore(store)

  const preview = referenceFixture.contentFor(state)
  const notify = (actionId: string, value?: string) => {
    const handler = onActionRef.current
    if (!handler) return
    handler(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
  }
  const notifyIfChanged = (actionId: string, changed: boolean, value?: string) => {
    if (changed) notify(actionId, value)
  }

  const referenceContent: LumenForms6Content = {
    copy: preview.copy,
    email: preview.email,
    delivery: preview.delivery,
    billing: preview.billing,
    billingMatchesDelivery: preview.billingMatchesDelivery,
    payment: preview.payment,
    cartLines: preview.cartLines,
    shipping: preview.shipping,
    summary: preview.summary,
    backToCartLabel: preview.backToCartLabel,
    completeRequiredFields: preview.completeRequiredFields,
    payButtonLabel: preview.payButtonLabel,
    payDisabled: preview.payDisabled,
    listStrategy: preview.listStrategy,
  }

  const checkoutReference: LumenForms6ViewModel = {
    content: referenceContent,
    onEmailChange(value) {
      notifyIfChanged('edit-checkout-email', store.getState().setEmail(value))
    },
    onAddressFieldChange(addressId, fieldId, value) {
      notifyIfChanged(
        'edit-checkout-address-field',
        store.getState().setAddressField(addressId, fieldId, value),
        `${addressId}:${fieldId}`,
      )
    },
    onCountryChange(addressId, countryId) {
      notifyIfChanged(
        'select-checkout-country',
        store.getState().setAddressCountry(addressId, countryId),
        `${addressId}:${countryId}`,
      )
    },
    onRegionChange(addressId, regionValue) {
      notifyIfChanged('select-checkout-region', store.getState().setAddressRegion(addressId, regionValue), addressId)
    },
    onBillingMatchesDeliveryChange(checked) {
      notifyIfChanged(
        'toggle-billing-address-match',
        store.getState().setBillingMatchesDelivery(checked),
        checked ? 'checked' : 'unchecked',
      )
    },
    onPaymentFieldChange(fieldId, value) {
      // Keep payment data local to this preview; never emit entered values into the host event log.
      notifyIfChanged('edit-checkout-payment-field', store.getState().setPaymentField(fieldId, value))
    },
    onShippingChange(shippingId) {
      notifyIfChanged('select-checkout-shipping', store.getState().selectShipping(shippingId), shippingId)
    },
    onBackToCart() {
      const request = store.getState().requestBackToCart()
      if (request.kind === 'back-to-cart') notify('request-back-to-cart')
    },
    onPay() {
      store.getState().requestPay()
    },
  }

  return (
    <LumenFormsProvider content={{ ...(parentContent ?? content), checkoutReference }}>{children}</LumenFormsProvider>
  )
}
