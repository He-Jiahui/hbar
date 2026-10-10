import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyUsage, HbarError } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { DriverInput, GoalService, HarnessDriver } from '@hbar/plugin-sdk'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function complete(input: DriverInput) {
  const callId = crypto.randomUUID()
  const args = { status: 'complete' }
  await input.commit('assistant', [{ type: 'tool_call', name: 'update_goal', callId, args }])
  expect((await input.execute('update_goal', args, callId)).isError ?? false).toBe(false)
}

async function fixture(script: (input: DriverInput) => Promise<void>, retryDelayMs = 20) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-transient-'))
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Retry fixture',
      description: 'Deterministic transient failures',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      permissions: [],
      provides: { driver: '1.0.0' },
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        run: async (input) => {
          const step = crypto.randomUUID()
          await input.beforeRequest(input.request, step)
          await input.emit('usage.recorded', { ...emptyUsage(), output: 1 }, step)
          await script(input)
          await input.stepEnded(step)
        },
        summarize: async () => ({ text: '', usage: emptyUsage() }),
      })
    },
  })
  const options = {
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    profile: { replacements: { 'driver.pi': driver } },
  }
  const kernel = await Kernel.create(options)
  const resource = { root, kernel }
  resources.push(resource)
  await kernel.changePlugin('goal.codex', true, { retryDelayMs })
  const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
  const goals = kernel.plugins.get<GoalService>('goal')
  await goals.create(session.id, 'Recover from temporary provider failure', 100)
  return { kernel, goals, session, resource, options }
}

async function waiting(goals: GoalService, sessionId: string) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const goal = (await goals.get(sessionId)).goal
    if (goal?.continuation?.reason === 'retry_wait') return goal
    await Bun.sleep(10)
  }
  throw new Error('Retry was not scheduled')
}

