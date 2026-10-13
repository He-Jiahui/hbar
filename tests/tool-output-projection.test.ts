import { expect, test } from 'bun:test'
import { projectToolOutput } from '../packages/app-runtime/src/session-timeline'

const streamId = 'b3efc554-09d3-47f5-aa42-8974982577cf'
const empty = { sessionId: 's', toolOutputs: {} }
const chunk = (
  seq: number,
  text: string,
  extra: Partial<import('@hbar/contracts').ToolOutputNotification> = {},
): import('@hbar/contracts').ToolOutputNotification => ({
  sessionId: 's',
  runId: 'r',
  callId: 'c',
  streamId,
  seq,
  text,
  ...extra,
})

test('tool output projection fences duplicates, resets gaps/generations, and bounds live tails', () => {
  const first = projectToolOutput(empty, chunk(1, 'one'))
  expect(first.toolOutputs['r:c']?.text).toBe('one')
  expect(projectToolOutput(first, chunk(1, 'duplicate'))).toBe(first)
  const second = projectToolOutput(first, chunk(2, ' two'))
  expect(second.toolOutputs['r:c']?.text).toBe('one two')

  const gap = projectToolOutput(second, chunk(4, ' tail'))
  expect(gap.toolOutputs['r:c']).toMatchObject({ seq: 4, text: ' tail', reset: true, reason: 'gap' })
  const generation = projectToolOutput(gap, chunk(1, 'new generation', { streamId: crypto.randomUUID() }))
  expect(generation.toolOutputs['r:c']).toMatchObject({ seq: 1, text: 'new generation', reset: true, reason: 'gap' })

  const bounded = projectToolOutput(empty, chunk(1, '界'.repeat(30_000)))
  expect(new TextEncoder().encode(bounded.toolOutputs['r:c']?.text ?? '').byteLength).toBeLessThanOrEqual(64 * 1024)
  expect(bounded.toolOutputs['r:c']?.reason).toBe('limited')

  let operations: ReturnType<typeof projectToolOutput> = empty
  for (let index = 0; index < 70; index++)
    operations = projectToolOutput(operations, chunk(1, 'x', { callId: `call-${index}` }))
  expect(Object.keys(operations.toolOutputs)).toHaveLength(64)
  expect(operations.toolOutputs['r:call-0']).toBeUndefined()
})

test('UTF-8 tail truncation keeps code points whole without depending on Node Buffer', () => {
  const originalBuffer = Object.getOwnPropertyDescriptor(globalThis, 'Buffer')
  try {
    Object.defineProperty(globalThis, 'Buffer', { configurable: true, value: undefined })
    const projected = projectToolOutput(empty, chunk(1, `${'x'.repeat(65_535)}界`))
    const text = projected.toolOutputs['r:c']?.text ?? ''
    expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(64 * 1024)
    expect(text.endsWith('界')).toBe(true)
    expect(projected.toolOutputs['r:c']?.reason).toBe('limited')
  } finally {
    if (originalBuffer) Object.defineProperty(globalThis, 'Buffer', originalBuffer)
    else Reflect.deleteProperty(globalThis, 'Buffer')
  }
})

test('tool output reset markers clear the live tail and wrong sessions are ignored', () => {
  const first = projectToolOutput(empty, chunk(1, 'old'))
  const reset = projectToolOutput(first, chunk(8, '', { reset: true, reason: 'retention' }))
  expect(reset.toolOutputs['r:c']).toMatchObject({ seq: 8, text: '', reset: true, reason: 'retention' })
  const latest = projectToolOutput(projectToolOutput(first, chunk(2, 'middle')), chunk(3, ' latest'))
  const freshGeneration = projectToolOutput(
    latest,
    chunk(0, 'new baseline', { streamId: crypto.randomUUID(), reset: true, reason: 'retention' }),
  )
  expect(freshGeneration.toolOutputs['r:c']).toMatchObject({
    seq: 0,
    text: 'new baseline',
    reset: true,
    reason: 'retention',
  })
  expect(projectToolOutput(latest, chunk(1, '', { reset: true, reason: 'retention' }))).toBe(latest)
  const resetWithText = projectToolOutput(first, chunk(2, 'new tail', { reset: true, reason: 'retention' }))
  expect(resetWithText.toolOutputs['r:c']).toMatchObject({ seq: 2, text: 'new tail', reset: true, reason: 'retention' })
  expect(projectToolOutput(reset, chunk(1, 'foreign', { sessionId: 'other' }))).toBe(reset)
})
