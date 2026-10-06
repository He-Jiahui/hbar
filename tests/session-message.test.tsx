import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenMessage } from '@lumen/app-ui'
import { HbarMessageActionBar, HbarMessageBlocks } from '../packages/app-react/src/session-message'
import { SessionToolDetails } from '../packages/app-react/src/session-tool-details'
import {
  buildMessageRows,
  projectSessionMessages,
  thinkingPreview,
  toolInputText,
  type SessionMessageBlock,
} from '../packages/app-react/src/session-message-model'
import { describeFixtureTool, messageBlocks, messageLabels, sessionMessage } from './session-message.fixtures'
import { MAX_TOOL_RESULT_COPY_CHARACTERS } from '../packages/app-react/src/tool-result-copy'

function toolRow(blocks: readonly SessionMessageBlock[]) {
  const row = buildMessageRows(blocks)[0]
  if (row?.kind !== 'tool') throw new Error('Expected original tool row')
  return row
}

test('a Host-supplied tool action stays beside a collapsed disclosure and never nests its button', () => {
  const html = renderToStaticMarkup(
    <HbarMessageBlocks
      sessionId="parent"
      messageId="source-message"
      blocks={[
        { type: 'thinking', text: 'Investigating' },
        { type: 'tool_call', name: 'agent', callId: 'call', args: {} },
      ]}
      labels={messageLabels('zh-CN').blocks}
      renderToolAction={(row) => (row.call?.callId === 'call' ? <button>打开原子任务并保留当前草稿</button> : null)}
    />,
  )
  expect(html).toContain('hbar-session-disclosure-heading')
  expect(html).toContain('打开原子任务并保留当前草稿')
  expect(html).toContain('aria-expanded="false"')
  expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/)
})

test('output copy belongs beside its result, not input, thinking, reply text, or a missing output', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = messageLabels(locale).blocks
    for (const text of ['', ' \r\n\t', 'one', '错误详情\nretry safely']) {
      const html = renderToStaticMarkup(
        <SessionToolDetails
          sessionId="original-session"
          messageId="original-message"
          row={toolRow([
            { type: 'tool_call', callId: 'original-call', name: 'Read', args: { content: 'not the copy source' } },
            { type: 'tool_result', callId: 'original-call', name: 'Read', text, isError: true },
          ])}
          labels={labels}
        />,
      )
      expect(html).toContain('data-tool-call-id="original-call"')
      expect(html).toContain('data-tool-name="Read"')
      expect(html).toContain('hbar-session-tool-result-heading')
      expect(html.includes(labels.toolResultCopy.copy)).toBe(Boolean(text.trim()))
      expect(html.split('hbar-session-tool-result-copy-action').length - 1).toBe(text.trim() ? 1 : 0)
    }
    const missing = renderToStaticMarkup(
      <SessionToolDetails
        sessionId="s"
        messageId="m"
        row={toolRow([{ type: 'tool_call', callId: 'pending', name: 'Read', args: {} }])}
        labels={labels}
      />,
    )
    expect(missing).not.toContain('hbar-session-tool-result-copy-action')
  }
})

test('copy capacity is separate from the 12k preview and never silently copies a truncated result', () => {
  const labels = messageLabels('zh-CN').blocks
  for (const length of [1, 12_000, 12_001, MAX_TOOL_RESULT_COPY_CHARACTERS, MAX_TOOL_RESULT_COPY_CHARACTERS + 1]) {
    const html = renderToStaticMarkup(
      <SessionToolDetails
        sessionId="s"
        messageId="m"
        row={toolRow([
          { type: 'tool_result', callId: 'orphan', name: 'Read', text: 'x'.repeat(length), isError: true },
        ])}
        labels={labels}
      />,
    )
    expect(html).toContain(labels.toolResultCopy.copy)
    expect(html.includes(labels.showFullContent)).toBe(length > 12_000)
    expect(html.includes('data-copy-status="too_large"')).toBe(length > MAX_TOOL_RESULT_COPY_CHARACTERS)
    expect(html.includes(labels.toolResultCopy.tooLarge(MAX_TOOL_RESULT_COPY_CHARACTERS))).toBe(
      length > MAX_TOOL_RESULT_COPY_CHARACTERS,
    )
    expect(html.length).toBeLessThan(20_000)
  }
})

test('a tool-decision sibling remains visible beside collapsed details with a target-bound output action', () => {
  const result = {
    type: 'tool_result' as const,
    callId: 'decision-call',
    name: 'Plan',
    text: 'saved plan',
    isError: true,
  }
  const rows = buildMessageRows([result])
  const row = rows[0]
  if (!row) throw new Error('Expected tool row')
  const html = renderToStaticMarkup(
    <HbarMessageBlocks
      sessionId="s"
      messageId="m"
      blocks={[result]}
      labels={messageLabels('en-US').blocks}
      toolDecisions={new Map([[row.id, <span key="decision">Test-owned decision</span>]])}
    />,
  )
  expect(html).toContain('hbar-session-tool-decision')
  expect(html).toContain('data-tool-call-id="decision-call"')
  expect(html).toContain('aria-expanded="false"')
  expect(html).not.toContain('Copy output')
  expect(html).toContain('Test-owned decision')
  const details = renderToStaticMarkup(
    <SessionToolDetails sessionId="s" messageId="m" row={toolRow([result])} labels={messageLabels('en-US').blocks} />,
  )
  expect(details).toContain('data-tool-call-id="decision-call"')
  expect(details).toContain('Copy output')
})

