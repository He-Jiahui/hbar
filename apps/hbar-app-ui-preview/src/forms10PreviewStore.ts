import { createStore } from 'zustand/vanilla'

export const FORMS10_MATRIX_CRITERION_IDS = [
  'room-cleanliness',
  'check-in-flow',
  'staff-helpfulness',
  'breakfast',
] as const

export const FORMS10_MATRIX_RATING_IDS = ['poor', 'fair', 'good', 'very-good', 'excellent'] as const

export const FORMS10_HIGHLIGHT_IDS = [
  'location',
  'housekeeping',
  'front-desk-team',
  'breakfast',
  'value-for-money',
  'nothing-in-particular',
] as const

export const FORMS10_NPS_SCORE_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

export const FORMS10_BASE_QUESTION_COUNT = 7
export const FORMS10_LEGACY_FOLLOW_UP_THRESHOLD = 6
export const FORMS10_LEGACY_FOLLOW_UP_COUNTER_LIMIT = 300

export type Forms10MatrixCriterionId = (typeof FORMS10_MATRIX_CRITERION_IDS)[number]
export type Forms10MatrixRatingId = (typeof FORMS10_MATRIX_RATING_IDS)[number]
export type Forms10HighlightId = (typeof FORMS10_HIGHLIGHT_IDS)[number]
export type Forms10NpsScore = (typeof FORMS10_NPS_SCORE_VALUES)[number]

export type Forms10MatrixAnswers = Readonly<Record<Forms10MatrixCriterionId, Forms10MatrixRatingId | null>>

export interface Forms10SurveyDraft {
  readonly propertyId: string | null
  readonly reservationReference: string
  readonly npsScore: Forms10NpsScore | null
  readonly matrixAnswers: Forms10MatrixAnswers
  readonly highlightIds: readonly Forms10HighlightId[]
  readonly conditionalFollowUpText: string
}

export interface Forms10Progress {
  readonly answeredQuestionCount: number
  readonly totalQuestionCount: number
  readonly remainingQuestionCount: number
  readonly followUpRequired: boolean
  readonly followUpCountedAsAnswered: boolean
  readonly followUpAtOrBelowCounterDisplay: boolean
  readonly isComplete: boolean
}

export type Forms10HostRequest = {
  readonly kind: 'submit-survey'
  readonly draft: Forms10SurveyDraft
}

export interface Forms10PreviewStoreState {
  readonly draft: Forms10SurveyDraft
  readonly setPropertyId: (propertyId: string | null) => boolean
  readonly setReservationReference: (reservationReference: string) => boolean
  readonly setNpsScore: (score: number | null) => boolean
  readonly setMatrixRating: (criterionId: string, ratingId: string | null) => boolean
  readonly setHighlightSelected: (highlightId: string, selected: boolean) => boolean
  readonly setConditionalFollowUpText: (text: string) => boolean
  readonly requestSubmit: () => Forms10HostRequest | null
}

function emptyMatrixAnswers(): Record<Forms10MatrixCriterionId, Forms10MatrixRatingId | null> {
  return {
    'room-cleanliness': null,
    'check-in-flow': null,
    'staff-helpfulness': null,
    breakfast: null,
  }
}

function cloneDraft(draft: Forms10SurveyDraft): Forms10SurveyDraft {
  return {
    propertyId: draft.propertyId,
    reservationReference: draft.reservationReference,
    npsScore: draft.npsScore,
    matrixAnswers: { ...draft.matrixAnswers },
    highlightIds: [...draft.highlightIds],
    conditionalFollowUpText: draft.conditionalFollowUpText,
  }
}

function isNpsScore(value: number): value is Forms10NpsScore {
  return Number.isInteger(value) && FORMS10_NPS_SCORE_VALUES.some((score) => score === value)
}

function isMatrixCriterionId(value: string): value is Forms10MatrixCriterionId {
  return FORMS10_MATRIX_CRITERION_IDS.some((id) => id === value)
}

function isMatrixRatingId(value: string): value is Forms10MatrixRatingId {
  return FORMS10_MATRIX_RATING_IDS.some((id) => id === value)
}

function isHighlightId(value: string): value is Forms10HighlightId {
  return FORMS10_HIGHLIGHT_IDS.some((id) => id === value)
}

