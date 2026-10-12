import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenOnboardingProvider, useLumenOnboardingContent, type LumenOnboarding4ReferenceViewModel, type LumenOnboardingContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Onboarding4PreviewFixture } from './onboarding4PreviewFixtures'
import { createOnboarding4PreviewStore } from './onboarding4PreviewStore'

type Onboarding4PreviewHostProps = HbarAppUiVariantProps & {
  readonly content: LumenOnboardingContent
  readonly referenceFixture: Onboarding4PreviewFixture
  readonly children: ReactNode
}

export function Onboarding4PreviewHost(props: Onboarding4PreviewHostProps) {
  if (props.spec.category !== 'onboarding' || props.spec.variant !== 4) return props.children
  return <Onboarding4PreviewHostOwner key={props.spec.id} {...props} />
}

function Onboarding4PreviewHostOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: Onboarding4PreviewHostProps) {
  const parentContent = useLumenOnboardingContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createOnboarding4PreviewStore(referenceFixture.seed), [referenceFixture.seed])
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

  const useCaseReference: LumenOnboarding4ReferenceViewModel = {
    content: {
      stepLabel: preview.step.label,
      heading: preview.labels.heading,
      description: preview.labels.description,
      useCaseGroupLabel: preview.labels.useCaseGroupLabel,
      emptyUseCasesText: preview.labels.emptyUseCasesText,
      useCases: preview.useCases.map((useCase) => ({
        id: useCase.id,
        title: useCase.title,
        description: useCase.description,
        accessibleName: useCase.accessibleName,
        checked: useCase.checked,
      })),
      teamSizeLegend: preview.labels.teamSizeLegend,
      teamSizes: preview.teamSizes.map((teamSize) => ({
        id: teamSize.id,
        label: teamSize.label,
        pressed: teamSize.pressed,
      })),
      backLabel: preview.actions.backLabel,
      continueLabel: preview.actions.continueLabel,
      backEnabled: preview.actions.backEnabled,
      continueEnabled: preview.actions.continueEnabled,
    },
    onUseCaseSelectionRequest(useCaseId) {
      if (store.getState().selectUseCase(useCaseId)) notify('select-use-case', useCaseId)
    },
    onTeamSizeSelectionRequest(teamSizeId) {
      if (store.getState().selectTeamSize(teamSizeId)) notify('select-team-size', teamSizeId)
    },
    onBackRequest() {
      notifyRequest('request-back', store.getState().requestBack())
    },
    onContinueRequest() {
      notifyRequest('request-continue', store.getState().requestContinue())
    },
  }

  return (
    <LumenOnboardingProvider content={{ ...(parentContent ?? content), useCaseReference }}>
      {children}
    </LumenOnboardingProvider>
  )
}