test('tool rows join call and result once, retain mismatched and orphan results, and ignore duplicate IDs', () => {
  const call = { type: 'tool_call' as const, callId: 'call', name: 'Custom', args: { value: 1 } }
  const result = { type: 'tool_result' as const, callId: 'call', name: 'Custom', text: 'first result', isError: false }
  const rows = buildMessageRows([call, call, result, { ...result, text: 'duplicate' }, { ...result, name: 'Other' }])
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({ kind: 'tool', call, result })
  expect(rows[1]).toMatchObject({ kind: 'tool', name: 'Other', result: { text: 'first result' } })
  expect(buildMessageRows([])).toEqual([])
  expect(
    buildMessageRows([
      { type: 'thinking', text: ' ' },
      { type: 'text', text: '' },
    ]),
  ).toEqual([])
})

test('cross-message results join only their session and run; later unrelated prose remains', () => {
  const call = { type: 'tool_call' as const, callId: 'call', name: 'Read', args: { path: 'original' } }
  const result = { type: 'tool_result' as const, callId: 'call', name: 'Read', text: 'correct', isError: false }
  const messages = [
    sessionMessage([call]),
    sessionMessage([result], { id: 'result', role: 'tool' }),
    sessionMessage([{ ...result, text: 'wrong run' }], { id: 'wrong-run', runId: 'other-run', role: 'tool' }),
    sessionMessage([{ ...result, text: 'wrong session' }], {
      id: 'wrong-session',
      sessionId: 'other-session',
      role: 'tool',
    }),
    sessionMessage(
      [
        { ...result, name: 'Different' },
        { type: 'text', text: 'Preserved prose' },
      ],
      { id: 'other-tool', role: 'tool' },
    ),
  ]
  const projection = projectSessionMessages(messages)
  expect(projection).toHaveLength(4)
  expect(projection[0]?.results).toEqual([result])
  expect(projection.map((item) => item.message.id)).not.toContain('result')
  expect(projection[1]?.blocks[0]).toMatchObject({ text: 'wrong run' })
  expect(projection[2]?.blocks[0]).toMatchObject({ text: 'wrong session' })
  expect(projection[3]?.blocks[1]).toMatchObject({ text: 'Preserved prose' })
})

test('a paged orphan remains visible until its real call arrives, with deterministic duplicate message handling', () => {
  const result = { type: 'tool_result' as const, callId: 'call', name: 'Read', text: 'result', isError: false }
  const resultMessage = sessionMessage([result], { id: 'result', role: 'tool' })
  expect(projectSessionMessages([resultMessage])[0]?.blocks).toEqual([result])
  const call = sessionMessage([{ type: 'tool_call', callId: 'call', name: 'Read', args: {} }])
  const projected = projectSessionMessages([
    call,
    { ...call, content: [{ type: 'text', text: 'duplicate' }] },
    resultMessage,
  ])
  expect(projected).toHaveLength(1)
  expect(projected[0]?.results).toEqual([result])
  expect(projected[0]?.message).toBe(call)
})

test('projection retains the host page boundary and over-bound records without a hidden item cap', () => {
  for (const count of [0, 1, 100, 101]) {
    const messages = Array.from({ length: count }, (_, index) =>
      sessionMessage([{ type: 'text', text: `message-${index}` }], { id: `message-${index}` }),
    )
    expect(projectSessionMessages(messages)).toHaveLength(count)
  }
})

test('empty continuation envelopes do not render blank human bubbles or remove real activity', () => {
  const messages = [
    sessionMessage([{ type: 'text', text: '  ' }], { id: 'continuation', role: 'user' }),
    sessionMessage([], { id: 'empty', role: 'assistant' }),
    sessionMessage([{ type: 'thinking', text: 'Checking the active goal' }], { id: 'thought' }),
    sessionMessage([{ type: 'tool_call', callId: 'goal-call', name: 'inspect', args: {} }], { id: 'tool' }),
  ]
  expect(projectSessionMessages(messages).map(({ message }) => message.id)).toEqual(['thought', 'tool'])
})

