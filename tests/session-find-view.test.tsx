import { expect, test } from 'bun:test'
import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ConversationFindState } from '@hbar/app-runtime'
import { HbarSessionFindBar } from '../packages/app-react/src/session-find-view'
import { sessionFindCopy } from '../apps/web/src/session-find-copy'

const base: ConversationFindState = {
  status: 'idle',
  scopeId: 'original-session',
  query: '',
  matches: [],
  activeIndex: -1,
  navigationRevision: 0,
  truncated: false,
  history: 'complete',
  error: null,
}
function render(
  locale: 'en-US' | 'zh-CN',
  patch: Partial<ConversationFindState> = {},
  feedback: 'highlight' | 'target' | null = null,
  long = false,
) {
  const copy = sessionFindCopy(locale)
  return renderToStaticMarkup(
    <HbarSessionFindBar
      state={{ ...base, ...patch }}
      labels={long ? { ...copy, title: copy.title.repeat(20), older: copy.older.repeat(20) } : copy}
      inputRef={createRef<HTMLInputElement>()}
      descriptionId="scope-notice"
      feedback={feedback}
      onQuery={() => {}}
      onStep={() => {}}
      onClose={() => {}}
    />,
  )
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`find is a localized non-modal search region with query and three separately named actions: ${locale}`, () => {
    const copy = sessionFindCopy(locale)
    const html = render(locale)
    expect(html).toContain('role="search"')
    expect(html).toContain(`aria-label="${copy.title}"`)
    expect(html).toContain(`aria-label="${copy.input}"`)
    expect(html).toContain(`aria-description="${copy.scope}"`)
    expect(html).toContain('maxLength="257"')
    expect(html.match(/<button\b/g)).toHaveLength(3)
    for (const label of [copy.previous, copy.next, copy.close]) expect(html).toContain(`aria-label="${label}"`)
    expect(html.match(/disabled=""/g)).toHaveLength(2)
    expect(html).not.toContain('aria-modal="true"')
    expect(render(locale, { status: 'closed' })).toBe('')
  })
  test(`loaded-history boundary and capacity are explicit without invented result rows: ${locale}`, () => {
    const copy = sessionFindCopy(locale)
    const ready = {
      status: 'ready',
      query: 'needle',
      activeIndex: 0,
      matches: [{ rowId: 'm', segmentId: 'text:0', start: 0, end: 6 }],
    } as const
    const html = render(locale, ready)
    expect(html).toContain('1 / 1')
    expect(html).not.toContain('disabled=""')
    expect(render(locale, { ...ready, matches: [], activeIndex: -1 })).toContain('>0</span>')
    expect(render(locale, { ...ready, history: 'older' })).toContain(copy.older)
    expect(render(locale, { ...ready, history: 'failed' })).toContain(copy.historyFailed)
    expect(render(locale, { ...ready, history: 'limit' })).toContain(copy.limited)
    const capped = render(locale, {
      ...ready,
      matches: Array.from({ length: 1000 }, (_, start) => ({ rowId: 'm', segmentId: 'text:0', start, end: start + 1 })),
      truncated: true,
    })
    expect(capped).toContain('1 / 1000+')
    expect(capped).toContain(copy.limited)
    expect(capped.match(/<button\b/g)).toHaveLength(3)
    expect(render(locale, { history: 'older' }, null, true)).toContain(copy.older.repeat(20))
  })
  test(`pending and failed results cannot navigate or pretend they were highlighted: ${locale}`, () => {
    const copy = sessionFindCopy(locale)
    expect(render(locale, { status: 'searching', query: 'a' })).toContain(copy.searching)
    for (const error of ['INVALID_SOURCE', 'QUERY_LIMIT'] as const) {
      const html = render(locale, { status: 'failed', error, query: 'a' })
      expect(html).toContain(error === 'QUERY_LIMIT' ? copy.queryLimit : copy.invalidSource)
      expect(html).toContain('role="alert"')
      expect(html.match(/disabled=""/g)).toHaveLength(2)
    }
    expect(render(locale, {}, 'highlight')).toContain(copy.highlightUnavailable)
    expect(render(locale, {}, 'target')).toContain(copy.targetUnavailable)
  })
}
