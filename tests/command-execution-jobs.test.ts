import { expect, test } from 'bun:test'
import { z } from 'zod'
import {
  CommandError,
  CommandRegistry,
  createCommandExpectation,
  defineCommand,
  type CommandExecutionTicket,
  type CommandPhysicalSettlement,
} from '@hbar/commands'
import {
  CommandExecutionJobs,
  commandJobLogicalResultSchema,
  commandJobSnapshotSchema,
  type CommandJobIdentity,
  type CommandJobSnapshot,
} from '@hbar/commands/jobs'

function deferred<Value>() {
  let resolve: (value: Value) => void = () => {
    throw new Error('Deferred is not initialized')
  }
  let reject: (error: unknown) => void = () => {
    throw new Error('Deferred is not initialized')
  }
  const promise = new Promise<Value>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
function completed(result: unknown): CommandExecutionTicket {
  return {
    result: Promise.resolve(result),
    settled: Promise.resolve({ status: 'succeeded', executionStarted: true, result }),
  }
}
async function failure(action: Promise<unknown>): Promise<unknown> {
  try {
    await action
  } catch (error) {
    return error
  }
  throw new Error('Expected job refusal')
}
async function waitFor(
  jobs: CommandExecutionJobs,
  input: CommandJobIdentity,
  ready: (value: CommandJobSnapshot) => boolean,
) {
  let value = jobs.get(input)
  for (let attempt = 0; attempt < 20; attempt++) {
    if (ready(value)) return commandJobSnapshotSchema.parse(value)
    value = await jobs.watch({ ...input, afterRevision: value.revision, waitMs: 50 }, new AbortController().signal)
  }
  throw new Error('Command job did not publish its expected state')
}
function read(
  jobs: CommandExecutionJobs,
  input: CommandJobIdentity,
  channel: 'logical' | 'physical',
  limit = 65_536,
): unknown {
  let text = '',
    offset = 0
  for (let page = 0; page < 65_536; page++) {
    const chunk = jobs.read({ ...input, channel, offset, limit })
    text += chunk.text
    if (chunk.nextOffset === null) return JSON.parse(text) as unknown
    expect(chunk.nextOffset).toBeGreaterThan(offset)
    offset = chunk.nextOffset
  }
  throw new Error('Command chunk cursor failed to finish')
}
const source = { jobId: 'job', actorId: 'operator' }

test('a real late write result remains available after logical timeout and occupies its job until acknowledgment', async () => {
  const release = deferred<void>(),
    entered = deferred<void>()
  let writes = 0
  const registry = new CommandRegistry({ execution: 'host' })
  registry.register(
    defineCommand(
      {
        id: 'jobs.write',
        owner: 'jobs',
        version: 1,
        execution: 'host',
        kind: 'command',
        stateEffect: 'persistent',
        scope: 'workspace',
        category: 'jobs',
        titleKey: 'jobs',
        descriptionKey: 'jobs',
        surfaces: ['api'],
        timeoutMs: 15,
      },
      z.strictObject({}),
      z.strictObject({ receipt: z.string() }),
    ),
    async () => {
      writes++
      entered.resolve()
      await release.promise
      return { receipt: '真实回执 🎯' }
    },
    { durable: true },
  )
  const invocation = registry.prepare({
    protocol: 1,
    requestId: 'write-once',
    commandId: 'jobs.write',
    commandVersion: 1,
    input: {},
  })
  const expected = createCommandExpectation({ invocation, descriptor: registry.describe('jobs.write') })
  const jobs = new CommandExecutionJobs({ maxJobs: 1 })
  try {
    jobs.start(source, (signal) => registry.dispatchPreparedTracked(invocation, source.actorId, expected, { signal }))
    await entered.promise
    const logical = await waitFor(jobs, source, (value) => value.logical !== null)
    expect(logical.physical.phase).toBe('pending')
    expect(commandJobLogicalResultSchema.parse(read(jobs, source, 'logical'))).toMatchObject({
      ok: false,
      error: { code: 'RESULT_UNKNOWN' },
    })
    expect(() =>
      jobs.start(source, () => {
        writes++
        return completed({})
      }),
    ).toThrow('read its receipt')
    expect(() => jobs.start({ ...source, jobId: 'another' }, () => completed({}))).toThrow('capacity')
    expect(() => jobs.acknowledge(source)).toThrow('Physical settlement')
    expect(jobs.stats()).toMatchObject({ jobs: 1, active: 1 })
    release.resolve()
    const settled = await waitFor(jobs, source, (value) => value.physical.phase === 'settled')
    expect(settled.physical).toMatchObject({ phase: 'settled', status: 'succeeded', executionStarted: true })
    expect(read(jobs, source, 'physical')).toMatchObject({ status: 'succeeded', result: { receipt: '真实回执 🎯' } })
    expect(writes).toBe(1)
    expect(jobs.stats()).toMatchObject({ jobs: 1, active: 0 })
    expect(jobs.acknowledge(source)).toEqual({ released: true })
    expect(jobs.acknowledge(source)).toEqual({ released: false })
    expect(jobs.stats()).toEqual({ jobs: 0, active: 0, waiters: 0, bufferedBytes: 0 })
  } finally {
    release.resolve()
    registry.dispose()
    jobs.dispose()
  }
})

test('job status, chunks, watches, cancellation and acknowledgment all retain their actor binding', async () => {
  const jobs = new CommandExecutionJobs()
  jobs.start(source, () => completed({ receipt: 'private' }))
  try {
    await waitFor(jobs, source, (value) => value.logical !== null && value.physical.phase === 'settled')
    const other = { ...source, actorId: 'another-operator' }
    for (const action of [
      () => jobs.get(other),
      () => jobs.cancel(other),
      () => jobs.acknowledge(other),
      () => jobs.read({ ...other, channel: 'physical', offset: 0 }),
      () => jobs.watch({ ...other, afterRevision: 0 }, new AbortController().signal),
      () => jobs.start(other, () => completed({})),
    ])
      expect(action).toThrow('another actor')
    const snapshot = jobs.get(source)
    snapshot.physical = { phase: 'pending' }
    expect(jobs.get(source).physical.phase).toBe('settled')
    expect(jobs.cancel(source)).toEqual({ accepted: false })
  } finally {
    jobs.dispose()
  }
})

test('chunks preserve Unicode across code-unit boundaries and enforce valid progress and page capacity', async () => {
  const jobs = new CommandExecutionJobs()
  const result = { text: '中🎯文'.repeat(40) }
  jobs.start(source, () => completed(result))
  try {
    const value = await waitFor(jobs, source, (state) => state.logical !== null && state.physical.phase === 'settled')
    expect(read(jobs, source, 'logical', 1)).toEqual({ ok: true, result })
    expect(value.logical?.kind).toBe('json')
    const all = jobs.read({ ...source, channel: 'logical', offset: 0 })
    expect(new TextEncoder().encode(all.text).byteLength).toBeGreaterThan(all.totalUnits)
    expect(jobs.read({ ...source, channel: 'logical', offset: all.totalUnits })).toEqual({
      text: '',
      totalUnits: all.totalUnits,
      nextOffset: null,
    })
    expect(() => jobs.read({ ...source, channel: 'logical', offset: all.totalUnits + 1 })).toThrow('offset')
    expect(() => jobs.read({ ...source, channel: 'logical', offset: 0, limit: 65_537 })).toThrow()
  } finally {
    jobs.dispose()
  }
})

test('bounded watches release on timeout, cancellation, acknowledgment and owner disposal', async () => {
  const logical = deferred<unknown>(),
    physical = deferred<CommandPhysicalSettlement>()
  const jobs = new CommandExecutionJobs({ maxWaiters: 1 })
  jobs.start(source, () => ({ result: logical.promise, settled: physical.promise }))
  try {
    const controller = new AbortController()
    const pending = jobs.watch({ ...source, afterRevision: 1 }, controller.signal)
    expect(jobs.stats().waiters).toBe(1)
    expect(await failure(jobs.watch({ ...source, afterRevision: 1 }, new AbortController().signal))).toMatchObject({
      code: 'BUSY',
    })
    controller.abort()
    expect(await failure(pending)).toMatchObject({ code: 'CANCELLED' })
    expect(jobs.stats().waiters).toBe(0)
    expect((await jobs.watch({ ...source, afterRevision: 1, waitMs: 1 }, new AbortController().signal)).revision).toBe(
      1,
    )
    expect(jobs.stats().waiters).toBe(0)
    expect(await failure(jobs.watch({ ...source, afterRevision: 2 }, new AbortController().signal))).toMatchObject({
      code: 'INVALID_INPUT',
    })
    logical.resolve({ ok: true })
    physical.resolve({ status: 'succeeded', executionStarted: true, result: { ok: true } })
    const value = await waitFor(jobs, source, (state) => state.logical !== null && state.physical.phase === 'settled')
    const held = jobs.watch({ ...source, afterRevision: value.revision }, new AbortController().signal)
    jobs.acknowledge(source)
    expect(await failure(held)).toMatchObject({ code: 'COMMAND_JOB_NOT_FOUND' })
    expect(jobs.stats().waiters).toBe(0)
  } finally {
    logical.resolve({})
    physical.resolve({ status: 'succeeded', executionStarted: true, result: {} })
    jobs.dispose()
  }
})

test('cancellation is a request and never fabricates physical completion of an uncooperative owner', async () => {
  const logical = deferred<unknown>(),
    physical = deferred<CommandPhysicalSettlement>()
  const jobs = new CommandExecutionJobs()
  let signal: AbortSignal | undefined
  jobs.start(source, (value) => {
    signal = value
    return { result: logical.promise, settled: physical.promise }
  })
  try {
    expect(jobs.cancel(source)).toEqual({ accepted: true })
    expect(signal?.aborted).toBe(true)
    expect(jobs.cancel(source)).toEqual({ accepted: false })
    expect(jobs.get(source).physical.phase).toBe('pending')
    expect(() => jobs.acknowledge(source)).toThrow('Physical settlement')
    logical.reject(new CommandError('RESULT_UNKNOWN', 'Inspect the write'))
    physical.resolve({
      status: 'failed',
      executionStarted: true,
      error: { code: 'PARTIAL_WRITE', message: 'Inspect state' },
    })
    await waitFor(jobs, source, (value) => value.logical !== null && value.physical.phase === 'settled')
    expect(read(jobs, source, 'physical')).toMatchObject({
      status: 'failed',
      executionStarted: true,
      error: { code: 'PARTIAL_WRITE' },
    })
  } finally {
    logical.resolve({})
    physical.resolve({ status: 'succeeded', executionStarted: true, result: {} })
    jobs.dispose()
  }
})

test('oversized or non-JSON output keeps the true physical success and exposes explicit unavailable data', async () => {
  let getterCalls = 0
  const cyclic: { child?: unknown } = {}
  cyclic.child = cyclic
  const accessor = Object.defineProperty({}, 'text', {
    enumerable: true,
    get: () => {
      getterCalls++
      return 'forbidden'
    },
  })
  const values: unknown[] = [
    { text: 'x'.repeat(512) },
    cyclic,
    { fn: () => {} },
    { n: Infinity },
    new Date(),
    accessor,
    Array(2),
  ]
  const jobs = new CommandExecutionJobs({ maxPayloadBytes: 128, maxBufferedBytes: 256 })
  try {
    for (const [index, value] of values.entries()) {
      const input = { ...source, jobId: `unavailable-${index}` }
      jobs.start(input, () => completed(value))
      const state = await waitFor(
        jobs,
        input,
        (snapshot) => snapshot.logical !== null && snapshot.physical.phase === 'settled',
      )
      expect(state).toMatchObject({
        logical: { kind: 'unavailable' },
        physical: { phase: 'settled', status: 'succeeded', executionStarted: true, payload: { kind: 'unavailable' } },
      })
      expect(() => jobs.read({ ...input, channel: 'physical', offset: 0 })).toThrow('could not be retained')
      jobs.acknowledge(input)
    }
    expect(getterCalls).toBe(0)
    expect(jobs.stats().bufferedBytes).toBe(0)
  } finally {
    jobs.dispose()
  }
})

test('total result memory is bounded and acknowledgment returns exactly the retained byte budget', async () => {
  const jobs = new CommandExecutionJobs({ maxPayloadBytes: 256, maxBufferedBytes: 256 })
  try {
    jobs.start(source, () => completed({ text: 'x'.repeat(80) }))
    await waitFor(jobs, source, (value) => value.logical !== null && value.physical.phase === 'settled')
    expect(jobs.stats().bufferedBytes).toBeGreaterThan(0)
    expect(jobs.stats().bufferedBytes).toBeLessThanOrEqual(256)
    const next = { ...source, jobId: 'bounded-next' }
    jobs.start(next, () => completed({ text: 'x'.repeat(180) }))
    const value = await waitFor(jobs, next, (state) => state.logical !== null && state.physical.phase === 'settled')
    expect(value.logical?.kind).toBe('unavailable')
    expect(jobs.stats().bufferedBytes).toBeLessThanOrEqual(256)
    jobs.acknowledge(source)
    jobs.acknowledge(next)
    expect(jobs.stats().bufferedBytes).toBe(0)
  } finally {
    jobs.dispose()
  }
})

test('lost settlement or a throwing factory stays unconfirmed and cannot be acknowledged as stopped', async () => {
  const jobs = new CommandExecutionJobs()
  const physical = deferred<CommandPhysicalSettlement>()
  jobs.start(source, () => ({
    result: Promise.reject(new CommandError('RESULT_UNKNOWN', 'Unknown')),
    settled: physical.promise,
  }))
  physical.reject(new CommandError('OWNER_LOST', 'Owner settlement is unavailable'))
  try {
    const state = await waitFor(
      jobs,
      source,
      (value) => value.logical !== null && value.physical.phase === 'unconfirmed',
    )
    expect(state.physical).toMatchObject({ phase: 'unconfirmed', error: { code: 'OWNER_LOST' } })
    expect(() => jobs.acknowledge(source)).toThrow('Physical settlement')
    const broken = { ...source, jobId: 'throwing-factory' }
    jobs.start(broken, () => {
      throw new CommandError('BROKEN_FACTORY', 'Physical state is not proven')
    })
    expect(jobs.get(broken).physical).toMatchObject({ phase: 'unconfirmed', error: { code: 'BROKEN_FACTORY' } })
    expect(read(jobs, broken, 'logical')).toMatchObject({ ok: false, error: { code: 'RESULT_UNKNOWN' } })
    expect(() => jobs.acknowledge(broken)).toThrow('Physical settlement')
    expect(jobs.stats().active).toBe(2)
  } finally {
    jobs.dispose()
  }
})

test('disposing an owner cancels watchers and admission while late completion releases all buffered data', async () => {
  const logical = deferred<unknown>(),
    physical = deferred<CommandPhysicalSettlement>()
  const jobs = new CommandExecutionJobs()
  jobs.start(source, () => ({ result: logical.promise, settled: physical.promise }))
  const pending = jobs.watch({ ...source, afterRevision: 1 }, new AbortController().signal)
  jobs.dispose()
  expect(await failure(pending)).toMatchObject({ code: 'CANCELLED' })
  expect(() => jobs.start({ ...source, jobId: 'late' }, () => completed({}))).toThrow('closing')
  physical.resolve({ status: 'succeeded', executionStarted: true, result: { text: 'late' } })
  logical.resolve({ text: 'late' })
  await physical.promise
  await logical.promise
  await Promise.resolve()
  expect(jobs.stats()).toEqual({ jobs: 0, active: 0, waiters: 0, bufferedBytes: 0 })
})