test('finished activity is a light collapsed summary while active activity exposes compact rows', () => {
  const props = {
    sessionId: 'session',
    messageId: 'reply',
    blocks: messageBlocks,
    labels: messageLabels('zh-CN').blocks,
    describeTool: describeFixtureTool,
  }
  const finished = renderToStaticMarkup(<HbarMessageBlocks {...props} />)
  expect(finished).toContain('思考 1 次，执行 2 个工具')
  expect(finished).toContain('aria-expanded="false"')
  expect(finished).toContain('草稿与会话位置保持不变。')
  expect(finished).not.toContain('输入参数')
  const active = renderToStaticMarkup(<HbarMessageBlocks {...props} streaming />)
  expect(active).toContain('aria-expanded="true"')
  expect(active).toContain('正在思考')
  expect(active).toContain('/workspace/src/composer.tsx')
  expect(active).toContain('已有结果')
  expect(active).not.toContain('3 tests passed')
})

test('single legacy error tools start collapsed with safe preview and separately available fallback details', () => {
  const blocks: SessionMessageBlock[] = [
    { type: 'tool_call', callId: 'unknown', name: 'plugin.arbitrary', args: { '<script>': '<unsafe>' } },
    { type: 'tool_result', callId: 'unknown', name: 'plugin.arbitrary', text: 'safe failure', isError: true },
  ]
  const html = renderToStaticMarkup(
    <HbarMessageBlocks
      sessionId="session"
      messageId="message"
      blocks={blocks}
      labels={messageLabels('zh-CN').blocks}
    />,
  )
  expect(html).toContain('safe failure')
  expect(html).toContain('未完成')
  expect(html).toContain('data-outcome="legacy-error"')
  expect(html).toContain('aria-expanded="false"')
  expect(html).not.toContain('输入参数')
  expect(html).not.toContain('<script>')
  expect(html.match(/aria-expanded=/g)).toHaveLength(1)
  const details = renderToStaticMarkup(
    <SessionToolDetails
      sessionId="session"
      messageId="message"
      row={toolRow(blocks)}
      labels={messageLabels('zh-CN').blocks}
    />,
  )
  expect(details).toContain('输入参数')
  expect(details).toContain('&lt;script&gt;')
  expect(details).not.toContain('<script>')
  const cyclic: { self?: unknown } = {}
  cyclic.self = cyclic
  expect(toolInputText(cyclic, '不可显示')).toBe('不可显示')
})

test('thinking previews follow the latest stream line and return to the opening line once settled', () => {
  expect(thinkingPreview('## Opening\n\n- Latest line', false)).toBe('Opening')
  expect(thinkingPreview('## Opening\n\n- Latest line', true)).toBe('Latest line')
  for (const length of [159, 160, 161, 1000]) {
    const text = '😀'.repeat(length)
    expect(thinkingPreview(text, false)).toBe(text)
    expect(thinkingPreview(`Opening\n${text}`, true)).toBe(text)
  }
  expect(thinkingPreview('', false)).toBe('')
})

test('message prose is sanitized and empty messages do not invent controls', () => {
  const labels = messageLabels('zh-CN')
  const html = renderToStaticMarkup(
    <HbarMessageBlocks
      sessionId="session"
      messageId="message"
      blocks={[{ type: 'text', text: '**安全** <script>unsafe()</script> [bad](javascript:alert(1))' }]}
      labels={labels.blocks}
    />,
  )
  expect(html).toContain('<strong>安全</strong>')
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('href="javascript:')
  expect(
    renderToStaticMarkup(
      <HbarMessageActionBar sessionId="session" messageId="message" content={[]} labels={labels.actions} />,
    ),
  ).toBe('')
  const actions = renderToStaticMarkup(
    <HbarMessageActionBar
      sessionId="session"
      messageId="message"
      content={[{ type: 'text', text: 'reply' }]}
      labels={{ ...labels.actions, copy: '复制此条已经完成的助手回复并保留原始格式' }}
    />,
  )
  expect(actions).toContain('复制此条已经完成的助手回复并保留原始格式')
  expect(actions).not.toContain('fork')
  expect(actions).toContain('data-lumen-indicator="none"')
})

test('Lumen card remains the default while transcript removes repeated chrome and accepts host actions', () => {
  const props = { id: 'message', role: 'assistant' as const, author: '助手', avatar: 'AI', copyLabel: '旧复制' }
  const legacy = renderToStaticMarkup(
    <LumenMessage {...props} onCopy={() => {}}>
      <p>正文</p>
    </LumenMessage>,
  )
  expect(legacy).toContain('data-material="frost"')
  expect(legacy).toContain('lumen-message-avatar')
  expect(legacy).toContain('旧复制')
  const transcript = renderToStaticMarkup(
    <LumenMessage {...props} appearance="transcript" actions={<button>新的消息操作</button>} onCopy={() => {}}>
      <p>正文</p>
    </LumenMessage>,
  )
  expect(transcript).toContain('aria-label="助手"')
  expect(transcript).toContain('新的消息操作')
  expect(transcript).not.toContain('旧复制')
  expect(transcript).not.toContain('data-material=')
  expect(transcript).not.toContain('lumen-message-avatar')
  const suppressed = renderToStaticMarkup(
    <LumenMessage {...props} actions={null} onCopy={() => {}}>
      <p>正文</p>
    </LumenMessage>,
  )
  expect(suppressed).not.toContain('<footer>')
})
