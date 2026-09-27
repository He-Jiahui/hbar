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
  test('annotation reference preserves continuous prose, linked ranges and resolve states', () => {
    const value = render(2)
    expect(value).toContain('Service commitment draft')
    expect(value).toContain('2 open comments · 3 total')
    expect(value.match(/data-hbar-app-ui-action="select-annotation"/g)?.length).toBe(3)
    expect(value.match(/data-hbar-app-ui-action="toggle-resolved"/g)?.length).toBe(3)
    expect(value).toContain('data-hbar-app-ui-target="regions"')
    expect(value).toContain('lumen-comments-document-note is-resolved')
    expect(value).toContain('aria-pressed="true"')
    expect(value).not.toContain('Document annotation')
  })
  test('annotation Host updates project counts and selection independent of record order', () => {
    const content = HBAR_APP_UI_COMMENTS_FIXTURES.referenceAnnotation!
    const value = render(2, {referenceAnnotation: {
      ...content, activeId: 'regions',
      annotations: [...content.annotations].reverse().map((item) => item.id === 'regions' ? {...item, resolved: true} : item),
    }})
    expect(value).toContain('1 open comment · 3 total')
    expect(value.indexOf('Priya Nandakumar')).toBeLessThan(value.indexOf('Sofia Alvarez'))
    expect(value).toContain('lumen-comments-document-highlight is-active is-resolved')
    expect(value.match(/aria-pressed="true"/g)?.length).toBe(2)
    expect(value).not.toContain('lumen-comments-document-card is-active')
  })
  test('annotation capacity, stale IDs, duplicate IDs, empty data and missing links stay explicit', () => {
    const content = HBAR_APP_UI_COMMENTS_FIXTURES.referenceAnnotation!
    for (const count of [0, 1, 3, 4]) {
      const annotations = Array.from({length: count}, (_, index) => ({...content.annotations[0]!, id: `record-${index}`}))
      const value = render(2, {referenceAnnotation: {...content, activeId: 'missing', annotations}})
      expect((value.match(/data-hbar-app-ui-action="toggle-resolved"/g) ?? []).length).toBe(count)
      expect(value).not.toContain('data-hbar-app-ui-action="select-annotation"')
      expect(value).toContain('Northwind commits')
      if (count === 0) expect(value).toContain('No comments')
    }
    const duplicate = render(2, {referenceAnnotation: {...content, annotations: [content.annotations[0]!, content.annotations[0]!]}})
    expect(duplicate.match(/data-hbar-app-ui-action="toggle-resolved"/g)?.length).toBe(1)
    const localized = render(2, createHbarAppUiCommentsLocalizedFixtures())
    expect(localized).toContain('服务承诺草稿与区域覆盖范围审查')
    expect(localized).toContain('2 条未解决批注，共 3 条')
    expect(render(2, createHbarAppUiCommentsOverflowFixtures())).toContain('Regional reviewer 4')
  })
  test('code review renders passive diff and suggestions without inventing accept or dismiss actions', () => {
    const value = render(3)
    expect(value).toContain('Cap backfill concurrency')
    expect(value).toContain('packages/data/src/query.ts · 2 comments')
    expect(value.match(/lumen-comments-code-review-line"/g)?.length).toBe(9)
    expect(value.match(/<article/g)?.length).toBe(2)
    expect(value).toContain('maxWorkers: pool.size / 2,')
    expect(value.match(/<button/g)?.length).toBe(2)
    expect(value).toContain('disabled=""')
    expect(value).not.toContain('>Accept<')
    expect(value).not.toContain('>Dismiss<')
  })
  test('code review consumes Host resolution and draft without coupling the two states', () => {
    const content = HBAR_APP_UI_COMMENTS_FIXTURES.referenceReview!
    const value = render(3, {referenceReview: {...content, resolved: true, draft: 'Capacity confirmed'}})
    expect(value).toContain('aria-pressed="true"')
    expect(value).toContain('Resolved')
    expect(value).toContain('Capacity confirmed')
    expect(value).not.toContain('disabled=""')
    expect(value.match(/<article/g)?.length).toBe(2)
    expect(render(3, {referenceReview: {...content, draft: '   '}})).toContain('disabled=""')
  })
  test('review empty, one, normal, boundary-plus-one and duplicate collections are preserved', () => {
    const content = HBAR_APP_UI_COMMENTS_FIXTURES.referenceReview!
    expect(render(3, {referenceReview: {...content, lines: [], messages: []}})).toContain('No code changes')
    expect(render(3, {referenceReview: {...content, lines: [], messages: []}})).toContain('No review comments')
    for (const count of [1, 2, 3]) {
      const messages = Array.from({length: count}, (_, index) => ({...content.messages[0]!, id: String(index)}))
      expect(render(3, {referenceReview: {...content, messages}}).match(/<article/g)?.length).toBe(count)
    }
    const duplicate = render(3, {referenceReview: {...content, messages: [content.messages[0]!, content.messages[0]!], lines: [content.lines[0]!, content.lines[0]!]}})
    expect(duplicate.match(/<article/g)?.length).toBe(1)
    expect(duplicate.match(/lumen-comments-code-review-line"/g)?.length).toBe(1)
    const overflow = render(3, createHbarAppUiCommentsOverflowFixtures())
    expect(overflow.match(/lumen-comments-code-review-line"/g)?.length).toBe(10)
    expect(overflow.match(/<article/g)?.length).toBe(3)
    const localized = render(3, createHbarAppUiCommentsLocalizedFixtures())
    expect(localized).toContain('限制回填任务并发并统一读取连接池配置')
    expect(localized).toContain('回复这条审查线程')
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
