import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createBudgetCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { BudgetRuntime } from '../plugins/budget/src/index.ts'
import type { SessionEvent } from '@hbar/contracts'
import type { BudgetService, GoalService, HbarAPI } from '@hbar/plugin-sdk'
import { startServer } from '../apps/host/src/server.ts'

const resources: Array<{ root: string; kernel: Kernel; close?: () => Promise<void> }> = []

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.close?.()
    await resource.kernel.close()
    await rm(resource.root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-budget-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  return { root, kernel, session }
}

test('budget accounts completed runs, blocks exhausted runs, and restores after restart', async () => {
  const { root, kernel, session } = await fixture()
  const budget = kernel.plugins.get<BudgetService>('budget')
  const created = await budget.set(session.id, 1)
  expect(created.phase).toBe('active')

  const run = await kernel.submit(session.id, 'budget-run', { text: 'hello', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  const exhausted = await budget.get(session.id)
  expect(exhausted?.usedTokens).toBeGreaterThan(0)
  expect(exhausted?.phase).toBe('exhausted')
  await expect(kernel.submit(session.id, 'blocked-run', { text: 'second', images: [] }, 'local-fixture')).rejects.toThrow('exhausted')
  expect((await kernel.storage.call('run', run.id)).status).toBe('completed')

  const increased = await budget.set(session.id, exhausted!.usedTokens + 100)
  expect(increased.phase).toBe('active')
  expect(increased.remainingTokens).toBe(100)

  await kernel.close()
  const index = resources.findIndex((resource) => resource.kernel === kernel)
  if (index >= 0) resources.splice(index, 1)
  const restarted = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel: restarted })
  expect((await restarted.plugins.get<BudgetService>('budget').get(session.id))?.budgetId).toBe(created.budgetId)
})

test('budget command clears an existing ledger and converges when repeated', async () => {
  const { kernel, session } = await fixture()
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  resources[0]!.close = async () => {
    client.disconnect()
    await host.close()
  }
  await client.pair(host.pairing.code, 'budget test')
  const created = await client.call('budget.set', { sessionId: session.id, limit: 500 })
  expect(created.limit).toBe(500)
  expect(await client.call('automation.set', { sessionId: session.id, unattended: true, goalEnabled: true })).toMatchObject({
    sessionId: session.id,
    unattended: true,
    goalEnabled: true,
  })
  expect(await client.call('automation.get', { sessionId: session.id })).toMatchObject({ goalEnabled: true })
  const commands = createBudgetCommandClient(client)
  expect((await commands.execute('session.getBudget', { sessionId: session.id }))?.budgetId).toBe(created.budgetId)
  expect(await commands.execute('session.clearBudget', { sessionId: session.id })).toEqual({ cleared: true })
  expect(await commands.execute('session.clearBudget', { sessionId: session.id })).toEqual({ cleared: false })
  expect(await commands.execute('session.getBudget', { sessionId: session.id })).toBeNull()
  expect(
    (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'budget.cleared'),
  ).toHaveLength(1)
})

