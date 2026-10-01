import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenOnboardingProvider,
  useLumenOnboardingContent,
  type LumenOnboarding7ReferenceViewModel,
  type LumenOnboardingContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Onboarding7PreviewFixture } from './onboarding7PreviewFixtures'
import { createOnboarding7PreviewStore } from './onboarding7PreviewStore'

type Onboarding7PreviewHostProps = HbarAppUiVariantProps & {
  readonly content: LumenOnboardingContent
  readonly referenceFixture: Onboarding7PreviewFixture
  readonly children: ReactNode
}

export function Onboarding7PreviewHost(props: Onboarding7PreviewHostProps) {
  if (props.spec.category !== 'onboarding' || props.spec.variant !== 7) return props.children
  return <Onboarding7PreviewHostOwner key={props.spec.id} {...props} />
}

function Onboarding7PreviewHostOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: Onboarding7PreviewHostProps) {
  const parentContent = useLumenOnboardingContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createOnboarding7PreviewStore(referenceFixture.seed), [referenceFixture.seed])
  const state = useStore(store)

  const preview = referenceFixture.contentFor(state)
  const notifyRequest = (actionId: string, request: unknown) => {
    onActionRef.current?.({ variantId: spec.id, actionId, value: JSON.stringify(request) })
  }

  const workspaceReference: LumenOnboarding7ReferenceViewModel = {
    content: {
      title: preview.labels.title,
      description: preview.labels.description,
      workspaceNameLabel: preview.labels.workspaceName,
      workspaceNamePlaceholder: preview.labels.workspaceNamePlaceholder,
      workspaceUrlLabel: preview.labels.workspaceUrl,
      workspaceUrlPlaceholder: preview.labels.workspaceUrlPlaceholder,
      memberReachHint: preview.labels.memberReachHint,
      dataRegionLabel: preview.labels.dataRegion,
      regionPermanentHint: preview.labels.regionPermanentHint,
      privateWorkspaceLabel: preview.labels.privateWorkspace,
      privateWorkspaceDescription: preview.labels.privateWorkspaceDescription,
      backLabel: preview.labels.back,
      continueLabel: preview.labels.continue,
      workspaceName: preview.workspaceName,
      slug: preview.slug,
      urlPrefix: preview.urlPrefix,
      regionId: preview.regionId,
      regionOptions: preview.regionOptions,
      privateWorkspace: preview.privateWorkspace,
    },
    onWorkspaceNameChange: (value) => store.getState().updateWorkspaceName(value),
    onSlugChangeRequest(value) {
      notifyRequest('request-slug-change', store.getState().requestSlugChange(value))
    },
    onRegionChange: (regionId) => {
      store.getState().selectRegion(regionId)
    },
    onPrivateWorkspaceChange: (checked) => store.getState().setPrivateWorkspace(checked),
    onBackRequest() {
      notifyRequest('request-back', store.getState().requestBack())
    },
    onContinueRequest() {
      notifyRequest('request-continue', store.getState().requestContinue())
    },
  }

  return (
    <LumenOnboardingProvider content={{ ...(parentContent ?? content), workspaceReference }}>
      {children}
    </LumenOnboardingProvider>
  )
}
