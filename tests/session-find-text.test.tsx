import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { CONVERSATION_FIND_LIMITS, type SessionTimelineState } from '@hbar/app-runtime'
import { MessageMarkdown, HbarMessageBlocks } from '../packages/app-react/src/session-message'
import { HbarHistoricalPlanMessage } from '../packages/app-react/src/proposed-plan-message'
import { projectSessionFindText, sessionFindDomRanges } from '../packages/app-react/src/session-find-text'
import { createSessionFindProjector } from '../packages/app-react/src/session-find-source'
import { sessionMessageTextSegments } from '../packages/app-react/src/session-message-text'
import { messageLabels, sessionMessage } from './session-message.fixtures'

/** SSR escapes only these characters; a single pass preserves literal entity text. */
function decodeReactText(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|#x27);/g, (token) => {
    switch (token) {
      case '&amp;':
        return '&'
      case '&lt;':
        return '<'
      case '&gt;':
        return '>'
      case '&quot;':
        return '"'
      default:
        return "'"
    }
  })
}

async function renderedText(html: string, selector = 'body'): Promise<string> {
  let text = ''
  await new HTMLRewriter()
    .on(selector, {
      text(chunk) {
        text += chunk.text
      },
    })
    .transform(new Response(`<body>${html}</body>`))
    .text()
  return decodeReactText(text)
}

const markdownCases = [
  '**strong** and _emphasis_ ~~deleted~~ [link **label**](https://example.org "not text")',
  'Escaped \\*stars\\* &amp; &#x1f600; <https://example.org> &lt;literal&gt;',
  'soft\nline  \nhard\n\n# Header\n\n> quoted\n> text\n\n- first\n- second',
  '```ts\nconst x = "😀"\n  x < 2 && x > 0\n```\n\nInline ` a\n b ` code.',
  '| First | Second |\n| --- | --- |\n| **cell** | code `two` |',
  '- [x] finished\n- [ ] waiting\n\n![ignored image alt](https://example.org/image.png)',
  'Footnote[^one] and text.\n\n[^one]: Actual footnote body.',
  '<script>do not index</script>\n\n<div>not parsed raw HTML</div>\n\nVisible **safe** text.',
  '中文 **查找** 😀é and İ/ı; CRLF\r\nsoft\rline\twhite   space',
]

test('AST DOM-text stream exactly matches the production Markdown renderer across Markdown/GFM', async () => {
  for (const markdown of markdownCases) {
    const projection = projectSessionFindText(markdown)
    const html = renderToStaticMarkup(<MessageMarkdown text={markdown} />)
    expect(projection.domText).toBe(await renderedText(html))
    for (const span of projection.spans) {
      expect(span.start).toBeLessThan(span.end)
      expect(span.domStart).toBeLessThanOrEqual(span.domEnd)
      expect(span.domEnd).toBeLessThanOrEqual(projection.domText.length)
      if (span.kind === 'text')
        expect(projection.text.slice(span.start, span.end)).toBe(projection.domText.slice(span.domStart, span.domEnd))
    }
  }
})

test('readable projection strips syntax and hidden/generated chrome without gluing block/table boundaries', () => {
  expect(projectSessionFindText('**markedneedle**').text).toBe('markedneedle')
  expect(projectSessionFindText('one\nsoft\n\nnext  \nline').text).toBe('one soft\nnext\nline')
  expect(projectSessionFindText('| A | B |\n| - | - |\n| C | D |').text).toBe('A\nB\nC\nD')
  expect(projectSessionFindText('```\na\n  b\n```').text).toBe('a\n  b\n')
  expect(projectSessionFindText('word[^x]\n\n[^x]: actual').text).toBe('word\nactual')
  expect(projectSessionFindText('![not body](https://example.org/a.png)').text).toBe('')
  expect(projectSessionFindText('before![not body](https://example.org/a.png)after').text).toBe('before\nafter')
  expect(projectSessionFindText('[visible](https://secret.example/path "hidden title")').text).toBe('visible')
  expect(projectSessionFindText('<script>hidden</script>').text).toBe('')
})

