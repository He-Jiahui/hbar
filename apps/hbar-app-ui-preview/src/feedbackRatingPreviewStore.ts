import { createStore } from 'zustand/vanilla'
import type { HbarAppUiFeedbackRatingReferenceContent } from 'hbar-app-ui/catalog'
import { uniqueHbarAppUiFeedbackRatingOptions, uniqueHbarAppUiFeedbackRatingReasons } from 'hbar-app-ui/catalog'

type Option = HbarAppUiFeedbackRatingReferenceContent['ratings'][number]
type Reason = HbarAppUiFeedbackRatingReferenceContent['lowReasons'][number]
interface RatingState {
  readonly ticketId: string | undefined
  readonly ratings: readonly Option[]
  readonly lowReasons: readonly Reason[]
  readonly highReasons: readonly Reason[]
  readonly selectedRating: number | undefined
  readonly selectedReasonIds: readonly string[]
  readonly comment: string
  readonly reset: (content: HbarAppUiFeedbackRatingReferenceContent | undefined) => void
  readonly selectRating: (ticketId: string, rating: number) => void
  readonly toggleReason: (ticketId: string, reasonId: string) => void
  readonly changeComment: (ticketId: string, comment: string) => void
}

function projection(content: HbarAppUiFeedbackRatingReferenceContent | undefined) {
  const ratings = uniqueHbarAppUiFeedbackRatingOptions(content?.ratings ?? [])
  const lowReasons = uniqueHbarAppUiFeedbackRatingReasons(content?.lowReasons ?? [])
  const highReasons = uniqueHbarAppUiFeedbackRatingReasons(content?.highReasons ?? [])
  const selectedRating = ratings.some((rating) => rating.value === content?.selectedRating)
    ? content?.selectedRating
    : undefined
  const reasons = selectedRating === undefined ? [] : selectedRating >= 4 ? highReasons : lowReasons
  return {
    ticketId: content?.ticketId,
    ratings,
    lowReasons,
    highReasons,
    selectedRating,
    selectedReasonIds: [...new Set(content?.selectedReasonIds ?? [])].filter((id) =>
      reasons.some((reason) => reason.id === id),
    ),
    comment: content?.comment ?? '',
  }
}

/** The original preview has no visible delivery or skip result. Those actions remain host callbacks. */
export function createFeedbackRatingPreviewStore(content: HbarAppUiFeedbackRatingReferenceContent | undefined) {
  return createStore<RatingState>((set) => ({
    ...projection(content),
    reset: (next) => set(projection(next)),
    selectRating: (ticketId, rating) =>
      set((state) =>
        state.ticketId === ticketId && state.ratings.some((option) => option.value === rating)
          ? { selectedRating: rating, selectedReasonIds: [] }
          : {},
      ),
    toggleReason: (ticketId, reasonId) =>
      set((state) => {
        const reasons =
          state.selectedRating !== undefined && state.selectedRating >= 4 ? state.highReasons : state.lowReasons
        return state.ticketId === ticketId &&
          state.selectedRating !== undefined &&
          reasons.some((reason) => reason.id === reasonId)
          ? {
              selectedReasonIds: state.selectedReasonIds.includes(reasonId)
                ? state.selectedReasonIds.filter((id) => id !== reasonId)
                : [...state.selectedReasonIds, reasonId],
            }
          : {}
      }),
    changeComment: (ticketId, comment) =>
      set((state) => (state.ticketId === ticketId && state.selectedRating !== undefined ? { comment } : {})),
  }))
}
