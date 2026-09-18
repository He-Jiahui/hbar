import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CommandError, createCommandClient } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import type { BudgetCommandPort } from '@hbar/app-runtime'
import { HbarClient, createBudgetCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'
import { budgetCommands } from '@hbar/contracts/commands/budget'
import type { BudgetReceipt } from '@hbar/contracts/commands/budget'
import type { SessionBudget } from '@hbar/contracts'

function fixture() {
  const budgets = new Map<string, SessionBudget>()
  const receipts = new Map<string, BudgetReceipt>()
  let hold: Promise<void> | null = null
  let queryHold: Promise<void> | null = null
  let loseAck = false
  const commands = createCommandClient(budgetCommands, {
    async execute(id, value, options) {
      if (id === 'session.getBudget') {
        if (queryHold) await queryHold
        const input = budgetCommands[id].input.parse(value)
        return budgets.get(input.sessionId) ?? null
      }
      const input = budgetCommands['session.setBudget'].input.parse(value)
      const key = `${input.sessionId}:${options?.idempotencyKey ?? ''}`
      const prior = receipts.get(key)
      if (prior) return prior
      if (
        input.expectedRevision !== undefined &&
        input.expectedRevision !== (budgets.get(input.sessionId)?.revision ?? null)
      )
        throw new CommandError('REVISION_CONFLICT', 'Refresh the budget')
      if (hold) await hold
      const now = Date.now()
      const existing = budgets.get(input.sessionId)
      const budget: SessionBudget = {
        sessionId: input.sessionId,
        budgetId: existing?.budgetId ?? crypto.randomUUID(),
        limit: input.tokens,
        phase: 'active',
        usedTokens: 0,
        remainingTokens: input.tokens,
        revision: (existing?.revision ?? 0) + 1,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      budgets.set(input.sessionId, budget)
      const receipt: BudgetReceipt = {
        status: 'succeeded',
        commandId: 'session.setBudget',
        commandVersion: 1,
        requestId: options?.requestId ?? crypto.randomUUID(),
        idempotencyKey: options?.idempotencyKey ?? '',
        eventId: crypto.randomUUID(),
        revision: budget.revision,
        committedAt: now,
        budget,
        accountingVersion: 1,
      }
      receipts.set(key, receipt)
      if (loseAck) throw new CommandError('RESULT_UNKNOWN', 'Simulated lost reply')
      return receipt
    },
  })
  const port: BudgetCommandPort = {
    execute: commands.execute,
    getReceipt: async (sessionId, key) => receipts.get(`${sessionId}:${key}`) ?? null,
  }
  const directory = { execute: async () => null }
  const runtime = createAppRuntime({ instanceId: 'one', hostId: 'host', directory, budget: port })
  return {
    runtime,
    budgets,
    holdUntil(releasePromise: Promise<void>) {
      hold = releasePromise
    },
    holdQueryUntil(releasePromise: Promise<void>) {
      queryHold = releasePromise
    },
    loseNextReply() {
      loseAck = true
    },
  }
}

test('closing an opening form discards a late query result', async () => {
  const { runtime, holdQueryUntil } = fixture()
  let release!: () => void
  holdQueryUntil(
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  const opening = runtime.view.commands.execute('app.openCommandForm', {
    commandId: 'session.setBudget',
    sessionId: 'target',
    formId: 'late',
  })
  await Bun.sleep(0)
  expect(await runtime.view.commands.execute('app.closeCommandForm', { formId: 'late' })).toEqual({ closed: true })
  release()
  await expect(opening).rejects.toMatchObject({ code: 'CANCELLED' })
  expect(runtime.view.state.forms.getSnapshot().late).toBeUndefined()
  runtime.dispose()
})

test('budget form opens on an explicit target, validates locally, and keeps newer edits after Host success', async () => {
  const { runtime, budgets, holdUntil } = fixture()
  const commands = runtime.view.commands
  const opened = await commands.execute('app.openCommandForm', {
    commandId: 'session.setBudget',
    sessionId: 'original',
    formId: 'first',
  })
  expect(opened.issues).toEqual([{ field: 'tokens', code: 'required' }])
  expect(Object.isFrozen(runtime.view.state.forms.getSnapshot().first!.form.draft)).toBe(true)
  await expect(
    commands.execute('form.setField', { formId: 'first', field: 'expectedRevision', value: '1' }),
  ).rejects.toMatchObject({ code: 'FIELD_READ_ONLY' })
  await commands.execute('form.setField', { formId: 'first', field: 'tokens', value: '-' })
  expect(runtime.view.state.forms.getSnapshot().first!.form.raw.tokens).toBe('-')
  await expect(commands.execute('form.submit', { formId: 'first' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  await commands.execute('form.setField', { formId: 'first', field: 'tokens', value: '500' })
  let release!: () => void
  holdUntil(
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  const pending = commands.execute('form.submit', { formId: 'first' })
  await Bun.sleep(0)
  expect(runtime.view.state.forms.getSnapshot().first!.form.status).toBe('submitting')
  await commands.execute('form.setField', { formId: 'first', field: 'tokens', value: '600' })
  await commands.execute('app.openCommandForm', {
    commandId: 'session.setBudget',
    sessionId: 'another',
    formId: 'second',
  })
  release()
  const receipt = await pending
  expect(receipt.budget).toMatchObject({ sessionId: 'original', limit: 500 })
  expect(budgets.has('another')).toBe(false)
  expect(runtime.view.state.forms.getSnapshot().first!.form).toMatchObject({
    draft: { sessionId: 'original', tokens: 600, expectedRevision: 1 },
    baseline: { sessionId: 'original', tokens: 500, expectedRevision: 1 },
    dirty: ['tokens'],
    revision: 3,
  })
  expect(runtime.view.state.forms.getSnapshot().second!.sessionId).toBe('another')
  runtime.dispose()
})

test('interrupted submission enters unknown state while its Host request is still in flight', async () => {
  const { runtime, holdUntil } = fixture()
  const commands = runtime.view.commands
  await commands.execute('app.openCommandForm', { commandId: 'session.setBudget', sessionId: 'target', formId: 'slow' })
  await commands.execute('form.setField', { formId: 'slow', field: 'tokens', value: '700' })
  let release!: () => void
  holdUntil(
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  const controller = new AbortController()
  const pending = commands.execute('form.submit', { formId: 'slow' }, { signal: controller.signal })
  await Bun.sleep(0)
  controller.abort()
  await expect(pending).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  expect(runtime.view.state.forms.getSnapshot().slow!.form.status).toBe('unknown')
  expect(await commands.execute('form.reconcile', { formId: 'slow' })).toBeNull()
  release()
  await Bun.sleep(0)
  expect(runtime.view.state.forms.getSnapshot().slow!.receipt?.budget.limit).toBe(700)
  runtime.dispose()
})

test('unknown response keeps original key and draft until receipt reconciliation; failures retain input', async () => {
  const { runtime, budgets, loseNextReply } = fixture()
  const commands = runtime.view.commands
  await commands.execute('app.openCommandForm', {
    commandId: 'session.setBudget',
    sessionId: 'target',
    formId: 'budget',
  })
  await commands.execute('form.setField', { formId: 'budget', field: 'tokens', value: '400' })
  loseNextReply()
  await expect(commands.execute('form.submit', { formId: 'budget' })).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  const unknown = runtime.view.state.forms.getSnapshot().budget!
  expect(unknown.form.status).toBe('unknown')
  expect(unknown.form.draft.tokens).toBe(400)
  expect(unknown.pendingKey).toBeString()
  await expect(commands.execute('form.submit', { formId: 'budget' })).rejects.toMatchObject({
    code: 'SUBMISSION_PENDING',
  })
  const receipt = await commands.execute('form.reconcile', { formId: 'budget' })
  if (!receipt || !unknown.pendingKey) throw new Error('Original receipt or key was lost')
  expect(receipt.idempotencyKey).toBe(unknown.pendingKey)
  expect(runtime.view.state.forms.getSnapshot().budget!.form.draft.expectedRevision).toBe(1)
  await commands.execute('form.setField', { formId: 'budget', field: 'tokens', value: '300' })
  budgets.set('target', { ...budgets.get('target')!, revision: 2 })
  await expect(commands.execute('form.submit', { formId: 'budget' })).rejects.toMatchObject({
    code: 'REVISION_CONFLICT',
  })
  expect(runtime.view.state.forms.getSnapshot().budget!.form.draft.tokens).toBe(300)
  expect(await commands.execute('app.closeCommandForm', { formId: 'budget' })).toEqual({ closed: true })
  expect(runtime.view.state.forms.getSnapshot().budget).toBeUndefined()
  runtime.dispose()
})

test('real Host budget form and direct command read the same committed budget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-budget-form-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  let runtime: ReturnType<typeof createAppRuntime> | undefined
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]!
    const session = await kernel.createSession(workspace.id)
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'form test')
    const budget = createBudgetCommandClient(client)
    runtime = createAppRuntime({
      instanceId: 'form test',
      hostId: 'host',
      directory: { execute: async () => null },
      budget,
    })
    await runtime.view.commands.execute('app.openCommandForm', {
      commandId: 'session.setBudget',
      sessionId: session.id,
      formId: 'budget',
    })
    await runtime.view.commands.execute('form.setField', { formId: 'budget', field: 'tokens', value: '800' })
    const receipt = await runtime.view.commands.execute('form.submit', { formId: 'budget' })
    expect(receipt).toMatchObject({ budget: { sessionId: session.id, limit: 800 }, revision: 1 })
    expect(await budget.execute('session.getBudget', { sessionId: session.id })).toMatchObject({
      budgetId: receipt.budget.budgetId,
      limit: 800,
      revision: 1,
    })
  } finally {
    runtime?.dispose()
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
