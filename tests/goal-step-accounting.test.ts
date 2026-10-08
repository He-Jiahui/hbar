import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyUsage } from '@hbar/contracts'
import type { Run } from '@hbar/contracts'
import { GoalRuntime } from '@hbar/goal'
import { Kernel, MemorySecrets } from '@hbar/kernel'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-step-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const resource = { root, kernel }
  resources.push(resource)
  await kernel.changePlugin('goal.codex', true, { autoContinue: false, maxContinuations: 0 })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  return { resource, kernel, session, goals: kernel.plugins.get<GoalRuntime>('goal') }
}

function runFor(sessionId: string): Run {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    sessionId,
    requestId: crypto.randomUUID(),
    input: { text: 'test', images: [] },
    modelId: 'local-fixture',
    status: 'completed',
    createdAt: now,
    startedAt: now,
    endedAt: now,
    error: null,
  }
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
    return null
  } catch (error) {
    return error
  }
}

test('Goal timing samples only bound live execution and never count idle, completed or offline time', async () => {
  const { kernel, session, goals } = await fixture()
  await goals.create(session.id, 'Observe actual execution')
  expect((await goals.get(session.id)).goal?.timing).toMatchObject({ running: false, elapsedMilliseconds: 0 })
  const run = { ...runFor(session.id), status: 'running' as const, endedAt: null, startedAt: Date.now() - 3500 }
  await goals.startRun({ sessionId: session.id, runId: run.id, run })
  const live = (await goals.get(session.id)).goal!
  expect(live.timeUsedSeconds).toBe(0)
  expect(live.timing?.running).toBe(true)
  expect(live.timing!.elapsedMilliseconds).toBeGreaterThanOrEqual(3500)
  const snapshot = await goals.snapshot(session.id)
  expect(snapshot.seq).toBe((await kernel.storage.call('events', session.id, 0)).at(-1)!.seq)
  await goals.set(session.id, { status: 'paused', expectedGoalId: live.goalId })
  // Pausing continuation does not stop the currently executing Run.
  expect((await goals.get(session.id)).goal?.timing?.running).toBe(true)
  const ended = { ...run, status: 'completed' as const, endedAt: Date.now() }
  await goals.accountRun({ sessionId: session.id, runId: run.id, run: ended, status: 'completed' })
  const settled = (await goals.get(session.id)).goal!
  expect(settled.timing).toMatchObject({ running: false, elapsedMilliseconds: settled.timeUsedSeconds * 1000 })
  expect(settled.timeUsedSeconds).toBeGreaterThanOrEqual(3)
  for (const event of await kernel.storage.call('events', session.id, 0)) {
    if (event.type.startsWith('goal.')) expect(JSON.stringify(event.data)).not.toContain('elapsedMilliseconds')
  }
})

test('Goal settles each model step and blocks a second request when its own allowance is exhausted', async () => {
  const { kernel, session, goals } = await fixture()
  await goals.create(session.id, 'One-request allowance', 1)
  const accepted = await kernel.submit(
    session.id,
    'one-step',
    { text: '/tool get_goal {}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  const events = await kernel.storage.call('events', session.id, 0)
  expect(events.filter((event) => event.type === 'request.started')).toHaveLength(1)
  const run = await kernel.storage.call('run', accepted.id)
  expect(run.error).toContain('Goal token budget exhausted')
  expect((await goals.get(session.id)).goal?.status).toBe('budget_limited')
  const used = (await goals.get(session.id)).goal!.tokensUsed
  await goals.accountRun({ sessionId: session.id, runId: run.id, run, status: run.status })
  expect((await goals.get(session.id)).goal!.tokensUsed).toBe(used)
  expect(events.find((event) => event.type === 'goal.accounted')!.seq).toBeLessThan(
    events.find((event) => event.type === 'run.settled')!.seq,
  )
})

test('Goal checkpoints restore their run binding and charge usage exactly once after Host restart', async () => {
  const { resource, kernel, session, goals } = await fixture()
  await goals.create(session.id, 'Checkpointed task', 200)
  const run = runFor(session.id)
  const step = { sessionId: session.id, runId: run.id, stepId: 'checkpoint' }
  await goals.startRun({ ...step, run })
  await kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), input: 80, cacheRead: 30, output: 10 }, run.id)
  await goals.accountStep(step)
  await goals.accountStep(step)
  expect((await goals.get(session.id)).goal!.tokensUsed).toBe(60)
  await kernel.close()
  resource.kernel = await Kernel.create({ home: join(resource.root, 'data'), demo: true, secrets: new MemorySecrets() })
  const restored = resource.kernel.plugins.get<GoalRuntime>('goal')
  await restored.startRun({ ...step, run })
  await restored.accountStep(step)
  expect((await restored.get(session.id)).goal!.tokensUsed).toBe(60)
  await resource.kernel.append(
    session.id,
    'usage.recorded',
    { ...emptyUsage(), input: 5, cacheRead: 10, output: 25 },
    run.id,
  )
  await restored.accountStep({ ...step, stepId: 'second' })
  await restored.accountRun({ ...step, run, status: run.status })
  await restored.accountRun({ ...step, run, status: run.status })
  expect((await restored.get(session.id)).goal!.tokensUsed).toBe(85)
})

