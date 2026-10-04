import type { HbarAppUiFeedbackContent } from 'hbar-app-ui/catalog'
import type { createFeedbackWidgetPreviewStore } from './feedbackWidgetPreviewStore'
import type { createFeedbackSurveyPreviewStore } from './feedbackSurveyPreviewStore'
import type { createFeedbackRatingPreviewStore } from './feedbackRatingPreviewStore'
import type { createFeedbackBoardPreviewStore } from './feedbackBoardPreviewStore'
import type { createFeedbackInboxPreviewStore } from './feedbackInboxPreviewStore'
import type { createFeedbackInsightsPreviewStore } from './feedbackInsightsPreviewStore'

export function projectFeedbackWidget(
  input: HbarAppUiFeedbackContent,
  state: ReturnType<ReturnType<typeof createFeedbackWidgetPreviewStore>['getState']>,
): HbarAppUiFeedbackContent {
  const content = input.referenceWidget
  return {
    widget: input.widget,
    referenceWidget: content
      ? {
          ...content,
          types: state.types,
          selectedTypeId: state.selectedTypeId,
          draft: state.draft,
          screenshotAttached: state.screenshotAttached,
          phase: state.phase,
          onSelectType: state.selectType,
          onDraftChange: state.changeDraft,
          onToggleScreenshot: state.toggleScreenshot,
          onSubmit: state.submit,
          onSendAnother: state.sendAnother,
        }
      : undefined,
  }
}
export function projectFeedbackSurvey(
  input: HbarAppUiFeedbackContent,
  state: ReturnType<ReturnType<typeof createFeedbackSurveyPreviewStore>['getState']>,
): HbarAppUiFeedbackContent {
  const content = input.referenceSurvey
  return {
    survey: input.survey,
    referenceSurvey: content
      ? {
          ...content,
          scores: state.scores,
          reasons: state.reasons,
          selectedScore: state.selectedScore,
          selectedReasonIds: state.selectedReasonIds,
          comment: state.comment,
          phase: state.phase,
          onSelectScore: state.selectScore,
          onToggleReason: state.toggleReason,
          onCommentChange: state.changeComment,
          onSubmit: state.submit,
        }
      : undefined,
  }
}
export function projectFeedbackRating(
  input: HbarAppUiFeedbackContent,
  state: ReturnType<ReturnType<typeof createFeedbackRatingPreviewStore>['getState']>,
): HbarAppUiFeedbackContent {
  const content = input.referenceRating
  return {
    postResolution: input.postResolution,
    referenceRating: content
      ? {
          ...content,
          ratings: state.ratings,
          lowReasons: state.lowReasons,
          highReasons: state.highReasons,
          selectedRating: state.selectedRating,
          selectedReasonIds: state.selectedReasonIds,
          comment: state.comment,
          onSelectRating: state.selectRating,
          onToggleReason: state.toggleReason,
          onCommentChange: state.changeComment,
        }
      : undefined,
  }
}
export function projectFeedbackBoard(
  input: HbarAppUiFeedbackContent,
  state: ReturnType<ReturnType<typeof createFeedbackBoardPreviewStore>['getState']>,
): HbarAppUiFeedbackContent {
  const content = input.referenceBoard
  return {
    featureBoard: input.featureBoard,
    referenceBoard: content
      ? {
          ...content,
          sorts: state.sorts,
          requests: state.requests,
          selectedSortId: state.selectedSortId,
          searchQuery: state.searchQuery,
          votedIds: state.votedIds,
          onSort: state.sort,
          onSearch: state.search,
          onVote: state.vote,
        }
      : undefined,
  }
}
export function projectFeedbackInbox(
  input: HbarAppUiFeedbackContent,
  state: ReturnType<ReturnType<typeof createFeedbackInboxPreviewStore>['getState']>,
): HbarAppUiFeedbackContent {
  const content = input.referenceInbox
  return {
    inbox: input.inbox,
    referenceInbox: content
      ? {
          ...content,
          threads: state.threads,
          details: state.details,
          selectedThreadId: state.selectedThreadId,
          noteDraft: state.noteDraft,
          onSelectThread: state.selectThread,
          onNoteChange: state.changeNote,
        }
      : undefined,
  }
}
export function projectFeedbackInsights(
  input: HbarAppUiFeedbackContent,
  state: ReturnType<ReturnType<typeof createFeedbackInsightsPreviewStore>['getState']>,
): HbarAppUiFeedbackContent {
  const content = input.referenceInsights
  return {
    insights: input.insights,
    referenceInsights: content
      ? { ...content, selectedPeriodId: state.selectedPeriodId, onPeriodChange: state.selectPeriod }
      : undefined,
  }
}
