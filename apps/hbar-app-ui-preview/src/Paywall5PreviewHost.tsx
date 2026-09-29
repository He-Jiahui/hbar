import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenPaywallProvider, useLumenPaywallContent, type LumenPaywall5ReferenceViewModel, type LumenPaywallContent } from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Paywall5PreviewFixture } from './paywall5PreviewFixtures'
import { createPaywall5PreviewStore } from './paywall5PreviewStore'

export function Paywall5PreviewHost({ content, spec, onAction, referenceFixture, children }: HbarAppUiVariantProps & {
  readonly content: LumenPaywallContent
  readonly referenceFixture: Paywall5PreviewFixture
  readonly children: ReactNode
}) {
  const parentContent = useLumenPaywallContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createPaywall5PreviewStore(referenceFixture.seed), [referenceFixture.seed])
  const state = useStore(store)
  if (spec.category !== 'paywall' || spec.variant !== 5) return children
  const preview = referenceFixture.contentFor(state)
  const notifyRequest = (actionId: string, request: unknown) => {
    onActionRef.current?.({ variantId: spec.id, actionId, value: JSON.stringify(request) })
  }
  const trialReference: LumenPaywall5ReferenceViewModel = {
    content: preview,
    onPaymentChangeRequest() {
      notifyRequest('request-payment-change', store.getState().requestPaymentChange())
    },
    onReactivateRequest() {
      notifyRequest('request-reactivate', store.getState().requestReactivate())
    },
  }
  return <LumenPaywallProvider content={{ ...(parentContent ?? content), trialReference }}>{children}</LumenPaywallProvider>
}
