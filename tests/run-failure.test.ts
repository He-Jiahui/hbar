import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError, RUN_STEP_LIMIT_CODE } from '@hbar/contracts'
import type { RunFailure } from '@hbar/contracts'
import { Kernel, MemorySecrets, createRunCommands } from '@hbar/kernel'
import type { BudgetService, GoalService } from '@hbar/plugin-sdk'
import { classifyRunFailure } from '../packages/kernel/src/run-failure.ts'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-run-failure-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const resource = { root, kernel }
  resources.push(resource)
  await kernel.changePlugin('goal.codex', true, { autoContinue: false, maxContinuations: 0 })
  const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
  return { resource, kernel, session, goals: kernel.plugins.get<GoalService>('goal') }
}

test('failure classification distinguishes explicit cancellation, allowance, transient errors and unknown effects', () => {
  expect(classifyRunFailure(new HbarError('USER_CANCELLED', 'arbitrary text'))).toEqual({
    code: 'USER_CANCELLED',
    category: 'cancelled',
    retryable: false,
  })
  expect(classifyRunFailure(new HbarError('RUN_TIMEOUT', 'arbitrary text')).category).toBe('timeout')
  expect(classifyRunFailure(new HbarError('COMPACTION_TIMEOUT', 'arbitrary text'))).toEqual({
    code: 'COMPACTION_TIMEOUT',
    category: 'timeout',
    retryable: false,
  })
  expect(classifyRunFailure(new HbarError('RESULT_UNKNOWN', 'arbitrary text')).retryable).toBe(false)
  expect(classifyRunFailure(new Error('429 too many requests'))).toMatchObject({
    category: 'transient',
    retryable: true,
  })
  expect(classifyRunFailure(new Error('insufficient quota'))).toMatchObject({
    category: 'usage_limit',
    retryable: false,
  })
  expect(classifyRunFailure(new Error('unexpected'))).toMatchObject({ category: 'execution', retryable: false })
})

test('the bounded driver slice has a typed terminal code and never matches ordinary text', () => {
  expect(classifyRunFailure(new HbarError(RUN_STEP_LIMIT_CODE, 'arbitrary text'))).toEqual({
    code: RUN_STEP_LIMIT_CODE,
    category: 'execution',
    retryable: false,
  })
  expect(classifyRunFailure(new Error('Run reached the 64-step limit'))).toEqual({
    code: 'RUN_FAILED',
    category: 'execution',
    retryable: false,
  })
})

test('Bun provider socket closure is transient but typed Host failures and unknown effects are not', () => {
  const message =
    'The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()'
  expect(classifyRunFailure(new Error(message))).toMatchObject({ category: 'transient', retryable: true })
  for (const code of ['EFFECT_UNKNOWN', 'RESULT_UNKNOWN', 'USER_CANCELLED', 'RUN_TIMEOUT', 'STORAGE_FAILURE']) {
    expect(classifyRunFailure(new HbarError(code, message)).retryable).toBe(false)
  }
  expect(classifyRunFailure(new Error('fetch failed'))).toMatchObject({ category: 'execution', retryable: false })
})

test('provider transport failures retry only when attributed by the provider boundary', () => {
  for (const code of ['PROVIDER_CONNECTION_FAILED', 'PROVIDER_STREAM_INTERRUPTED'])
    expect(classifyRunFailure(new HbarError(code, 'Provider response interrupted'))).toEqual({
      code,
      category: 'transient',
      retryable: true,
    })
  for (const message of ['Connection error.', 'JSON Parse error: Unterminated string']) {
    expect(classifyRunFailure(new Error(message))).toMatchObject({ category: 'execution', retryable: false })
    expect(classifyRunFailure(new HbarError('STORAGE_FAILURE', message))).toEqual({
      code: 'STORAGE_FAILURE',
      category: 'execution',
      retryable: false,
    })
  }
})

