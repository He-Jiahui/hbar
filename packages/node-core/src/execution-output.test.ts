import { describe, expect, test } from 'bun:test'
import { NodeExecutionOutputBuffer, NODE_EXEC_OUTPUT_LIMITS } from './execution-output'

describe('node process output replay window', () => {
  test('splits bounded UTF-8 frames, deduplicates by sequence, and resumes from an acknowledged cursor', () => {
    const notifications: Array<{ seq: number; text: string }> = []
    const output = new NodeExecutionOutputBuffer('run:call', (chunk) => notifications.push(chunk))
    output.grant({ streamId: output.streamId, throughSeq: 0, bytes: 16_384 })
    output.append('λ'.repeat(5_000))

    expect(notifications.length).toBeGreaterThan(1)
    expect(notifications.every((chunk, index) => chunk.seq === index + 1)).toBe(true)
    expect(notifications.every((chunk) => Buffer.byteLength(chunk.text) <= NODE_EXEC_OUTPUT_LIMITS.chunkBytes)).toBe(
      true,
    )
    const pageItems = output.read(0).items.map(({ seq, text }) => ({ seq, text }))
    expect(pageItems).toEqual(notifications.map(({ seq, text }) => ({ seq, text })))
    const firstNotification = notifications[0]
    if (!firstNotification) throw new Error('Expected a first output notification')
    expect(output.read(firstNotification.seq).items[0]?.seq).toBe(2)
  })

  test('reports a reset after retention advances and reports terminal independently from the final receipt', () => {
    const output = new NodeExecutionOutputBuffer('run:overflow', () => undefined)
    output.append('x'.repeat(NODE_EXEC_OUTPUT_LIMITS.retainedBytes + 20_000))
    expect(output.bytes).toBeLessThanOrEqual(NODE_EXEC_OUTPUT_LIMITS.retainedBytes)
    expect(output.read(0).reset).toBe(true)
    expect(() => output.read(Number.MAX_SAFE_INTEGER - 1)).toThrow()
    output.finish()
    const latest = output.read(output.read(0).cursor)
    expect(latest.terminal).toBe(true)
  })

  test('propagates an upstream process-ring reset before the retained tail', () => {
    const output = new NodeExecutionOutputBuffer('run:upstream-reset', () => undefined)
    output.reset()
    output.append('retained tail')
    const page = output.read(0)
    expect(page.reset).toBe(true)
    expect(page.items.map((item) => item.text).join('')).toBe('retained tail')
    expect(output.read(page.cursor).reset).toBe(false)
  })

  test('rejects stale stream generations and out-of-range or oversized credits', () => {
    const output = new NodeExecutionOutputBuffer('run:credit', () => undefined)
    expect(() => output.grant({ streamId: crypto.randomUUID(), throughSeq: 0, bytes: 1 })).toThrow()
    expect(() =>
      output.grant({ streamId: output.streamId, throughSeq: 0, bytes: NODE_EXEC_OUTPUT_LIMITS.maxCreditBytes + 1 }),
    ).toThrow()
    expect(() => output.grant({ streamId: output.streamId, throughSeq: 1, bytes: 1 })).toThrow()
  })

  test('bounds tiny frame counts and notification rate even when the reader is slow', () => {
    const notifications: unknown[] = []
    const output = new NodeExecutionOutputBuffer('run:tiny', (chunk) => notifications.push(chunk))
    output.grant({ streamId: output.streamId, throughSeq: 0, bytes: NODE_EXEC_OUTPUT_LIMITS.maxCreditBytes })
    for (let index = 0; index < NODE_EXEC_OUTPUT_LIMITS.retainedFrames + 100; index++) output.append('x')
    expect(output.bytes).toBeLessThanOrEqual(NODE_EXEC_OUTPUT_LIMITS.retainedBytes)
    expect(output.read(0).items.length).toBeLessThanOrEqual(NODE_EXEC_OUTPUT_LIMITS.readFrames)
    expect(output.read(0).reset).toBe(true)
    expect(notifications.length).toBeLessThanOrEqual(NODE_EXEC_OUTPUT_LIMITS.notificationFramesPerWindow)
    expect(() => output.grant({ streamId: output.streamId, throughSeq: 0, bytes: 1 })).toThrow()
  })
})
