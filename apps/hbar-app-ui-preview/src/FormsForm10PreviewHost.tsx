import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenFormsProvider,
  useLumenFormsContent,
  type LumenForms10ViewModel,
  type LumenFormsContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Forms10PreviewFixture } from './forms10PreviewFixtures'
import {
  FORMS10_HIGHLIGHT_IDS,
  FORMS10_MATRIX_CRITERION_IDS,
  FORMS10_MATRIX_RATING_IDS,
  FORMS10_NPS_SCORE_VALUES,
  createForms10PreviewStore,
  type Forms10HighlightId,
  type Forms10MatrixCriterionId,
  type Forms10MatrixRatingId,
  type Forms10NpsScore,
} from './forms10PreviewStore'

function findHighlightId(value: string): Forms10HighlightId | undefined {
  return FORMS10_HIGHLIGHT_IDS.find((id) => id === value)
}

function findMatrixCriterionId(value: string): Forms10MatrixCriterionId | undefined {
  return FORMS10_MATRIX_CRITERION_IDS.find((id) => id === value)
}

function findMatrixRatingId(value: string): Forms10MatrixRatingId | undefined {
  return FORMS10_MATRIX_RATING_IDS.find((ratingId) => ratingId === value)
}

function findNpsScore(value: number): Forms10NpsScore | undefined {
  return FORMS10_NPS_SCORE_VALUES.find((score) => score === value)
}

export function FormsForm10PreviewHost({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: HbarAppUiVariantProps & {
  readonly content: LumenFormsContent
  readonly referenceFixture: Forms10PreviewFixture
  readonly children: ReactNode
}) {
  const parentContent = useLumenFormsContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createForms10PreviewStore(), [])
  const state = useStore(store)

  if (spec.category !== 'forms' || spec.variant !== 10) return children

  const preview = referenceFixture.contentFor(state)
  const notify = (actionId: string, value?: string) => {
    const handler = onActionRef.current
    if (!handler) return
    handler(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
  }
  const notifyIfChanged = (actionId: string, changed: boolean, value?: string) => {
    if (changed) notify(actionId, value)
  }

  const guestSurveyReference: LumenForms10ViewModel = {
    content: preview,
    onPropertyChange(propertyId) {
      if (propertyId !== null && !referenceFixture.propertyOptions.some((option) => option.id === propertyId)) return
      notifyIfChanged(
        'select-guest-survey-property',
        store.getState().setPropertyId(propertyId),
        propertyId ?? undefined,
      )
    },
    onReservationReferenceChange(value) {
      notifyIfChanged('edit-guest-survey-reservation-reference', store.getState().setReservationReference(value))
    },
    onNpsScoreChange(score) {
      const typedScore = findNpsScore(score)
      if (typedScore === undefined) return
      notifyIfChanged(
        'select-guest-survey-recommendation-score',
        store.getState().setNpsScore(typedScore),
        String(typedScore),
      )
    },
    onMatrixRatingChange(criterionId, ratingId) {
      const typedCriterionId = findMatrixCriterionId(criterionId)
      const typedRatingId = findMatrixRatingId(ratingId)
      if (!typedCriterionId || !typedRatingId) return
      notifyIfChanged(
        'select-guest-survey-matrix-rating',
        store.getState().setMatrixRating(typedCriterionId, typedRatingId),
        typedCriterionId + ':' + typedRatingId,
      )
    },
    onHighlightChange(highlightId, selected) {
      const typedHighlightId = findHighlightId(highlightId)
      if (!typedHighlightId) return
      notifyIfChanged(
        'toggle-guest-survey-highlight',
        store.getState().setHighlightSelected(typedHighlightId, selected),
        typedHighlightId + ':' + (selected ? 'selected' : 'cleared'),
      )
    },
    onFollowUpChange(value) {
      notifyIfChanged('edit-guest-survey-follow-up', store.getState().setConditionalFollowUpText(value))
    },
    onSubmitRequest() {
      const request = store.getState().requestSubmit()
      if (request?.kind === 'submit-survey') notify('request-guest-survey-submit')
    },
  }

  return (
    <LumenFormsProvider content={{ ...(parentContent ?? content), guestSurveyReference }}>
      {children}
    </LumenFormsProvider>
  )
}