test('UTF16 mapping crosses inline markup and collapsed whitespace, not synthetic separators', () => {
  const projection = projectSessionFindText('中😀 **bold**\n[link](https://example.org)\n\nnext')
  const query = '😀 bold link'
  const start = projection.text.indexOf(query)
  const ranges = sessionFindDomRanges(projection, start, start + query.length)
  expect(ranges.map((range) => projection.domText.slice(range.start, range.end)).join('')).toBe('😀 bold\nlink')
  const newline = projection.text.lastIndexOf('\n')
  expect(sessionFindDomRanges(projection, newline, newline + 1)).toEqual([])
  expect(sessionFindDomRanges(projection, -1, 3)).toEqual([])
  expect(sessionFindDomRanges(projection, 1, 1000)).toEqual([])
  expect(sessionFindDomRanges(projection, 2, 2)).toEqual([])
  expect(sessionFindDomRanges(projection, 0.5, 2)).toEqual([])
  const footnote = projectSessionFindText('before [^x] after\n\n[^x]: footnote')
  const phrase = footnote.text.indexOf('before after')
  expect(
    sessionFindDomRanges(footnote, phrase, phrase + 'before after'.length)
      .map((range) => footnote.domText.slice(range.start, range.end))
      .join(''),
  ).toBe('before after')
})

test('late matches binary-seek ordered spans instead of rescanning a long inline prefix', () => {
  const projection = projectSessionFindText('**part** [part](https://example.org) '.repeat(2_000))
  let inspectedEnds = 0
  const observed = {
    ...projection,
    spans: projection.spans.map((span) => ({
      ...span,
      get end() {
        inspectedEnds++
        return span.end
      },
    })),
  }
  const occurrences = [...projection.text.matchAll(/part/g)]
  for (const index of [0, 1, 999, 2_500, 3_999]) {
    const start = occurrences[index]?.index
    if (start === undefined) throw new Error('Fixture must contain the requested inline occurrence')
    const ranges = sessionFindDomRanges(observed, start, start + 4)
    expect(ranges.map((range) => projection.domText.slice(range.start, range.end)).join('')).toBe('part')
  }
  // Five O(log N + matching spans) lookups, not thousands of prefix visits.
  expect(inspectedEnds).toBeLessThan(150)
})

function timeline(
  messages: SessionTimelineState['messages'],
  extra: Partial<SessionTimelineState> = {},
): SessionTimelineState {
  return {
    sessionId: 'session',
    status: 'ready',
    olderStatus: 'idle',
    olderError: null,
    messages,
    runs: [],
    approvals: [],
    userInputs: [],
    plan: null,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    streams: {},
    toolOutputs: {},
    events: [],
    cursor: 0,
    hasOlder: false,
    error: null,
    ...extra,
  }
}

test('source indexes only exact-session user/assistant bodies and stream text with real row and segment IDs', () => {
  const owner = createSessionFindProjector()
  const source = timeline(
    [
      sessionMessage([{ type: 'text', text: 'assistant' }]),
      sessionMessage(
        [
          { type: 'thinking', text: 'secret thought' },
          { type: 'text', text: 'user' },
        ],
        { id: 'u', role: 'user' },
      ),
      sessionMessage([{ type: 'text', text: 'system' }], { id: 'sys', role: 'system' }),
      sessionMessage([{ type: 'text', text: 'other session' }], { id: 'b', sessionId: 'B' }),
    ],
    {
      streams: {
        live: {
          id: 'live',
          sessionId: 'session',
          runId: 'run',
          text: '**stream**',
          thinking: 'private',
          offset: 0,
          version: 1,
        },
      },
    },
  )
  const result = owner.project(source, 'host/tab/session', 'session')
  expect(result?.source.rows).toEqual([
    { id: 'reply', segments: [{ id: 'text:0', text: 'assistant' }] },
    { id: 'u', segments: [{ id: 'text:1', text: 'user' }] },
    { id: 'live', segments: [{ id: 'text:1', text: 'stream' }] },
  ])
  expect(owner.project(source, 'host/tab/B', 'B')).toBeNull()
  expect(owner.project({ ...source, sessionId: null }, 'host/tab/session', 'session')).toBeNull()
  expect(owner.project(source, '', 'session')).toBeNull()
})

