import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenPaywallProvider,
  useLumenPaywallContent,
  type LumenPaywall6ReferenceViewModel,
  type LumenPaywallContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Paywall6PreviewFixture } from './paywall6PreviewFixtures'
import { createPaywall6PreviewStore } from './paywall6PreviewStore'

export function Paywall6PreviewHost({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: HbarAppUiVariantProps & {
  readonly content: LumenPaywallContent
  readonly referenceFixture: Paywall6PreviewFixture
  readonly children: ReactNode
}) {
  const parentContent = useLumenPaywallContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createPaywall6PreviewStore(referenceFixture.seed), [referenceFixture.seed])
  const state = useStore(store)
  if (spec.category !== 'paywall' || spec.variant !== 6) return children
  const preview = referenceFixture.contentFor(state)
  const notifyRequest = (actionId: string, request: unknown) => {
    onActionRef.current?.({ variantId: spec.id, actionId, value: JSON.stringify(request) })
  }
  const readsReference: LumenPaywall6ReferenceViewModel = {
    content: {
      labels: preview.labels,
      emailDraft: preview.emailDraft,
      segments: preview.segments,
      assurances: preview.assurances,
      listStrategy: preview.listStrategy,
    },
    onEmailDraftChange: (value) => store.getState().updateEmailDraft(value),
    onKeepReadingRequest() {
      notifyRequest('request-keep-reading', store.getState().requestKeepReading())
    },
    onSignInRequest() {
      notifyRequest('request-reader-sign-in', store.getState().requestSignIn())
    },
  }
  return (
    <LumenPaywallProvider content={{ ...(parentContent ?? content), readsReference }}>{children}</LumenPaywallProvider>
  )
}
