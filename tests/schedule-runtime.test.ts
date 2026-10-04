import { describe, expect, test } from 'bun:test'
import { createScheduleRuntime } from '../packages/app-runtime/src/schedules'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import {
  scheduleCreateInputSchema,
  scheduleUpdateInputSchema,
  scheduleDeleteInputSchema,
  scheduleListInputSchema,
  type ScheduleDefinition,
  type ScheduleOccurrence,
  type ScheduleCreateInput,
} from '@hbar/contracts/commands/schedules'
const schedule = (id: string, workspaceId = 'w'): ScheduleDefinition => ({
  id,
  workspaceId,
  name: id,
  input: 'prompt',
  modelId: 'model',
  timezone: 'UTC',
  target: { mode: 'new-session' },
  spec: { kind: 'once', at: 10000 },
  enabled: true,
  revision: 0,
  createdAt: 1,
  updatedAt: 1,
})
const occurrence = (id: string): ScheduleOccurrence => ({
  id,
  scheduleId: 's',
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
const defaultPort = (): CommandExecutor => ({
  execute: async (name, input) => {
    if (name === 'schedule.list') return { items: [], next: null, revision: 0 }
    if (name === 'schedule.occurrences') return { items: [], next: null }
    if (name === 'schedule.create')
      return {
        ...scheduleCreateInputSchema.parse(input),
        id: 'created',
        enabled: true,
        revision: 0,
        createdAt: 1,
        updatedAt: 1,
      }
    if (name === 'schedule.update') {
      const { scheduleId, expectedRevision, ...values } = scheduleUpdateInputSchema.parse(input)
      return {
        ...values,
        id: scheduleId,
        enabled: values.enabled ?? true,
        revision: expectedRevision + 1,
        createdAt: 1,
        updatedAt: 2,
      }
    }
    if (name === 'schedule.delete') {
      const v = scheduleDeleteInputSchema.parse(input)
      return { scheduleId: v.scheduleId, revision: v.expectedRevision + 1 }
    }
    if (name === 'schedule.preview') return { occurrences: [1], timezone: 'UTC' }
    return null
  },
})
describe('schedule runtime recovery and bounded paging', () => {
  test('late workspace page is ignored and previous request aborted', async () => {
    let resolve: ((v: { items: ScheduleDefinition[]; next: string | null; revision: number }) => void) | undefined
    let signal: AbortSignal | undefined
    const base = defaultPort()
    const p: CommandExecutor = {
      execute: async (name, input, options) => {
        if (name !== 'schedule.list') return base.execute(name, input, options)
        if (scheduleListInputSchema.parse(input).workspaceId === 'old') {
          signal = options?.signal
          return new Promise((r) => {
            resolve = r
          })
        }
        return { items: [schedule('new', 'new')], next: null, revision: 0 }
      },
    }
    const r = createScheduleRuntime(p)
    const stale = r.refresh('old')
    await r.refresh('new')
    resolve?.({ items: [schedule('old', 'old')], next: null, revision: 0 })
    await stale
    expect(signal?.aborted).toBe(true)
    expect(r.reader.getSnapshot().schedules.map((x) => x.id)).toEqual(['new'])
    r.dispose()
  })
  test('unknown mutation reconciles exact receipt without replay', async () => {
    let writes = 0
    let receipt: unknown
    const saved = schedule('saved')
    const base = defaultPort()
    const p: CommandExecutor = {
      execute: async (name, input, options) => {
        if (name === 'schedule.create') {
          writes++
          throw new Error('request timed out')
        }
        if (name === 'schedule.receipt') {
          receipt = input
          return saved
        }
        return base.execute(name, input, options)
      },
    }
    const r = createScheduleRuntime(p)
    const input: ScheduleCreateInput = {
      workspaceId: 'w',
      name: 'x',
      input: 'p',
      modelId: 'm',
      timezone: 'UTC',
      target: { mode: 'new-session' },
      spec: { kind: 'once', at: 10000 },
    }
    await expect(r.create(input, { idempotencyKey: 'stable' })).rejects.toThrow('timed out')
    await r.reconcile()
    expect(writes).toBe(1)
    expect(receipt).toEqual({ commandId: 'schedule.create', input, idempotencyKey: 'stable' })
    r.dispose()
  })
  test('ordinary failure permits retry', async () => {
    let calls = 0
    const base = defaultPort()
    const p: CommandExecutor = {
      execute: async (name, input, options) => {
        if (name === 'schedule.create') {
          calls++
          if (calls === 1) throw new Error('validation failed')
          return {
            ...scheduleCreateInputSchema.parse(input),
            id: 'ok',
            enabled: true,
            revision: 0,
            createdAt: 1,
            updatedAt: 1,
          }
        }
        return base.execute(name, input, options)
      },
    }
    const r = createScheduleRuntime(p)
    const i: ScheduleCreateInput = {
      workspaceId: 'w',
      name: 'x',
      input: 'p',
      modelId: 'm',
      timezone: 'UTC',
      target: { mode: 'new-session' },
      spec: { kind: 'once', at: 10000 },
    }
    await expect(r.create(i, { idempotencyKey: 'a' })).rejects.toThrow()
    await expect(r.create(i, { idempotencyKey: 'b' })).resolves.toMatchObject({ id: 'ok' })
    expect(calls).toBe(2)
    r.dispose()
  })
  test('occurrences cap at 400', async () => {
    let pages = 0
    const base = defaultPort()
    const p: CommandExecutor = {
      execute: async (name, input, options) => {
        if (name === 'schedule.list') return { items: [schedule('s')], next: null, revision: 0 }
        if (name === 'schedule.occurrences') {
          pages++
          return { items: Array.from({ length: 100 }, (_, i) => occurrence(`${pages}-${i}`)), next: `c${pages}` }
        }
        return base.execute(name, input, options)
      },
    }
    const r = createScheduleRuntime(p)
    await r.refresh('w')
    for (let i = 0; i < 5; i++) await (i === 0 ? r.refreshOccurrences('s') : r.loadMoreOccurrences('s'))
    expect(pages).toBe(4)
    expect(r.reader.getSnapshot().occurrences.s).toHaveLength(400)
    r.dispose()
  })
  test('schedules cap at 400', async () => {
    let pages = 0
    const base = defaultPort()
    const p: CommandExecutor = {
      execute: async (name, input, options) => {
        if (name === 'schedule.list') {
          pages++
          const start = pages * 100
          return {
            items: Array.from({ length: 100 }, (_, i) => schedule(`s${start + i}`)),
            next: `c${pages}`,
            revision: pages,
          }
        }
        return base.execute(name, input, options)
      },
    }
    const r = createScheduleRuntime(p)
    await r.refresh('w')
    for (let i = 0; i < 5; i++) await r.loadMore()
    expect(pages).toBe(4)
    expect(r.reader.getSnapshot().schedules).toHaveLength(400)
    expect(r.reader.getSnapshot().capacityReached).toBe(true)
    r.dispose()
  })
  test('dispose ignores late read', async () => {
    let done: ((v: { items: ScheduleDefinition[]; next: string | null; revision: number }) => void) | undefined
    let signal: AbortSignal | undefined
    const p: CommandExecutor = {
      execute: async (_name, _input, options) => {
        signal = options?.signal
        return new Promise((r) => {
          done = r
        })
      },
    }
    const r = createScheduleRuntime(p)
    const read = r.refresh('w')
    r.dispose()
    done?.({ items: [schedule('late')], next: null, revision: 0 })
    await read
    expect(signal?.aborted).toBe(true)
    expect(r.reader.getSnapshot().schedules).toEqual([])
  })
})

test('typed transport failure retains the original schedule receipt across workspace changes without replay', async () => {
  const input: ScheduleCreateInput = {
    workspaceId: 'w',
    name: 'Captured',
    input: 'prompt',
    modelId: 'model',
    timezone: 'UTC',
    target: { mode: 'new-session' },
    spec: { kind: 'once', at: 10000 },
  }
  let writes = 0
  let receiptInput: unknown
  const base = defaultPort()
  const runtime = createScheduleRuntime({
    execute: async (name, raw, options) => {
      if (name === 'schedule.create') {
        writes++
        throw new CommandError('TIMEOUT', 'Transport reply missing')
      }
      if (name === 'schedule.receipt') {
        receiptInput = raw
        return schedule('captured', 'w')
      }
      return base.execute(name, raw, options)
    },
  })
  await expect(runtime.create(input, { idempotencyKey: 'original-key' })).rejects.toMatchObject({ code: 'TIMEOUT' })
  expect(runtime.reader.getSnapshot().mutation).toBe('unknown')
  await runtime.refresh('other-workspace')
  await expect(
    runtime.create({ ...input, workspaceId: 'other-workspace' }, { idempotencyKey: 'replacement-key' }),
  ).rejects.toMatchObject({ code: 'BUSY' })
  await runtime.reconcile()
  expect(receiptInput).toEqual({ commandId: 'schedule.create', input, idempotencyKey: 'original-key' })
  expect(runtime.reader.getSnapshot().workspaceId).toBe('other-workspace')
  expect(runtime.reader.getSnapshot().schedules).toEqual([])
  expect(runtime.reader.getSnapshot().mutation).toBe('succeeded')
  expect(writes).toBe(1)
  runtime.dispose()
})
