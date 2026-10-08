import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { runSchema } from '@hbar/contracts'
import type { Message } from '@hbar/contracts'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { HbarConversationAnchorRail } from '../packages/app-react/src/conversation-anchors'
import {
  CONVERSATION_ANCHOR_MAX_MESSAGES,
  CONVERSATION_ANCHOR_PAGE_SIZE,
  conversationAnchorPage,
  conversationAnchorText,
  currentConversationAnchor,
  projectConversationAnchors,
  type ConversationAnchor,
} from '../packages/app-react/src/conversation-anchor-model'

function message(seq: number, role: Message['role'], text: string, update: Partial<Message> = {}): Message {
  return {
    id: `message-${seq}`,
    sessionId: 'session',
    runId: `run-${seq}`,
    seq,
    createdAt: seq,
    role,
    content: [{ type: 'text', text }],
    ...update,
  }
}
const project = (messages: readonly Message[]) =>
  projectConversationAnchors({ sessionId: 'session', messages, runs: [] })
const anchors = (count: number): readonly ConversationAnchor[] =>
  Array.from({ length: count }, (_, index) => ({
    messageId: `original-${index}`,
    seq: index + 1,
    title: `用户对话 ${index + 1} 🧭`,
    preview: '实际回复，未生成额外摘要',
    attachments: 0,
  }))

test('canonical user turns are ordered and deduplicated; tools, thinking, foreign and empty messages stay outside the rail', () => {
  const items = [
    message(9, 'user', 'Next'),
    message(2, 'assistant', 'Starting'),
    message(4, 'tool', 'Secret tool data'),
    message(1, 'user', 'First'),
    message(5, 'user', '   '),
    message(8, 'assistant', 'Completed'),
    message(1, 'user', 'Duplicate'),
    message(7, 'user', 'Another Session', { sessionId: 'foreign' }),
    message(10, 'assistant', 'Hidden thinking', { content: [{ type: 'thinking', text: 'Private reasoning' }] }),
  ]
  expect(project(items)).toEqual([
    { messageId: 'message-1', seq: 1, title: 'First', preview: 'Completed', attachments: 0 },
    { messageId: 'message-9', seq: 9, title: 'Next', preview: '', attachments: 0 },
  ])
  expect(projectConversationAnchors({ sessionId: null, messages: items, runs: [] })).toEqual([])
})

test('generated Goal/system envelopes are excluded while human guides under that Run remain anchors', () => {
  const text = 'Internal recovery instruction'
  const run = runSchema.parse({
    id: 'active',
    sessionId: 'session',
    requestId: 'request',
    input: { text, images: [], source: 'goal' },
    modelId: 'fixture',
    status: 'running',
    createdAt: 1,
    startedAt: 1,
    endedAt: null,
    error: null,
  })
  const messages = [
    message(1, 'user', text, { runId: run.id }),
    message(2, 'user', '请先验证最新的改动', { runId: run.id }),
    message(3, 'assistant', 'Guide acknowledged', { runId: run.id }),
  ]
  expect(projectConversationAnchors({ sessionId: 'session', messages, runs: [run] })).toEqual([
    { messageId: 'message-2', seq: 2, title: '请先验证最新的改动', preview: 'Guide acknowledged', attachments: 0 },
  ])
})

test('attachment-only input has a real anchor and Host-owned fallback copy', () => {
  const result = project([
    message(1, 'user', '', {
      content: [
        {
          type: 'file',
          artifact: { id: 'file', name: '说明.md', mime: 'text/markdown', size: 10 },
        },
      ],
    }),
  ])
  expect(result).toMatchObject([{ title: '', attachments: 1, messageId: 'message-1' }])
  const copy = getShellCopy('zh-CN').session.anchors
  const html = render(result)
  expect(html).toContain(copy.attachments(1))
})

test('Chinese, emoji clusters, markup and 4,000-character prompts remain bounded plain text', () => {
  const emoji = '👩🏽‍💻'
  expect(conversationAnchorText(`中文${emoji}${emoji}`, 3)).toBe(`中文${emoji}…`)
  const result = project([
    message(1, 'user', '<img src=x onerror=alert(1)> ' + '中文'.repeat(2000)),
    message(2, 'assistant', 'Answer '.repeat(1000)),
  ])
  expect([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(result[0]?.title ?? '')]).toHaveLength(
    161,
  )
  expect(result[0]?.preview.length).toBeLessThanOrEqual(281)
  const html = render(result)
  expect(html).toContain('&lt;img')
  expect(html).not.toContain('<img src=x')
})

