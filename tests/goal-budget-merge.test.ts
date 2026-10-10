import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { HbarClient } from '@hbar/client'
import type { BudgetService, GoalService } from '@hbar/plugin-sdk'
import { startServer } from '../apps/host/src/server.ts'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture(limit = 1_000_000) {
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
  await budget.set(session.id, limit)
  return { kernel, session, budget, goals }
}

async function rejection(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected an admission rejection')
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

test('RPC budget exhaustion rejects deterministically and raising allowance permits the same unaccepted key', async () => {
  const { kernel, session, goals, budget } = await fixture(1)
  await goals.create(session.id, 'Validate exhaustion admission', 10_000)
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  try {
    await client.pair(host.pairing.code, 'budget admission fixture')
    const input = {
      sessionId: session.id,
      requestId: 'initial',
      input: { text: 'hello', images: [] },
      modelId: 'local-fixture',
    }
    await client.call('run.start', input)
    await kernel.waitForIdle()
    const exhausted = await budget.get(session.id)
    if (!exhausted) throw new Error('Budget missing')
    expect(exhausted.phase).toBe('exhausted')
    expect((await goals.get(session.id)).goal?.status).toBe('budget_limited')
    const rejected = { ...input, requestId: 'known-rejection' }
    expect(await rejection(client.call('run.start', rejected))).toMatchObject({ code: 'BUDGET_EXHAUSTED' })
    expect((await kernel.snapshot(session.id)).runs).toHaveLength(1)
    await goals.set(session.id, { status: 'paused' })
    await budget.set(session.id, exhausted.usedTokens + 10_000)
    const accepted = await client.call('run.start', rejected)
    await kernel.waitForIdle()
    expect((await kernel.storage.call('run', accepted.id)).status).toBe('completed')
    expect((await kernel.snapshot(session.id)).runs).toHaveLength(2)
    expect((await goals.get(session.id)).goal?.status).toBe('paused')
  } finally {
    client.disconnect()
    await host.close()
  }
})

test('RPC stopped Goal admission is not unknown and explicit resume restores its unaccepted key', async () => {
  const { kernel, session, goals } = await fixture()
  await goals.create(session.id, 'Validate stopped Goal admission')
  await goals.set(session.id, { status: 'blocked' })
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  try {
    await client.pair(host.pairing.code, 'Goal admission fixture')
    const input = {
      sessionId: session.id,
      requestId: 'stopped-goal',
      input: { text: '', images: [], source: 'goal' as const },
      modelId: 'local-fixture',
    }
    expect(await rejection(client.call('run.start', input))).toMatchObject({ code: 'GOAL_NOT_ACTIVE' })
    expect((await kernel.snapshot(session.id)).runs).toHaveLength(0)
    await goals.set(session.id, { status: 'active' })
    const accepted = await client.call('run.start', input)
    await kernel.waitForIdle()
    expect((await kernel.storage.call('run', accepted.id)).status).toBe('completed')
    const runs = (await kernel.snapshot(session.id)).runs
    // Resuming an explicit Goal also admits its persisted continuation. The
    // retried RPC key must remain a separate accepted Run instead of becoming
    // RESULT_UNKNOWN or replacing that continuation.
    expect(runs).toHaveLength(2)
    expect(runs.filter((run) => run.id === accepted.id)).toHaveLength(1)
    expect(runs.filter((run) => run.input.continuation?.goalId).length).toBe(1)
  } finally {
    client.disconnect()
    await host.close()
  }
})
