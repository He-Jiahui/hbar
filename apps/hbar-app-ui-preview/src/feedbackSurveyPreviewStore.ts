import { createStore } from 'zustand/vanilla'
import type { HbarAppUiFeedbackSurveyReferenceContent } from 'hbar-app-ui/catalog'
import { uniqueHbarAppUiFeedbackSurveyReasons, uniqueHbarAppUiFeedbackSurveyScores } from 'hbar-app-ui/catalog'

type Reason = HbarAppUiFeedbackSurveyReferenceContent['reasons'][number]
interface SurveyState {
  readonly surveyId: string | undefined
  readonly scores: readonly number[]
  readonly reasons: readonly Reason[]
  readonly selectedScore: number | undefined
  readonly selectedReasonIds: readonly string[]
  readonly comment: string
  readonly phase: 'editing' | 'sent'
  readonly reset: (content: HbarAppUiFeedbackSurveyReferenceContent | undefined) => void
  readonly selectScore: (surveyId: string, score: number) => void
  readonly toggleReason: (surveyId: string, reasonId: string) => void
  readonly changeComment: (surveyId: string, comment: string) => void
  readonly submit: (surveyId: string) => void
}

function projection(content: HbarAppUiFeedbackSurveyReferenceContent | undefined) {
  const scores = uniqueHbarAppUiFeedbackSurveyScores(content?.scores ?? [])
  const reasons = uniqueHbarAppUiFeedbackSurveyReasons(content?.reasons ?? [])
  return {
    surveyId: content?.surveyId,
    scores,
    reasons,
    selectedScore:
      content?.selectedScore !== undefined && scores.includes(content.selectedScore)
        ? content.selectedScore
        : undefined,
    selectedReasonIds: [...new Set(content?.selectedReasonIds ?? [])].filter((id) =>
      reasons.some((reason) => reason.id === id),
    ),
    comment: content?.comment ?? '',
    phase: content?.phase ?? 'editing',
  }
}

/** The preview records an acknowledgement locally; product delivery remains the embedding host's responsibility. */
export function createFeedbackSurveyPreviewStore(content: HbarAppUiFeedbackSurveyReferenceContent | undefined) {
  return createStore<SurveyState>((set) => ({
    ...projection(content),
    reset: (next) => set(projection(next)),
    selectScore: (surveyId, score) =>
      set((state) =>
        state.surveyId === surveyId && state.phase === 'editing' && state.scores.includes(score)
          ? { selectedScore: score }
          : {},
      ),
    toggleReason: (surveyId, reasonId) =>
      set((state) =>
        state.surveyId === surveyId &&
        state.phase === 'editing' &&
        state.selectedScore !== undefined &&
        state.reasons.some((reason) => reason.id === reasonId)
          ? {
              selectedReasonIds: state.selectedReasonIds.includes(reasonId)
                ? state.selectedReasonIds.filter((id) => id !== reasonId)
                : [...state.selectedReasonIds, reasonId],
            }
          : {},
      ),
    changeComment: (surveyId, comment) =>
      set((state) =>
        state.surveyId === surveyId && state.phase === 'editing' && state.selectedScore !== undefined
          ? { comment }
          : {},
      ),
    submit: (surveyId) =>
      set((state) =>
        state.surveyId === surveyId && state.phase === 'editing' && state.selectedScore !== undefined
          ? { phase: 'sent' }
          : {},
      ),
  }))
}
