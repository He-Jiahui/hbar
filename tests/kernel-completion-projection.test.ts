import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Kernel, MemorySecrets } from '../packages/kernel/src/index'
import { Storage, type StoragePort } from '@hbar/storage'
import { definePlugin, provide, service, type HarnessDriver, type GoalService } from '@hbar/plugin-sdk'
import {
  emptyUsage,
  providerSchema,
  sessionEventSchema,
  sessionEventPageSchema,
  sessionEventPageInputSchema,
  type Run,
  type SessionEventPageInput,
} from '@hbar/contracts'

const resources: Array<{ root: string; storage: Storage; kernel?: Kernel }> = []
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    const owned = resolve(resource.root)
    if (dirname(owned) !== resolve(tmpdir()) || !basename(owned).startsWith('hbar-completion-projection-'))
      throw new Error('Refusing to remove an unowned completion fixture')
    try {
      await resource.kernel?.close()
    } finally {
      await resource.storage.close()
      await rm(resource.root, { recursive: true, force: true })
    }
  }
})

async function fixture(source: 'user' | 'goal' = 'user') {
  const root = await mkdtemp(join(tmpdir(), 'hbar-completion-projection-'))
  const storage = new Storage(join(root, 'state.sqlite'))
  const resource: (typeof resources)[number] = { root, storage }
  resources.push(resource)
  await storage.call('ready')
  await storage.call(
    'saveProvider',
    providerSchema.parse({
      id: 'fixture',
      name: 'Fixture',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: 'fixture',
    }),
  )
  const workspace = await storage.call('createWorkspace', root, 'fixture')
  const session = await storage.call('createSession', workspace.id)
  const executed: Run[] = []
  const statistics = {
    rawReads: 0,
    rawRows: 0,
    rawCharacters: 0,
    completionRows: 0,
    completionCharacters: 0,
    completionRequests: [] as SessionEventPageInput[],
  }
  const port: StoragePort = {
    call: (method, ...args) => {
      const request = method === 'readEventPage' ? sessionEventPageInputSchema.parse(args[0]) : undefined
      if (request?.types.includes('run.driverCompleted')) statistics.completionRequests.push(request)
      return storage.call(method, ...args).then((value) => {
        if (method === 'events') {
          const rows = sessionEventSchema.array().parse(value)
          statistics.rawReads++
          statistics.rawRows += rows.length
          statistics.rawCharacters += JSON.stringify(rows).length
        }
        if (request?.types.includes('run.driverCompleted')) {
          const page = sessionEventPageSchema.parse(value)
          statistics.completionRows += page.items.length
          statistics.completionCharacters += JSON.stringify(page).length
        }
        return value
      })
    },
    close: async () => {},
  }
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Completion projection fixture',
      description: 'Observe real recovery decisions',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      provides: { driver: '1.0.0' },
      requires: { goal: '^1.0.0' },
      permissions: [],
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input) {
          executed.push(input.run)
          if (source === 'goal')
            await service<GoalService>(ctx, 'goal').update(input.session.id, 'complete', input.run.id)
          await input.commit('assistant', [{ type: 'text', text: 'Actual unfinished work' }])
        },
        summarize: async () => ({ text: '', usage: emptyUsage() }),
      })
    },
  })
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    demo: true,
    lifecycle: 'managed',
    secrets: new MemorySecrets(),
    profile: { createStorage: async () => port, replacements: { 'driver.pi': driver } },
  })
  resource.kernel = kernel
  const goal =
    source === 'goal'
      ? await kernel.plugins.get<GoalService>('goal').create(session.id, 'Finish only unfinished work', 100)
      : null
  const original = await kernel.submit(session.id, 'original', { text: 'Owned request', images: [], source }, 'fixture')
  await storage.call('claim', session.id)
  await storage.call('commit', session.id, original.id, 'user', [{ type: 'text', text: 'Owned request' }])
  if (goal?.goal)
    await storage.call(
      'append',
      session.id,
      'goal.run_bound',
      {
        accounting: {
          goalId: goal.goal.goalId,
          sessionId: session.id,
          startedAt: Date.now(),
          usageThroughSeq: 0,
          tokensAccounted: 0,
          timeAccounted: 0,
        },
      },
      original.id,
    )
  const reset = () => {
    statistics.rawReads = 0
    statistics.rawRows = 0
    statistics.rawCharacters = 0
    statistics.completionRows = 0
    statistics.completionCharacters = 0
    statistics.completionRequests.length = 0
  }
  const marker = (runId: string, data: unknown = { version: 1 }, sessionId = session.id) =>
    storage.call('append', sessionId, 'run.driverCompleted', data, runId)
  const noise = async (count: number) => {
    for (let index = 0; index < count; index++)
      await storage.call(
        'append',
        session.id,
        index % 2 ? 'tool.fixture' : 'stream.fixture',
        { index, text: 'noise'.repeat(20) },
        original.id,
      )
  }
  return { root, storage, kernel, workspace, session, original, statistics, reset, marker, noise, executed }
}

