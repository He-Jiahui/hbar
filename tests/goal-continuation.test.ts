import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyUsage } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { DriverInput, GoalService, HarnessDriver, ModeService } from '@hbar/plugin-sdk'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

function scriptedDriver(script: (input: DriverInput) => Promise<void>) {
  return definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Continuation test driver',
      description: 'Deterministic bounded continuation scenarios',
      permissions: [],
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
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
        summarize: async () => ({ text: 'test summary', usage: emptyUsage() }),
      })
    },
  })
}

async function call(input: DriverInput, name: string, args: Record<string, unknown>) {
  const callId = crypto.randomUUID()
  await input.commit('assistant', [{ type: 'tool_call', callId, name, args }])
  const result = await input.execute(name, args, callId)
  expect(result.isError ?? false).toBe(false)
}

async function fixture(script: (input: DriverInput) => Promise<void> = async () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-continuation-'))
  const driver = scriptedDriver(script)
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
  const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
  return { resource, options, kernel, session, goals: kernel.plugins.get<GoalService>('goal') }
}

test('default Goal executes more than eight autonomous turns with durable Plan progress and completes', async () => {
  let turns = 0
  const { kernel, session, goals } = await fixture(async (input) => {
    turns++
    await call(input, 'update_plan', {
      plan: [{ step: `Verified milestone ${turns}`, status: turns === 12 ? 'completed' : 'in_progress' }],
    })
    if (turns === 12) await call(input, 'update_goal', { status: 'complete' })
  })
  await goals.create(session.id, 'Verify twelve milestones', 100)
  await kernel.submit(session.id, 'start', { text: 'Do the task', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(turns).toBe(12)
  expect((await goals.get(session.id)).goal).toMatchObject({
    status: 'complete',
    tokensUsed: 12,
    continuation: { phase: 'stopped', reason: 'complete' },
  })
  const snapshot = await kernel.snapshot(session.id)
  expect(snapshot.runs.filter((run) => run.input.source === 'goal')).toHaveLength(11)
  expect(new Set(snapshot.runs.map((run) => run.requestId)).size).toBe(12)
})

test('no-tool automatic turns stop with a durable reason instead of consuming the old eight-run allowance', async () => {
  let turns = 0
  const { resource, options, kernel, session, goals } = await fixture(async () => {
    turns++
  })
  await goals.create(session.id, 'Do not echo indefinitely')
  await kernel.submit(session.id, 'start', { text: 'Work', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(turns).toBe(2)
  expect((await goals.get(session.id)).goal?.continuation).toMatchObject({ phase: 'stopped', reason: 'no_tool_calls' })
  await kernel.close()
  resource.kernel = await Kernel.create(options)
  await resource.kernel.waitForIdle()
  expect(turns).toBe(2)
})

test('repeating state queries is not progress and stops after three no-progress turns', async () => {
  let turns = 0
  const { kernel, session, goals } = await fixture(async (input) => {
    turns++
    await call(input, 'get_goal', {})
  })
  await goals.create(session.id, 'Do not query forever')
  await kernel.submit(session.id, 'start', { text: 'Work', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(turns).toBe(3)
  expect((await goals.get(session.id)).goal?.continuation).toMatchObject({ phase: 'stopped', reason: 'no_progress' })
})

test('an explicit continuation ceiling still stops with its own visible reason', async () => {
  let turns = 0
  const {
    kernel,
    session,
    goals: _old,
  } = await fixture(async (input) => {
    turns++
    await call(input, 'update_plan', { plan: [{ step: `Progress ${turns}`, status: 'in_progress' }] })
  })
  await kernel.changePlugin('goal.codex', true, { maxContinuations: 2 })
  const goals = kernel.plugins.get<GoalService>('goal')
  await goals.create(session.id, 'Explicit ceiling')
  await kernel.submit(session.id, 'start', { text: 'Work', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(turns).toBe(3)
  expect((await goals.get(session.id)).goal?.continuation).toMatchObject({
    phase: 'stopped',
    reason: 'continuation_limit',
  })
})

test('budget recovery wakes the persisted intent and reaches completion without another user message', async () => {
  let turns = 0
  const { kernel, session, goals } = await fixture(async (input) => {
    turns++
    await call(input, 'update_plan', {
      plan: [{ step: `Progress ${turns}`, status: turns === 2 ? 'completed' : 'in_progress' }],
    })
    if (turns === 2) await call(input, 'update_goal', { status: 'complete' })
  })
  await goals.create(session.id, 'Resume after allowance recovery', 1)
  await kernel.submit(session.id, 'start', { text: 'Work', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(turns).toBe(1)
  expect((await goals.get(session.id)).goal).toMatchObject({
    status: 'budget_limited',
    continuation: { phase: 'waiting', reason: 'budget_exhausted' },
  })
  await goals.set(session.id, { tokenBudget: 100 })
  await kernel.waitForIdle()
  expect(turns).toBe(2)
  expect((await goals.get(session.id)).goal?.status).toBe('complete')
})

test('duplicate triggers merge into one pending intent, and mode changes wake it after restart', async () => {
  let turns = 0
  const { resource, options, kernel, session, goals } = await fixture(async (input) => {
    turns++
    await call(input, 'update_goal', { status: 'complete' })
  })
  await kernel.plugins.get<ModeService>('mode').set(session.id, 'plan')
  await kernel.waitForIdle()
  const goal = (await goals.create(session.id, 'Persisted intent')).goal!
  const request = { goalId: goal.goalId!, trigger: 'review-return', modelId: 'local-fixture' }
  await Promise.all([goals.requestContinuation(session.id, request), goals.requestContinuation(session.id, request)])
  await kernel.waitForIdle()
  const intent = (await goals.get(session.id)).goal?.continuation?.intentId
  expect((await goals.get(session.id)).goal?.continuation?.reason).toBe('plan_mode')
  await kernel.close()
  resource.kernel = await Kernel.create(options)
  await resource.kernel.waitForIdle()
  expect(turns).toBe(0)
  const restored = resource.kernel.plugins.get<GoalService>('goal')
  expect((await restored.get(session.id)).goal?.continuation?.intentId).toBe(intent)
  await resource.kernel.plugins.get<ModeService>('mode').set(session.id, 'default')
  await resource.kernel.waitForIdle()
  expect(turns).toBe(1)
  await restored.requestContinuation(session.id, request)
  await resource.kernel.waitForIdle()
  expect(turns).toBe(1)
})

test('user messages queued during automatic admission execute first and invalidate the old intent', async () => {
  const seen: string[] = []
  const { kernel, session, goals } = await fixture(async (input) => {
    seen.push(input.run.input.text)
    await call(input, 'update_goal', { status: 'complete' })
  })
  const goal = (await goals.create(session.id, 'User priority')).goal!
  let entered!: () => void
  const observed = new Promise<void>((resolve) => {
    entered = resolve
  })
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const original = kernel.submit.bind(kernel)
  kernel.submit = async (...args: Parameters<Kernel['submit']>) => {
    if (args[2].continuation) {
      entered()
      await gate
    }
    return original(...args)
  }
  await goals.requestContinuation(session.id, {
    goalId: goal.goalId!,
    trigger: 'auto',
    modelId: 'local-fixture',
    text: 'automatic',
  })
  await observed
  await kernel.storage.call(
    'enqueue',
    session.id,
    'user-priority',
    { text: 'user message', images: [] },
    'local-fixture',
  )
  release()
  await kernel.waitForIdle()
  expect(seen).toEqual(['user message'])
  expect((await goals.get(session.id)).goal?.status).toBe('complete')
})

for (const change of ['pause', 'replace', 'clear'] as const) {
  test(`${change} between idle scheduling and enqueue prevents stale automatic execution`, async () => {
    let turns = 0
    const { kernel, session, goals } = await fixture(async () => {
      turns++
    })
    const goal = (await goals.create(session.id, 'Old intent')).goal!
    let entered!: () => void
    const observed = new Promise<void>((resolve) => {
      entered = resolve
    })
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = kernel.submit.bind(kernel)
    kernel.submit = async (...args: Parameters<Kernel['submit']>) => {
      if (args[2].continuation) {
        entered()
        await gate
      }
      return original(...args)
    }
    await goals.requestContinuation(session.id, { goalId: goal.goalId!, trigger: 'auto', modelId: 'local-fixture' })
    await observed
    if (change === 'pause') await goals.set(session.id, { status: 'paused' })
    else if (change === 'clear') await goals.clear(session.id)
    else await goals.set(session.id, { objective: 'Replacement', expectedGoalId: goal.goalId })
    release()
    await kernel.waitForIdle()
    expect(turns).toBe(0)
    if (change === 'replace')
      expect((await goals.get(session.id)).goal).toMatchObject({
        objective: 'Replacement',
        tokensUsed: 0,
        status: 'active',
      })
  })
}

test('a lost enqueue acknowledgement is reconciled using the same durable request id', async () => {
  let turns = 0
  const { kernel, session, goals } = await fixture(async (input) => {
    turns++
    await call(input, 'update_goal', { status: 'complete' })
  })
  const goal = (await goals.create(session.id, 'Reconcile admission')).goal!
  const original = kernel.submit.bind(kernel)
  kernel.submit = async (...args: Parameters<Kernel['submit']>) => {
    const run = await original(...args)
    if (args[2].continuation) throw new Error('simulated lost admission acknowledgement')
    return run
  }
  await goals.requestContinuation(session.id, { goalId: goal.goalId!, trigger: 'review', modelId: 'local-fixture' })
  await kernel.waitForIdle()
  expect(turns).toBe(1)
  expect((await kernel.snapshot(session.id)).runs).toHaveLength(1)
  expect((await goals.get(session.id)).goal?.status).toBe('complete')
})

test('failed admission has a persistent stop reason instead of an unexplained queued intent', async () => {
  const { kernel, session, goals } = await fixture()
  const goal = (await goals.create(session.id, 'Invalid admission')).goal!
  await goals.requestContinuation(session.id, { goalId: goal.goalId!, trigger: 'review', modelId: 'missing-model' })
  await kernel.waitForIdle()
  expect((await goals.get(session.id)).goal?.continuation).toMatchObject({ phase: 'stopped', reason: 'run_failed' })
  expect((await kernel.snapshot(session.id)).runs).toHaveLength(0)
})

test('explicit resume starts a fresh intent but merely raising a paused Goal budget does not', async () => {
  let turns = 0
  const { kernel, session, goals } = await fixture(async (input) => {
    turns++
    if (turns === 3) await call(input, 'update_goal', { status: 'complete' })
  })
  await goals.create(session.id, 'Resume consciously', 100)
  await kernel.submit(session.id, 'start', { text: 'Work', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(turns).toBe(2)
  await goals.set(session.id, { status: 'paused' })
  await goals.set(session.id, { tokenBudget: 200 })
  await kernel.waitForIdle()
  expect(turns).toBe(2)
  await goals.set(session.id, { status: 'active' })
  await kernel.waitForIdle()
  expect(turns).toBe(3)
  expect((await goals.get(session.id)).goal?.status).toBe('complete')
})