test('current marker follows the containing user turn, including tool rows and the latest reply', () => {
  const messages = [
    message(1, 'user', 'First'),
    message(2, 'assistant', 'Answer'),
    message(3, 'tool', 'Tool'),
    message(4, 'user', 'Next'),
    message(5, 'assistant', 'Next answer'),
  ]
  const items = project(messages)
  expect(currentConversationAnchor(items, messages, null)).toBe('message-4')
  expect(currentConversationAnchor(items, messages, { messageId: 'message-3', messageOffset: 0, atEnd: false })).toBe(
    'message-1',
  )
  expect(
    currentConversationAnchor(items, messages, { messageId: 'missing', messageOffset: 0, atEnd: false }),
  ).toBeNull()
  expect(currentConversationAnchor(items, messages, { messageId: 'message-1', messageOffset: 0, atEnd: true })).toBe(
    'message-4',
  )
})

for (const count of [0, 1, CONVERSATION_ANCHOR_PAGE_SIZE, CONVERSATION_ANCHOR_PAGE_SIZE + 1, 1000]) {
  for (const locale of ['zh-CN', 'en-US'] as const) {
    test(`rail uses ${locale} Host labels with bounded markers for ${count} turns`, () => {
      const items = anchors(count)
      const html = render(items, locale)
      expect((html.match(/data-conversation-anchor=/g) ?? []).length).toBe(
        Math.min(count, CONVERSATION_ANCHOR_PAGE_SIZE),
      )
      if (!count) expect(html).toBe('')
      else {
        expect(html).toContain(getShellCopy(locale).session.anchors.jump(1, items[0]?.title ?? ''))
        expect(html).toContain('aria-current="location"')
      }
    })
  }
}

test('paged rail retains original message identity after prepending history and safely handles stale active IDs', () => {
  const items = anchors(50)
  const page = conversationAnchorPage(items, 'original-48')
  expect(page.start).toBe(48)
  expect(page.items.map((item) => item.messageId)).toEqual(['original-48', 'original-49'])
  const prepended = [{ ...items[0]!, messageId: 'earlier' }, ...items]
  expect(conversationAnchorPage(prepended, 'original-48', 'original-48').items[0]?.messageId).toBe('original-48')
  expect(conversationAnchorPage(items, 'missing', 'missing').start).toBe(0)
  expect(
    project(
      Array.from({ length: CONVERSATION_ANCHOR_MAX_MESSAGES + 1 }, (_, index) => message(index, 'user', 'Actual')),
    ),
  ).toHaveLength(CONVERSATION_ANCHOR_MAX_MESSAGES)
})

test('history loading, failure, offline and limit use accessible local recovery controls', () => {
  const labels = getShellCopy('zh-CN').session.anchors
  for (const olderStatus of ['loading', 'error', 'limit'] as const) {
    const html = renderToStaticMarkup(
      <HbarConversationAnchorRail
        anchors={[]}
        activeId={null}
        labels={labels}
        hasOlder
        olderStatus={olderStatus}
        canLoadOlder={false}
        onNavigate={() => {}}
        onLoadOlder={() => {}}
      />,
    )
    expect(html).toContain(
      olderStatus === 'loading'
        ? labels.loadingOlder
        : olderStatus === 'error'
          ? labels.retryOlder
          : labels.historyLimit,
    )
    expect(html).toContain('disabled=""')
  }
})

function render(items: readonly ConversationAnchor[], locale: 'zh-CN' | 'en-US' = 'zh-CN') {
  return renderToStaticMarkup(
    <HbarConversationAnchorRail
      anchors={items}
      activeId={items[0]?.messageId ?? null}
      labels={getShellCopy(locale).session.anchors}
      hasOlder={false}
      olderStatus="idle"
      canLoadOlder
      onNavigate={() => {}}
      onLoadOlder={() => {}}
    />,
  )
}