test('proposal markers are absent and actual before/document/after roots match source projection', async () => {
  const blocks = [
    { type: 'text' as const, text: 'Before **opening**.\r\n<proposed_plan>\r\n# Plan\r\n\r\nStep one.' },
    { type: 'tool_call' as const, callId: 'call', name: 'tool', args: {} },
    { type: 'text' as const, text: 'Step **two**.\n</proposed_plan>\nAfter ending.' },
  ]
  const owner = createSessionFindProjector()
  const result = owner.project(timeline([sessionMessage(blocks)]), 'scope', 'session')
  const html = renderToStaticMarkup(
    <HbarHistoricalPlanMessage
      sessionId="session"
      messageId="reply"
      blocks={blocks}
      labels={messageLabels('zh-CN').blocks}
      readOnlyLabel="只读计划"
    />,
  )
  expect(result?.source.rows[0]?.segments.map((item) => item.id)).toEqual(['text:0:before', 'proposal', 'text:2:after'])
  for (const [id, projection] of result?.rows.get('reply') ?? [])
    expect(await renderedText(html, `[data-session-find-segment="${id}"]`)).toBe(projection.domText)
  expect(result?.source.rows[0]?.segments.map((item) => item.text).join('')).not.toContain('proposed_plan')
  expect(result?.source.rows[0]?.segments.map((item) => item.text).join('')).not.toContain('只读计划')
  expect(sessionMessageTextSegments([{ type: 'text', text: '```\n<proposed_plan>\n```' }], true)[0]?.id).toBe('text:0')
})

test('normal roots exclude thinking, tools and message metadata; tool-result reparenting uses current visible block index', async () => {
  const call = { type: 'tool_call' as const, callId: 'c', name: 'read', args: {} }
  const reply = sessionMessage([
    { type: 'tool_result', callId: 'c', name: 'read', text: 'excluded', isError: false },
    { type: 'text', text: '**visible**' },
  ])
  const owner = createSessionFindProjector()
  const before = owner.project(timeline([reply]), 'scope', 'session')
  expect(before?.source.rows[0]?.segments[0]?.id).toBe('text:1')
  const after = owner.project(timeline([sessionMessage([call], { id: 'call', seq: 0 }), reply]), 'scope', 'session')
  expect(after?.source.rows[0]?.segments[0]?.id).toBe('text:0')
  const html = renderToStaticMarkup(
    <HbarMessageBlocks
      sessionId="session"
      messageId="reply"
      blocks={[{ type: 'text', text: '**visible**' }]}
      labels={messageLabels('en-US').blocks}
    />,
  )
  expect(await renderedText(html, '[data-session-find-segment="text:0"]')).toBe('visible')
})

test('immutable message/stream references reuse parse results; replacements, session changes and clear cannot reuse stale text', () => {
  const owner = createSessionFindProjector()
  const message = sessionMessage([{ type: 'text', text: 'first' }])
  const first = owner
    .project(timeline([message]), 'A', 'session')
    ?.rows.get('reply')
    ?.get('text:0')
  const same = owner
    .project(timeline([message], { hasOlder: true }), 'A', 'session')
    ?.rows.get('reply')
    ?.get('text:0')
  expect(same).toBe(first)
  const replacement = sessionMessage([{ type: 'text', text: 'changed' }])
  expect(
    owner
      .project(timeline([replacement]), 'A', 'session')
      ?.rows.get('reply')
      ?.get('text:0')?.text,
  ).toBe('changed')
  owner.clear()
  expect(
    owner
      .project(timeline([message]), 'A', 'session')
      ?.rows.get('reply')
      ?.get('text:0'),
  ).not.toBe(first)
})

test('history flags use canonical paging/read failures and pre-parse limits, not inferred completion', () => {
  const owner = createSessionFindProjector()
  const message = sessionMessage([{ type: 'text', text: 'body' }])
  for (const [extra, expected] of [
    [{}, 'complete'],
    [{ hasOlder: true }, 'older'],
    [{ status: 'loading' }, 'older'],
    [{ olderStatus: 'error' }, 'failed'],
    [{ status: 'error' }, 'failed'],
    [{ olderStatus: 'limit' }, 'limit'],
  ] as const)
    expect(owner.project(timeline([message], extra), 'scope', 'session')?.source.history).toBe(expected)
  const huge = sessionMessage([{ type: 'text', text: 'x'.repeat(CONVERSATION_FIND_LIMITS.characters + 1) }])
  const result = owner.project(timeline([huge]), 'scope', 'session')
  expect(result?.source.rows).toEqual([])
  expect(result?.source.history).toBe('limit')
  const tooMany = Array.from({ length: CONVERSATION_FIND_LIMITS.rows + 1 }, (_, index) => ({
    ...message,
    id: String(index),
  }))
  expect(owner.project(timeline(tooMany), 'scope', 'session')?.source).toEqual({
    scopeId: 'scope',
    rows: [],
    history: 'limit',
  })
  const tooManySegments = sessionMessage(
    Array.from({ length: CONVERSATION_FIND_LIMITS.segments + 1 }, () => ({ type: 'text' as const, text: 'x' })),
  )
  expect(owner.project(timeline([tooManySegments]), 'scope', 'session')?.source.rows).toEqual([])
})

