import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenFormsProvider, useLumenFormsContent, type LumenForms2ReferenceViewModel, type LumenFormsContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Forms2PreviewFixture } from './forms2PreviewFixtures'
import { createForms2PreviewStore } from './forms2PreviewStore'

type Forms2PreviewHostProps = HbarAppUiVariantProps & {
  readonly content: LumenFormsContent
  readonly referenceFixture: Forms2PreviewFixture
  readonly children: ReactNode
}

export function Forms2PreviewHost(props: Forms2PreviewHostProps) {
  if (props.spec.category !== 'forms' || props.spec.variant !== 2) return props.children
  return <Forms2PreviewHostOwner key={props.spec.id} {...props} />
}

function Forms2PreviewHostOwner({ content, spec, onAction, referenceFixture, children }: Forms2PreviewHostProps) {
  const parentContent = useLumenFormsContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createForms2PreviewStore(referenceFixture.storeSeed), [referenceFixture])
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

  const sessionSubmissionReference: LumenForms2ReferenceViewModel = {
    content: preview,
    onTextChange(fieldId, value) {
      notifyIfChanged('edit-session-field', store.getState().setTextField(fieldId, value), fieldId)
    },
    onFormatChange(formatId) {
      notifyIfChanged('select-session-format', store.getState().selectFormat(formatId), formatId)
    },
    onTrackChange(trackId) {
      notifyIfChanged('select-session-track', store.getState().selectTrack(trackId), trackId)
    },
    onAudienceLevelChange(levelId) {
      notifyIfChanged('select-audience-level', store.getState().selectAudienceLevel(levelId), levelId)
    },
    onRoomRequirementChange(requirementId, checked) {
      notifyIfChanged(
        'toggle-room-requirement',
        store.getState().setRoomRequirement(requirementId, checked),
        `${requirementId}:${checked ? 'selected' : 'cleared'}`,
      )
    },
    onRecordingConsentChange(checked) {
      notifyIfChanged(
        'toggle-recording-consent',
        store.getState().setRecordingConsent(checked),
        checked ? 'accepted' : 'cleared',
      )
    },
    onSubmitProposal() {
      const attempt = store.getState().attemptSubmit()
      if (attempt.kind === 'invalid') {
        notify('validate-session-proposal')
        return
      }
      notify('request-session-proposal', JSON.stringify(attempt.draft))
    },
  }

  return (
    <LumenFormsProvider content={{ ...(parentContent ?? content), sessionSubmissionReference }}>
      {children}
    </LumenFormsProvider>
  )
}
