import { describe, expect, test } from 'bun:test'
import { createScheduleRuntime } from '../packages/app-runtime/src/schedules'
import type {
  ScheduleDefinition,
  ScheduleOccurrence,
  ScheduleCreateInput,
  ScheduleUpdateInput,
} from '../packages/contracts/src/commands/schedules'

const schedule = (id: string, workspaceId = 'w'): ScheduleDefinition => ({
  id,
  workspaceId,
  name: id,
  input: 'prompt',
  modelId: 'model',
  timezone: 'UTC',
  target: { mode: 'new-session' },
  spec: { kind: 'once', at: 10_000 },
  enabled: true,
  revision: 0,
  createdAt: 1,
  updatedAt: 1,
})

const occurrence = (id: string, scheduleId = 's'): ScheduleOccurrence => ({
  id,
  scheduleId,
  dueAt: 1,
  status: 'completed',
  sessionId: null,
  runId: `run-${id}`,
  attempt: 1,
  idempotencyKey: `key-${id}`,
  createdAt: 1,
  updatedAt: 1,
  error: null,
})

type FakeClient = {
  list: (input: { workspaceId: string; after?: string | null; limit?: number }) => Promise<{ items: ScheduleDefinition[]; next: string | null; revision: number }>
  occurrences: (input: { scheduleId: string; after?: string | null; limit?: number }) => Promise<{ items: ScheduleOccurrence[]; next: string | null }>
  create: (input: ScheduleCreateInput, options: { idempotencyKey: string }) => Promise<ScheduleDefinition>
  update: (input: ScheduleUpdateInput, options: { idempotencyKey: string }) => Promise<ScheduleDefinition>
  delete: (input: { scheduleId: string; expectedRevision: number }, options: { idempotencyKey: string }) => Promise<{ scheduleId: string; revision: number }>
  execute: (id: string, input: unknown) => Promise<unknown>
  preview: () => { occurrences: number[]; timezone: string }
}

function client(overrides: Partial<FakeClient> = {}): FakeClient {
  return {
    list: async () => ({ items: [], next: null, revision: 0 }),
    occurrences: async () => ({ items: [], next: null }),
    create: async (input) => ({ ...input, id: 'created', enabled: true, revision: 0, createdAt: 1, updatedAt: 1 }),
    update: async (input) => ({ ...input, id: input.scheduleId, enabled: true, revision: input.expectedRevision + 1, createdAt: 1, updatedAt: 2 }),
    delete: async (input) => ({ scheduleId: input.scheduleId, revision: input.expectedRevision + 1 }),
    execute: async () => null,
    preview: () => ({ occurrences: [1], timezone: 'UTC' }),
    ...overrides,
  }
}

describe('schedule runtime recovery and bounded paging', () => {
  test('late workspace page is ignored and previous request is aborted', async () => {
    let firstResolve: ((page: { items: ScheduleDefinition[]; next: string | null; revision: number }) => void) | undefined
    let firstSignal: AbortSignal | undefined
    const port = client({
      list: async ({ workspaceId }, options?: { signal?: AbortSignal }) => {
        if (workspaceId === 'old') {
          firstSignal = options?.signal
          return new Promise((resolve) => {
            firstResolve = resolve
          })
        }
        return { items: [schedule('new', 'new')], next: null, revision: 0 }
      },
    } as Partial<FakeClient> & { list: FakeClient['list'] })
    const runtime = createScheduleRuntime(port as never)
    const stale = runtime.refresh('old')
    await runtime.refresh('new')
    firstResolve?.({ items: [schedule('old', 'old')], next: null, revision: 0 })
    await stale
    expect(firstSignal?.aborted).toBe(true)
    expect(runtime.reader.getSnapshot().schedules.map((item) => item.id)).toEqual(['new'])
    runtime.dispose()
  })

  test('unknown mutation can be retried through exact receipt query without replaying write', async () => {
    let writes = 0
    let receiptInput: unknown
    const saved = schedule('saved')
    const port = client({
      create: async () => {
        writes++
        throw new Error('request timed out')
      },
      execute: async (id, input) => {
        expect(id).toBe('schedule.receipt')
        receiptInput = input
        return saved
      },
    })
    const runtime = createScheduleRuntime(port as never)
    await runtime.refresh('w')
    const input: ScheduleCreateInput = { workspaceId: 'w', name: 'x', input: 'p', modelId: 'm', timezone: 'UTC', target: { mode: 'new-session' }, spec: { kind: 'once', at: 10_000 } }
    await expect(runtime.create(input, { idempotencyKey: 'stable-key' })).rejects.toThrow('timed out')
    expect(runtime.reader.getSnapshot().mutation).toBe('unknown')
    await runtime.reconcile()
    expect(writes).toBe(1)
    expect(receiptInput).toEqual({ commandId: 'schedule.create', input, idempotencyKey: 'stable-key' })
    expect(runtime.reader.getSnapshot().schedules.map((item) => item.id)).toEqual(['saved'])
    runtime.dispose()
  })

  test('ordinary mutation failure clears pending state and allows retry', async () => {
    let calls = 0
    const port = client({
      create: async (input) => {
        calls++
        if (calls === 1) throw new Error('validation failed')
        return { ...input, id: 'ok', enabled: true, revision: 0, createdAt: 1, updatedAt: 1 }
      },
    })
    const runtime = createScheduleRuntime(port as never)
    const input: ScheduleCreateInput = { workspaceId: 'w', name: 'x', input: 'p', modelId: 'm', timezone: 'UTC', target: { mode: 'new-session' }, spec: { kind: 'once', at: 10_000 } }
    await expect(runtime.create(input, { idempotencyKey: 'one' })).rejects.toThrow('validation failed')
    await expect(runtime.create(input, { idempotencyKey: 'two' })).resolves.toMatchObject({ id: 'ok' })
    expect(calls).toBe(2)
    runtime.dispose()
  })

  test('occurrence paging stops at 400 and does not request beyond capacity', async () => {
    let pages = 0
    const port = client({
      list: async () => ({ items: [schedule('s')], next: null, revision: 0 }),
      occurrences: async () => {
        pages++
        return { items: Array.from({ length: 100 }, (_, index) => occurrence(`${pages}-${index}`, 's')), next: `cursor-${pages}` }
      },
    })
    const runtime = createScheduleRuntime(port as never)
    await runtime.refresh('w')
    await runtime.refreshOccurrences('s')
    await runtime.loadMoreOccurrences('s')
    await runtime.loadMoreOccurrences('s')
    await runtime.loadMoreOccurrences('s')
    await runtime.loadMoreOccurrences('s')
    expect(pages).toBe(4)
    expect(runtime.reader.getSnapshot().occurrences.s).toHaveLength(400)
    expect(runtime.reader.getSnapshot().occurrenceNext.s).toBeNull()
    runtime.dispose()
  })
})