function assertBoundedRead(f: Awaited<ReturnType<typeof fixture>>, expectedRows: number) {
  expect(f.statistics.rawReads).toBe(0)
  expect(f.statistics.rawRows).toBe(0)
  expect(f.statistics.rawCharacters).toBe(0)
  expect(f.statistics.completionRequests).toHaveLength(1)
  expect(f.statistics.completionRequests[0]).toMatchObject({
    sessionId: f.session.id,
    types: ['run.driverCompleted'],
    runIds: [f.original.id],
  })
  expect(f.statistics.completionRows).toBe(expectedRows)
  expect(f.statistics.completionCharacters).toBeLessThan(4096)
}

for (const source of ['user', 'goal'] as const)
  test(`${source} real recovery reads only its completion receipt despite large tool history and other Runs`, async () => {
    const f = await fixture(source)
    await f.noise(512)
    // Larger than the projection reply budget: it must never be selected or decoded by this read.
    await f.storage.call('append', f.session.id, 'tool.fixture', { text: 'unrelated'.repeat(150_000) }, f.original.id)
    for (let index = 0; index < 17; index++) {
      const other = await f.storage.call(
        'enqueue',
        f.session.id,
        `other-${index}`,
        { text: 'Other request', images: [] },
        'fixture',
      )
      await f.marker(other.id, { version: 999 })
      await f.storage.call('setRun', other.id, 'cancelled')
    }
    await f.storage.call('commit', f.session.id, f.original.id, 'assistant', [
      { type: 'text', text: 'Final committed result' },
    ])
    await f.marker(f.original.id)
    // A later malformed duplicate never overrides the first durable valid receipt.
    await f.marker(f.original.id, { version: 999 })
    if (source === 'goal') await f.kernel.plugins.get<GoalService>('goal').set(f.session.id, { status: 'complete' })
    await f.storage.call('deleteProvider', 'fixture')
    f.reset()
    const record = (await f.kernel.recoverRuns([f.original.id]))[0]
    if (!record?.run) throw new Error('Missing completion successor')
    const successor = record.run
    assertBoundedRead(f, 1)
    const duplicate = (await f.kernel.recoverRuns([f.original.id]))[0]
    expect(duplicate?.recoveryId).toBe(record.recoveryId)
    expect(duplicate?.run?.id).toBe(record.run.id)
    expect(f.statistics.completionRequests).toHaveLength(1)
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    expect(f.executed).toHaveLength(0)
    expect((await f.storage.call('run', record.run.id)).status).toBe('completed')
    expect(f.statistics.rawReads).toBe(0)
    expect(f.statistics.completionRequests.length).toBeLessThanOrEqual(3)
    expect(
      f.statistics.completionRequests
        .slice(1)
        .every((request) => request.runIds?.includes(f.original.id) && request.runIds.includes(successor.id)),
    ).toBe(true)
    const snapshot = await f.storage.call('snapshot', f.session.id)
    expect(
      snapshot.messages
        .flatMap((message) => message.content)
        .filter((block) => block.type === 'text' && block.text === 'Final committed result'),
    ).toHaveLength(1)
  }, 120_000)

