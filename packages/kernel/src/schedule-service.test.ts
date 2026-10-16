import { describe, expect, test } from 'bun:test'
import { createScheduleService, latestDueSchedule, previewSchedule } from './schedule-service'

describe('schedule preview', () => {
  test('allows updating an already elapsed one-time schedule when its timing is unchanged', async () => {
    const at = Date.UTC(2026, 0, 1)
    const current = {
      id: 's',
      workspaceId: 'w',
      name: 'old',
      input: 'x',
      modelId: 'm',
      timezone: 'UTC' as const,
      target: { mode: 'new-session' as const },
      spec: { kind: 'once' as const, at },
      enabled: true,
      revision: 0,
      createdAt: 1,
      updatedAt: 1,
    }
    let updated = false
    const service = createScheduleService({
      list: async () => ({ items: [current], next: null, revision: 0 }),
      get: async () => current,
      execution: async () => null,
      create: async () => current,
      update: async (input) => {
        updated = true
        return { ...current, name: input.name, revision: 1 }
      },
      delete: async () => ({ scheduleId: 's', revision: 1 }),
      occurrences: async () => ({ items: [], next: null }),
      claim: async () => null,
      transition: async () => {
        throw new Error('unused')
      },
    })
    const result = await service.update({ ...current, scheduleId: 's', expectedRevision: 0, name: 'renamed' })
    expect(updated).toBe(true)
    expect(result.name).toBe('renamed')
  })
  test('returns five cron occurrences in timezone', () => {
    const result = previewSchedule({
      spec: { kind: 'cron', expression: '0 9 * * *' },
      timezone: 'America/Los_Angeles',
      from: Date.UTC(2026, 0, 1),
    })
    expect(result).toHaveLength(5)
    expect(result.every((value, index) => index === 0 || value > result[index - 1]!)).toBe(true)
  })
  test('rejects six-field cron', () => {
    expect(() => previewSchedule({ spec: { kind: 'cron', expression: '0 0 9 * * *' }, timezone: 'UTC' })).toThrow()
  })
  test('finds latest due from current time, not epoch', () => {
    const now = Date.UTC(2026, 0, 2, 12, 34)
    const latest = previewSchedule(
      { spec: { kind: 'cron', expression: '* * * * *' }, timezone: 'UTC', from: now - 10_000 },
      now,
    )
    expect(latest.at(-1)).toBeGreaterThan(now)
  })
  test('latest due does not skip the previous minute near a boundary', () => {
    const now = Date.UTC(2026, 0, 2, 12, 34, 59, 500)
    expect(latestDueSchedule({ spec: { kind: 'cron', expression: '* * * * *' }, timezone: 'UTC' }, now)).toBe(
      Date.UTC(2026, 0, 2, 12, 34),
    )
  })
})
