import { expect, test } from 'bun:test'
import { assessInputCache, inputCacheHitRate, UsageService, type UsageReadRow } from '@hbar/usage'
import { emptyUsage } from '@hbar/contracts'

test('input cache ratio uses inclusive input and weights by tokens, including cold requests', () => {
  expect(
    inputCacheHitRate([
      { input: 100, cacheRead: 0 },
      { input: 900, cacheRead: 810 },
    ]),
  ).toMatchObject({
    value: 0.81,
    sampleCount: 2,
    availability: 'available',
    estimated: false,
  })
  expect(inputCacheHitRate([{ input: 107411, cacheRead: 11520 }]).value).toBeCloseTo(0.107251585, 8)
})

test('ten recent requests each meet 95%, while total including cold exceeds 90%', () => {
  const cold = { input: 100_000, cacheRead: 0 }
  const warm = Array.from({ length: 11 }, () => ({ input: 100_000, cacheRead: 99_000 }))
  const samples = [cold, ...warm]
  expect(inputCacheHitRate(samples).value).toBeCloseTo(0.9075)
  expect(assessInputCache(samples)).toMatchObject({
    status: 'healthy',
    sampleCount: 10,
    recentMinimum: 0.99,
    belowMinimum: 0,
    belowTarget: 0,
  })
})

test('a high weighted average cannot conceal a bad recent request or insufficient evidence', () => {
  const good = Array.from({ length: 10 }, () => ({ input: 1_000_000, cacheRead: 990_000 }))
  expect(assessInputCache(good.slice(0, 9)).status).toBe('insufficient')
  expect(assessInputCache([...good, { input: 100, cacheRead: 89 }])).toMatchObject({
    status: 'below-minimum',
    belowMinimum: 1,
    belowTarget: 1,
  })
  expect(assessInputCache([...good, { input: 100, cacheRead: 94 }])).toMatchObject({
    status: 'below-target',
    belowMinimum: 0,
    belowTarget: 1,
  })
  expect(assessInputCache([...good, { input: 100, cacheRead: 95 }]).status).toBe('healthy')
  expect(assessInputCache(good, true).status).toBe('unavailable')
})

test('empty and inconsistent provider counters never manufacture a healthy cache rate', () => {
  expect(inputCacheHitRate([])).toMatchObject({ value: null, availability: 'empty' })
  for (const sample of [
    { input: 0, cacheRead: 0 },
    { input: 1, cacheRead: 2 },
    { input: NaN, cacheRead: 0 },
    { input: 100, cacheRead: -1 },
  ]) {
    expect(inputCacheHitRate([sample])).toMatchObject({ value: null, availability: 'unavailable' })
    expect(assessInputCache([sample]).status).toBe('unavailable')
  }
})

test('public usage reports retain cold samples, actual ratios and recent quality without cache eligibility', async () => {
  const rows: UsageReadRow[] = Array.from({ length: 12 }, (_, index) => ({
    workspaceId: 'workspace',
    parentSessionId: null,
    run: null,
    event: {
      eventId: `usage-${index}`,
      sessionId: 'session',
      runId: null,
      stepId: `step-${index}`,
      seq: index + 1,
      time: 1000 + index,
      version: 1,
      type: 'usage.recorded',
      data: { ...emptyUsage(), input: 100_000, cacheRead: index ? 99_000 : 0 },
    },
  }))
  const service = new UsageService({ read: async () => ({ items: rows, hasMore: false }) }, () => 2000)
  const report = await service.query({
    scope: { kind: 'global' },
    from: 0,
    to: 2000,
    bucketMs: 1000,
    maxBuckets: 10,
    maxSamples: 100,
    filters: {},
  })
  expect(report.totals).toMatchObject({ attempts: 12, input: 1_200_000, cacheRead: 1_089_000 })
  expect(report.cacheHitRate).toMatchObject({ value: 0.9075, sampleCount: 12, availability: 'available' })
  expect(report.cacheQuality).toMatchObject({ status: 'healthy', recentMinimum: 0.99, sampleCount: 10 })
  const bounded = await service.query({
    scope: { kind: 'global' },
    from: 0,
    to: 2000,
    bucketMs: 1000,
    maxBuckets: 10,
    maxSamples: 10,
    filters: {},
  })
  expect(bounded.gap).toBe(true)
  expect(bounded.cacheQuality?.status).toBe('unavailable')
})
