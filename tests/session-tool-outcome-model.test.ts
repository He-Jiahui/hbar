import { expect, test } from 'bun:test'
import {
  buildMessageRows,
  projectSessionMessages,
  type SessionMessage,
  type SessionMessageBlock,
  type SessionToolResult,
  type SessionToolRow,
} from '../packages/app-react/src/session-message-model'
import {
  MAX_TOOL_ERROR_PREVIEW_CHARACTERS,
  MAX_TOOL_ERROR_PREVIEW_SCAN_CHARACTERS,
  sessionToolOutcome,
  toolErrorPreview,
  toolOutcomeCounts,
  type ToolDisplayOutcome,
} from '../packages/app-react/src/session-tool-outcome-model'

const kinds = ['succeeded', 'failed', 'denied', 'cancelled', 'interrupted', 'unknown'] as const

function result(kind?: (typeof kinds)[number], text = 'original output'): SessionToolResult {
  return {
    type: 'tool_result',
    callId: 'call',
    name: 'write_file',
    text,
    isError: kind !== 'succeeded',
    ...(kind ? { outcome: { kind, executionStarted: true } } : {}),
  }
}

function message(content: SessionMessageBlock[], overrides: Partial<SessionMessage> = {}): SessionMessage {
  return {
    id: 'message',
    sessionId: 'session',
    runId: 'run',
    seq: 1,
    role: 'assistant',
    content,
    createdAt: 1,
    ...overrides,
  }
}

function rows(messages: readonly SessionMessage[]): readonly SessionToolRow[] {
  return projectSessionMessages(messages).flatMap((projection) =>
    buildMessageRows(projection.blocks, projection.results).filter((row) => row.kind === 'tool'),
  )
}

test('projects all six canonical outcomes, explicit legacy evidence, and pending without guessing', () => {
  for (const kind of kinds) expect(sessionToolOutcome(result(kind))).toBe(kind)
  expect(sessionToolOutcome(result())).toBe('legacy-error')
  expect(sessionToolOutcome({ ...result(), isError: false })).toBe('legacy-result')
  expect(sessionToolOutcome(undefined)).toBe('pending')
  for (const text of ['User denied the tool call', 'USER_CANCELLED', 'Failed', 'success', 'Run interrupted']) {
    const spoof = { ...result(undefined, text), details: { outcome: { kind: 'cancelled' }, code: 'USER_CANCELLED' } }
    expect(sessionToolOutcome(spoof)).toBe('legacy-error')
    expect(sessionToolOutcome({ ...spoof, isError: false })).toBe('legacy-result')
    expect(sessionToolOutcome({ ...spoof, outcome: { kind: 'failed', executionStarted: false } })).toBe('failed')
  }
})

test('counts each already-projected row once and only canonical failure in failed', () => {
  const values: readonly (SessionToolResult | undefined)[] = [
    ...kinds.map((kind) => result(kind)),
    result(),
    { ...result(), isError: false },
    undefined,
  ]
  const input = values.map((value, index): SessionToolRow => ({
    kind: 'tool',
    id: String(index),
    name: 'write_file',
    ...(value ? { result: value } : {}),
  }))
  const counts = toolOutcomeCounts(input)
  expect(counts).toEqual({
    succeeded: 1,
    failed: 1,
    denied: 1,
    cancelled: 1,
    interrupted: 1,
    unknown: 1,
    'legacy-error': 1,
    'legacy-result': 1,
    pending: 1,
  })
  expect(Object.values(toolOutcomeCounts([]))).toEqual(Array.from({ length: 9 }, () => 0))
  expect(toolOutcomeCounts(input).failed).toBe(1)
  expect(values[0]?.text).toBe('original output')
})

test('existing canonical joins preserve exact session/run/name and first duplicate result', () => {
  const call: SessionMessageBlock = { type: 'tool_call', callId: 'call', name: 'write_file', args: {} }
  const cancelled = result('cancelled')
  const projected = rows([
    message([call, call]),
    message([cancelled, result('failed')], { id: 'result', role: 'tool', seq: 2 }),
    message([result('failed')], { id: 'other-run', runId: 'other-run', role: 'tool' }),
    message([result('denied')], { id: 'other-session', sessionId: 'other-session', role: 'tool' }),
    message([{ ...result('unknown'), name: 'different_tool' }], { id: 'other-tool', role: 'tool' }),
    message([result('failed')], { id: 'result', role: 'tool', seq: 2 }),
  ])
  expect(projected).toHaveLength(4)
  expect(projected[0]?.result).toBe(cancelled)
  expect(projected.map((row) => sessionToolOutcome(row.result))).toEqual(['cancelled', 'failed', 'denied', 'unknown'])
  expect(toolOutcomeCounts(projected).failed).toBe(1)
})

