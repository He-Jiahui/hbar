import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyUsage } from '@hbar/contracts'
import { GoalRuntime } from '@hbar/goal'
import { BudgetRuntime } from '@hbar/budget'
import { Kernel, MemorySecrets } from '@hbar/kernel'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-account-recover-'))
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
  const goals = kernel.plugins.get<GoalRuntime>('goal')
  const budgets = kernel.plugins.get<BudgetRuntime>('budget')
  await goals.create(session.id, 'Crash-bound accounting', 50)
  await budgets.set(session.id, 100)
  await kernel.storage.call('enqueue', session.id, 'crashed', { text: 'pending usage', images: [] }, 'local-fixture')
  const run = (await kernel.storage.call('claim', session.id))!
  await goals.startRun({ sessionId: session.id, runId: run.id, run })
  return { resource, kernel, session, goals, budgets, run }
}

for (const checkpoint of [false, true]) {
  test(`startup reconciles usage before admission (${checkpoint ? 'after a partial checkpoint' : 'without a step callback'})`, async () => {
    const { resource, kernel, session, goals, budgets, run } = await fixture()
    const step = { sessionId: session.id, runId: run.id, stepId: 'partial' }
    if (checkpoint) {
      await kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), input: 20 }, run.id)
      await budgets.accountStep(step)
      await goals.accountStep(step)
    }
    await kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), input: checkpoint ? 40 : 60 }, run.id)
    await kernel.close()
    resource.kernel = await Kernel.create({
      home: join(resource.root, 'data'),
      demo: true,
      secrets: new MemorySecrets(),
    })
    const restoredGoals = resource.kernel.plugins.get<GoalRuntime>('goal')
    const restoredBudgets = resource.kernel.plugins.get<BudgetRuntime>('budget')
    expect((await restoredGoals.get(session.id)).goal).toMatchObject({
      tokensUsed: 60,
      status: 'budget_limited',
      executionBudget: { goalRemainingTokens: 0, sessionRemainingTokens: 40, effectiveRemainingTokens: 0 },
    })
    expect((await restoredBudgets.get(session.id))?.usedTokens).toBe(60)
    const interrupted = await resource.kernel.storage.call('run', run.id)
    expect(interrupted.status).toBe('interrupted')
    await restoredGoals.accountRun({ ...step, status: interrupted.status, run: interrupted })
    await restoredBudgets.accountRun({ ...step, status: interrupted.status, run: interrupted })
    expect((await restoredGoals.get(session.id)).goal?.tokensUsed).toBe(60)
    expect((await restoredBudgets.get(session.id))?.usedTokens).toBe(60)
    const accepted = await resource.kernel.submit(
      session.id,
      'after-recovery',
      { text: 'no remaining Goal budget', images: [] },
      'local-fixture',
    )
    await resource.kernel.waitForIdle()
    expect((await resource.kernel.storage.call('run', accepted.id)).failure?.category).toBe('budget')
    expect(
      (await resource.kernel.storage.call('events', session.id, 0)).some((event) => event.type === 'request.started'),
    ).toBe(false)
  })
}

test('startup settles a terminal run whose end callback was lost and restores a committed user cancellation', async () => {
  const { resource, kernel, session, run } = await fixture()
  await kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), input: 60 }, run.id)
  await kernel.storage.call('setRun', run.id, 'cancelled', 'Cancelled by user', {
    code: 'USER_CANCELLED',
    category: 'cancelled',
    retryable: false,
  })
  await kernel.close()
  resource.kernel = await Kernel.create({ home: join(resource.root, 'data'), demo: true, secrets: new MemorySecrets() })
  const goals = resource.kernel.plugins.get<GoalRuntime>('goal')
  expect((await goals.get(session.id)).goal).toMatchObject({ tokensUsed: 60, status: 'paused' })
  await goals.set(session.id, { tokenBudget: 1000 })
  expect((await goals.get(session.id)).goal?.status).toBe('paused')
})
