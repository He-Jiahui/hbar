import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createGoalPlanCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-plan-commands-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id, 'goal plan commands')
  const other = await kernel.createSession(workspace.id, 'other session')
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'goal plan command test')
  return { client, session, other }
}

test('goal and plan commands preserve plugin rules, explicit targets and query reconciliation', async () => {
  const { client, session, other } = await fixture()
  const commands = createGoalPlanCommandClient(client)
  const catalog = await client.call('command.catalog', { category: 'agent.goal.plan', limit: 20 })
  expect(catalog.items.map((item) => item.metadata.id)).toEqual([
    'agent.cancel',
    'agent.create',
    'agent.list',
    'goal.clear',
    'goal.create',
    'goal.get',
    'goal.set',
    'goal.update',
    'mode.get',
    'mode.set',
    'plan.clear',
    'plan.get',
    'plan.update',
  ])
  expect(await commands.execute('goal.get', { sessionId: session.id })).toEqual({
    goal: null,
    remainingTokens: null,
  })

  const created = await commands.execute('goal.create', {
    sessionId: session.id,
    objective: '  finish the command migration  ',
    tokenBudget: 1_000,
  })
  expect(created).toMatchObject({
    goal: { threadId: session.id, objective: 'finish the command migration', status: 'active', tokenBudget: 1_000 },
    remainingTokens: 1_000,
  })
  await expect(
    commands.execute('goal.create', { sessionId: session.id, objective: 'duplicate' }),
  ).rejects.toMatchObject({ code: 'GOAL_EXISTS' })
  await expect(
    commands.execute('goal.set', {
      sessionId: session.id,
      objective: 'stale update',
      expectedGoalId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: 'GOAL_CONFLICT' })
  const goalId = created.goal?.goalId
  if (!goalId) throw new Error('Goal identity missing')
  const updated = await commands.execute('goal.set', {
    sessionId: session.id,
    objective: 'ship the command migration',
    expectedGoalId: goalId,
  })
  expect(updated.goal).toMatchObject({ goalId, objective: 'ship the command migration' })
  expect(await commands.execute('goal.update', { sessionId: session.id, status: 'blocked' })).toMatchObject({
    goal: { goalId, status: 'blocked' },
  })
  expect(await commands.execute('goal.get', { sessionId: other.id })).toEqual({
    goal: null,
    remainingTokens: null,
  })

  const plan = await commands.execute('plan.update', {
    sessionId: session.id,
    explanation: 'Keep the target explicit',
    plan: [
      { step: 'inspect', status: 'completed' },
      { step: 'ship', status: 'in_progress' },
    ],
  })
  expect(plan).toMatchObject({
    sessionId: session.id,
    explanation: 'Keep the target explicit',
    plan: [
      { step: 'inspect', status: 'completed' },
      { step: 'ship', status: 'in_progress' },
    ],
  })
  expect(await commands.execute('plan.get', { sessionId: session.id })).toEqual(plan)
  expect(await commands.execute('plan.clear', { sessionId: session.id })).toEqual({ cleared: true })
  expect(await commands.execute('plan.clear', { sessionId: session.id })).toEqual({ cleared: false })
  expect(await commands.execute('plan.get', { sessionId: session.id })).toBeNull()
  expect(await commands.execute('goal.clear', { sessionId: session.id })).toEqual({ cleared: true })
  expect(await commands.execute('goal.get', { sessionId: session.id })).toEqual({
    goal: null,
    remainingTokens: null,
  })
})