export function deriveForms10Progress(draft: Forms10SurveyDraft): Forms10Progress {
  const followUpRequired = draft.npsScore !== null && draft.npsScore <= FORMS10_LEGACY_FOLLOW_UP_THRESHOLD
  const matrixAnsweredCount = FORMS10_MATRIX_CRITERION_IDS.reduce(
    (count, criterionId) => count + (draft.matrixAnswers[criterionId] === null ? 0 : 1),
    0,
  )
  const followUpAtOrBelowCounterDisplay = draft.conditionalFollowUpText.length <= FORMS10_LEGACY_FOLLOW_UP_COUNTER_LIMIT
  const followUpCountedAsAnswered =
    followUpRequired && followUpAtOrBelowCounterDisplay && draft.conditionalFollowUpText.trim().length > 0
  const answeredQuestionCount =
    (draft.propertyId ? 1 : 0) +
    (draft.npsScore === null ? 0 : 1) +
    matrixAnsweredCount +
    (draft.highlightIds.length > 0 ? 1 : 0) +
    (followUpCountedAsAnswered ? 1 : 0)
  const totalQuestionCount = FORMS10_BASE_QUESTION_COUNT + (followUpRequired ? 1 : 0)

  return {
    answeredQuestionCount,
    totalQuestionCount,
    remainingQuestionCount: Math.max(0, totalQuestionCount - answeredQuestionCount),
    followUpRequired,
    followUpCountedAsAnswered,
    followUpAtOrBelowCounterDisplay,
    isComplete: answeredQuestionCount === totalQuestionCount,
  }
}

export function createForms10PreviewStore() {
  const initialDraft: Forms10SurveyDraft = {
    propertyId: null,
    reservationReference: '',
    npsScore: null,
    matrixAnswers: emptyMatrixAnswers(),
    highlightIds: [],
    conditionalFollowUpText: '',
  }

  return createStore<Forms10PreviewStoreState>((set, get) => ({
    draft: initialDraft,
    setPropertyId: (propertyId) => {
      if (propertyId !== null && (!propertyId.trim() || propertyId !== propertyId.trim())) {
        return false
      }
      const state = get()
      if (state.draft.propertyId === propertyId) return false
      set({ draft: { ...state.draft, propertyId } })
      return true
    },
    setReservationReference: (reservationReference) => {
      const state = get()
      if (state.draft.reservationReference === reservationReference) return false
      set({ draft: { ...state.draft, reservationReference } })
      return true
    },
    setNpsScore: (score) => {
      if (score !== null && !isNpsScore(score)) return false
      const state = get()
      if (state.draft.npsScore === score) return false
      set({
        draft: {
          ...state.draft,
          npsScore: score,
        },
      })
      return true
    },
    setMatrixRating: (criterionId, ratingId) => {
      if (!isMatrixCriterionId(criterionId)) return false
      if (ratingId !== null && !isMatrixRatingId(ratingId)) return false
      const state = get()
      if (state.draft.matrixAnswers[criterionId] === ratingId) return false
      set({
        draft: {
          ...state.draft,
          matrixAnswers: {
            ...state.draft.matrixAnswers,
            [criterionId]: ratingId,
          },
        },
      })
      return true
    },
    setHighlightSelected: (highlightId, selected) => {
      if (!isHighlightId(highlightId)) return false
      const state = get()
      const isSelected = state.draft.highlightIds.includes(highlightId)
      if (isSelected === selected) return false
      const highlightIds = selected
        ? [...state.draft.highlightIds, highlightId]
        : state.draft.highlightIds.filter((id) => id !== highlightId)
      set({
        draft: {
          ...state.draft,
          highlightIds,
        },
      })
      return true
    },
    setConditionalFollowUpText: (text) => {
      const state = get()
      if (state.draft.conditionalFollowUpText === text) return false
      set({
        draft: {
          ...state.draft,
          conditionalFollowUpText: text,
        },
      })
      return true
    },
    requestSubmit: () => {
      const state = get()
      if (!deriveForms10Progress(state.draft).isComplete) return null
      return { kind: 'submit-survey', draft: cloneDraft(state.draft) }
    },
  }))
}
