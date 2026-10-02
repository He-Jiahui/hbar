import { expect, test } from 'bun:test'
import { createScheduleDueReader } from '../packages/kernel/src/schedule-due-reader'

const make = (id: string, at: number) => ({
  id,
  workspaceId: 'w',
  name: id,
  input: 'x',
  modelId: 'm',
  timezone: 'UTC',
  target: { mode: 'new-session' as const },
  spec: { kind: 'once' as const, at },
  enabled: true,
  revision: 0,
  createdAt: 0,
  updatedAt: 1,
})

test('bounded fair reader reaches late rows and records latest pending candidate', async () => {
  const rows = Array.from({ length: 1000 }, (_, index) =>
    make(`s${String(index).padStart(4, '0')}`, index === 999 ? 1 : 10_000),
  )
  const candidates: Array<{ id: string; dueAt: number }> = []
  const reader = createScheduleDueReader({
    async enabledPage(after, limit) {
      const start = after ? rows.findIndex((item) => item.id > after) : 0
      const items = rows.slice(Math.max(0, start), Math.max(0, start) + limit)
      return { items, next: items.at(-1)?.id === rows.at(-1)?.id ? null : (items.at(-1)?.id ?? null) }
    },
    async runtime() {
      return { lastDueAt: null, pendingDueAt: null }
    },
    async recordCandidate(id, dueAt) {
      candidates.push({ id, dueAt })
    },
  })
  for (let index = 0; index < 4; index++) await reader(2, 32)
  expect(candidates.map((item) => item.id)).toContain('s0999')
})

test('pending candidate is coalesced with latest due', async () => {
  let recorded = 0
  const reader = createScheduleDueReader({
    async enabledPage() {
      return { items: [make('s', 1)], next: null }
    },
    async runtime() {
      return { lastDueAt: 1, pendingDueAt: 2 }
    },
    async recordCandidate(_id, dueAt) {
      recorded = dueAt
    },
  })
  await reader(3)
  expect(recorded).toBe(2)
})

test('a capacity stop keeps unprocessed rows even on the last page and restart skips claimed due', async () => {
  const rows = Array.from({ length: 50 }, (_, index) => make(`s${String(index).padStart(3, '0')}`, 1))
  const claimed = new Map<string, number>()
  const port = {
    async enabledPage(after: string | null, limit: number) {
      const remaining = rows.filter((row) => after === null || row.id > after)
      return {
        items: remaining.slice(0, limit),
        next: remaining.length > limit ? (remaining[limit - 1]?.id ?? null) : null,
      }
    },
    async runtime(id: string) {
      return { lastDueAt: claimed.get(id) ?? null, pendingDueAt: null }
    },
    async recordCandidate() {},
  }
  const reader = createScheduleDueReader(port)
  const first = await reader(2, 32)
  expect(first).toHaveLength(32)
  for (const row of first) claimed.set(row.scheduleId, row.dueAt)
  const next = await reader(2, 32)
  expect(next).toHaveLength(18)
  expect([...first, ...next].map((row) => row.scheduleId)).toEqual(rows.map((row) => row.id))
  for (const row of next) claimed.set(row.scheduleId, row.dueAt)
  expect(await createScheduleDueReader(port)(2, 32)).toEqual([])
})