test('typed command persists one budget fact and receipt across retries, conflicts and restart', async () => {
  const { root, kernel, session } = await fixture()
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  resources[0]!.close = async () => {
    client.disconnect()
    await host.close()
  }
  await client.pair(host.pairing.code, 'budget command test')
  const firstActorId = (await kernel.storage.call('devices')).find(
    (device) => device.name === 'budget command test',
  )?.id
  if (!firstActorId) throw new Error('Authenticated device was not recorded')
  const commands = createBudgetCommandClient(client)
  const input = { sessionId: session.id, tokens: 500, expectedRevision: null }
  const first = await commands.execute('session.setBudget', input, { idempotencyKey: 'first', requestId: 'submit-1' })
  expect(first).toMatchObject({
    status: 'succeeded',
    commandId: 'session.setBudget',
    commandVersion: 1,
    revision: 1,
    accountingVersion: 1,
    budget: { limit: 500, usedTokens: 0 },
  })
  expect(first.requestId).toBe('submit-1')
  expect(await commands.getReceipt(session.id, 'first')).toEqual(first)
  expect(await commands.getReceipt(session.id, 'unused')).toBeNull()
  const duplicate = await commands.execute('session.setBudget', input, {
    idempotencyKey: 'first',
    requestId: 'submit-2',
  })
  expect(duplicate).toEqual(first)
  await expect(
    commands.execute('session.setBudget', { ...input, tokens: 600 }, { idempotencyKey: 'first' }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  await expect(
    commands.execute('session.setBudget', { ...input, tokens: 600 }, { idempotencyKey: 'stale' }),
  ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
  const next = await commands.execute(
    'session.setBudget',
    { sessionId: session.id, tokens: 600, expectedRevision: 1 },
    { idempotencyKey: 'next' },
  )
  expect(next).toMatchObject({ revision: 2, budget: { limit: 600, usedTokens: 0 } })
  expect((await commands.execute('session.getBudget', { sessionId: session.id }))?.revision).toBe(2)
  expect(
    (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type.startsWith('budget.')),
  ).toHaveLength(2)

  await resources[0]!.close?.()
  await kernel.close()
  resources.splice(0, 1)
  const restarted = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel: restarted })
  const againHost = await startServer(restarted, { port: 0 })
  const againClient = new HbarClient(`http://127.0.0.1:${againHost.server.port}`)
  resources[0]!.close = async () => {
    againClient.disconnect()
    await againHost.close()
  }
  await againClient.pair(againHost.pairing.code, 'new device')
  // A new actor cannot query the previous actor’s receipt.
  expect(await createBudgetCommandClient(againClient).getReceipt(session.id, 'first')).toBeNull()
  const restored = await restarted.plugins
    .get<BudgetService>('budget')
    .getCommandReceipt(session.id, firstActorId, 'first')
  expect(restored).toEqual(first)
  const otherActor = await createBudgetCommandClient(againClient).execute(
    'session.setBudget',
    {
      sessionId: session.id,
      tokens: 700,
      expectedRevision: 2,
    },
    { idempotencyKey: 'first' },
  )
  expect(otherActor.budget.revision).toBe(3)
})

test('concurrent retries with one key commit exactly one fact', async () => {
  const { kernel, session } = await fixture()
  const budget = kernel.plugins.get<BudgetService>('budget')
  const context = { actorId: 'test-device', idempotencyKey: 'concurrent', requestId: 'one' }
  const input = { sessionId: session.id, tokens: 400, expectedRevision: null }
  const [first, second] = await Promise.all([
    budget.setCommand(input, context),
    budget.setCommand(input, { ...context, requestId: 'two' }),
  ])
  expect(second).toEqual(first)
  expect(
    (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type.startsWith('budget.')),
  ).toHaveLength(1)
})

test('an ACK lost after append is unknown until restart, then the original receipt is recovered', async () => {
  const sessionId = crypto.randomUUID()
  const events: SessionEvent[] = []
  let loseAck = true
  const api = {
    sessions: {
      get: async (id: string) => {
        if (id !== sessionId) throw new Error('Session not found')
        return { id, seq: events.length }
      },
      list: async () => [{ id: sessionId }],
      events: async (id: string) => (id === sessionId ? [...events] : []),
      append: async (id: string, type: string, data: unknown, runId?: string) => {
        const event: SessionEvent = {
          eventId: crypto.randomUUID(),
          sessionId: id,
          seq: events.length + 1,
          runId: runId ?? null,
          stepId: null,
          type,
          data,
          time: Date.now(),
          version: 1,
        }
        events.push(event)
        if (loseAck) throw new Error('simulated lost append acknowledgement')
        return event
      },
    },
    notify: () => {},
    changed: () => {},
  } as unknown as HbarAPI
  const budget = new BudgetRuntime(api, 10_000_000)
  await budget.restore()
  const input = { sessionId, tokens: 500, expectedRevision: null }
  const context = { actorId: 'test-device', idempotencyKey: 'lost-ack', requestId: 'submit' }
  await expect(budget.setCommand(input, context)).rejects.toThrow('simulated lost append')
  await expect(budget.getCommandReceipt(sessionId, context.actorId, context.idempotencyKey)).rejects.toMatchObject({
    code: 'RESULT_UNKNOWN',
  })
  await expect(budget.setCommand(input, context)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  loseAck = false
  const recovered = new BudgetRuntime(api, 10_000_000)
  await recovered.restore()
  const receipt = await recovered.getCommandReceipt(sessionId, context.actorId, context.idempotencyKey)
  expect(receipt).toMatchObject({ status: 'succeeded', revision: 1, budget: { limit: 500 } })
  if (!receipt) throw new Error('Recovered receipt was missing')
  expect(await recovered.setCommand(input, context)).toEqual(receipt)
  expect(events).toHaveLength(1)
})

test('active budgets continue completed user runs until the budget is exhausted or bounded', async () => {
  const { kernel, session } = await fixture()
  await kernel.changePlugin('budget.codex', true, { maxLimit: 1_000_000, autoContinue: true, maxContinuations: 1 })
  const budget = kernel.plugins.get<BudgetService>('budget')
  await budget.set(session.id, 1_000_000)
  const first = await kernel.submit(session.id, 'budget-continuation', { text: 'keep working', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  const runs = (await kernel.snapshot(session.id)).runs
  expect((await kernel.storage.call('run', first.id)).status).toBe('completed')
  expect(runs.filter((run) => run.input.source === 'system')).toHaveLength(1)
  expect((await budget.get(session.id))?.phase).toBe('active')
})

test('exhausting a session budget marks an active goal budget_limited', async () => {
  const { kernel, session } = await fixture()
  const goals = kernel.plugins.get<GoalService>('goal')
  const budget = kernel.plugins.get<BudgetService>('budget')
  await goals.create(session.id, 'finish within the session budget')
  await budget.set(session.id, 1)
  await kernel.submit(session.id, 'budget-goal-limit', { text: 'continue', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect((await goals.get(session.id)).goal?.status).toBe('budget_limited')
  await budget.set(session.id, 100)
  expect((await goals.get(session.id)).goal?.status).toBe('active')
})