for (const offset of [0, 1])
  test(`receipt beyond an old 16-event page boundary ${offset} is found without raw pages`, async () => {
    const f = await fixture()
    await f.noise(32)
    while ((await f.storage.call('session', f.session.id)).seq % 16 !== 15) await f.noise(1)
    if (offset) await f.noise(1)
    const receipt = await f.marker(f.original.id)
    expect(receipt.seq % 16).toBe(offset)
    await f.storage.call('deleteProvider', 'fixture')
    f.reset()
    expect((await f.kernel.recoverRuns([f.original.id]))[0]?.run?.status).toBe('queued')
    assertBoundedRead(f, 1)
  }, 60_000)

test('other-Run and cross-Session receipts never turn an absent completion into a committed result', async () => {
  const f = await fixture()
  await f.noise(256)
  const other = await f.storage.call('enqueue', f.session.id, 'other', { text: 'Other request', images: [] }, 'fixture')
  await f.marker(other.id)
  const foreign = await f.storage.call('createSession', f.workspace.id)
  await f.marker(f.original.id, { version: 1 }, foreign.id)
  await f.storage.call('deleteProvider', 'fixture')
  f.reset()
  const record = (await f.kernel.recoverRuns([f.original.id]))[0]
  expect(record?.run).toBeNull()
  expect(record?.chain.reasonCode).toBe('MODEL_NOT_FOUND')
  assertBoundedRead(f, 0)
  expect(f.executed).toHaveLength(0)
}, 60_000)

for (const oversized of [false, true])
  test(`${oversized ? 'oversized' : 'malformed'} earliest completion fails closed before a later valid receipt`, async () => {
    const f = await fixture()
    await f.marker(f.original.id, oversized ? { version: 1, extra: 'x'.repeat(1_100_000) } : { version: 2 })
    await f.marker(f.original.id)
    f.reset()
    const record = (await f.kernel.recoverRuns([f.original.id]))[0]
    expect(record?.run).toBeNull()
    expect(record?.chain.status).toBe('waiting')
    expect(record?.chain.reasonCode).toBe(oversized ? 'EVENT_PAGE_ITEM_TOO_LARGE' : 'RECOVERY_ADMISSION_FAILED')
    expect(f.executed).toHaveLength(0)
  }, 60_000)

test('completion from a predecessor remains visible across another real recovery generation', async () => {
  const f = await fixture()
  await f.noise(256)
  await f.marker(f.original.id)
  const first = (await f.kernel.recoverRuns([f.original.id]))[0]
  if (!first?.run) throw new Error('Missing first recovery generation')
  expect((await f.storage.call('claim', f.session.id))?.id).toBe(first.run.id)
  f.reset()
  const second = (await f.kernel.recoverRuns([first.run.id]))[0]
  if (!second?.run) throw new Error('Missing second recovery generation')
  expect(second.run.recovery?.predecessorRunId).toBe(first.run.id)
  expect(f.statistics.rawReads).toBe(0)
  expect(f.statistics.completionRequests).toHaveLength(1)
  expect(f.statistics.completionRequests[0]?.runIds).toEqual([first.run.id, f.original.id])
  await f.kernel.activate()
  await f.kernel.waitForIdle()
  expect(f.executed).toHaveLength(0)
  expect((await f.storage.call('run', second.run.id)).status).toBe('completed')
}, 60_000)

test('unknown effect reconciliation still blocks recovery before any completion read', async () => {
  const f = await fixture()
  await f.storage.call('toolStart', f.session.id, f.original.id, 'unknown-write', 'write_file', {})
  await f.marker(f.original.id)
  f.reset()
  const record = (await f.kernel.recoverRuns([f.original.id]))[0]
  expect(record?.chain.reasonCode).toBe('EFFECT_UNKNOWN')
  expect(record?.run).toBeNull()
  expect((await f.kernel.resumeRecovery(f.original.id)).run).toBeNull()
  expect(f.statistics.completionRequests).toHaveLength(0)
  expect(f.executed).toHaveLength(0)
}, 60_000)
