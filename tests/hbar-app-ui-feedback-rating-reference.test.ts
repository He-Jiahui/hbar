import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiFeedbackProvider,
  uniqueHbarAppUiFeedbackRatingOptions,
  uniqueHbarAppUiFeedbackRatingReasons,
  type HbarAppUiFeedbackRatingReferenceContent,
} from '../packages/hbar-app-ui/src/index'
import { createFeedbackRatingPreviewStore } from '../apps/hbar-app-ui-preview/src/feedbackRatingPreviewStore'
import {
  createHbarAppUiFeedbackLocalizedFixtures,
  createHbarAppUiFeedbackOverflowFixtures,
  HBAR_APP_UI_FEEDBACK_FIXTURES,
} from './fixtures/hbar-app-ui-feedback-fixtures'

const rating = HBAR_APP_UI_FEEDBACK_FIXTURES.referenceRating
if (!rating) throw new Error('Expected hosted rating fixture')

function render(content: HbarAppUiFeedbackRatingReferenceContent): string {
  const component = getHbarAppUiVariant('feedback', 3).component
  return renderToStaticMarkup(
    createElement(HbarAppUiFeedbackProvider, {
      content: { ...HBAR_APP_UI_FEEDBACK_FIXTURES, referenceRating: content },
      children: createElement(component, {}),
    }),
  )
}

describe('reference post-resolution rating contract', () => {
  test('keeps ticket, star semantics and conditional reason family in host content', () => {
    const initial = render(rating)
    expect(initial).toContain('Sofia Alvarez closed your ticket')
    expect(initial).toContain('role="radiogroup"')
    expect(initial.match(/role="radio"/g)).toHaveLength(5)
    expect(initial).toContain('inert=""')
    expect(initial).toContain('Tap a star to rate')
    expect(render({ ...rating, selectedRating: 1 })).toContain('What should have gone better?')
    expect(render({ ...rating, selectedRating: 3 })).toContain('Took too long')
    expect(render({ ...rating, selectedRating: 4 })).toContain('What went well?')
    expect(render({ ...rating, selectedRating: 4 })).toContain('Fast reply')
    expect(render({ ...rating, selectedRating: 4 })).not.toContain('Took too long')
  })

  test('handles empty, single, duplicate, invalid and overflow records with localized copy', () => {
    const [first] = rating.ratings
    const [reason] = rating.lowReasons
    if (!first || !reason) throw new Error('Expected initial rating and reason')
    expect(uniqueHbarAppUiFeedbackRatingOptions([first, first, { ...first, value: 6 }])).toEqual([first])
    expect(uniqueHbarAppUiFeedbackRatingReasons([reason, reason])).toEqual([reason])
    expect(render({ ...rating, ratings: [], selectedRating: 4 })).toContain('No ratings available')
    expect(render({ ...rating, ratings: [first] }).match(/role="radio"/g)).toHaveLength(1)
    const localized = createHbarAppUiFeedbackLocalizedFixtures().referenceRating
    if (!localized) throw new Error('Expected localized rating')
    expect(render(localized)).toContain('Wie beurteilen Sie die erhaltene Unterstützung?')
    expect(render(localized)).not.toContain('How was the support you received?')
    const overflow = createHbarAppUiFeedbackOverflowFixtures().referenceRating
    if (!overflow) throw new Error('Expected overflow rating')
    expect(render({ ...overflow, selectedRating: 4 }).match(/aria-pressed="false"/g)).toHaveLength(16)
    expect(
      render({
        ...localized,
        selectedRating: 4,
        highReasons: [
          { id: 'long', label: 'Eine ausgesprochen ausführliche Beschreibung des besonders hilfreichen Supports' },
        ],
      }),
    ).toContain('Eine ausgesprochen ausführliche Beschreibung')
  })

  test('host state validates stale IDs and clears reason selection on rating changes', () => {
    const store = createFeedbackRatingPreviewStore(rating)
    const state = () => store.getState()
    state().toggleReason(rating.ticketId, rating.lowReasons[0]?.id ?? '')
    expect(state().selectedReasonIds).toEqual([])
    state().selectRating('stale-ticket', 1)
    state().selectRating(rating.ticketId, 6)
    expect(state().selectedRating).toBeUndefined()
    state().selectRating(rating.ticketId, 1)
    const first = rating.lowReasons[0]
    const positive = rating.highReasons[0]
    if (!first || !positive) throw new Error('Expected both reason families')
    state().toggleReason(rating.ticketId, first.id)
    state().changeComment(rating.ticketId, 'Needs follow-up')
    expect(state()).toMatchObject({ selectedRating: 1, selectedReasonIds: [first.id], comment: 'Needs follow-up' })
    state().selectRating(rating.ticketId, 4)
    expect(state().selectedReasonIds).toEqual([])
    state().toggleReason(rating.ticketId, first.id)
    expect(state().selectedReasonIds).toEqual([])
    state().toggleReason(rating.ticketId, positive.id)
    expect(state().selectedReasonIds).toEqual([positive.id])
    state().selectRating(rating.ticketId, 1)
    expect(state().selectedReasonIds).toEqual([])
    state().reset({
      ...rating,
      ratings: [rating.ratings[3]!],
      selectedRating: 1,
      highReasons: [positive, positive],
      selectedReasonIds: [first.id],
    })
    expect(state()).toMatchObject({ selectedRating: undefined, selectedReasonIds: [], highReasons: [positive] })
  })
})
