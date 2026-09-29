import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenOnboardingProvider,
  useLumenOnboardingContent,
  type LumenOnboarding6ReferenceViewModel,
  type LumenOnboardingContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Onboarding6PreviewFixture } from './onboarding6PreviewFixtures'
import { createOnboarding6PreviewStore } from './onboarding6PreviewStore'

export function Onboarding6PreviewHost({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: HbarAppUiVariantProps & {
  readonly content: LumenOnboardingContent
  readonly referenceFixture: Onboarding6PreviewFixture
  readonly children: ReactNode
}) {
  const parentContent = useLumenOnboardingContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createOnboarding6PreviewStore(referenceFixture.seed), [referenceFixture.seed])
  const state = useStore(store)

  if (spec.category !== 'onboarding' || spec.variant !== 6) return children

  const preview = referenceFixture.contentFor(state)
  const notifyRequest = (actionId: string, request: unknown) => {
    onActionRef.current?.({ variantId: spec.id, actionId, value: JSON.stringify(request) })
  }

  const completionReference: LumenOnboarding6ReferenceViewModel = {
    content: {
      title: preview.labels.title,
      description: preview.labels.description,
      summaryRows: preview.summaryRows,
      openWorkspaceLabel: preview.labels.openWorkspace,
      takeTourLabel: preview.labels.takeTour,
      inboxNote: preview.labels.inboxNote,
    },
    onOpenWorkspaceRequest() {
      notifyRequest('request-open-workspace', store.getState().requestOpenWorkspace())
    },
    onTakeTourRequest() {
      notifyRequest('request-take-tour', store.getState().requestTakeTour())
    },
  }

  return (
    <LumenOnboardingProvider content={{ ...(parentContent ?? content), completionReference }}>
      {children}
    </LumenOnboardingProvider>
  )
}
