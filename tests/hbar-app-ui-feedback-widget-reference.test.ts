import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiFeedbackProvider,
  uniqueHbarAppUiFeedbackReferenceTypes,
  type HbarAppUiFeedbackWidgetReferenceContent,
} from '../packages/hbar-app-ui/src/index'
import { createFeedbackWidgetPreviewStore } from '../apps/hbar-app-ui-preview/src/feedbackWidgetPreviewStore'
import {
  createHbarAppUiFeedbackLocalizedFixtures,
  HBAR_APP_UI_FEEDBACK_FIXTURES,
} from './fixtures/hbar-app-ui-feedback-fixtures'

const widget = HBAR_APP_UI_FEEDBACK_FIXTURES.referenceWidget
if (!widget) throw new Error('Expected hosted reference widget fixture')

function render(content: HbarAppUiFeedbackWidgetReferenceContent): string {
  const component = getHbarAppUiVariant('feedback', 1).component
  return renderToStaticMarkup(
    createElement(HbarAppUiFeedbackProvider, {
      content: { ...HBAR_APP_UI_FEEDBACK_FIXTURES, referenceWidget: content },
      children: createElement(component, {}),
    }),
  )
}

describe('reference feedback widget contract', () => {
  test('keeps labels, types and contextual placeholder hosted and semantic', () => {
    const markup = render(widget)
    expect(markup).toContain('role="radiogroup"')
    expect(markup).toContain('aria-checked="true"')
    expect(markup).toContain('placeholder="What would you like the product to do?"')
    expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(render({ ...widget, selectedTypeId: 'issue' })).toContain(
      'placeholder="What went wrong, and what did you expect instead?"',
    )
    expect(render({ ...widget, selectedTypeId: 'praise' })).toContain(
      'placeholder="What worked well? We pass these on to the team."',
    )
    const localized = createHbarAppUiFeedbackLocalizedFixtures().referenceWidget
    if (!localized) throw new Error('Expected localized widget')
    expect(render(localized)).toContain('Feedback senden')
    expect(render(localized)).toContain('Beschreiben Sie Ihr Anliegen für das zuständige Team.')
    expect(render(localized)).not.toContain('Send feedback')
  })

  test('handles empty, single, duplicate and stale type identities without fallback copy', () => {
    const [idea, issue] = widget.types
    if (!idea || !issue) throw new Error('Expected two types')
    expect(uniqueHbarAppUiFeedbackReferenceTypes([idea, idea, issue])).toEqual([idea, issue])
    const empty = render({ ...widget, types: [], selectedTypeId: undefined })
    expect(empty).toContain('No feedback types')
    expect(empty).toContain('placeholder="Write your feedback"')
    expect(empty).toContain('disabled=""')
    const one = render({ ...widget, types: [issue], selectedTypeId: 'idea' })
    expect(one).toContain('placeholder="What went wrong, and what did you expect instead?"')
    expect(one.match(/role="radio"/g)).toHaveLength(1)
    const many = render({
      ...widget,
      types: Array.from({ length: 12 }, (_, index) => ({
        ...idea,
        id: index % 2 ? ('issue' as const) : ('idea' as const),
        label: `Type ${index}`,
      })),
    })
    expect(many.match(/role="radio"/g)).toHaveLength(2)
  })

  test('bounds drafts, counts remaining characters, and renders sent flow', () => {
    const full = render({ ...widget, draft: 'x'.repeat(400) })
    expect(full).toContain('>0</span>')
    expect(full).not.toContain('disabled=""')
    const overBound = render({ ...widget, draft: 'x'.repeat(401) })
    expect(overBound).toContain('>0</span>')
    const sent = render({ ...widget, phase: 'sent' })
    expect(sent).toContain('Thanks, that is on its way')
    expect(sent).toContain('Send another')
    expect(sent).not.toContain('role="radiogroup"')
  })

  test('host state has ID-guarded transitions and preserves context when sending another', () => {
    const store = createFeedbackWidgetPreviewStore(widget)
    const state = () => store.getState()
    state().selectType('old-widget', 'issue')
    expect(state().selectedTypeId).toBe('idea')
    state().selectType(widget.widgetId, 'issue')
    state().changeDraft(widget.widgetId, 'x'.repeat(401))
    expect(state().draft).toHaveLength(400)
    state().toggleScreenshot(widget.widgetId)
    state().submit(widget.widgetId)
    expect(state().phase).toBe('sent')
    state().changeDraft(widget.widgetId, 'ignored')
    expect(state().draft).toHaveLength(400)
    state().sendAnother('old-widget')
    expect(state().phase).toBe('sent')
    state().sendAnother(widget.widgetId)
    expect(state()).toMatchObject({ phase: 'editing', draft: '', selectedTypeId: 'issue', screenshotAttached: false })
    state().submit(widget.widgetId)
    expect(state().phase).toBe('editing')
    state().reset({ ...widget, types: [], draft: 'x'.repeat(401) })
    expect(state()).toMatchObject({ types: [], selectedTypeId: undefined, draft: 'x'.repeat(400) })
  })
})
