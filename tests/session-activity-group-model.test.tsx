import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { createSessionToolPresenter } from '../apps/web/src/session-tool-presentation'
import {
  groupCompletedSessionActivities,
  summarizeMessageActivity,
} from '../packages/app-react/src/session-activity-group-model'
import {
  buildMessageRows,
  projectSessionMessages,
  type SessionMessage,
  type SessionMessageBlock,
  type SessionTimelineSequenceItem,
  type SessionToolCall,
  type SessionToolResult,
} from '../packages/app-react/src/session-message-model'
import { HbarMessageBlocks, messageActivitySummary } from '../packages/app-react/src/session-message'
import { sessionMessage } from './session-message.fixtures'

function call(id: string, kind?: 'file-read' | 'file-write' | 'file-edit' | 'command'): SessionToolCall {
  return {
    type: 'tool_call',
    callId: id,
    name: `custom-${id}`,
    args: {},
    ...(kind
      ? {
          presentation:
            kind === 'command'
              ? { version: 1 as const, kind, commandField: 'command' }
              : { version: 1 as const, kind, pathField: 'path' },
        }
      : {}),
  }
}
function result(
  source: SessionToolCall,
  kind: NonNullable<SessionToolResult['outcome']>['kind'] = 'succeeded',
): SessionToolResult {
  return {
    type: 'tool_result',
    callId: source.callId,
    name: source.name,
    text: `Original ${source.callId}`,
    isError: kind !== 'succeeded',
    outcome: { kind, executionStarted: kind === 'succeeded' || kind === 'failed' },
  }
}
function message(id: string, content: readonly SessionMessageBlock[], overrides: Partial<SessionMessage> = {}) {
  return sessionMessage([...content], { id, ...overrides })
}
function sequence(messages: readonly SessionMessage[]): SessionTimelineSequenceItem[] {
  return projectSessionMessages(messages).map((projection) => ({ kind: 'message', projection }))
}
function settled(id: string) {
  const source = call(id)
  return message(id, [source, result(source)])
}

test('completed consecutive calls from different messages collapse without losing original message/result identities', () => {
  const first = call('first')
  const second = call('second', 'file-write')
  const before = message('before', [{ type: 'text', text: 'Before activity' }])
  const after = message('after', [{ type: 'text', text: 'After activity' }])
  const input = sequence([
    before,
    message('first', [first]),
    message('result-first', [result(first)], { role: 'tool' }),
    message('second', [second]),
    message('result-second', [result(second, 'failed')], { role: 'tool' }),
    after,
  ])
  const grouped = groupCompletedSessionActivities(input)
  expect(grouped.map((item) => item.kind)).toEqual(['message', 'activityGroup', 'message'])
  const group = grouped[1]
  if (group?.kind !== 'activityGroup') throw new Error('Missing original activity group')
  expect(group.id).toBe('first')
  expect(group.projections.map(({ message }) => message.id)).toEqual(['first', 'second'])
  expect(group.projections[0]).toBe(input[1]?.kind === 'message' ? input[1].projection : undefined)
  expect(group.rows).toMatchObject([
    { name: first.name, result: { text: 'Original first' } },
    { name: second.name, result: { outcome: { kind: 'failed' } } },
  ])
  expect(grouped[0]).toBe(input[0])
  expect(grouped.at(-1)).toBe(input.at(-1))
})

test('prose, pending actions, attachments, runs, Sessions and committed lifecycle boundaries stop grouping', () => {
  const source = call('pending')
  const boundaries: SessionTimelineSequenceItem[] = [
    ...sequence([
      message('prose', [{ type: 'text', text: 'Visible content' }]),
      message('pending', [source]),
      message('human', [{ type: 'thinking', text: 'Human content is never activity' }], { role: 'user' }),
      message('system', [{ type: 'thinking', text: 'System content is never activity' }], { role: 'system' }),
      message('file', [
        { type: 'file', artifact: { id: 'a'.repeat(64), name: 'source.txt', mime: 'text/plain', size: 1 } },
      ]),
      message('image', [
        { type: 'image', artifact: { id: 'b'.repeat(64), name: 'source.png', mime: 'image/png', size: 1 } },
      ]),
    ]),
    {
      kind: 'stream',
      stream: {
        id: 'live',
        sessionId: 'session',
        runId: 'run',
        text: '',
        thinking: 'Still working',
        offset: 0,
        version: 1,
      },
    },
    {
      kind: 'goalContinuation',
      continuation: {
        id: 'boundary',
        sessionId: 'session',
        runId: 'next',
        status: 'completed',
        createdAt: 1,
        anchor: { kind: 'run', createdAt: 1 },
      },
    },
  ]
  for (const boundary of boundaries) {
    const input = [...sequence([settled('left')]), boundary, ...sequence([settled('right')])]
    expect(groupCompletedSessionActivities(input).map((item) => item.kind)).not.toContain('activityGroup')
  }
  for (const overrides of [{ runId: 'other' }, { sessionId: 'other' }]) {
    const input = sequence([settled('left'), { ...settled('right'), ...overrides }])
    expect(groupCompletedSessionActivities(input)).toHaveLength(2)
  }
  const protectedInput = sequence([settled('left'), settled('protected'), settled('right')])
  expect(groupCompletedSessionActivities(protectedInput, ({ message }) => message.id === 'protected')).toHaveLength(3)
})

