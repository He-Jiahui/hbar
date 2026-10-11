import { expect, test } from 'bun:test'
import { contextHistoryCopy } from '../apps/web/src/context-history-copy'
import type { ContextCompactionMarker } from '@hbar/contracts/context-history'
import { contextRecord } from './fixtures/context-history'

const startedAt = new Date(2026, 9, 11, 14, 35, 42).getTime()
const details = { startedAt, durationMs: 123456, contextWindow: 150000, beforeTokens: 120000, afterTokens: 7500 }
const marker: ContextCompactionMarker = {
  id: 'completed',
  sessionId: 'session-one',
  seq: 12,
  time: startedAt + 123456,
  trigger: 'automatic',
  details,
}

test('Chinese compaction labels use minutes and seconds, 24-hour start times and actual window occupancy', () => {
  const copy = contextHistoryCopy('zh-CN')
  expect(copy.elapsed(123456)).toBe('· 已进行2分3秒')
  expect(copy.elapsed(0)).toBe('· 已进行0分0秒')
  expect(copy.elapsed(-1000)).toBe('· 已进行0分0秒')
  expect(copy.elapsed(3661000)).toBe('· 已进行61分1秒')
  expect(copy.completed(marker)).toBe('上下文已[自动]压缩 · 共耗时2分3秒')
  expect(copy.completed({ ...marker, trigger: 'manual' })).toBe('上下文已[手动]压缩 · 共耗时2分3秒')
  expect(copy.activeDetails(contextRecord({ startedAt, beforeTokens: 120000, contextWindow: 150000 }))).toEqual([
    '从 14:35:42 开始',
    '从 120,000 tokens(80%) 上下文窗口空间压缩（估算）',
  ])
  expect(copy.completedDetails(marker)).toEqual([
    '从 2026:10:11 14:35:42 开始',
    '从 120,000 tokens(80%) 上下文窗口空间压缩到 7,500 tokens(5%)（估算）',
  ])
  expect(copy.completedDetails({ ...marker, details: { ...details, afterTokens: 1000 } })[1]).toContain(
    '1,000 tokens(0.7%)',
  )
})

test('English and legacy records retain localized measured or unknown values', () => {
  const copy = contextHistoryCopy('en-US')
  expect(copy.elapsed(123456)).toBe('· Elapsed 2m 3s')
  expect(copy.completed(marker)).toBe('Context automatically compacted · Took 2m 3s')
  expect(copy.completedDetails(marker)).toEqual([
    'Started at 2026:10:11 14:35:42',
    'Compacted context window usage from 120,000 tokens(80%) to 7,500 tokens(5%) (estimated)',
  ])
  const legacy: ContextCompactionMarker = {
    id: marker.id,
    sessionId: marker.sessionId,
    seq: marker.seq,
    time: marker.time,
    trigger: marker.trigger,
  }
  expect(copy.completed(legacy)).toBe('Context automatically compacted · Took Unknown')
  expect(copy.completedDetails(legacy).join('\n')).not.toContain('1970')
  expect(copy.completedDetails(legacy).join('\n')).toContain('Unknown')
  expect(copy.completed({ ...marker, details: { ...details, durationMs: null } })).toContain('Took Unknown')
})
