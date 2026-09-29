import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenPaywallProvider,
  useLumenPaywallContent,
  type LumenPaywall7ReferenceViewModel,
  type LumenPaywallContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Paywall7PreviewFixture } from './paywall7PreviewFixtures'
import { createPaywall7PreviewStore } from './paywall7PreviewStore'

export function Paywall7PreviewHost({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: HbarAppUiVariantProps & {
  readonly content: LumenPaywallContent
  readonly referenceFixture: Paywall7PreviewFixture
  readonly children: ReactNode
}) {
  const parentContent = useLumenPaywallContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createPaywall7PreviewStore(referenceFixture.seed), [referenceFixture.seed])
  const state = useStore(store)

  if (spec.category !== 'paywall' || spec.variant !== 7) return children

  const preview = referenceFixture.contentFor(state)
  const notifyRequest = (actionId: string, request: unknown) => {
    onActionRef.current?.({ variantId: spec.id, actionId, value: JSON.stringify(request) })
  }
  const adminReference: LumenPaywall7ReferenceViewModel = {
    content: {
      labels: preview.labels,
      recipients: preview.recipients,
      draft: preview.draft,
      listStrategy: preview.listStrategy,
    },
    onDraftChange: (value) => store.getState().setDraft(value),
    onComparePlansRequest() {
      notifyRequest('request-plan-comparison', store.getState().requestComparePlans())
    },
    onSendRequest() {
      notifyRequest('request-admin-upgrade', store.getState().requestSend())
    },
  }

  return (
    <LumenPaywallProvider content={{ ...(parentContent ?? content), adminReference }}>{children}</LumenPaywallProvider>
  )
}
