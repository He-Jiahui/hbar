import { expect, test } from 'bun:test'
import { emptyUsage, providerSchema } from '@hbar/contracts'
import { usageExportInputSchema } from '@hbar/contracts/commands/usage'
import { createUsageFact, UsageService, type UsageReadRow } from '@hbar/usage'

test('newest request pages use a stable time/ID cursor, preserve older session history and fence new arrivals', async () => {
  const provider = providerSchema.parse({
    id: 'fixture',
    name: 'Fixture',
    protocol: 'mock',
    baseUrl: 'http://127.0.0.1',
    model: 'fixture',
  })
  const row = (id: string, time: number): UsageReadRow => ({
    event: {
      eventId: id,
      sessionId: 'session',
      seq: time,
      runId: `run-${id}`,
      stepId: id,
      type: 'usage.recorded',
      data: {
        ...createUsageFact({
          usage: { ...emptyUsage(), input: 10, output: 5 },
          runId: id,
          attemptId: id,
          source: 'model',
          model: provider,
        }),
        usageId: id,
      },
      time,
      version: 1,
    },
    workspaceId: 'workspace',
    parentSessionId: null,
    run: null,
  })
  const rows = [row('old', 1), row('tie-A', 6_000_000), row('tie-a', 6_000_000), row('tie-z', 6_000_000)]
  const service = new UsageService(
    {
      async read(input) {
        return {
          items: rows.filter((row) => row.event.time >= input.from && row.event.time < input.to),
          hasMore: false,
        }
      },
    },
    () => 7_200_000,
  )
  const scope = { kind: 'session' as const, sessionId: 'session', includeDescendants: false }
  const first = await service.export(usageExportInputSchema.parse({ scope, from: 0, order: 'desc', limit: 2 }))
  expect(first.items.map((item) => item.usageId)).toEqual(['tie-z', 'tie-a'])
  rows.push(row('new-arrival', 7_000_000))
  const second = await service.export(
    usageExportInputSchema.parse({ scope, from: 0, order: 'desc', limit: 2, after: first.nextCursor }),
  )
  expect(second.items.map((item) => item.usageId)).toEqual(['tie-A', 'old'])
  expect(second.nextCursor).toBeUndefined()
  const refreshed = await service.export(usageExportInputSchema.parse({ scope, from: 0, order: 'desc', limit: 2 }))
  expect(refreshed.items[0]?.usageId).toBe('new-arrival')
  const legacy = await service.export(usageExportInputSchema.parse({ scope, from: 0, limit: 2 }))
  expect(legacy.items.map((item) => item.usageId)).toEqual(['old', 'tie-A'])
  const defaultWindow = await service.export(usageExportInputSchema.parse({ scope, order: 'desc', limit: 500 }))
  expect(defaultWindow.items.some((item) => item.usageId === 'old')).toBe(false)
})