test('empty, one, row and segment capacities remain explicit, and a large skipped row does not hide later readable rows', () => {
  const owner = createSessionFindProjector()
  expect(owner.project(timeline([]), 'scope', 'session')?.source.rows).toEqual([])
  for (const count of [1, CONVERSATION_FIND_LIMITS.rows - 1, CONVERSATION_FIND_LIMITS.rows]) {
    const messages = Array.from({ length: count }, (_, index) =>
      sessionMessage([{ type: 'text', text: 'x' }], { id: `m-${index}`, seq: index }),
    )
    expect(owner.project(timeline(messages), 'scope', 'session')?.source.rows).toHaveLength(count)
  }
  for (const count of [CONVERSATION_FIND_LIMITS.segments - 1, CONVERSATION_FIND_LIMITS.segments]) {
    const message = sessionMessage(Array.from({ length: count }, () => ({ type: 'text' as const, text: 'x' })))
    expect(owner.project(timeline([message]), 'scope', 'session')?.source.rows[0]?.segments).toHaveLength(count)
  }
  const huge = sessionMessage([{ type: 'text', text: 'x'.repeat(CONVERSATION_FIND_LIMITS.characters + 1) }])
  const small = sessionMessage([{ type: 'text', text: 'next visible' }], { id: 'next', seq: 2 })
  const result = owner.project(timeline([huge, small]), 'scope', 'session')
  expect(result?.source.history).toBe('limit')
  expect(result?.source.rows).toEqual([{ id: 'next', segments: [{ id: 'text:0', text: 'next visible' }] }])
})

test('stream cache respects immutable replacements and does not turn unfinished plan syntax into a proposal card', () => {
  const owner = createSessionFindProjector()
  const stream = {
    id: 'live',
    sessionId: 'session',
    runId: 'run',
    text: 'before **current**',
    thinking: '',
    offset: 0,
    version: 1,
  }
  const source = timeline([], { streams: { live: stream } })
  const first = owner.project(source, 'scope', 'session')?.rows.get('live')?.get('text:1')
  expect(owner.project(source, 'scope', 'session')?.rows.get('live')?.get('text:1')).toBe(first)
  const changed = { ...stream, text: 'before **current** appended', version: 2 }
  expect(
    owner
      .project(timeline([], { streams: { live: changed } }), 'scope', 'session')
      ?.rows.get('live')
      ?.get('text:1')?.text,
  ).toBe('before current appended')
  expect(first?.text).toBe('before current')
})

test('a deeply nested offscreen Markdown parse failure is local, explicit and cannot replace other readable rows', () => {
  const owner = createSessionFindProjector()
  // This is below the character cap but exceeds the upstream recursive tree
  // transform's stack capacity. No renderer for this historical row is mounted.
  const nested = sessionMessage([{ type: 'text', text: '> '.repeat(15_000) + 'deep' }])
  const readable = sessionMessage([{ type: 'text', text: 'still readable' }], { id: 'safe', seq: 2 })
  const result = owner.project(timeline([nested, readable]), 'scope', 'session')
  expect(result?.source.history).toBe('failed')
  expect(result?.source.rows).toEqual([{ id: 'safe', segments: [{ id: 'text:0', text: 'still readable' }] }])
  expect(owner.project(timeline([nested, readable]), 'scope', 'session')?.source).toEqual(result?.source)
  const replacement = sessionMessage([{ type: 'text', text: 'fixed source' }])
  expect(owner.project(timeline([replacement, readable]), 'scope', 'session')?.source.history).toBe('complete')
})
