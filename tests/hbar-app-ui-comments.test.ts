import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiCommentsProvider,
  uniqueHbarAppUiCommentsItems,
  type HbarAppUiCommentsContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiCommentsLocalizedFixtures,
  HBAR_APP_UI_COMMENTS_FIXTURES,
} from './fixtures/hbar-app-ui-comments-fixtures'
function render(variant: number, content: HbarAppUiCommentsContent = HBAR_APP_UI_COMMENTS_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiCommentsProvider, {
      content,
      children: createElement(getHbarAppUiVariant('comments', variant).component, {}),
    }),
  )
}
describe('hbar-app-ui comment surfaces', () => {
  test('renders six Lumen workflows from host content', () => {
    const values = Array.from({ length: 6 }, (_, i) => render(i + 1))
    expect(new Set(values).size).toBe(6)
    values.forEach((value, i) => {
      expect(value).toContain(`data-lumen-variant="${i + 1}"`)
      expect(value).not.toContain('lucide')
    })
  })
  test('uses localized host copy without package fallback', () => {
    const value = render(1, createHbarAppUiCommentsLocalizedFixtures())
    expect(value).toContain('讨论线程')
    expect(value).not.toContain('Threaded discussion')
  })
  test('preserves empty and duplicate boundaries', () => {
    const content = { ...HBAR_APP_UI_COMMENTS_FIXTURES, inbox: { ...HBAR_APP_UI_COMMENTS_FIXTURES.inbox!, items: [] } }
    expect(render(5, content)).toContain('No comments')
    expect(
      uniqueHbarAppUiCommentsItems([
        { id: 'a', v: 1 },
        { id: 'a', v: 2 },
        { id: 'b', v: 3 },
      ]),
    ).toEqual([
      { id: 'a', v: 1 },
      { id: 'b', v: 3 },
    ])
  })
})
