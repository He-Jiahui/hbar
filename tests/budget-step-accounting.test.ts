import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BudgetRuntime } from '@hbar/budget'
import { emptyUsage } from '@hbar/contracts'
import type { Run } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-budget-step-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const resource = { root, kernel }
  resources.push(resource)
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  return { resource, kernel, session, budget: kernel.plugins.get<BudgetRuntime>('budget') }
}

test('session budget settles a tool turn before the next model request in the same run', async () => {
  const { kernel, session, budget } = await fixture()
  await budget.set(session.id, 1)
  const accepted = await kernel.submit(
    session.id,
    'step-budget',
    {
      text: '/tool get_budget {}',
      images: [],
    },
    'local-fixture',
  )
  await kernel.waitForIdle()
  const events = await kernel.storage.call('events', session.id, 0)
  const requests = events.filter((event) => event.type === 'request.started')
  expect(requests).toHaveLength(1)
  const run = await kernel.storage.call('run', accepted.id)
  expect(run.error).toContain('Token budget exhausted')
  expect(run.status).toBe('failed')
  expect((await budget.get(session.id))?.phase).toBe('exhausted')
  const settledBeforeRunEnd = events.find((event) => event.type === 'budget.accounted')
  const runEnd = events.find((event) => event.type === 'run.settled')
  expect(settledBeforeRunEnd!.seq).toBeLessThan(runEnd!.seq)
  const before = (await budget.get(session.id))!.usedTokens
  await budget.accountRun({ sessionId: session.id, runId: run.id, status: run.status, run })
  expect((await budget.get(session.id))!.usedTokens).toBe(before)
})

test('step checkpoints charge each durable usage fact once across repeat callbacks and Host restart', async () => {
  const { resource, kernel, session, budget } = await fixture()
  await budget.set(session.id, 200)
  const runId = crypto.randomUUID()
  const step = { sessionId: session.id, runId, stepId: 'first-step' }
  await kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), input: 80, cacheRead: 30, output: 10 }, runId)
  await budget.accountStep(step)
  await budget.accountStep(step)
  expect((await budget.get(session.id))!.usedTokens).toBe(60)
  await kernel.close()
  resource.kernel = await Kernel.create({ home: join(resource.root, 'data'), demo: true, secrets: new MemorySecrets() })
  const restored = resource.kernel.plugins.get<BudgetRuntime>('budget')
  await restored.accountStep(step)
  expect((await restored.get(session.id))!.usedTokens).toBe(60)
  await resource.kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), input: 20, output: 5 }, runId)
  await restored.accountStep({ ...step, stepId: 'second-step' })
  const run: Run = {
    id: runId,
    sessionId: session.id,
    requestId: 'fault-injected-run',
    input: { text: 'test', images: [] },
    modelId: 'local-fixture',
    status: 'completed',
    createdAt: 1,
    startedAt: 1,
    endedAt: 2,
    error: null,
  }
  await restored.accountRun({ sessionId: session.id, runId, status: run.status, run })
  await restored.accountRun({ sessionId: session.id, runId, status: run.status, run })
  expect((await restored.get(session.id))!.usedTokens).toBe(85)
  expect((await restored.get(session.id))!.remainingTokens).toBe(115)
})

test('a new ledger starts after prior usage instead of charging historical runs again', async () => {
  const { kernel, session, budget } = await fixture()
  await kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), input: 100 })
  await budget.set(session.id, 200)
  const step = { sessionId: session.id, runId: crypto.randomUUID(), stepId: 'new-ledger-step' }
  await budget.accountStep(step)
  expect((await budget.get(session.id))!.usedTokens).toBe(0)
  await kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), input: 10 }, step.runId)
  await budget.accountStep(step)
  expect((await budget.get(session.id))!.usedTokens).toBe(10)
  await budget.clear(session.id)
  await budget.set(session.id, 300)
  await budget.accountStep(step)
  expect((await budget.get(session.id))!.usedTokens).toBe(0)
})

test('legacy run ledgers restore without recharging usage already settled before upgrade', async () => {
  const { resource, kernel, session } = await fixture()
  const ledger = {
    sessionId: session.id,
    budgetId: crypto.randomUUID(),
    limit: 200,
    phase: 'active',
    usedTokens: 0,
    remainingTokens: 200,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    accountedRuns: [],
  }
  await kernel.append(session.id, 'budget.created', { budget: ledger })
  const oldRun = crypto.randomUUID()
  await kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), input: 50 }, oldRun)
  await kernel.append(
    session.id,
    'budget.accounted',
    {
      budget: { ...ledger, usedTokens: 50, remainingTokens: 150, revision: 2, accountedRuns: [oldRun] },
    },
    oldRun,
  )
  await kernel.close()
  resource.kernel = await Kernel.create({ home: join(resource.root, 'data'), demo: true, secrets: new MemorySecrets() })
  const restored = resource.kernel.plugins.get<BudgetRuntime>('budget')
  const step = { sessionId: session.id, runId: crypto.randomUUID(), stepId: 'post-upgrade' }
  await restored.accountStep(step)
  expect((await restored.get(session.id))!.usedTokens).toBe(50)
  await resource.kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), input: 15 }, step.runId)
  await restored.accountStep(step)
  expect((await restored.get(session.id))!.usedTokens).toBe(65)
})

test('a lost step-settlement acknowledgement stops new requests until durable accounting is recovered', async () => {
  const { resource, kernel, session, budget } = await fixture()
  await budget.set(session.id, 200)
  const append = kernel.append.bind(kernel)
  let loseAck = true
  kernel.append = async (...args: Parameters<Kernel['append']>) => {
    const event = await append(...args)
    if (args[1] === 'budget.accounted' && loseAck) {
      loseAck = false
      throw new Error('simulated lost accounting acknowledgement')
    }
    return event
  }
  const step = { sessionId: session.id, runId: crypto.randomUUID(), stepId: 'lost-step' }
  await kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), input: 60 }, step.runId)
  let settlementError: unknown
  try {
    await budget.accountStep(step)
  } catch (error) {
    settlementError = error
  }
  expect(settlementError).toBeInstanceOf(Error)
  const run = await kernel.submit(
    session.id,
    'unknown-budget',
    { text: 'must not request the model', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect((await kernel.storage.call('run', run.id)).error).toBe('Budget state requires Host recovery')
  expect(
    (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'request.started'),
  ).toHaveLength(0)
  await kernel.close()
  resource.kernel = await Kernel.create({ home: join(resource.root, 'data'), demo: true, secrets: new MemorySecrets() })
  const restored = resource.kernel.plugins.get<BudgetRuntime>('budget')
  await restored.accountStep(step)
  expect((await restored.get(session.id))!.usedTokens).toBe(60)
})
