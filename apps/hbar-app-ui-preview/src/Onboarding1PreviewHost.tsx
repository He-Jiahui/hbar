import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenOnboardingProvider, useLumenOnboardingContent, type LumenOnboarding1ReferenceViewModel, type LumenOnboardingContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Onboarding1PreviewFixture } from './onboarding1PreviewFixtures'
import { createOnboarding1PreviewStore } from './onboarding1PreviewStore'

type Onboarding1PreviewHostProps = HbarAppUiVariantProps & {
  readonly content: LumenOnboardingContent
  readonly referenceFixture: Onboarding1PreviewFixture
  readonly children: ReactNode
}

export function Onboarding1PreviewHost(props: Onboarding1PreviewHostProps) {
  if (props.spec.category !== 'onboarding' || props.spec.variant !== 1) return props.children
  return <Onboarding1PreviewHostOwner key={props.spec.id} {...props} />
}

function Onboarding1PreviewHostOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: Onboarding1PreviewHostProps) {
  const parentContent = useLumenOnboardingContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(
    () => createOnboarding1PreviewStore(referenceFixture.initialDraft),
    [referenceFixture.initialDraft],
  )
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

  const profileReference: LumenOnboarding1ReferenceViewModel = {
    content: {
      copy: {
        title: preview.copy.title,
        introduction: preview.copy.introduction,
        uploadPhoto: preview.copy.uploadPhoto,
        photoRequirements: preview.copy.photoRequirements,
        fullNameLabel: preview.copy.fullNameLabel,
        requiredMarker: preview.copy.requiredMarker,
        fullNamePlaceholder: preview.copy.fullNamePlaceholder,
        jobTitleLabel: preview.copy.jobTitleLabel,
        jobTitlePlaceholder: preview.copy.jobTitlePlaceholder,
        timezoneLabel: preview.copy.timezoneLabel,
        timezonePlaceholder: preview.copy.timezonePlaceholder,
        productUpdatesOptIn: preview.copy.productUpdatesOptIn,
        continueLabel: preview.copy.continueLabel,
        directoryPreviewTitle: preview.copy.directoryPreviewTitle,
        directoryTimezoneLabel: preview.copy.directoryTimezoneLabel,
        directoryUpdatesLabel: preview.copy.directoryUpdatesLabel,
        directoryPreviewDescription: preview.copy.directoryPreviewDescription,
      },
      form: {
        fullName: preview.form.fullName,
        jobTitle: preview.form.jobTitle,
        timezone: {
          selectedId: preview.form.timezone.selectedId,
          placeholder: preview.form.timezone.placeholder,
          options: preview.form.timezone.options,
        },
        productUpdatesOptIn: preview.form.productUpdatesOptIn,
      },
      photoUpload: preview.photoUpload,
      continue: {
        enabledInCapturedDefault: preview.continue.enabledInCapturedDefault,
        outcomeEvidence: preview.continue.outcomeEvidence,
      },
      directoryPreview: {
        avatarInitials: preview.directoryPreview.avatarInitials,
        fullName: preview.directoryPreview.fullName,
        jobTitle: preview.directoryPreview.jobTitle,
        timezone: {
          label: preview.directoryPreview.timezone.label,
          value: preview.directoryPreview.timezone.value,
        },
        updates: {
          label: preview.directoryPreview.updates.label,
          value: preview.directoryPreview.updates.value,
        },
        description: preview.directoryPreview.description,
      },
    },
    onFullNameChange(value) {
      notifyIfChanged('edit-profile-full-name', store.getState().setFullName(value), value)
    },
    onJobTitleChange(value) {
      notifyIfChanged('edit-profile-job-title', store.getState().setJobTitle(value), value)
    },
    onTimezoneChange(value) {
      notifyIfChanged('select-profile-timezone', store.getState().setTimezoneId(value), value)
    },
    onProductUpdatesChange(enabled) {
      notifyIfChanged(
        'toggle-profile-product-updates',
        store.getState().setProductUpdatesOptIn(enabled),
        enabled ? 'checked' : 'unchecked',
      )
    },
    onPhotoRequest() {
      const request = store.getState().requestPhotoSelection()
      notify('request-profile-photo-selection', request.kind)
    },
    onContinueRequest() {
      const request = store.getState().requestContinue()
      notify('request-profile-continue', JSON.stringify(request))
    },
  }

  return (
    <LumenOnboardingProvider content={{ ...(parentContent ?? content), profileReference }}>
      {children}
    </LumenOnboardingProvider>
  )
}
