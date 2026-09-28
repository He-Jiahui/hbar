import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiFeedbackProvider, type HbarAppUiFeedbackContent } from 'hbar-app-ui/catalog'
import { createFeedbackWidgetPreviewStore } from './feedbackWidgetPreviewStore'
import { createFeedbackSurveyPreviewStore } from './feedbackSurveyPreviewStore'
import { createFeedbackRatingPreviewStore } from './feedbackRatingPreviewStore'
import { createFeedbackBoardPreviewStore } from './feedbackBoardPreviewStore'
import { createFeedbackInboxPreviewStore } from './feedbackInboxPreviewStore'

export function FeedbackPreviewHost({
  content,
  children,
}: {
  readonly content: HbarAppUiFeedbackContent
  readonly children: ReactNode
}) {
  const [store] = useState(() => createFeedbackWidgetPreviewStore(content.referenceWidget))
  const state = useStore(store)
  const [surveyStore] = useState(() => createFeedbackSurveyPreviewStore(content.referenceSurvey))
  const surveyState = useStore(surveyStore)
  const [ratingStore] = useState(() => createFeedbackRatingPreviewStore(content.referenceRating))
  const ratingState = useStore(ratingStore)
  const [boardStore] = useState(() => createFeedbackBoardPreviewStore(content.referenceBoard))
  const boardState = useStore(boardStore)
  const [inboxStore] = useState(() => createFeedbackInboxPreviewStore(content.referenceInbox))
  const inboxState = useStore(inboxStore)
  useEffect(() => store.getState().reset(content.referenceWidget), [store, content.referenceWidget])
  useEffect(() => surveyStore.getState().reset(content.referenceSurvey), [surveyStore, content.referenceSurvey])
  useEffect(() => ratingStore.getState().reset(content.referenceRating), [ratingStore, content.referenceRating])
  useEffect(() => boardStore.getState().reset(content.referenceBoard), [boardStore, content.referenceBoard])
  useEffect(() => inboxStore.getState().reset(content.referenceInbox), [inboxStore, content.referenceInbox])
  return (
    <HbarAppUiFeedbackProvider
      content={{
        ...content,
        referenceWidget: content.referenceWidget && {
          ...content.referenceWidget,
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
        },
        referenceSurvey: content.referenceSurvey && {
          ...content.referenceSurvey,
          scores: surveyState.scores,
          reasons: surveyState.reasons,
          selectedScore: surveyState.selectedScore,
          selectedReasonIds: surveyState.selectedReasonIds,
          comment: surveyState.comment,
          phase: surveyState.phase,
          onSelectScore: surveyState.selectScore,
          onToggleReason: surveyState.toggleReason,
          onCommentChange: surveyState.changeComment,
          onSubmit: surveyState.submit,
        },
        referenceRating: content.referenceRating && {
          ...content.referenceRating,
          ratings: ratingState.ratings,
          lowReasons: ratingState.lowReasons,
          highReasons: ratingState.highReasons,
          selectedRating: ratingState.selectedRating,
          selectedReasonIds: ratingState.selectedReasonIds,
          comment: ratingState.comment,
          onSelectRating: ratingState.selectRating,
          onToggleReason: ratingState.toggleReason,
          onCommentChange: ratingState.changeComment,
        },
        referenceBoard: content.referenceBoard && {
          ...content.referenceBoard,
          sorts: boardState.sorts,
          requests: boardState.requests,
          selectedSortId: boardState.selectedSortId,
          searchQuery: boardState.searchQuery,
          votedIds: boardState.votedIds,
          onSort: boardState.sort,
          onSearch: boardState.search,
          onVote: boardState.vote,
        },
        referenceInbox: content.referenceInbox && {
          ...content.referenceInbox,
          threads: inboxState.threads,
          details: inboxState.details,
          selectedThreadId: inboxState.selectedThreadId,
          noteDraft: inboxState.noteDraft,
          onSelectThread: inboxState.selectThread,
          onNoteChange: inboxState.changeNote,
        },
      }}
    >
      {children}
    </HbarAppUiFeedbackProvider>
  )
}
