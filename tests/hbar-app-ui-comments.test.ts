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
  createHbarAppUiCommentsOverflowFixtures,
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
  test('discussion preserves source thread hierarchy, parent-only actions and guarded composer', () => {
    const value = render(1)
    expect(value).toContain('Migration plan feedback')
    expect(value).toContain('5 comments · 4 participants')
    expect(value.match(/<article /g)?.length).toBe(3)
    expect(value).toContain('Marcus Bell')
    expect(value).toContain('Sofia Alvarez')
    expect(value).toContain('aria-pressed="true"')
    expect(value).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(value).toContain('disabled=""')
    expect(value).not.toContain('>Resolve<')
  })
  test('Host owns sorting, draft and reactions instead of package-local app state', () => {
    const discussion = HBAR_APP_UI_COMMENTS_FIXTURES.referenceDiscussion!
    const value = render(1, {...HBAR_APP_UI_COMMENTS_FIXTURES, referenceDiscussion: {
      ...discussion, sortId: 'new', draft: 'Review ready',
      messages: discussion.messages.map((message) => message.id === 'priya' ? {...message, reacted: false, reactionCount: 4} : message),
    }})
    expect(value.indexOf('Tomás Guerrero')).toBeLessThan(value.indexOf('Priya Nandakumar'))
    expect(value.indexOf('Marcus Bell')).toBeLessThan(value.indexOf('Sofia Alvarez'))
    expect(value).toContain('Review ready')
    expect(value).not.toContain('disabled=""')
    expect(value).not.toContain('aria-pressed="true"')
  })
  test('the existing discussion contract still renders without new reference fields', () => {
    const value = render(1, {discussion: {
      labels: {title: 'Existing discussion', detail: 'Existing host data', sortLabel: 'Order', resolve: 'Resolve', resolved: 'Resolved', replyPlaceholder: 'Reply'},
      sortOptions: [{id: 'first', label: 'First'}], initialSortId: 'first', initiallyResolved: false,
      messages: [{id: 'old', initials: 'A', author: 'Avery', body: 'Legacy message', meta: 'Earlier'}],
      listStrategy: {kind: 'content-grown', expectedMaximum: 8},
    }})
    expect(value).toContain('Existing discussion')
    expect(value).toContain('Legacy message')
    expect(value).toContain('>Resolve<')
  })
  test('stale sort, empty, duplicate and 45-message collections remain deterministic and untruncated', () => {
    const discussion = HBAR_APP_UI_COMMENTS_FIXTURES.referenceDiscussion!
    const duplicate = render(1, {...HBAR_APP_UI_COMMENTS_FIXTURES, referenceDiscussion: {...discussion, sortId: 'missing', messages: [discussion.messages[0]!, discussion.messages[0]!]}})
    expect(duplicate.match(/<article /g)?.length).toBe(1)
    expect(duplicate).toContain('aria-selected="true"')
    const empty = render(1, {...HBAR_APP_UI_COMMENTS_FIXTURES, referenceDiscussion: {...discussion, messages: []}})
    expect(empty).toContain('Write a comment')
    expect(empty).not.toContain('<article')
    const overflow = render(1, createHbarAppUiCommentsOverflowFixtures())
    expect(overflow.match(/<article /g)?.length).toBe(45)
    expect(overflow).toContain('Additional participant 45')
  })
})