test('paged orphan results, appended calls and capacity boundaries retain every loaded activity with stable append identity', () => {
  for (const count of [0, 1, 2, 60, 61, 100, 101]) {
    const messages = Array.from({ length: count }, (_, index) => settled(`call-${index}`))
    const grouped = groupCompletedSessionActivities(sequence(messages))
    if (count <= 1) expect(grouped).toHaveLength(count)
    else {
      expect(grouped).toHaveLength(1)
      const group = grouped[0]
      if (group?.kind !== 'activityGroup') throw new Error('Missing loaded activity group')
      expect(group.id).toBe('call-0')
      expect(group.rows).toHaveLength(count)
      expect(group.projections).toHaveLength(count)
    }
  }
  const first = call('orphan')
  const orphan = message('orphan-result', [result(first)], { role: 'tool' })
  const recent = groupCompletedSessionActivities(sequence([orphan, settled('following')]))
  expect(recent[0]?.kind).toBe('activityGroup')
  const older = groupCompletedSessionActivities(
    sequence([message('original-call', [first]), orphan, settled('following')]),
  )
  if (older[0]?.kind !== 'activityGroup') throw new Error('Missing joined activity')
  expect(older[0].projections.map(({ message }) => message.id)).toEqual(['original-call', 'following'])
  expect(older[0].rows).toHaveLength(2)
})

test('summary counts action semantics, suppresses zeros and reports exact settled success in both locales', () => {
  const calls = [
    call('generic-a'),
    call('generic-b'),
    call('read', 'file-read'),
    call('write', 'file-write'),
    call('terminal', 'command'),
  ]
  const blocks = calls.flatMap((source, index) => [source, result(source, index === 1 ? 'failed' : 'succeeded')])
  const rows = buildMessageRows(blocks).filter((row) => row.kind === 'thinking' || row.kind === 'tool')
  for (const locale of ['zh-CN', 'en-US'] as const) {
    const labels = getShellCopy(locale).session.messageBlocks
    const summary = messageActivitySummary(rows, labels, createSessionToolPresenter(locale))
    expect(summary.actionCounts).toEqual({
      tool: 2,
      'file-read': 1,
      'file-write': 1,
      'file-edit': 0,
      terminal: 1,
      directory: 0,
      search: 0,
    })
    expect(summary.successRate).toBe(0.8)
    const parts = labels.activity(summary)
    const text = typeof parts === 'string' ? parts : parts.map((part) => part.text).join('')
    expect(text).toBe(
      locale === 'zh-CN'
        ? '工具调用 × 2 · 读取文件 × 1 · 写入文件 × 1 · 执行终端 × 1 · 1 项失败 · 成功率 80%'
        : 'Tool calls × 2 · Read files × 1 · Write files × 1 · Terminal commands × 1 · 1 failed · Success rate 80%',
    )
    expect(text).not.toContain('× 0')
  }
})

test('duplicate tool results are counted once; pending and uncertain outcomes cannot inflate success', () => {
  const source = call('same')
  const row = buildMessageRows([source, result(source)])[0]
  if (row?.kind !== 'tool') throw new Error('Missing settled row')
  const describe = () => ({ category: 'tool' as const, displayName: 'Tool' })
  expect(summarizeMessageActivity([row, row], describe).actionCounts.tool).toBe(1)
  const pending = buildMessageRows([call('pending')])[0]
  if (pending?.kind !== 'tool') throw new Error('Missing pending row')
  expect(summarizeMessageActivity([row, pending], describe).successRate).toBeNull()
  expect(summarizeMessageActivity([], describe).successRate).toBeNull()
  const unknown = buildMessageRows([result(call('unknown'), 'unknown')])[0]
  if (unknown?.kind !== 'tool') throw new Error('Missing uncertain row')
  const summary = summarizeMessageActivity([row, unknown], describe)
  expect(summary.successRate).toBe(0.5)
  expect(summary.failedCount).toBe(0)
  expect(summary.outcomeCounts.unknown).toBe(1)
})

test('settled prefix folds during a running turn while a pending row and confirmation stay visible', () => {
  const a = call('a'),
    b = call('b'),
    pending = call('pending')
  const labels = getShellCopy('zh-CN').session.messageBlocks
  const html = renderToStaticMarkup(
    <HbarMessageBlocks
      sessionId="session"
      messageId="message"
      streaming
      labels={labels}
      blocks={[a, result(a), b, result(b), pending]}
    />,
  )
  expect(html).toContain('工具调用')
  expect(html).toContain('成功率 100%')
  expect(html).not.toContain('data-tool-call-id="a"')
  expect(html).toContain('data-tool-call-id="pending"')
  const emptyDecisions = new Map([[JSON.stringify([a.callId, a.name]), []]])
  const settledHtml = renderToStaticMarkup(
    <HbarMessageBlocks
      sessionId="session"
      messageId="message"
      streaming
      labels={labels}
      blocks={[a, result(a), b, result(b)]}
      toolDecisions={emptyDecisions}
    />,
  )
  expect(settledHtml).not.toContain('data-tool-call-id="a"')
  expect(settledHtml).toContain('aria-expanded="false"')
})
