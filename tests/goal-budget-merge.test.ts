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
  const root = await mkdtemp(join(tmpdir(), 'hbar-budget-merge-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })
  await kernel.changePlugin('budget.codex', true, { autoContinue: true, maxContinuations: 1 })
  await kernel.changePlugin('goal.codex', true, { autoContinue: true, maxContinuations: 1 })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Fixture workspace missing')
  const session = await kernel.createSession(workspace.id)
  const budget = kernel.plugins.get<BudgetService>('budget')
  const goals = kernel.plugins.get<GoalService>('goal')
  await budget.set(session.id, 1_000_000)
  return { kernel, session, budget, goals }
}

test('merged default composition starts and active Goal owns exactly one continuation', async () => {
  const { kernel, session, goals, budget } = await fixture()
  await goals.create(session.id, 'Check single continuation owner')
  await kernel.submit(session.id, 'one-owner', { text: 'continue', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  const runs = (await kernel.snapshot(session.id)).runs
  expect(runs).toHaveLength(2)
  expect(runs.filter((run) => run.input.source === 'goal')).toHaveLength(1)
  expect(runs.filter((run) => run.input.source === 'system')).toHaveLength(0)
  expect(runs.every((run) => run.status === 'completed')).toBe(true)
  expect((await goals.get(session.id)).goal?.tokensUsed).toBe((await budget.get(session.id))?.usedTokens)
})

for (const status of ['paused', 'blocked', 'complete'] as const) {
  test(`budget cannot bypass an explicit ${status} Goal`, async () => {
    const { kernel, session, goals } = await fixture()
    await goals.create(session.id, 'Respect explicit lifecycle')
    await goals.set(session.id, { status })
    await kernel.submit(session.id, `stopped-${status}`, { text: 'ordinary user message', images: [] }, 'local-fixture')
    await kernel.waitForIdle()
    expect((await kernel.snapshot(session.id)).runs).toHaveLength(1)
    expect((await goals.get(session.id)).goal?.status).toBe(status)
  })
}

test('budget-only continuation remains bounded and does not create an implicit Goal', async () => {
  const { kernel, session, goals } = await fixture()
  await kernel.submit(session.id, 'budget-only', { text: 'continue', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  const runs = (await kernel.snapshot(session.id)).runs
  expect(runs).toHaveLength(2)
  expect(runs.filter((run) => run.input.source === 'system')).toHaveLength(1)
  expect((await goals.get(session.id)).goal).toBeNull()
})

test('budget-only Plan runs do not enqueue implementation automatically', async () => {
  const { kernel, session } = await fixture()
  await kernel.submit(session.id, 'plan-only', { text: 'plan only', images: [], mode: 'plan' }, 'local-fixture')
  await kernel.waitForIdle()
  expect((await kernel.snapshot(session.id)).runs).toHaveLength(1)
})