for (const source of ['goal', 'session'] as const) {
  test(`${source} allowance errors preserve their code through PiDriver, operation queries and restart`, async () => {
    const { resource, kernel, session, goals } = await fixture()
    if (source === 'goal') await goals.create(session.id, 'Single request', 1)
    else await kernel.plugins.get<BudgetService>('budget').set(session.id, 1)
    const accepted = await kernel.submit(
      session.id,
      'exhausted',
      { text: '/tool get_budget {}', images: [] },
      'local-fixture',
    )
    await kernel.waitForIdle()
    const failure: RunFailure = {
      code: source === 'goal' ? 'GOAL_BUDGET_EXHAUSTED' : 'BUDGET_EXHAUSTED',
      category: 'budget',
      retryable: false,
      budgetSource: source,
    }
    expect((await kernel.storage.call('run', accepted.id)).failure).toEqual(failure)
    const host = createRunCommands(kernel)
    expect((await host.execute('operation.get', { operationId: accepted.id })).failure).toEqual(failure)
    host.dispose()
    await kernel.close()
    resource.kernel = await Kernel.create({
      home: join(resource.root, 'data'),
      demo: true,
      secrets: new MemorySecrets(),
    })
    expect((await resource.kernel.storage.call('run', accepted.id)).failure).toEqual(failure)
  })
}

test('cancelling an executing run pauses its Goal and cannot be undone by increasing its budget', async () => {
  const { kernel, session, goals } = await fixture()
  await goals.create(session.id, 'Cancelled task', 500)
  let entered!: () => void
  const observed = new Promise<void>((resolve) => {
    entered = resolve
  })
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const dispose = kernel.hooks.on('model.request', async () => {
    entered()
    await gate
  })
  try {
    const accepted = await kernel.submit(session.id, 'cancelled', { text: 'must stop', images: [] }, 'local-fixture')
    await observed
    await kernel.cancel(accepted.id)
    release()
    await kernel.waitForIdle()
    expect(await kernel.storage.call('run', accepted.id)).toMatchObject({
      status: 'cancelled',
      error: 'Cancelled by user',
      failure: { code: 'USER_CANCELLED', category: 'cancelled', retryable: false },
    })
    expect((await goals.get(session.id)).goal?.status).toBe('paused')
    await goals.set(session.id, { tokenBudget: 1000 })
    expect((await goals.get(session.id)).goal?.status).toBe('paused')
  } finally {
    release()
    await dispose()
  }
})

test('queued cancellation pauses the current Goal without starting a provider request', async () => {
  const { kernel, session, goals } = await fixture()
  await goals.create(session.id, 'Queued task')
  const run = await kernel.storage.call(
    'enqueue',
    session.id,
    'cancel-before-start',
    { text: 'queued', images: [] },
    'local-fixture',
  )
  await kernel.cancel(run.id)
  expect((await goals.get(session.id)).goal?.status).toBe('paused')
  expect((await kernel.storage.call('run', run.id)).failure?.code).toBe('USER_CANCELLED')
  expect((await kernel.storage.call('events', session.id, 0)).some((event) => event.type === 'request.started')).toBe(
    false,
  )
})

test('Host start-hook failures stop admission instead of being logged and ignored', async () => {
  const { kernel, session } = await fixture()
  const dispose = kernel.hooks.on('run.start', () => {
    throw new HbarError('RESULT_UNKNOWN', 'Unknown prior effect')
  })
  try {
    const run = await kernel.submit(session.id, 'fail-closed', { text: 'must not run', images: [] }, 'local-fixture')
    await kernel.waitForIdle()
    expect((await kernel.storage.call('run', run.id)).failure).toEqual({
      code: 'RESULT_UNKNOWN',
      category: 'result_unknown',
      retryable: false,
    })
    expect((await kernel.storage.call('events', session.id, 0)).some((event) => event.type === 'request.started')).toBe(
      false,
    )
  } finally {
    await dispose()
  }
})
