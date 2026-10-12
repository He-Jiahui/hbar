import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useLumenFeedbackContent } from '@lumen/app-ui/catalog'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { FeedbackPreviewHost } from '../apps/hbar-app-ui-preview/src/FeedbackPreviewHost'
import { createFeedbackWidgetPreviewStore } from '../apps/hbar-app-ui-preview/src/feedbackWidgetPreviewStore'
import { createFeedbackSurveyPreviewStore } from '../apps/hbar-app-ui-preview/src/feedbackSurveyPreviewStore'
import { createFeedbackRatingPreviewStore } from '../apps/hbar-app-ui-preview/src/feedbackRatingPreviewStore'
import { createFeedbackBoardPreviewStore } from '../apps/hbar-app-ui-preview/src/feedbackBoardPreviewStore'
import { createFeedbackInboxPreviewStore } from '../apps/hbar-app-ui-preview/src/feedbackInboxPreviewStore'
import { createFeedbackInsightsPreviewStore } from '../apps/hbar-app-ui-preview/src/feedbackInsightsPreviewStore'
import {
  projectFeedbackWidget,
  projectFeedbackSurvey,
  projectFeedbackRating,
  projectFeedbackBoard,
  projectFeedbackInbox,
  projectFeedbackInsights,
} from '../apps/hbar-app-ui-preview/src/feedbackPreviewProjection'
import {
  HBAR_APP_UI_FEEDBACK_FIXTURES as input,
  createHbarAppUiFeedbackLocalizedFixtures,
} from './fixtures/hbar-app-ui-feedback-fixtures'

