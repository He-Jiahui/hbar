import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { referenceAttributes, ReferenceMetricStrip } from './production'

test('production bindings expose the skill, source reference and optional adapter', () => {
  expect(referenceAttributes('https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-9', 'model-picker')).toEqual({
    'data-reactbits-skill': '$hbar-reactbits-ui',
    'data-reactbits-reference': 'https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-9',
    'data-reactbits-adapter': 'model-picker',
  })
  expect(referenceAttributes('https://pro.reactbits.dev/docs/app-ui/card')).toEqual({
    'data-reactbits-skill': '$hbar-reactbits-ui',
    'data-reactbits-reference': 'https://pro.reactbits.dev/docs/app-ui/card',
  })
})

test('metric strips can preserve feature selectors alongside the shared card class', () => {
  const markup = renderToStaticMarkup(
    createElement(ReferenceMetricStrip, {
      reference: 'https://pro.reactbits.dev/docs/app-ui/ai-usage',
      adapter: 'usage',
      metricClassName: 'activity-metric',
      metrics: [{ id: 'input', label: 'Input', value: '10' }],
    }),
  )
  expect(markup).toContain('rb-reference-metric activity-metric')
  expect(markup).toContain('data-reactbits-reference="https://pro.reactbits.dev/docs/app-ui/ai-usage"')
  expect(markup).toContain('data-reactbits-adapter="usage"')
})
