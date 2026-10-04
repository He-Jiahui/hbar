import { expect, test } from 'bun:test'
import { sessionTimeCopy } from '../apps/web/src/session-time-copy'

test('sidebar time stays compact across elapsed-time boundaries in both locales', () => {
  const now = Date.UTC(2026, 8, 27, 12)
  const en = sessionTimeCopy('en-US')
  const zh = sessionTimeCopy('zh-CN')
  expect(en.compact(now, now)).toBe('now')
  expect(zh.compact(now - 59_000, now)).toBe('刚刚')
  expect(en.compact(now - 60_000, now)).toBe('1m')
  expect(zh.compact(now - 3_600_000, now)).toBe('1 小时')
  expect(en.compact(now - 86_400_000, now)).toBe('1d')
  expect(en.compact(now - 604_800_000, now)).toBe('Sep 20')
  expect(en.compact(Date.UTC(2025, 11, 31), now)).toContain('2025')
  expect(en.compact(now + 60_000, now)).toBe('now')
})

test('sidebar time has a localized full tooltip and safe invalid fallback', () => {
  const timestamp = Date.UTC(2026, 8, 27, 12)
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const copy = sessionTimeCopy(locale)
    expect(copy.full(timestamp)).toContain('2026')
    expect(copy.full(timestamp)).toContain('27')
    expect(copy.compact(Number.NaN)).toBe(locale === 'en-US' ? 'Unknown' : '时间未知')
    expect(copy.full(Number.MAX_SAFE_INTEGER)).toBe(locale === 'en-US' ? 'Update time unavailable' : '更新时间未知')
  }
})
