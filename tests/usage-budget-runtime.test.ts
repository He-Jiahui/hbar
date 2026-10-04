import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor, type ExecuteOptions } from '@hbar/commands'
import { budgetReceiptSchema, setBudgetInputSchema, type BudgetReceipt } from '@hbar/contracts/commands/budget'
import { type SessionBudget } from '@hbar/contracts'
import { createState } from '../packages/app-runtime/src/state'
import { createUsageBudget } from '../packages/app-runtime/src/usage-budget'

const budget = (sessionId: string, limit: number, revision = 1): SessionBudget => ({
  sessionId,
  budgetId: `budget-${sessionId}`,
  limit,
  phase: 'active',
  usedTokens: 0,
  remainingTokens: limit,
  revision,
  createdAt: 1,
  updatedAt: 2,
})
function committed(sessionId: string, tokens: number, key: string, revision = 1): BudgetReceipt {
  return budgetReceiptSchema.parse({
    status: 'succeeded',
    commandId: 'session.setBudget',
    commandVersion: 1,
    requestId: 'r',
    idempotencyKey: key,
    eventId: 'e',
    revision,
    committedAt: 2,
    budget: budget(sessionId, tokens, revision),
    accountingVersion: 1,
  })
}
function deferred<Value>() {
  let resolve!: (value: Value) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<Value>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
function fixture() {
  const target = createState<{ sessionId: string } | null>({ sessionId: 'a' }, () => undefined)
  const values = new Map<string, SessionBudget>()
  const writes: { sessionId: string; tokens: number; key: string; revision: number | null | undefined }[] = []
  const commands: CommandExecutor = {
    async execute(id, input, options) {
      if (id === 'session.getBudget') {
        const { sessionId } = input as { sessionId: string }
        return values.get(sessionId) ?? null
      }
      const parsed = setBudgetInputSchema.parse(input)
      const key = options?.idempotencyKey
      if (!key) throw new Error('key missing')
      const current = values.get(parsed.sessionId)
      if (parsed.expectedRevision !== (current?.revision ?? null)) throw new CommandError('COMMAND_CONFLICT', 'CAS')
      const receipt = committed(parsed.sessionId, parsed.tokens, key, (current?.revision ?? 0) + 1)
      writes.push({ sessionId: parsed.sessionId, tokens: parsed.tokens, key, revision: parsed.expectedRevision })
      values.set(parsed.sessionId, receipt.budget)
      return receipt
    },
  }
  return { target, values, writes, commands }
}

test('budget edits use positive token limits and CAS on the loaded original session', async () => {
  const f = fixture()
  const runtime = createUsageBudget({ commands: f.commands, target: f.target.reader })
  await runtime.refresh()
  runtime.setDraftLimit('500')
  await runtime.save()
  runtime.setDraftLimit('700')
  await runtime.save()
  expect(f.writes.map((write) => write.revision)).toEqual([null, 1])
  expect(new Set(f.writes.map((write) => write.key)).size).toBe(2)
  f.target.replace({ sessionId: 'b' })
  await runtime.refresh()
  expect(runtime.state.getSnapshot().budget).toBeNull()
  runtime.setDraftLimit('250')
  await runtime.save()
  expect(f.values.get('a')?.limit).toBe(700)
  expect(f.values.get('b')?.limit).toBe(250)
  runtime.setDraftLimit('-1')
  await expect(runtime.save()).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect(f.writes).toHaveLength(3)
  runtime.dispose()
})

test('a duplicate submission is BUSY and never makes a second Host write', async () => {
  const f = fixture()
  const gate = deferred<unknown>()
  let count = 0
  const runtime = createUsageBudget({
    target: f.target.reader,
    commands: {
      async execute(id, input, options) {
        if (id === 'session.getBudget') return null
        count++
        await gate.promise
        return f.commands.execute(id, input, options)
      },
    },
  })
  await runtime.refresh()
  runtime.setDraftLimit('300')
  const first = runtime.save()
  await expect(runtime.save()).rejects.toMatchObject({ code: 'BUSY' })
  expect(count).toBe(1)
  gate.resolve(null)
  await first
  expect(runtime.state.getSnapshot().budget?.limit).toBe(300)
  runtime.dispose()
})

test('unknown A writes survive target B, reconcile only A, and do not overwrite B', async () => {
  const f = fixture()
  let originalKey = ''
  let writes = 0
  let receipt: unknown = null
  const queries: { sessionId: string; key: string }[] = []
  const runtime = createUsageBudget({
    target: f.target.reader,
    commands: {
      async execute(id, _input, options) {
        if (id === 'session.getBudget') return null
        writes++
        originalKey = options?.idempotencyKey ?? ''
        throw new CommandError('RESULT_UNKNOWN', 'ack lost')
      },
    },
    getReceipt: async (sessionId, key) => {
      queries.push({ sessionId, key })
      return receipt
    },
  })
  await runtime.refresh()
  runtime.setDraftLimit('250')
  await runtime.save()
  f.target.replace({ sessionId: 'b' })
  await runtime.refresh()
  runtime.setDraftLimit('900')
  await expect(runtime.save()).rejects.toMatchObject({ code: 'BUSY' })
  expect(runtime.state.getSnapshot().pendingSessionId).toBe('a')
  await expect(runtime.reconcile()).resolves.toBeNull()
  expect(writes).toBe(1)
  receipt = committed('b', 250, originalKey)
  await expect(runtime.reconcile()).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
  expect(runtime.state.getSnapshot().pendingStatus).toBe('unknown')
  receipt = committed('a', 250, originalKey)
  await expect(runtime.reconcile()).resolves.toMatchObject({ budget: { sessionId: 'a' } })
  expect(queries.every((query) => query.sessionId === 'a' && query.key === originalKey)).toBe(true)
  expect(runtime.state.getSnapshot()).toMatchObject({
    targetSessionId: 'b',
    draftLimit: '900',
    budget: null,
    pendingStatus: null,
  })
  expect(writes).toBe(1)
  runtime.dispose()
})

test('a known late A failure cannot change the B draft or status', async () => {
  const f = fixture()
  const gate = deferred<unknown>()
  const runtime = createUsageBudget({
    target: f.target.reader,
    commands: {
      execute: async (id) => (id === 'session.getBudget' ? null : gate.promise),
    },
  })
  await runtime.refresh()
  runtime.setDraftLimit('300')
  const submitted = runtime.save()
  f.target.replace({ sessionId: 'b' })
  await runtime.refresh()
  runtime.setDraftLimit('800')
  gate.reject(new CommandError('COMMAND_CONFLICT', 'old A failure'))
  await submitted
  expect(runtime.state.getSnapshot()).toMatchObject({
    targetSessionId: 'b',
    status: 'ready',
    draftLimit: '800',
    error: null,
  })
  runtime.dispose()
})

test('a stale read and a null target leave only the current session projection', async () => {
  const f = fixture()
  const gate = deferred<unknown>()
  const runtime = createUsageBudget({
    target: f.target.reader,
    commands: {
      execute: async (_id, input) =>
        (input as { sessionId: string }).sessionId === 'a' ? gate.promise : budget('b', 200),
    },
  })
  const first = runtime.refresh()
  f.target.replace({ sessionId: 'b' })
  await runtime.refresh()
  gate.resolve(budget('a', 100))
  await first
  expect(runtime.state.getSnapshot().budget?.sessionId).toBe('b')
  f.target.replace(null)
  await runtime.refresh()
  expect(runtime.state.getSnapshot()).toMatchObject({
    targetSessionId: null,
    budget: null,
    draftLimit: '',
    status: 'idle',
  })
  runtime.dispose()
})

test('read and uncertain write timeouts are bounded and never replay', async () => {
  const f = fixture()
  let calls = 0
  const runtime = createUsageBudget({
    target: f.target.reader,
    timeoutMs: 5,
    commands: {
      execute: async () => {
        calls++
        return new Promise<never>(() => undefined)
      },
    },
  })
  await runtime.refresh()
  expect(runtime.state.getSnapshot()).toMatchObject({ status: 'error', error: 'TIMEOUT' })
  runtime.setDraftLimit('200')
  await runtime.save()
  expect(runtime.state.getSnapshot()).toMatchObject({ status: 'unknown', pendingSessionId: 'a' })
  await expect(runtime.save()).rejects.toMatchObject({ code: 'BUSY' })
  expect(calls).toBe(2)
  runtime.dispose()
})

test('dispose aborts waiting and forbids subsequent reads or mutations', async () => {
  const f = fixture()
  let calls = 0
  let signal: AbortSignal | undefined
  const runtime = createUsageBudget({
    target: f.target.reader,
    commands: {
      execute: async (_id, _input, options?: ExecuteOptions) => {
        calls++
        signal = options?.signal
        return new Promise<never>(() => undefined)
      },
    },
  })
  const pending = runtime.refresh()
  runtime.dispose()
  await pending
  expect(signal?.aborted).toBe(true)
  await expect(runtime.refresh()).rejects.toMatchObject({ code: 'DISPOSED' })
  await expect(runtime.save()).rejects.toMatchObject({ code: 'DISPOSED' })
  expect(calls).toBe(1)
})
