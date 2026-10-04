import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { BudgetService, GoalService } from '@hbar/plugin-sdk'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-budget-'))
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
  return {
    resource,
    kernel,
    session,
    goals: kernel.plugins.get<GoalService>('goal'),
    budgets: kernel.plugins.get<BudgetService>('budget'),
  }
}

test('effective allowance follows the smaller ledger without merging their scopes', async () => {
  const { session, goals, budgets } = await fixture()
  const first = await goals.create(session.id, 'Dual allowance', 100)
  expect(first.goal?.executionBudget).toEqual({
    goalRemainingTokens: 100,
    sessionRemainingTokens: null,
    effectiveRemainingTokens: 100,
    limitingSource: 'goal',
  })
  await budgets.set(session.id, 50)
  expect((await goals.get(session.id)).goal?.executionBudget).toEqual({
    goalRemainingTokens: 100,
    sessionRemainingTokens: 50,
    effectiveRemainingTokens: 50,
    limitingSource: 'session',
  })
  await budgets.set(session.id, 100)
  expect((await goals.get(session.id)).goal?.executionBudget?.limitingSource).toBe('both')
  await goals.set(session.id, { tokenBudget: null })
  expect((await goals.get(session.id)).goal?.executionBudget).toEqual({
    goalRemainingTokens: null,
    sessionRemainingTokens: 100,
    effectiveRemainingTokens: 100,
    limitingSource: 'session',
  })
  await budgets.clear(session.id)
  expect((await goals.get(session.id)).goal?.executionBudget).toEqual({
    goalRemainingTokens: null,
    sessionRemainingTokens: null,
    effectiveRemainingTokens: null,
    limitingSource: null,
  })
})

for (const source of ['goal', 'session', 'both'] as const) {
  test(`${source} exhaustion is budget_limited and recovery preserves both ledger totals`, async () => {
    const { kernel, session, goals, budgets } = await fixture()
    await budgets.set(session.id, source === 'goal' ? 10_000 : 1)
    await goals.create(session.id, 'Exhaustion test', source === 'session' ? 10_000 : 1)
    await kernel.submit(session.id, 'exhaust-budget', { text: '/tool get_goal {}', images: [] }, 'local-fixture')
    await kernel.waitForIdle()
    const limited = (await goals.get(session.id)).goal!
    const sessionBudget = (await budgets.get(session.id))!
    expect(limited.status).toBe('budget_limited')
    expect(limited.executionBudget).toMatchObject({ effectiveRemainingTokens: 0, limitingSource: source })
    expect(limited.tokensUsed).toBe(sessionBudget.usedTokens)
    if (source !== 'session') await goals.set(session.id, { tokenBudget: limited.tokensUsed + 100 })
    if (source === 'both') expect((await goals.get(session.id)).goal?.status).toBe('budget_limited')
    if (source !== 'goal') await budgets.set(session.id, sessionBudget.usedTokens + 100)
    expect((await goals.get(session.id)).goal).toMatchObject({
      status: 'active',
      tokensUsed: limited.tokensUsed,
      executionBudget: { effectiveRemainingTokens: 100 },
    })
    expect((await budgets.get(session.id))?.usedTokens).toBe(sessionBudget.usedTokens)
  })
}

for (const status of ['paused', 'blocked', 'complete'] as const) {
  test(`raising or clearing session constraints cannot undo an explicit ${status} Goal`, async () => {
    const { kernel, session, goals, budgets } = await fixture()
    await budgets.set(session.id, 1)
    await goals.create(session.id, 'Explicit stop', 10_000)
    await kernel.submit(session.id, 'limited', { text: 'one request', images: [] }, 'local-fixture')
    await kernel.waitForIdle()
    expect((await goals.get(session.id)).goal?.status).toBe('budget_limited')
    await goals.set(session.id, { status })
    await budgets.set(session.id, 20_000)
    expect((await goals.get(session.id)).goal?.status).toBe(status)
    await budgets.clear(session.id)
    expect((await goals.get(session.id)).goal?.status).toBe(status)
  })
}

test('restart restores pending budget-resume intent but does not invent it for legacy stopped goals', async () => {
  const { resource, kernel, session, goals, budgets } = await fixture()
  await budgets.set(session.id, 1)
  await goals.create(session.id, 'Restarted allowance', 10_000)
  await kernel.submit(session.id, 'limited', { text: 'one request', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  await kernel.close()
  resource.kernel = await Kernel.create({ home: join(resource.root, 'data'), demo: true, secrets: new MemorySecrets() })
  const restoredGoals = resource.kernel.plugins.get<GoalService>('goal')
  const restoredBudgets = resource.kernel.plugins.get<BudgetService>('budget')
  expect((await restoredGoals.get(session.id)).goal?.status).toBe('budget_limited')
  await restoredBudgets.clear(session.id)
  const active = (await restoredGoals.get(session.id)).goal!
  expect(active.status).toBe('active')
  await resource.kernel.append(session.id, 'goal.updated', { goal: { ...active, status: 'budget_limited' } })
  await resource.kernel.close()
  resource.kernel = await Kernel.create({ home: join(resource.root, 'data'), demo: true, secrets: new MemorySecrets() })
  await resource.kernel.plugins.get<BudgetService>('budget').set(session.id, 20_000)
  expect((await resource.kernel.plugins.get<GoalService>('goal').get(session.id)).goal?.status).toBe('budget_limited')
})

test('creating a Goal against an already exhausted session returns the persisted limited state', async () => {
  const { kernel, session, goals, budgets } = await fixture()
  await budgets.set(session.id, 1)
  await kernel.submit(session.id, 'use-session-allowance', { text: 'one request', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  const created = await goals.create(session.id, 'New Goal cannot bypass session allowance', 1000)
  expect(created.goal).toMatchObject({
    status: 'budget_limited',
    tokensUsed: 0,
    executionBudget: {
      goalRemainingTokens: 1000,
      sessionRemainingTokens: 0,
      effectiveRemainingTokens: 0,
      limitingSource: 'session',
    },
  })
  expect((await goals.get(session.id)).goal).toEqual(created.goal)
})
