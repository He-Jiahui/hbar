import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenFormsProvider, useLumenFormsContent, type LumenForms7ViewModel, type LumenFormsContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Forms7PreviewFixture } from './forms7PreviewFixtures'
import { createForms7PreviewStore } from './forms7PreviewStore'

type FormsForm7PreviewHostProps = HbarAppUiVariantProps & {
  readonly content: LumenFormsContent
  readonly referenceFixture: Forms7PreviewFixture
  readonly children: ReactNode
}

export function FormsForm7PreviewHost(props: FormsForm7PreviewHostProps) {
  if (props.spec.category !== 'forms' || props.spec.variant !== 7) return props.children
  return <FormsForm7PreviewHostOwner key={props.spec.id} {...props} />
}

function FormsForm7PreviewHostOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: FormsForm7PreviewHostProps) {
  const parentContent = useLumenFormsContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createForms7PreviewStore(referenceFixture.storeSeed), [referenceFixture])
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

  const communityArtsApplicationReference: LumenForms7ViewModel = {
    content: preview,
    onTextFieldChange(fieldId, value) {
      notifyIfChanged(`edit-application-${fieldId}`, store.getState().setTextField(fieldId, value))
    },
    onFocusAreaChange(focusAreaId) {
      notifyIfChanged('select-application-focus-area', store.getState().selectFocusArea(focusAreaId), focusAreaId)
    },
    onTagInputChange(value) {
      notifyIfChanged('edit-application-discipline-tags', store.getState().setTagInput(value))
    },
    onTagCommitRequest() {
      if (store.getState().requestTagCommit()) notify('request-add-application-discipline-tag')
    },
    onTagRemovalRequest(tagId) {
      const request = store.getState().requestTagRemoval(tagId)
      if (request?.kind === 'remove-discipline-tag') notify('request-remove-application-discipline-tag', tagId)
    },
    onFundingTierChange(fundingTierId) {
      notifyIfChanged(
        'select-application-funding-tier',
        store.getState().selectFundingTier(fundingTierId),
        fundingTierId,
      )
    },
    onSummaryChange(value) {
      notifyIfChanged('edit-application-summary', store.getState().setSummary(value))
    },
    onFilesSelected(files) {
      store
        .getState()
        .requestFileSelection(files.map((file) => ({ fileName: file.name, byteSize: file.size, mediaType: file.type })))
      notify('request-application-file-selection')
    },
    onAttachmentRemovalRequest(attachmentId) {
      if (store.getState().requestAttachmentRemoval(attachmentId)) {
        notify('request-application-attachment-removal', attachmentId)
      }
    },
    onConsentChange(checked) {
      notifyIfChanged(
        'toggle-application-consent',
        store.getState().setConsent(checked),
        checked ? 'checked' : 'unchecked',
      )
    },
    onSaveDraft() {
      store.getState().requestSaveDraft()
      notify('request-save-application-draft')
    },
    onSubmitApplication() {
      if (store.getState().requestSubmit()) notify('request-submit-application')
    },
  }

  return (
    <LumenFormsProvider content={{ ...(parentContent ?? content), communityArtsApplicationReference }}>
      {children}
    </LumenFormsProvider>
  )
}