test('paged orphan and newly loaded call have the same outcome without duplicate counts or hidden page caps', () => {
  const orphan = message([result('interrupted')], { id: 'result', role: 'tool', seq: 2 })
  const call = message([{ type: 'tool_call', callId: 'call', name: 'write_file', args: {} }])
  expect(toolOutcomeCounts(rows([orphan])).interrupted).toBe(1)
  const paired = rows([call, orphan])
  expect(paired).toHaveLength(1)
  expect(paired[0]?.call?.callId).toBe('call')
  expect(toolOutcomeCounts(paired).interrupted).toBe(1)
  for (const count of [0, 1, 100, 101]) {
    const page = Array.from({ length: count }, (_, index) =>
      message([{ ...result('cancelled'), callId: `call-${index}` }], { id: `message-${index}`, seq: index + 1 }),
    )
    expect(rows(page)).toHaveLength(count)
    expect(toolOutcomeCounts(rows(page)).cancelled).toBe(count)
    expect(toolOutcomeCounts(rows(page)).failed).toBe(0)
  }
})

test('error preview only exposes diagnostics for failed or incomplete legacy errors', () => {
  const previewKinds: readonly ToolDisplayOutcome[] = ['failed', 'legacy-error']
  for (const kind of kinds) {
    expect(toolErrorPreview(result(kind, 'diagnostic'))).toBe(previewKinds.includes(kind) ? 'diagnostic' : '')
  }
  expect(toolErrorPreview(result(undefined, 'legacy diagnostic'))).toBe('legacy diagnostic')
  expect(toolErrorPreview({ ...result(undefined, 'not a failure'), isError: false })).toBe('')
  expect(toolErrorPreview(undefined)).toBe('')
})

test('preview uses the first nonempty normalized line, strips ANSI and leaves raw output intact', () => {
  const cases = [
    ['', ''],
    [' \r\n\t\n', ''],
    ['x', 'x'],
    ['\r\n  first\t  line \r\nsecond', 'first line'],
    ['\u001b[31m\r\n  denied \u001b[0m   here\r\nnext', 'denied here'],
    ['\u001b]8;;https://example.invalid/private\u0007link\u001b]8;;\u0007 failed', 'link failed'],
    ['\u001b]title\u001b\\error\u001bPprivate payload\u001b\\ text', 'error text'],
    ['\u009b31merror\u009b0m\u009dprivate\u009c text', 'error text'],
    ['\u001b(Berror\u0000\u0007 text', 'error text'],
    ['\u001b[31', ''],
    ['\u001b]unclosed secret', ''],
  ] as const
  for (const [text, expected] of cases) {
    const value = result('failed', text)
    expect(toolErrorPreview(value)).toBe(expected)
    expect(value.text).toBe(text)
  }
})

test('a complete visible line is never shortened at the old 72-character caption width', () => {
  for (const character of ['a', '中', '😀', 'e\u0301', '👨‍👩‍👧‍👦']) {
    for (const length of [0, 1, 71, 72, 73, 160, 161, 300])
      expect(toolErrorPreview(result('failed', character.repeat(length)))).toBe(character.repeat(length))
  }
})

test('huge whitespace and escape payloads have a bounded scan and never copy the full raw result', () => {
  const limit = MAX_TOOL_ERROR_PREVIEW_SCAN_CHARACTERS
  expect(toolErrorPreview(result('failed', 'x'.repeat(MAX_TOOL_ERROR_PREVIEW_CHARACTERS)))).toBe('x'.repeat(limit))
  expect(toolErrorPreview(result('failed', 'x'.repeat(1_000_000)))).toBe('')
  expect(toolErrorPreview(result('failed', 'x'.repeat(1_000_000)), '查看完整内容')).toBe(
    'x'.repeat(limit) + ' · 查看完整内容',
  )
  expect(toolErrorPreview(result('failed', '\n'.repeat(limit) + 'outside the inspected prefix'))).toBe('')
  expect(toolErrorPreview(result('failed', '\u001b]' + 'secret'.repeat(100_000) + '\u0007failure'))).toBe('')
  expect(toolErrorPreview(result('failed', 'x' + ' '.repeat(limit) + 'not fully inspected'))).toBe('')
  expect(toolErrorPreview(result('failed', 'x' + ' '.repeat(limit) + 'not fully inspected'), 'View full content')).toBe(
    'x · View full content',
  )
  expect(toolErrorPreview(result('failed', '\n'.repeat(limit - 1) + 'x'))).toBe('x')
  expect(toolErrorPreview(result('failed', '\n'.repeat(limit - 1) + '😀'))).toBe('')
})
