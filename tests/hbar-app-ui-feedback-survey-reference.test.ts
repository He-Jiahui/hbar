import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiFeedbackProvider,
  uniqueHbarAppUiFeedbackSurveyReasons,
  uniqueHbarAppUiFeedbackSurveyScores,
  type HbarAppUiFeedbackSurveyReferenceContent,
} from '../packages/hbar-app-ui/src/index'
import { createFeedbackSurveyPreviewStore } from '../apps/hbar-app-ui-preview/src/feedbackSurveyPreviewStore'
import {
  createHbarAppUiFeedbackLocalizedFixtures,
  createHbarAppUiFeedbackOverflowFixtures,
  HBAR_APP_UI_FEEDBACK_FIXTURES,
} from './fixtures/hbar-app-ui-feedback-fixtures'

const survey = HBAR_APP_UI_FEEDBACK_FIXTURES.referenceSurvey
if (!survey) throw new Error('Expected hosted survey fixture')

function render(content: HbarAppUiFeedbackSurveyReferenceContent): string {
  const component = getHbarAppUiVariant('feedback', 2).component
  return renderToStaticMarkup(
    createElement(HbarAppUiFeedbackProvider, {
      content: { ...HBAR_APP_UI_FEEDBACK_FIXTURES, referenceSurvey: content },
      children: createElement(component, {}),
    }),
  )
}

describe('reference feedback survey contract', () => {
  test('unselected detail remains visible but inert; selected scores expose three hosted follow-ups', () => {
    const initial = render(survey)
    expect(initial).toContain('role="radiogroup"')
    expect(initial).toContain('Pick a score to continue')
    expect(initial).toContain('inert=""')
    expect(initial.match(/role="radio"/g)).toHaveLength(11)
    expect(render({ ...survey, selectedScore: 3 })).toContain('What let you down most?')
    expect(render({ ...survey, selectedScore: 8 })).toContain('What would move you to a nine or ten?')
    expect(render({ ...survey, selectedScore: 10 })).toContain('What made it worth recommending?')
    expect(render({ ...survey, selectedScore: 8 })).not.toContain('inert=""')
  })

  test('uses host-owned locale, reason identities and bounded score model', () => {
    const localized = createHbarAppUiFeedbackLocalizedFixtures().referenceSurvey
    if (!localized) throw new Error('Expected localized survey')
    expect(render(localized)).toContain('Wie wahrscheinlich empfehlen Sie Northwind')
    expect(render(localized)).not.toContain('Quarterly survey')
    expect(uniqueHbarAppUiFeedbackSurveyScores([0, 0, 10, 11, -1, 4.5])).toEqual([0, 10])
    const [first] = survey.reasons
    if (!first) throw new Error('Expected first reason')
    expect(uniqueHbarAppUiFeedbackSurveyReasons([first, first])).toEqual([first])
    const empty = render({ ...survey, scores: [], selectedScore: 8 })
    expect(empty).toContain('No survey scores available')
    expect(empty).toContain('inert=""')
    expect(render({ ...survey, scores: [8], selectedScore: 8 }).match(/role="radio"/g)).toHaveLength(1)
    const overflow = createHbarAppUiFeedbackOverflowFixtures().referenceSurvey
    if (!overflow) throw new Error('Expected overflow survey')
    expect(render(overflow).match(/aria-pressed="false"/g)).toHaveLength(18)
    expect(render(overflow)).toContain('data-hbar-app-ui-list-strategy="content-grown"')
    const longLocale = render({...localized, selectedScore: 8,
      reasons: [{id: 'long', label: 'Eine besonders ausführliche Beschreibung für ein zusätzliches Feedbackmotiv'}],
    })
    expect(longLocale).toContain('Eine besonders ausführliche Beschreibung')
  })

  test('renders score-specific acknowledgement without inventing a reset action', () => {
    const markup = render({ ...survey, selectedScore: 8, phase: 'sent' })
    expect(markup).toContain('Recorded, thank you')
    expect(markup).toContain('Your score of 8 goes to the product team')
    expect(markup).not.toContain('role="radiogroup"')
    expect(markup).not.toContain('Ask me later')
  })

  test('host state validates score/reason IDs, draft, stale callback and terminal phase', () => {
    const store = createFeedbackSurveyPreviewStore(survey)
    const state = () => store.getState()
    state().toggleReason(survey.surveyId, survey.reasons[0]?.id ?? '')
    expect(state().selectedReasonIds).toEqual([])
    state().selectScore('stale-survey', 8)
    state().selectScore(survey.surveyId, 11)
    expect(state().selectedScore).toBeUndefined()
    state().selectScore(survey.surveyId, 8)
    const first = survey.reasons[0]
    if (!first) throw new Error('Expected first reason')
    state().toggleReason(survey.surveyId, first.id)
    state().toggleReason(survey.surveyId, 'stale-reason')
    state().changeComment(survey.surveyId, 'A useful product note.')
    expect(state()).toMatchObject({
      selectedScore: 8,
      selectedReasonIds: [first.id],
      comment: 'A useful product note.',
    })
    state().submit('stale-survey')
    expect(state().phase).toBe('editing')
    state().submit(survey.surveyId)
    expect(state().phase).toBe('sent')
    state().selectScore(survey.surveyId, 10)
    expect(state().selectedScore).toBe(8)
    state().reset({
      ...survey,
      scores: [3],
      selectedScore: 8,
      reasons: [first, first],
      selectedReasonIds: [first.id, 'stale-reason'],
    })
    expect(state()).toMatchObject({ selectedScore: undefined, selectedReasonIds: [first.id], reasons: [first] })
  })
})
