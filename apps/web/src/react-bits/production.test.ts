import { expect, test } from 'bun:test'
import { referenceAttributes } from './production'

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
