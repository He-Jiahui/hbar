import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { GoalService, PlanService } from '@hbar/plugin-sdk'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-'))
  const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, demo: true, secrets: new MemorySecrets() })
  resources.push({ root, kernel })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  await kernel.changePlugin('goal.codex', true, { autoContinue: false, maxContinuations: 0 })
  return { root, kernel, session }
}

async function expectRejected(promise: Promise<unknown>, message: string) {
  try {
    await promise
    throw new Error('Expected the operation to reject')
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain(message)
  }
}

test('goal creation, blocked audit, external resume, and persistence follow Codex rules', async () => {
  const { root, kernel, session } = await fixture()
  const goals = kernel.plugins.get<GoalService>('goal')
  const created = await goals.create(session.id, '  finish the verified task  ', 100)
  expect(created.goal?.objective).toBe('finish the verified task')
  expect(created.goal?.status).toBe('active')
  await expectRejected(goals.create(session.id, 'another'), 'unfinished goal')
  const blocked = await goals.update(session.id, 'blocked')
  expect(blocked.goal?.status).toBe('blocked')
  const resumed = await goals.set(session.id, { status: 'active', expectedGoalId: created.goal?.goalId })
  expect(resumed.goal?.status).toBe('active')
  const events = await kernel.storage.call('events', session.id, 0, 1000)
  expect(events.some((event) => event.type === 'goal.updated')).toBeTrue()

  await kernel.close()
  const index = resources.findIndex((entry) => entry.kernel === kernel)
  if (index >= 0) resources.splice(index, 1)
  const restarted = await Kernel.create({ home: join(root, 'data'), workspace: root, demo: true, secrets: new MemorySecrets() })
  resources.push({ root, kernel: restarted })
  const restored = await restarted.plugins.get<GoalService>('goal').get(session.id)
  expect(restored.goal?.status).toBe('active')
  expect(restored.goal?.objective).toBe('finish the verified task')
})

test('goal creation and null budget updates follow the configured maximum', async () => {
  const { kernel, session } = await fixture()
  await kernel.changePlugin('goal.codex', true, { maxTokenBudget: 200, autoContinue: false, maxContinuations: 0 })
  const goals = kernel.plugins.get<GoalService>('goal')
  const created = await goals.create(session.id, 'bounded goal')
  expect(created.goal?.tokenBudget).toBe(200)
  await expectRejected(goals.set(session.id, { tokenBudget: 201 }), 'maximum allowed')
  const unbounded = await goals.set(session.id, { tokenBudget: null, expectedGoalId: created.goal?.goalId })
  expect(unbounded.goal?.tokenBudget).toBe(200)
})

test('goal accounting uses input minus cache plus output and plan-mode runs are excluded', async () => {
  const { kernel, session } = await fixture()
  const goals = kernel.plugins.get<GoalService>('goal')
  await goals.create(session.id, 'account usage', 1)
  const normal = await kernel.submit(session.id, 'normal', { text: 'hello', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  const afterNormal = await goals.get(session.id)
  expect(afterNormal.goal?.tokensUsed).toBeGreaterThan(0)
  expect(afterNormal.goal?.status).toBe('budget_limited')

  await goals.set(session.id, { objective: 'plan work', status: 'active', tokenBudget: null })
  const planRun = await kernel.submit(session.id, 'plan', { text: 'plan only', images: [], mode: 'plan' }, 'local-fixture')
  await kernel.waitForIdle()
  const afterPlan = await goals.get(session.id)
  expect(afterPlan.goal?.tokensUsed).toBe(afterNormal.goal?.tokensUsed)
  expect((await kernel.storage.call('run', normal.id)).status).toBe('completed')
  expect((await kernel.storage.call('run', planRun.id)).status).toBe('completed')
})

test('goal and plan control tools use the current run session and persist state', async () => {
  const { kernel, session } = await fixture()
  const goals = kernel.plugins.get<GoalService>('goal')
  const plans = kernel.plugins.get<PlanService>('plan')
  await goals.create(session.id, 'tool objective')
  await kernel.submit(session.id, 'get-goal', { text: '/tool get_goal {}', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  const snapshot = await kernel.snapshot(session.id)
  expect(snapshot.messages.flatMap((message) => message.content).some((block) => block.type === 'tool_result' && block.name === 'get_goal')).toBeTrue()
  const plan = await plans.update(session.id, [
    { step: 'inspect', status: 'completed' },
    { step: 'ship', status: 'in_progress' },
  ], 'Keep the objective visible')
  expect(plan.plan).toHaveLength(2)
  expect((await plans.get(session.id))?.explanation).toBe('Keep the objective visible')
})

test('mode service supplies the persisted run mode and update_plan is rejected only in Plan mode', async () => {
  const { root, kernel, session } = await fixture()
  await kernel.setPermissionMode('allow')
  const mode = kernel.plugins.get<{ get(id: string): Promise<{ mode: 'default' | 'plan' }>; set(id: string, value: 'default' | 'plan'): Promise<{ mode: 'default' | 'plan' }> }>('mode')
  expect((await mode.get(session.id)).mode).toBe('default')
  await mode.set(session.id, 'plan')
  const blocked = await kernel.submit(
    session.id,
    'plan-tool-blocked',
    { text: '/tool update_plan {"plan":[{"step":"inspect","status":"in_progress"}]}' , images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect((await kernel.storage.call('run', blocked.id)).input.mode).toBe('plan')
  expect((await kernel.snapshot(session.id)).messages.flatMap((message) => message.content).some((block) => block.type === 'tool_result' && block.isError && block.text.includes('Plan mode'))).toBeTrue()

  await mode.set(session.id, 'default')
  const accepted = await kernel.submit(
    session.id,
    'plan-tool-accepted',
    { text: '/tool update_plan {"plan":[{"step":"ship","status":"in_progress"}]}' , images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect((await kernel.storage.call('run', accepted.id)).input.mode).toBe('default')
  expect((await kernel.plugins.get<PlanService>('plan').get(session.id))?.plan[0]?.step).toBe('ship')
  expect(await Bun.file(join(root, 'unused.txt')).exists()).toBe(false)
})
