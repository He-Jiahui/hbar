import { describe, expect, test } from 'bun:test'
import { PROCESS_OUTPUT_LIMITS, ProcessOutputRing } from './process-output-ring'

describe('managed process output IPC ring', () => {
  test('keeps UTF-8 chunks within byte and page limits and resumes in sequence', () => {
    const ring = new ProcessOutputRing()
    ring.append('界'.repeat(30_000))
    const first = ring.read(0, true)
    expect(first.items.length).toBeLessThanOrEqual(PROCESS_OUTPUT_LIMITS.pageFrames)
    expect(first.items.every((item) => Buffer.byteLength(item.text) <= PROCESS_OUTPUT_LIMITS.chunkBytes)).toBe(true)
    const last = first.items.at(-1)
    if (!last) throw new Error('Expected a retained output frame')
    expect(first.cursor).toBe(last.seq)
    expect(ring.read(first.cursor, false).items[0]?.seq).toBe(first.cursor + 1)
  })

  test('bounds tiny frame count and signals cursor reset after eviction', () => {
    const ring = new ProcessOutputRing()
    for (let index = 0; index < PROCESS_OUTPUT_LIMITS.retainedFrames + 10; index++) ring.append('x')
    expect(ring.retainedFrames).toBe(PROCESS_OUTPUT_LIMITS.retainedFrames)
    expect(ring.retainedBytes).toBe(PROCESS_OUTPUT_LIMITS.retainedFrames)
    expect(ring.read(0, true).reset).toBe(true)
    expect(() => ring.read(Number.MAX_SAFE_INTEGER, true)).toThrow()
  })
})
