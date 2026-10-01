import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageLiteralText } from '../packages/app-react/src/message-literal-text'
import { messageLiteralSegments } from '../packages/app-react/src/message-literal-text-model'
import { projectSessionFindLiteralText, sessionFindDomRanges } from '../packages/app-react/src/session-find-text'
import { createSessionFindProjector } from '../packages/app-react/src/session-find-source'
import { sessionMessage } from './session-message.fixtures'

test('literal prompts preserve Markdown, HTML, paths, whitespace and Unicode without executable markup', () => {
  const text = '# 标题\n**粗体** `code`\n- 列表\n\n  D:\\Git\\hbar\\file.ts\r\n<script>alert(1)</script> &amp; 😀é'
  const html = renderToStaticMarkup(<MessageLiteralText text={text} />)
  expect(html).toContain('hbar-session-message-literal')
  expect(html).toContain('# 标题\n**粗体** `code`')
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp;amp;')
  expect(html).not.toMatch(/<(?:script|h1|strong|code|pre|ul|li)[ >]/)
  expect(messageLiteralSegments(text)).toEqual([{ kind: 'text', value: text }])
  expect(messageLiteralSegments('')).toEqual([])
})

test('only valid HTTP(S) prose URLs linkify and the exact authored text remains reconstructable', () => {
  for (const [text, urls] of [
    ['打开 http://localhost:3000，然后继续。', ['http://localhost:3000']],
    ['http://localhost:3000上运行', ['http://localhost:3000']],
    ['https://example.invalid/文档?q=是#部分。', ['https://example.invalid/文档?q=是#部分']],
    [
      '(https://example.invalid/Foo_(bar)). Next http://127.0.0.1:80/a;',
      ['https://example.invalid/Foo_(bar)', 'http://127.0.0.1:80/a'],
    ],
    ['[label](HTTPS://example.invalid/a) **literal**', ['HTTPS://example.invalid/a']],
    ['http://[::1]:8080/a', ['http://[::1]:8080/a']],
    ['https://a@evil.invalid http://x:655350 http://x:abc', []],
    ['javascript:alert(1) data:text/html,<script> file:///D:/Git/a mailto:a@b https://x:99999', []],
    [
      'before https://example.invalid/?q=' + 'encoded'.repeat(100) + ' after',
      ['https://example.invalid/?q=' + 'encoded'.repeat(100)],
    ],
  ] as const) {
    const segments = messageLiteralSegments(text)
    expect(segments.map((segment) => segment.value).join('')).toBe(text)
    expect(segments.filter((segment) => segment.kind === 'url').map((segment) => segment.value)).toEqual([...urls])
  }
  const html = renderToStaticMarkup(<MessageLiteralText text="https://example.invalid" />)
  expect(html).toContain('target="_blank" rel="noreferrer noopener"')
  const longTail = 'https://example.invalid/a' + ')'.repeat(180_000)
  expect(messageLiteralSegments(longTail)).toEqual([
    { kind: 'url', value: 'https://example.invalid/a' },
    { kind: 'text', value: ')'.repeat(180_000) },
  ])
})

test('literal find maps exact syntax, spaces, line endings and link boundaries at UTF16 offsets', () => {
  for (const text of ['', '# Header\n**needle**\n  spaced\r\n😀é', 'http://localhost:3000，然后继续。']) {
    const projection = projectSessionFindLiteralText(text)
    expect(projection.text).toBe(text)
    expect(projection.domText).toBe(text)
    const query = text.includes('needle') ? '**needle**' : text
    const start = text.indexOf(query)
    expect(
      sessionFindDomRanges(projection, start, start + query.length)
        .map((range) => projection.domText.slice(range.start, range.end))
        .join(''),
    ).toBe(query)
  }
})

test('source keeps operator syntax literal but continues parsing assistant Markdown and scopes replacements', () => {
  const text = '# Header\n**needle**\n  preserved\nhttps://example.invalid'
  const source = {
    sessionId: 'session',
    status: 'ready' as const,
    olderStatus: 'idle' as const,
    olderError: null,
    messages: [
      sessionMessage([{ type: 'text', text }], { id: 'user-literal', role: 'user' }),
      sessionMessage([{ type: 'text', text }], { id: 'assistant-markdown', seq: 2 }),
    ],
    runs: [],
    approvals: [],
    userInputs: [],
    plan: null,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    streams: {},
    events: [],
    cursor: 0,
    hasOlder: false,
    error: null,
  }
  const owner = createSessionFindProjector()
  const result = owner.project(source, 'scope', 'session')
  expect(result?.rows.get('user-literal')?.get('text:0')?.text).toBe(text)
  expect(result?.rows.get('assistant-markdown')?.get('text:0')?.text).not.toContain('**')
  expect(owner.project(source, 'foreign', 'other')).toBeNull()
  const replacement = owner.project(
    {
      ...source,
      messages: [sessionMessage([{ type: 'text', text: '**changed**' }], { id: 'user-literal', role: 'user' })],
    },
    'scope',
    'session',
  )
  expect(replacement?.rows.get('user-literal')?.get('text:0')?.text).toBe('**changed**')
})