test('a replaced Goal cannot inherit an old run after Host restart or missing-binding callbacks', async () => {
  const { resource, kernel, session, goals } = await fixture()
  const original = await goals.create(session.id, 'Original task')
  const run = runFor(session.id)
  const step = { sessionId: session.id, runId: run.id, stepId: 'old' }
  await goals.startRun({ ...step, run })
  await goals.set(session.id, { objective: 'Replacement', expectedGoalId: original.goal?.goalId })
  await kernel.close()
  resource.kernel = await Kernel.create({ home: join(resource.root, 'data'), demo: true, secrets: new MemorySecrets() })
  const restored = resource.kernel.plugins.get<GoalRuntime>('goal')
  await restored.startRun({ ...step, run })
  await resource.kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), input: 99 }, run.id)
  await restored.accountStep(step)
  expect(await rejection(restored.update(session.id, 'complete', run.id))).toMatchObject({ code: 'GOAL_CONFLICT' })
  await restored.accountRun({ ...step, run, status: run.status })
  await restored.startRun({ ...step, run })
  await restored.accountStep(step)
  const unbound = runFor(session.id)
  await resource.kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), input: 88 }, unbound.id)
  await restored.accountRun({ sessionId: session.id, runId: unbound.id, run: unbound, status: unbound.status })
  expect((await restored.get(session.id)).goal).toMatchObject({
    objective: 'Replacement',
    tokensUsed: 0,
    status: 'active',
  })
})

test('Goal creation inside a run excludes pre-creation usage and checkpoint pauses preserve explicit intent', async () => {
  const { kernel, session, goals } = await fixture()
  const run = runFor(session.id)
  const step = { sessionId: session.id, runId: run.id, stepId: 'created-in-run' }
  await kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), input: 100 }, run.id)
  await goals.create(session.id, 'Created mid-run', 5, run.id, run.startedAt!)
  await goals.accountStep(step)
  expect((await goals.get(session.id)).goal!.tokensUsed).toBe(0)
  await kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), input: 10 }, run.id)
  await goals.accountStep(step)
  expect((await goals.get(session.id)).goal!.status).toBe('budget_limited')
  await goals.set(session.id, { status: 'paused' })
  await kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), output: 2 }, run.id)
  await goals.accountRun({ ...step, run, status: run.status })
  expect((await goals.get(session.id)).goal).toMatchObject({ tokensUsed: 12, status: 'paused' })
})

test('unknown Goal settlement acknowledgement fails closed and recovers its atomic checkpoint', async () => {
  const { resource, kernel, session, goals } = await fixture()
  await goals.create(session.id, 'Lost acknowledgement task', 200)
  const run = runFor(session.id)
  const step = { sessionId: session.id, runId: run.id, stepId: 'lost-ack' }
  await goals.startRun({ ...step, run })
  const append = kernel.append.bind(kernel)
  let loseAck = true
  kernel.append = async (...args: Parameters<Kernel['append']>) => {
    const event = await append(...args)
    if (args[1] === 'goal.accounted' && loseAck) {
      loseAck = false
      throw new Error('simulated lost Goal acknowledgement')
    }
    return event
  }
  await kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), input: 60 }, run.id)
  expect(await rejection(goals.accountStep(step))).toBeInstanceOf(Error)
  // The merged Host queries authoritative Goal state before accepting a Run;
  // unknown state must fail at admission, not create a Run that later fails.
  expect(
    await rejection(kernel.submit(session.id, 'unknown-goal', { text: 'must not run', images: [] }, 'local-fixture')),
  ).toMatchObject({ code: 'RESULT_UNKNOWN', message: 'Goal state requires Host recovery' })
  await kernel.waitForIdle()
  expect(await kernel.storage.call('runByRequest', session.id, 'unknown-goal')).toBeNull()
  expect(
    (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'request.started'),
  ).toHaveLength(0)
  await kernel.close()
  resource.kernel = await Kernel.create({ home: join(resource.root, 'data'), demo: true, secrets: new MemorySecrets() })
  const restored = resource.kernel.plugins.get<GoalRuntime>('goal')
  await restored.accountStep(step)
  expect((await restored.get(session.id)).goal!.tokensUsed).toBe(60)
})
