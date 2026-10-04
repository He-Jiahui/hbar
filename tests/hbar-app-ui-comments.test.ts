import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  projectHbarAppUiCommentsInbox,
  projectHbarAppUiCommentsCanvas,
  normalizeHbarAppUiCommentsCanvasCoordinate,
  filterHbarAppUiCommentsComposerMentions,
  insertHbarAppUiCommentsComposerMention,
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
  test('the existing canvas contract remains available without opting into the reference canvas', () => {
    const value = render(6, {canvas: HBAR_APP_UI_COMMENTS_FIXTURES.canvas!})
    expect(value).toContain('Workspace canvas')
    expect(value).toContain('lumen-comments-canvas')
    expect(value).not.toContain('lumen-comments-canvas-layout')
  })
  test('canvas links overlay pins to all comments and a controlled reply without making mode actionable', () => {
    const value = render(6)
    expect(value).toContain('Pricing page · v7')
    expect(value).toContain('3 open pins · 3 reviewers')
    expect(value.match(/class="lumen-comments-canvas-card"/g)?.length).toBe(3)
    expect(value.match(/aria-pressed="true"/g)?.length).toBe(1)
    expect(value).toContain('Pin 2 by Amelia Whitfield')
    expect(value).toContain('Reply to pin 1')
    expect(value).not.toContain('disabled=""')
    expect(value).not.toContain('<button type="button">Comment mode')
  })
  test('canvas projection deduplicates IDs, counts reviewers and falls back from stale selection', () => {
    const content = HBAR_APP_UI_COMMENTS_FIXTURES.referenceCanvas!
    const first = content.pins[0]!
    const projection = projectHbarAppUiCommentsCanvas([first, {...first, resolved: true}, {...content.pins[1]!, reviewerId: first.reviewerId}], 'missing')
    expect(projection.pins.length).toBe(2)
    expect(projection.selected?.id).toBe(first.id)
    expect(projection.unresolved).toBe(2)
    expect(projection.reviewers).toBe(1)
    const resolved = content.pins.map((pin) => ({...pin, resolved: true}))
    const value = render(6, {referenceCanvas: {...content, pins: resolved, activeId: 'card', draft: 'Host-owned reply'}})
    expect(value).toContain('0 open pins · 3 reviewers')
    expect(value).toContain('Reply to pin 2')
    expect(value).toContain('Host-owned reply')
    expect(value.match(/class="lumen-comments-canvas-body is-resolved"/g)?.length).toBe(3)
    expect(value.match(/data-selected="true"/g)?.length).toBe(1)
  })
  test('canvas capacity, localization, empty input and normalized coordinates retain accessible data', () => {
    const content = HBAR_APP_UI_COMMENTS_FIXTURES.referenceCanvas!
    for (const count of [0, 1, 3, 4]) {
      const pins = Array.from({length: count}, (_, index) => ({...content.pins[0]!, id: String(index), label: String(index + 1)}))
      const value = render(6, {referenceCanvas: {...content, pins, activeId: 'missing'}})
      expect((value.match(/class="lumen-comments-canvas-card"/g) ?? []).length).toBe(count)
      if (!count) { expect(value).toContain('No comments'); expect(value).not.toContain('<input'); }
      else expect(value).toContain('Reply to pin 1')
    }
    expect(render(6, createHbarAppUiCommentsLocalizedFixtures())).toContain('价格页面与区域企业套餐定价审查')
    const overflow = render(6, createHbarAppUiCommentsOverflowFixtures())
    expect(overflow.match(/class="lumen-comments-canvas-card"/g)?.length).toBe(4)
    expect(overflow).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect([-5, 22, 110, Number.NaN, Number.POSITIVE_INFINITY].map(normalizeHbarAppUiCommentsCanvasCoordinate)).toEqual([0, 22, 100, 50, 50])
  })
  test('inbox keeps five passive comments with native filter tabs and reversible row actions', () => {
    const value = render(5)
    expect(value).toContain('Comment inbox')
    expect(value).toContain('4 unresolved across 5 documents')
    expect(value.match(/role="tab"/g)?.length).toBe(3)
    expect(value.match(/<article/g)?.length).toBe(5)
    expect(value).toContain('Reopen comment from Tomás Guerrero')
    expect(value.match(/aria-pressed="true"/g)?.length).toBe(1)
    expect(value).not.toContain('disabled=""')
    expect(value).not.toContain('href=')
  })
  test('inbox filtering and resolution derive from Host data without changing global document counts', () => {
    const content = HBAR_APP_UI_COMMENTS_FIXTURES.referenceInbox!
    const updated = content.items.map((item) => item.id === 'priya' ? {...item, resolved: true} : item)
    const mentions = projectHbarAppUiCommentsInbox(updated, 'mentions')
    expect(mentions.items.map((item) => item.id)).toEqual(['priya', 'sofia'])
    expect(mentions.unresolved).toBe(3)
    expect(mentions.documents).toBe(5)
    expect(projectHbarAppUiCommentsInbox(updated, 'unresolved').items.map((item) => item.id)).toEqual(['marcus', 'sofia', 'wei'])
    const value = render(5, {referenceInbox: {...content, items: updated, filterId: 'mentions'}})
    expect(value.match(/<article/g)?.length).toBe(2)
    expect(value).toContain('Reopen comment from Priya Nandakumar')
    expect(value.match(/class="lumen-comments-inbox-mention"/g)?.length).toBe(1)
    const empty = render(5, {referenceInbox: {...content, items: updated.map((item) => ({...item, resolved: true})), filterId: 'open'}})
    expect(empty).toContain('0 unresolved across 5 documents')
    expect(empty).toContain('Nothing left here')
    expect(empty).toContain('Every comment in this view has been resolved.')
    expect(empty).not.toContain('<article')
  })
  test('inbox capacity, duplicate IDs, stale filter and repeated document IDs preserve explicit boundaries', () => {
    const content = HBAR_APP_UI_COMMENTS_FIXTURES.referenceInbox!
    for (const count of [0, 1, 5, 6]) {
      const items = Array.from({length: count}, (_, index) => ({...content.items[0]!, id: String(index)}))
      const value = render(5, {referenceInbox: {...content, items, filterId: 'missing'}})
      expect((value.match(/<article/g) ?? []).length).toBe(count)
      expect(value).toContain('aria-selected="true"')
      expect(projectHbarAppUiCommentsInbox(items, 'all').documents).toBe(count ? 1 : 0)
      if (count === 1) expect(value).toContain('1 unresolved across 1 document')
      if (!count) expect(value).toContain('Nothing left here')
    }
    const value = render(5, {referenceInbox: {...content, items: [content.items[0]!, content.items[0]!], filters: [content.filters[0]!, content.filters[0]!]}})
    expect(value.match(/<article/g)?.length).toBe(1)
    expect(value.match(/role="tab"/g)?.length).toBe(1)
    expect(render(5, {referenceInbox: {...content, filters: []}}).match(/<article/g)?.length).toBe(5)
    expect(render(5, createHbarAppUiCommentsLocalizedFixtures())).toContain('跨文档评论收件箱与区域设计审查待办')
    const overflow = render(5, createHbarAppUiCommentsOverflowFixtures())
    expect(overflow.match(/<article/g)?.length).toBe(6)
    expect(overflow).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(overflow).toContain('Additional regional reviewer 6')
  })
  test('composer reference renders controlled draft, attachments, suggestions and passive history', () => {
    const value = render(4)
    expect(value).toContain('Leave a comment')
    expect(value).toContain('Nice catch on the pool cap. @')
    expect(value.match(/role="option"/g)?.length).toBe(5)
    expect(value.match(/<article/g)?.length).toBe(3)
    expect(value).toContain('Remove pool-saturation.png')
    expect(value).toContain('Mention suggestions')
    expect(value).not.toContain('disabled=""')
    const content = HBAR_APP_UI_COMMENTS_FIXTURES.referenceComposer!
    expect(render(4, {referenceComposer: {...content, draft: '   ', suggestions: []}})).toContain('disabled=""')
    expect(render(4, {composer: HBAR_APP_UI_COMMENTS_FIXTURES.composer})).not.toContain('lumen-comments-composer-layout')
  })
  test('mention projections match name filtering and insert only a trailing query without losing prior text', () => {
    const people = HBAR_APP_UI_COMMENTS_FIXTURES.referenceComposer!.suggestions
    expect(filterHbarAppUiCommentsComposerMentions('Please ask @SO', people).map((person) => person.id)).toEqual(['sofia'])
    expect(filterHbarAppUiCommentsComposerMentions('x@a', people).map((person) => person.id)).toEqual(['priya', 'marcus', 'sofia'])
    expect(filterHbarAppUiCommentsComposerMentions('Please ask @pla', people)).toEqual([])
    expect(filterHbarAppUiCommentsComposerMentions('Please ask @missing', people)).toEqual([])
    expect(filterHbarAppUiCommentsComposerMentions('Please ask @so ', people)).toEqual([])
    expect(filterHbarAppUiCommentsComposerMentions('Please ask ', people)).toEqual([])
    expect(filterHbarAppUiCommentsComposerMentions('@', [people[0]!, people[0]!, people[1]!])).toEqual([people[0]!, people[1]!])
    expect(insertHbarAppUiCommentsComposerMention('Ask @priya and @so', 'sofia')).toBe('Ask @priya and @sofia ')
    expect(insertHbarAppUiCommentsComposerMention('A stale selection has no query', 'sofia')).toBe('A stale selection has no query')
  })
  test('composer collections preserve empty, one, normal, documented bound and bound-plus-one data', () => {
    const content = HBAR_APP_UI_COMMENTS_FIXTURES.referenceComposer!
    for (const count of [0, 1, 5, 6]) {
      const suggestions = Array.from({length: count}, (_, index) => ({...content.suggestions[0]!, id: String(index)}))
      const value = render(4, {referenceComposer: {...content, suggestions}})
      expect((value.match(/role="option"/g) ?? []).length).toBe(count)
      if (!count) expect(value).not.toContain('role="listbox"')
    }
    for (const count of [0, 1, 2, 3]) {
      const attachments = Array.from({length: count}, (_, index) => ({id: String(index), name: `file-${index}`}))
      expect((render(4, {referenceComposer: {...content, attachments}}).match(/aria-label="Remove /g) ?? []).length).toBe(count)
    }
    for (const count of [0, 1, 3, 4]) {
      const messages = Array.from({length: count}, (_, index) => ({...content.messages[0]!, id: String(index)}))
      const value = render(4, {referenceComposer: {...content, messages}})
      expect((value.match(/<article/g) ?? []).length).toBe(count)
      if (!count) expect(value).toContain('No earlier comments')
    }
    const duplicate = render(4, {referenceComposer: {...content,
      suggestions: [content.suggestions[0]!, content.suggestions[0]!],
      attachments: [content.attachments[0]!, content.attachments[0]!], messages: [content.messages[0]!, content.messages[0]!],
    }})
    expect(duplicate.match(/role="option"/g)?.length).toBe(1)
    expect(duplicate.match(/aria-label="Remove /g)?.length).toBe(1)
    expect(duplicate.match(/<article/g)?.length).toBe(1)
    expect(render(4, createHbarAppUiCommentsLocalizedFixtures())).toContain('留下评论并与区域可靠性团队一起审查连接池容量')
    const overflow = render(4, createHbarAppUiCommentsOverflowFixtures())
    expect(overflow).toContain('Additional regional member 6')
    expect(overflow).toContain('Additional participant 4')
    expect(overflow).toContain('extended-filename-3.png')
  })
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
    const content = { inbox: { ...HBAR_APP_UI_COMMENTS_FIXTURES.inbox!, items: [] } }
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
