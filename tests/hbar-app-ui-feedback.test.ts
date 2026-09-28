import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiFeedbackProvider,
  selectHbarAppUiFeedbackItem,
  uniqueHbarAppUiFeedbackItems,
  type HbarAppUiFeedbackContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiFeedbackLocalizedFixtures,
  HBAR_APP_UI_FEEDBACK_FIXTURES,
} from './fixtures/hbar-app-ui-feedback-fixtures'

function renderFeedback(variant: number, content: HbarAppUiFeedbackContent = HBAR_APP_UI_FEEDBACK_FIXTURES): string {
  const component = getHbarAppUiVariant('feedback', variant).component
  return renderToStaticMarkup(
    createElement(HbarAppUiFeedbackProvider, { content, children: createElement(component, {}) }),
  )
}

describe('hbar-app-ui feedback surfaces', () => {
  test('renders six independent feedback workflows from host-owned content', () => {
    const markup = Array.from({ length: 6 }, (_, index) => renderFeedback(index + 1))
    expect(new Set(markup).size).toBe(6)
    expect(markup[0]).toContain('lumen-feedback-widget-reference')
    expect(markup[1]).toContain('lumen-feedback-survey-reference')
    expect(markup[2]).toContain('hbar-app-ui-feedback-rating-fieldset')
    expect(markup[3]).toContain('hbar-app-ui-feedback-request-list')
    expect(markup[4]).toContain('hbar-app-ui-feedback-thread-detail')
    expect(markup[5]).toContain('hbar-app-ui-feedback-volume-chart')
    for (const value of markup) {
      expect(value.toLocaleLowerCase()).not.toContain('react-bits')
      expect(value.toLocaleLowerCase()).not.toContain('reactbits')
    }
  })

  test('keeps continuous text and host-supplied labels in semantic flow', () => {
    const widget = renderFeedback(1)
    const resolution = renderFeedback(3)
    const inbox = renderFeedback(5)
    expect(widget).toContain('Goes to the team that owns this screen.')
    expect(widget).toContain('What would you like the product to do?')
    expect(resolution).toContain('Sofia Alvarez closed your ticket')
    expect(inbox).toContain('Halcyon Pay')
    expect(inbox).toContain('Add an internal note for the team')
    expect(inbox.indexOf('Export silently drops the last column')).toBeLessThan(
      inbox.indexOf('Running the Monday revenue export'),
    )
  })

  test('renders a long non-default locale without package fallback labels', () => {
    const localized = createHbarAppUiFeedbackLocalizedFixtures()
    expect(renderFeedback(1, localized)).toContain('Feedback senden')
    expect(renderFeedback(2, localized)).toContain('Vierteljährliche Umfrage')
    expect(renderFeedback(4, localized)).toContain('Funktionswünsche')
    expect(renderFeedback(5, localized)).toContain('Feedback-Posteingang')
    expect(renderFeedback(6, localized)).toContain('Feedback-Analysen')
    expect(renderFeedback(1, localized)).not.toContain('Send feedback')
  })

  test('handles empty, boundary, over-bound, duplicate, and stale records', () => {
    const base = HBAR_APP_UI_FEEDBACK_FIXTURES
    const featureBoard = base.featureBoard
    const inbox = base.inbox
    if (!featureBoard || !inbox) throw new Error('Expected feature-board and inbox fixtures')
    expect(renderFeedback(4, { ...base, featureBoard: { ...featureBoard, requests: [] } })).toContain(
      'No feature requests match this search.',
    )
    expect(renderFeedback(5, { ...base, inbox: { ...inbox, threads: [], details: [] } })).toContain(
      'No feedback threads are available.',
    )
    const boundary = Array.from({ length: featureBoard.listStrategy.expectedMaximum }, (_, index) => ({
      id: `boundary-${index}`,
      title: `Boundary request ${index}`,
      status: 'planned' as const,
      statusLabel: 'Planned',
      description: 'Boundary description',
      category: 'Testing',
      commentCount: 0,
      voteCount: 0,
    }))
    const overBoundary = [
      ...boundary,
      {
        id: 'over-bound',
        title: 'Over-bound request',
        status: 'planned' as const,
        statusLabel: 'Planned',
        description: 'Over-bound description',
        category: 'Testing',
        commentCount: 0,
        voteCount: 0,
      },
    ]
    expect(
      renderFeedback(4, { ...base, featureBoard: { ...featureBoard, requests: boundary } }).match(
        /<h3>Boundary request/g,
      ),
    ).toHaveLength(featureBoard.listStrategy.expectedMaximum)
    expect(
      renderFeedback(4, { ...base, featureBoard: { ...featureBoard, requests: overBoundary } }).match(
        /<h3>(?:Boundary request|Over-bound request)/g,
      ),
    ).toHaveLength(featureBoard.listStrategy.expectedMaximum + 1)
    const duplicate = uniqueHbarAppUiFeedbackItems([
      { id: 'kept', value: 'first' },
      { id: 'kept', value: 'duplicate' },
      { id: 'other', value: 'second' },
    ])
    expect(duplicate).toEqual([
      { id: 'kept', value: 'first' },
      { id: 'other', value: 'second' },
    ])
    expect(selectHbarAppUiFeedbackItem(duplicate, 'stale')).toEqual({ id: 'kept', value: 'first' })
    expect(selectHbarAppUiFeedbackItem([], 'stale')).toBeUndefined()
  })
})
