import { expect, test } from 'bun:test'
import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarChatSearchView,
  highlightedChatSearchText,
  visibleChatSearchRows,
  type HbarChatSearchLabels,
  type HbarChatSearchRow,
  type HbarChatSearchStatus,
} from '@hbar/app-react'

const labels: HbarChatSearchLabels = {
  search: '搜索聊天',
  recent: '最近的聊天',
  close: '关闭搜索',
  loading: '正在搜索',
  indexing: '正在建立索引，结果可能不完整',
  searchFailed: '搜索失败',
  empty: '没有匹配的聊天',
  noRecent: '没有最近的聊天',
  disconnected: 'Host 未连接',
  retry: '重试',
  truncated: '仅显示部分结果，请缩小搜索范围',
  navigateKey: '↑↓',
  navigate: '导航',
  selectKey: 'Enter',
  select: '打开',
  closeKey: 'Esc',
  closeHint: '关闭',
  role: (role) => (role === 'user' ? '你' : '助手'),
  time: (value) => `${value} 分钟前`,
  matches: (count, capped) => `${count}${capped ? '+' : ''} 条匹配`,
  openSession: (title, workspace) => `打开 ${workspace} 中的 ${title}`,
  opening: (title) => `正在打开 ${title}`,
}

const row = (id: string, title = `会话 ${id}`): HbarChatSearchRow => ({
  sessionId: id,
  workspaceId: `workspace-${id}`,
  title,
  workspaceName: `项目 ${id}`,
  updatedAt: 1_700_000_000_000,
  matchCount: 4,
  snippets: [
    { messageId: `message-${id}`, role: 'user', text: '一个 needle 片段', highlights: [{ start: 3, end: 9 }] },
  ],
})

function render(
  options: {
    readonly query?: string
    readonly status?: HbarChatSearchStatus
    readonly rows?: readonly HbarChatSearchRow[]
    readonly selectedSessionId?: string | null
    readonly truncated?: boolean
    readonly error?: string | null
    readonly openError?: { readonly sessionId: string; readonly message: string } | null
    readonly labels?: HbarChatSearchLabels
  } = {},
) {
  return renderToStaticMarkup(
    <HbarChatSearchView
      inputRef={createRef<HTMLInputElement>()}
      query={options.query ?? ''}
      status={options.status ?? 'recent'}
      rows={options.rows ?? []}
      selectedSessionId={options.selectedSessionId ?? null}
      truncated={options.truncated ?? false}
      error={options.error ?? null}
      openError={options.openError}
      labels={options.labels ?? labels}
      onQueryChange={() => {}}
      onMove={() => {}}
      onSelect={() => {}}
      onOpen={() => {}}
      onClose={() => {}}
      onCompositionStart={() => {}}
      onCompositionEnd={() => {}}
      onRetry={() => {}}
    />,
  )
}

test('Chinese copy, long text, and semantic combobox/listbox keep labels in the host contract', () => {
  const long = `很长的项目和会话名称${'翻译'.repeat(100)}`
  const html = render({
    status: 'ready',
    query: 'needle',
    rows: [row('one', long)],
    labels: { ...labels, closeHint: long },
  })
  expect(html).toContain('role="search"')
  expect(html).toContain('role="combobox"')
  expect(html).toContain('role="listbox"')
  expect(html).toContain('role="option"')
  expect(html).toContain('aria-label="打开 项目 one 中的 很长的项目和会话名称')
  expect(html).toContain(long)
  expect(html).toContain('role="mark"')
  expect(html).toContain('hbar-chat-search-highlight')
  expect(html).toContain('4 条匹配')
  expect(html).toContain('aria-selected="false"')
})

test('capped Host match counts are never presented as exact', () => {
  const html = render({ status: 'ready', rows: [{ ...row('capped'), matchCount: 999, matchCountCapped: true }] })
  expect(html).toContain('999+ 条匹配')
  expect(html).not.toContain('999 条匹配')
})

test('empty, one, 8 recent, 50 results, and one-over-boundary are capacity safe', () => {
  expect(render()).toContain(labels.noRecent)
  expect(render({ status: 'empty', query: 'absent' })).toContain(labels.empty)
  expect(render({ rows: [row('one')], selectedSessionId: 'one' })).toContain('aria-selected="true"')
  expect(render({ rows: [row('one')] })).toContain(labels.recent)
  const recent = render({ rows: Array.from({ length: 9 }, (_, index) => row(String(index))) })
  expect(recent.match(/role="option"/g)).toHaveLength(8)
  expect(recent).not.toContain('data-session-id="8"')
  const fifty = Array.from({ length: 50 }, (_, index) => row(String(index)))
  expect(render({ status: 'ready', rows: fifty }).match(/role="option"/g)).toHaveLength(50)
  const beyond = render({ status: 'ready', rows: [...fifty, row('fifty')], selectedSessionId: 'fifty' })
  expect(beyond.match(/role="option"/g)).toHaveLength(50)
  expect(beyond).not.toContain('data-session-id="fifty"')
  expect(beyond).not.toContain('aria-selected="true"')
  expect(beyond).toContain(labels.truncated)
})

test('duplicate and stale identifiers never create ambiguous options', () => {
  const html = render({ status: 'ready', rows: [row('a'), row('a', 'duplicate'), row('b')], selectedSessionId: 'gone' })
  expect(html.match(/role="option"/g)).toHaveLength(2)
  expect(html).not.toContain('duplicate')
  expect(html).not.toContain('aria-activedescendant=')
  expect(visibleChatSearchRows([row('a'), row('a'), row('b')], 'ready').map((item) => item.sessionId)).toEqual([
    'a',
    'b',
  ])
})

test('loading, index-incomplete, disconnected, error and per-row open failure remain visible', () => {
  expect(render({ status: 'loading', rows: [row('a')] })).toContain(labels.loading)
  expect(render({ status: 'indexing', rows: [row('a')] })).toContain(labels.indexing)
  expect(render({ status: 'indexing', rows: [row('a')] })).toContain('data-session-id="a"')
  expect(render({ status: 'error' })).toContain(labels.searchFailed)
  expect(render({ status: 'error', error: '读取失败' })).toContain('读取失败')
  expect(render({ status: 'disconnected' })).toContain(labels.disconnected)
  expect(render({ status: 'ready', rows: [row('a')], openError: { sessionId: 'a', message: '打开失败' } })).toContain(
    '打开失败',
  )
  expect(render({ status: 'ready', rows: [row('a')], truncated: true })).toContain(labels.truncated)
  const incomplete = render({ status: 'ready', rows: [], truncated: true })
  expect(incomplete).toContain(labels.truncated)
  expect(incomplete).not.toContain(labels.empty)
})

test('malformed highlights are excluded and React escapes transcript content', () => {
  const html = render({
    status: 'ready',
    rows: [
      {
        ...row('safe'),
        snippets: [
          {
            messageId: 'unsafe',
            role: 'assistant',
            text: '<img src=x onerror=alert(1)> needle',
            highlights: [
              { start: -1, end: 3 },
              { start: 30, end: 36 },
              { start: 29, end: 35 },
              { start: 0, end: 4 },
            ],
          },
        ],
      },
    ],
  })
  expect(html).not.toContain('<img src=x')
  expect(html).toContain('&lt;img')
  expect(html).toMatch(/<span[^>]*role="mark"[^>]*>&lt;img<\/span>/)
  expect(renderToStaticMarkup(<>{highlightedChatSearchText('needle', [{ start: 0, end: 6 }])}</>)).toContain(
    'role="mark"',
  )
})
