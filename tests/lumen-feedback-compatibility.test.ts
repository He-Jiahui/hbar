import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  LumenFeedback01,
  LumenFeedbackProvider,
  selectLumenFeedbackItem,
  uniqueLumenFeedbackItems,
} from '@lumen/app-ui'
import {
  HbarAppUiFeedbackProvider,
  selectHbarAppUiFeedbackItem,
  uniqueHbarAppUiFeedbackItems,
} from '../packages/hbar-app-ui/src/index'
import { HBAR_APP_UI_FEEDBACK_FIXTURES } from './fixtures/hbar-app-ui-feedback-fixtures'

test('feedback compatibility exports are canonical Lumen contracts', () => {
  expect(HbarAppUiFeedbackProvider).toBe(LumenFeedbackProvider)
  expect(selectHbarAppUiFeedbackItem).toBe(selectLumenFeedbackItem)
  expect(uniqueHbarAppUiFeedbackItems).toBe(uniqueLumenFeedbackItems)
})

test('the canonical Lumen entry renders host-owned feedback content', () => {
  const markup = renderToStaticMarkup(
    createElement(LumenFeedbackProvider, {
      content: HBAR_APP_UI_FEEDBACK_FIXTURES,
      children: createElement(LumenFeedback01),
    }),
  )

  expect(markup).toContain('data-lumen-component="feedback"')
  expect(markup).toContain('hbar-app-ui-feedback-modal')
  expect(markup).toContain('What would you like the product to do?')
  expect(markup).toContain('data-lumen-variant="outlined"')
})

test('the legacy feedback implementation and visual stylesheet are retired', async () => {
  const retired = [
    'FeatureRequestBoard.tsx',
    'FeedbackContent.tsx',
    'FeedbackInbox.tsx',
    'FeedbackInsights.tsx',
    'FeedbackPrimitives.tsx',
    'FeedbackSurface.css',
    'FeedbackWidget.tsx',
    'PostResolutionFeedback.tsx',
    'SurveyFeedback.tsx',
  ]

  for (const file of retired) {
    expect(await Bun.file(`packages/hbar-app-ui/src/components/feedback/${file}`).exists()).toBe(false)
  }
})