function ContentKeys() {
  return createElement('span', null, Object.keys(useLumenFeedbackContent() ?? {}).join(','))
}
describe('active Feedback preview owners', () => {
  test('only the active rich/legacy contract is provided; unrelated categories bypass the owner', () => {
    const keys = [
      'widget,referenceWidget',
      'survey,referenceSurvey',
      'postResolution,referenceRating',
      'featureBoard,referenceBoard',
      'inbox,referenceInbox',
      'insights,referenceInsights',
    ]
    for (let variant = 1; variant <= 6; variant++) {
      const html = renderToStaticMarkup(
        createElement(FeedbackPreviewHost, {
          spec: getHbarAppUiVariant('feedback', variant).spec,
          content: input,
          children: createElement(ContentKeys),
        }),
      )
      expect(html).toBe(`<span>${keys[variant - 1]!}</span>`)
    }
    const html = renderToStaticMarkup(
      createElement(FeedbackPreviewHost, {
        spec: getHbarAppUiVariant('editor', 1).spec,
        content: input,
        children: createElement(ContentKeys),
      }),
    )
    expect(html).toBe('<span></span>')
  })
  test('widget acknowledgement/recovery remain local, localized and bound to one owner generation', () => {
    const localized = createHbarAppUiFeedbackLocalizedFixtures()
    const reference = localized.referenceWidget!
    const old = createFeedbackWidgetPreviewStore(reference)
    const callback = projectFeedbackWidget(localized, old.getState()).referenceWidget!.onDraftChange!
    const replacement = { ...localized, referenceWidget: { ...reference, draft: 'Replacement draft' } }
    const current = createFeedbackWidgetPreviewStore(replacement.referenceWidget)
    callback(reference.widgetId, 'Old callback draft')
    expect(projectFeedbackWidget(replacement, current.getState()).referenceWidget?.draft).toBe('Replacement draft')
    current.getState().submit(reference.widgetId)
    const sent = projectFeedbackWidget(replacement, current.getState()).referenceWidget!
    expect(sent.phase).toBe('sent')
    expect(sent.labels.sentTitle).toBe(reference.labels.sentTitle)
    sent.onSendAnother?.(reference.widgetId)
    expect(projectFeedbackWidget(replacement, current.getState()).referenceWidget).toMatchObject({
      phase: 'editing',
      draft: '',
      selectedTypeId: reference.selectedTypeId,
    })
  })
  test('survey score zero is valid, selected reasons/comment survive score changes, and sent callbacks cannot alter answers', () => {
    const reference = input.referenceSurvey!
    const store = createFeedbackSurveyPreviewStore(reference)
    const callbacks = projectFeedbackSurvey(input, store.getState()).referenceSurvey!
    callbacks.onSelectScore?.(reference.surveyId, 0)
    callbacks.onToggleReason?.(reference.surveyId, reference.reasons[0]!.id)
    callbacks.onCommentChange?.(reference.surveyId, 'Core survey note')
    callbacks.onSelectScore?.(reference.surveyId, 10)
    expect(projectFeedbackSurvey(input, store.getState()).referenceSurvey).toMatchObject({
      selectedScore: 10,
      selectedReasonIds: [reference.reasons[0]!.id],
      comment: 'Core survey note',
    })
    callbacks.onSubmit?.(reference.surveyId)
    callbacks.onSelectScore?.(reference.surveyId, 2)
    expect(projectFeedbackSurvey(input, store.getState()).referenceSurvey).toMatchObject({
      phase: 'sent',
      selectedScore: 10,
    })
  })
  test('rating switches reason families without losing its comment or accepting an old-family reason', () => {
    const reference = input.referenceRating!
    const store = createFeedbackRatingPreviewStore(reference)
    const callbacks = projectFeedbackRating(input, store.getState()).referenceRating!
    callbacks.onSelectRating?.(reference.ticketId, 1)
    callbacks.onToggleReason?.(reference.ticketId, reference.lowReasons[0]!.id)
    callbacks.onCommentChange?.(reference.ticketId, 'Retained rating comment')
    callbacks.onSelectRating?.(reference.ticketId, 4)
    callbacks.onToggleReason?.(reference.ticketId, reference.lowReasons[0]!.id)
    expect(projectFeedbackRating(input, store.getState()).referenceRating).toMatchObject({
      selectedRating: 4,
      selectedReasonIds: [],
      comment: 'Retained rating comment',
    })
    callbacks.onToggleReason?.(reference.ticketId, reference.highReasons[0]!.id)
    expect(projectFeedbackRating(input, store.getState()).referenceRating?.selectedReasonIds).toEqual([
      reference.highReasons[0]!.id,
    ])
  })
  test('board vote state survives sort/search and source search-only behavior retains the original requests', () => {
    const reference = input.referenceBoard!
    const store = createFeedbackBoardPreviewStore(reference)
    const callbacks = projectFeedbackBoard(input, store.getState()).referenceBoard!
    const id = reference.requests[2]!.id
    callbacks.onVote?.(reference.boardId, id)
    callbacks.onSort?.(reference.boardId, 'new')
    callbacks.onSearch?.(reference.boardId, 'No matching request')
    expect(projectFeedbackBoard(input, store.getState()).referenceBoard?.votedIds).toContain(id)
    expect(projectFeedbackBoard(input, store.getState()).referenceBoard?.requests).toEqual(reference.requests)
    expect(projectFeedbackBoard(input, store.getState()).referenceBoard?.searchQuery).toBe('No matching request')
  })
  test('inbox projection preserves the source shared draft and replacement payload is independent even with the same inbox ID', () => {
    const reference = input.referenceInbox!
    const old = createFeedbackInboxPreviewStore(reference)
    const callbacks = projectFeedbackInbox(input, old.getState()).referenceInbox!
    callbacks.onNoteChange?.(reference.inboxId, 'Shared inbox note')
    callbacks.onSelectThread?.(reference.inboxId, 'saved-views')
    expect(projectFeedbackInbox(input, old.getState()).referenceInbox).toMatchObject({
      selectedThreadId: 'saved-views',
      noteDraft: 'Shared inbox note',
    })
    const replacement = { ...input, referenceInbox: { ...reference, noteDraft: 'Replacement note' } }
    const current = createFeedbackInboxPreviewStore(replacement.referenceInbox)
    callbacks.onNoteChange?.(reference.inboxId, 'Late old note')
    expect(projectFeedbackInbox(replacement, current.getState()).referenceInbox?.noteDraft).toBe('Replacement note')
  })
  test('insights projection retains host period data and selects only current report IDs', () => {
    const reference = input.referenceInsights!
    const store = createFeedbackInsightsPreviewStore(reference)
    const callbacks = projectFeedbackInsights(input, store.getState()).referenceInsights!
    callbacks.onPeriodChange?.(reference.reportId, '90d')
    callbacks.onPeriodChange?.('other-report', '12m')
    callbacks.onPeriodChange?.(reference.reportId, 'missing')
    const projection = projectFeedbackInsights(input, store.getState()).referenceInsights!
    expect(projection.selectedPeriodId).toBe('90d')
    expect(projection.periods).toBe(reference.periods)
    expect(projection.periods.find((period) => period.id === '90d')?.metrics[0]?.value).toBe('1,187')
    expect(
      projectFeedbackInsights({}, createFeedbackInsightsPreviewStore(undefined).getState()).referenceInsights,
    ).toBeUndefined()
  })
})
