import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenPaywallProvider, useLumenPaywallContent, type LumenPaywall4ReferenceViewModel, type LumenPaywallContent } from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Paywall4PreviewFixture } from './paywall4PreviewFixtures'
import { createPaywall4PreviewStore } from './paywall4PreviewStore'

export function Paywall4PreviewHost({ content, spec, onAction, referenceFixture, children }: HbarAppUiVariantProps & {
  readonly content: LumenPaywallContent
  readonly referenceFixture: Paywall4PreviewFixture
  readonly children: ReactNode
}) {
  const parentContent = useLumenPaywallContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createPaywall4PreviewStore(referenceFixture.seed), [referenceFixture.seed])
  const state = useStore(store)
  if (spec.category !== 'paywall' || spec.variant !== 4) return children

  const preview = referenceFixture.contentFor(state)
  const notifyRequest = (actionId: string, request: unknown) => {
    onActionRef.current?.({ variantId: spec.id, actionId, value: JSON.stringify(request) })
  }
  const usageReference: LumenPaywall4ReferenceViewModel = {
    content: preview,
    onTopUpRequest() {
      notifyRequest('request-top-up', store.getState().requestTopUp())
    },
    onUpgradeRequest() {
      notifyRequest('request-upgrade', store.getState().requestUpgrade())
    },
  }

  return <LumenPaywallProvider content={{ ...(parentContent ?? content), usageReference }}>{children}</LumenPaywallProvider>
}
