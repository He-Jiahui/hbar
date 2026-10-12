import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenOnboardingProvider, useLumenOnboardingContent, type LumenOnboarding2ReferenceViewModel, type LumenOnboardingContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Onboarding2PreviewFixture } from './onboarding2PreviewFixtures'
import { createOnboarding2PreviewStore } from './onboarding2PreviewStore'

type Onboarding2PreviewHostProps = HbarAppUiVariantProps & {
  readonly content: LumenOnboardingContent
  readonly referenceFixture: Onboarding2PreviewFixture
  readonly children: ReactNode
}

export function Onboarding2PreviewHost(props: Onboarding2PreviewHostProps) {
  if (props.spec.category !== 'onboarding' || props.spec.variant !== 2) return props.children
  return <Onboarding2PreviewHostOwner key={props.spec.id} {...props} />
}

function Onboarding2PreviewHostOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: Onboarding2PreviewHostProps) {
  const parentContent = useLumenOnboardingContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createOnboarding2PreviewStore(referenceFixture.seed), [referenceFixture.seed])
  const state = useStore(store)

  const preview = referenceFixture.contentFor(state)
  const notify = (actionId: string, value?: string) => {
    const handler = onActionRef.current
    if (!handler) return
    handler(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
  }
  const notifyRequest = (actionId: string, request: unknown) => {
    if (request !== null) notify(actionId, JSON.stringify(request))
  }
  const stepperReference: LumenOnboarding2ReferenceViewModel = {
    content: preview,
    onProfileFieldChange(fieldId, value) {
      const changed = store.getState().setProfileFieldValue(fieldId, value)
      if (changed) notify(`edit-profile-${fieldId}`, value)
    },
    onContinueProfile() {
      if (store.getState().continueProfile()) notify('continue-profile')
    },
    onStepNavigationRequest(stepId) {
      notifyRequest('request-step-navigation', store.getState().requestStepNavigation(stepId))
    },
    onBackRequest() {
      notifyRequest('request-back', store.getState().requestBack())
    },
    onRoleSelectionRequest(roleId) {
      notifyRequest('request-role-selection', store.getState().requestRoleSelection(roleId))
    },
    onContinueRoleRequest() {
      notifyRequest('request-role-continue', store.getState().requestStepNavigation('source'))
    },
  }

  return (
    <LumenOnboardingProvider content={{ ...(parentContent ?? content), stepperReference }}>
      {children}
    </LumenOnboardingProvider>
  )
}
