import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenFormsProvider,
  useLumenFormsContent,
  type LumenForms12ViewModel,
  type LumenFormsContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import {
  FORMS12_INITIAL_PREMIUM_SNAPSHOT,
  FORMS12_INITIAL_REVIEW_FIELDS,
  type Forms12PreviewFixture,
} from './forms12PreviewFixtures'
import { createForms12PreviewStore } from './forms12PreviewStore'

type FormsForm12PreviewHostProps = HbarAppUiVariantProps & {
  readonly content: LumenFormsContent
  readonly referenceFixture: Forms12PreviewFixture
  readonly children: ReactNode
}

export function FormsForm12PreviewHost(props: FormsForm12PreviewHostProps) {
  if (props.spec.category !== 'forms' || props.spec.variant !== 12) return props.children
  return <FormsForm12PreviewHostOwner key={props.spec.id} {...props} />
}

function FormsForm12PreviewHostOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: FormsForm12PreviewHostProps) {
  const parentContent = useLumenFormsContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(
    () =>
      createForms12PreviewStore({
        reviewFields: FORMS12_INITIAL_REVIEW_FIELDS,
        premium: FORMS12_INITIAL_PREMIUM_SNAPSHOT,
      }),
    [],
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

  const quoteReviewReference: LumenForms12ViewModel = {
    content: {
      steps: preview.steps,
      sections: preview.sections.map((section) => ({
        id: section.id,
        title: section.title,
        editLabel: section.editLabel,
        editDisabled: section.editDisabled,
        editing: section.editing,
        rows: section.rows,
        editorFields: section.editorFields,
        cancelLabel: section.cancelLabel,
        saveLabel: section.saveLabel,
      })),
      premium: {
        heading: preview.premium.heading,
        description: preview.premium.description,
        lines: preview.premium.lines.map(({ id, label, formattedAmount }) => ({ id, label, formattedAmount })),
        annualTotal: {
          label: preview.premium.annualTotal.label,
          formattedAmount: preview.premium.annualTotal.formattedAmount,
        },
      },
      consents: preview.consents,
      requestBoundQuote: {
        label: preview.requestBoundQuote.label,
        disabled: preview.requestBoundQuote.disabled,
      },
    },
    onEditSection(sectionId) {
      if (sectionId !== 'business-details') return
      notifyIfChanged('edit-quote-review-section', store.getState().beginSectionEdit(sectionId), sectionId)
    },
    onFieldChange(fieldId, value) {
      notifyIfChanged('edit-quote-review-field', store.getState().setDraftFieldValue(fieldId, value), fieldId)
    },
    onCancelEdit(sectionId) {
      const request = store.getState().requestCancelSectionEdit(sectionId)
      if (request) notify('request-cancel-quote-review-section', sectionId)
    },
    onSaveSection(sectionId) {
      const request = store.getState().requestSaveSection(sectionId)
      if (request?.kind === 'save-section-request') {
        notify('request-save-quote-review-section', JSON.stringify(request.section.values))
      }
    },
    onConsentChange(consentId, checked) {
      notifyIfChanged(
        'toggle-quote-review-consent',
        store.getState().setConsentChecked(consentId, checked),
        `${consentId}:${checked ? 'checked' : 'unchecked'}`,
      )
    },
    onBoundQuoteRequest() {
      const request = store.getState().requestBoundQuote()
      notify('request-bound-quote', JSON.stringify(request))
    },
  }

  return (
    <LumenFormsProvider content={{ ...(parentContent ?? content), quoteReviewReference }}>
      {children}
    </LumenFormsProvider>
  )
}