test('two transient failures back off and complete automatically with exact accounting', async () => {
  const starts: number[] = []
  const { kernel, goals, session } = await fixture(async (input) => {
    starts.push(Date.now())
    if (starts.length < 3) throw new Error('503 temporarily unavailable')
    await complete(input)
  })
  await kernel.submit(session.id, 'start', { text: 'Work', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(starts).toHaveLength(3)
  expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(20)
  expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(40)
  expect((await goals.get(session.id)).goal).toMatchObject({ status: 'complete', tokensUsed: 3 })
})

test('Bun socket interruption resumes with bounded backoff and settled usage without a user decision', async () => {
  let calls = 0
  const { kernel, goals, session } = await fixture(async (input) => {
    if (++calls < 3)
      throw new Error(
        'The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()',
      )
    await complete(input)
  })
  await kernel.submit(session.id, 'socket', { text: 'Work', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(calls).toBe(3)
  expect((await goals.get(session.id)).goal).toMatchObject({ status: 'complete', tokensUsed: 3 })
  expect(
    (await kernel.snapshot(session.id)).runs
      .filter((run) => run.status === 'failed')
      .map((run) => run.failure?.category),
  ).toEqual(['transient', 'transient'])
})

test('transient retry exhaustion is bounded, durable and not a fabricated blocker', async () => {
  let calls = 0
  let failing = true
  const { kernel, goals, session, options, resource } = await fixture(async (input) => {
    calls++
    if (failing) throw new Error('429 rate limit')
    expect((await resource.kernel.storage.call('run', input.run.id)).status).toBe('running')
    expect((await resource.kernel.plugins.get<GoalService>('goal').get(session.id)).goal?.status).toBe('active')
    await complete(input)
  })
  await kernel.submit(session.id, 'start', { text: 'Work', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(calls).toBe(3)
  expect((await goals.get(session.id)).goal).toMatchObject({
    status: 'paused',
    continuation: { phase: 'stopped', reason: 'retry_exhausted' },
    timing: { running: false },
  })
  await kernel.close()
  resource.kernel = await Kernel.create(options)
  await resource.kernel.waitForIdle()
  expect(calls).toBe(3)
  const restored = resource.kernel.plugins.get<GoalService>('goal')
  const paused = (await restored.get(session.id)).goal!
  expect(paused).toMatchObject({ status: 'paused', continuation: { reason: 'retry_exhausted' } })
  expect((await resource.kernel.snapshot(session.id)).runs.every((run) => run.status === 'failed')).toBe(true)
  failing = false
  await restored.set(session.id, { status: 'active', expectedGoalId: paused.goalId })
  await resource.kernel.waitForIdle()
  expect(calls).toBe(4)
  expect((await restored.get(session.id)).goal).toMatchObject({ status: 'complete', tokensUsed: 4 })
})

test('a pending backoff survives restart and resumes the same intent once', async () => {
  let calls = 0
  const { kernel, goals, session, options, resource } = await fixture(async (input) => {
    if (++calls === 1) throw new Error('ECONNRESET')
    await complete(input)
  }, 1000)
  await kernel.submit(session.id, 'start', { text: 'Work', images: [] }, 'local-fixture')
  const pending = await waiting(goals, session.id)
  await kernel.close()
  expect(calls).toBe(1)
  resource.kernel = await Kernel.create(options)
  await resource.kernel.waitForIdle()
  expect(calls).toBe(2)
  const runs = (await resource.kernel.snapshot(session.id)).runs
  expect(runs.some((run) => run.requestId === `goal-${pending.continuation!.intentId}`)).toBe(true)
  expect((await resource.kernel.plugins.get<GoalService>('goal').get(session.id)).goal?.status).toBe('complete')
})

test('explicit pause cancels the backoff without waiting for or starting the retry', async () => {
  let calls = 0
  const { kernel, goals, session } = await fixture(async () => {
    calls++
    throw new Error('503')
  }, 30_000)
  await kernel.submit(session.id, 'start', { text: 'Work', images: [] }, 'local-fixture')
  await waiting(goals, session.id)
  await goals.set(session.id, { status: 'paused' })
  await kernel.waitForIdle()
  expect(calls).toBe(1)
  expect((await goals.get(session.id)).goal).toMatchObject({ status: 'paused', continuation: { reason: 'paused' } })
})

test('a user turn supersedes waiting automatic work', async () => {
  const sources: string[] = []
  const { kernel, goals, session } = await fixture(async (input) => {
    sources.push(input.run.input.source ?? 'user')
    if (sources.length === 1) throw new Error('503')
    await complete(input)
  }, 30_000)
  await kernel.submit(session.id, 'start', { text: 'Work', images: [] }, 'local-fixture')
  await waiting(goals, session.id)
  await kernel.submit(session.id, 'user', { text: 'Continue now', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(sources).toEqual(['user', 'user'])
  expect((await goals.get(session.id)).goal?.status).toBe('complete')
})

for (const [code, message, reason] of [
  ['EFFECT_UNKNOWN', '503 during write acknowledgement', 'result_unknown'],
  ['RESULT_UNKNOWN', 'The socket connection was closed unexpectedly', 'result_unknown'],
  ['PROVIDER_QUOTA', 'insufficient quota', 'usage_limited'],
  ['RUN_TIMEOUT', 'execution timeout', 'run_failed'],
] as const)
  test(`${code} does not enter transient retry`, async () => {
    let calls = 0
    const { kernel, goals, session } = await fixture(async () => {
      calls++
      throw new HbarError(code, message)
    })
    await kernel.submit(session.id, 'start', { text: 'Work', images: [] }, 'local-fixture')
    await kernel.waitForIdle()
    expect(calls).toBe(1)
    expect((await goals.get(session.id)).goal).toMatchObject({
      status: reason === 'usage_limited' ? 'usage_limited' : 'paused',
      continuation: { phase: 'stopped', reason },
      timing: { running: false },
    })
  })

for (const automatic of [false, true])
  test(`stopping a ${automatic ? 'Goal continuation' : 'user Run'} also pauses its Goal`, async () => {
    let started!: (input: DriverInput) => void
    const running = new Promise<DriverInput>((resolve) => {
      started = resolve
    })
    let calls = 0
    const { kernel, goals, session } = await fixture(async (input) => {
      calls++
      if (automatic && input.run.input.source !== 'goal') return
      started(input)
      await new Promise<void>((_resolve, reject) => {
        const cancel = () => reject(input.signal.reason)
        if (input.signal.aborted) cancel()
        else input.signal.addEventListener('abort', cancel, { once: true })
      })
    })
    await kernel.submit(session.id, 'start', { text: 'Work', images: [] }, 'local-fixture')
    const input = await running
    expect((await goals.get(session.id)).goal).toMatchObject({ status: 'active', timing: { running: true } })
    await kernel.cancel(input.run.id)
    await kernel.waitForIdle()
    expect((await kernel.storage.call('run', input.run.id)).status).toBe('cancelled')
    expect((await goals.get(session.id)).goal).toMatchObject({
      status: 'paused',
      tokensUsed: automatic ? 2 : 1,
      timing: { running: false },
    })
    expect(calls).toBe(automatic ? 2 : 1)
  })
